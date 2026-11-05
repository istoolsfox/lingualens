// ============================================================
// background/aiService.ts —— 分析/对话/练习会话编排
// 单一职责：拿设置 → 组 prompt → 流式调用 → 广播 → 解析降级 → 落盘
// ============================================================

import { chatCompletionWithRetry, type EndpointConfig } from '../ai/client';
import { AiError } from '../ai/errors';
import {
  RETRY_INSTRUCTION,
  buildAnalysisPrompt,
  buildChatPrompt,
  buildLightPrompt,
  buildPracticeGeneratePrompt,
  buildPracticeGradePrompt,
} from '../ai/promptBuilder';
import { extractJsonObject, parseAnalysis, parseLight } from '../ai/parser';
import { guessMode } from '../ai/router';
import type { PortSwMsg, SessionView, Snapshot } from '../shared/messages';
import { channels } from '../shared/messages';
import { SESSION_CACHE_LIMIT } from '../shared/constants';
import type { Settings } from '../shared/settings';
import type {
  AnalysisResult,
  ChatMessage,
  LightAction,
  LightResult,
  Mode,
  PracticeSession,
  Question,
} from '../shared/types';
import { listEntriesRaw } from '../storage/favorites';
import { getSettings } from '../storage/settings';
import { loadApiKey } from './secureStore';
import { chromeStorageLike } from './storageLike';

type SessionKind = 'analysis' | 'light';

interface Session {
  id: string;
  kind: SessionKind;
  action?: LightAction;
  snapshot: Snapshot;
  guess: Mode;
  manual?: Mode;
  status: 'running' | 'done' | 'error';
  buffer: string;
  result?: AnalysisResult | LightResult;
  degraded?: boolean;
  raw?: string;
  errorCode?: string;
  errorMessage?: string;
  chat: ChatMessage[];
  controller?: AbortController;
  chatController?: AbortController;
  createdAt: number;
}

const SESSIONS_KEY = 'll_sessions';
const sessions = new Map<string, Session>();
const ports = new Set<chrome.runtime.Port>();

// ---------- Port 广播 ----------

export function addPort(port: chrome.runtime.Port): void {
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
}

export function broadcast(msg: PortSwMsg): void {
  for (const p of ports) {
    try {
      p.postMessage(msg);
    } catch {
      ports.delete(p);
    }
  }
}

// ---------- 会话持久化（storage.session，浏览器关闭即清） ----------

type PersistedSession = Omit<Session, 'controller' | 'chatController'>;

function toPersisted(s: Session): PersistedSession {
  const { controller: _c, chatController: _cc, ...rest } = s;
  void _c;
  void _cc;
  return rest;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persistSoon(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const arr = [...sessions.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, SESSION_CACHE_LIMIT)
      .map(toPersisted);
    void chrome.storage.session.set({ [SESSIONS_KEY]: arr }).catch(() => undefined);
  }, 300);
}

async function restoreSessions(): Promise<void> {
  try {
    const res = await chrome.storage.session.get(SESSIONS_KEY);
    const arr = res[SESSIONS_KEY];
    if (!Array.isArray(arr)) return;
    for (const s of arr as PersistedSession[]) {
      if (!sessions.has(s.id)) sessions.set(s.id, s as Session);
    }
  } catch {
    /* 首次运行无数据 */
  }
}

export async function initService(): Promise<void> {
  await restoreSessions();
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

// ---------- 配置 ----------

async function resolveEndpoint(): Promise<{ cfg: EndpointConfig; settings: Settings }> {
  const settings = await getSettings();
  const apiKey = await loadApiKey(chromeStorageLike);
  if (!settings.api.baseUrl || !settings.api.model || !apiKey) {
    throw new AiError('not_configured');
  }
  return {
    settings,
    cfg: {
      baseUrl: settings.api.baseUrl,
      apiKey,
      model: settings.api.model,
      temperature: settings.api.temperature,
      maxTokens: settings.api.maxTokens,
      timeoutMs: settings.api.timeoutMs,
    },
  };
}

// ---------- 分析（四模式） ----------

export async function startAnalysis(snapshot: Snapshot, manual?: Mode): Promise<string> {
  const { cfg, settings } = await resolveEndpoint();
  const guess = guessMode(snapshot.text);
  const mode = manual ?? guess;
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    kind: 'analysis',
    snapshot,
    guess,
    manual,
    status: 'running',
    buffer: '',
    chat: [],
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  // 裁剪旧会话
  if (sessions.size > SESSION_CACHE_LIMIT * 2) {
    const oldest = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const s of oldest.slice(0, sessions.size - SESSION_CACHE_LIMIT)) sessions.delete(s.id);
  }

  const controller = new AbortController();
  session.controller = controller;

  void (async () => {
    try {
      const prompt = buildAnalysisPrompt(mode, guess, manual, { snapshot, settings });
      const acc = await chatCompletionWithRetry(cfg, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        stream: true,
        jsonObject: settings.api.strictJson,
        signal: controller.signal,
        onDelta: (d, accNow) => {
          session.buffer = accNow;
          broadcast({ type: 'chunk', channel: channels.analysis(id), delta: d });
        },
      });
      session.buffer = acc;

      let parsed = parseAnalysis(acc, snapshot.text);
      if (!parsed.ok) {
        // L3：附纠偏指令重试一次（非流式即可）
        const retryAcc = await chatCompletionWithRetry(cfg, {
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
            { role: 'assistant', content: acc.slice(0, 4000) },
            { role: 'user', content: RETRY_INSTRUCTION },
          ],
          stream: false,
          jsonObject: true,
          signal: controller.signal,
        });
        parsed = parseAnalysis(retryAcc, snapshot.text);
        if (!parsed.ok) {
          // L4：降级为 Markdown 纯文本展示
          session.degraded = true;
          session.raw = acc;
          session.status = 'done';
          broadcast({ type: 'done', channel: channels.analysis(id), ok: true, degraded: true, raw: acc });
          persistSoon();
          return;
        }
      }
      session.result = parsed.data;
      session.status = 'done';
      broadcast({ type: 'done', channel: channels.analysis(id), ok: true });
    } catch (err) {
      session.status = 'error';
      if (err instanceof AiError) {
        session.errorCode = err.code;
        session.errorMessage = err.message;
        broadcast({ type: 'done', channel: channels.analysis(id), ok: false, errorCode: err.code, errorMessage: err.message });
      } else {
        session.errorCode = 'unknown';
        session.errorMessage = err instanceof Error ? err.message : String(err);
        broadcast({ type: 'done', channel: channels.analysis(id), ok: false, errorCode: 'unknown', errorMessage: session.errorMessage });
      }
    } finally {
      persistSoon();
    }
  })();

  return id;
}

// ---------- 轻动作（翻译/解释） ----------

export async function startLight(snapshot: Snapshot, action: LightAction): Promise<string> {
  const { cfg, settings } = await resolveEndpoint();
  const guess = guessMode(snapshot.text);
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    kind: 'light',
    action,
    snapshot,
    guess,
    status: 'running',
    buffer: '',
    chat: [],
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  const controller = new AbortController();
  session.controller = controller;

  void (async () => {
    try {
      const prompt = buildLightPrompt(action, guess, { snapshot, settings });
      const acc = await chatCompletionWithRetry(cfg, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        stream: true,
        jsonObject: settings.api.strictJson,
        signal: controller.signal,
      });
      session.buffer = acc;
      let parsed = parseLight(acc, action, snapshot.text);
      if (!parsed.ok) {
        const retryAcc = await chatCompletionWithRetry(cfg, {
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
            { role: 'assistant', content: acc.slice(0, 2000) },
            { role: 'user', content: RETRY_INSTRUCTION },
          ],
          stream: false,
          jsonObject: true,
          signal: controller.signal,
        });
        parsed = parseLight(retryAcc, action, snapshot.text);
        if (!parsed.ok) {
          session.degraded = true;
          session.raw = acc;
          session.status = 'done';
          broadcast({ type: 'done', channel: channels.analysis(id), ok: true, degraded: true, raw: acc });
          persistSoon();
          return;
        }
      }
      session.result = parsed.data;
      session.status = 'done';
      broadcast({ type: 'done', channel: channels.analysis(id), ok: true });
    } catch (err) {
      session.status = 'error';
      const code = err instanceof AiError ? err.code : 'unknown';
      const msg = err instanceof Error ? err.message : String(err);
      session.errorCode = code;
      session.errorMessage = msg;
      broadcast({ type: 'done', channel: channels.analysis(id), ok: false, errorCode: code, errorMessage: msg });
    } finally {
      persistSoon();
    }
  })();

  return id;
}

export function cancelAnalysis(id: string): void {
  const s = sessions.get(id);
  s?.controller?.abort();
  s?.chatController?.abort();
}

// ---------- 连续追问 ----------

export async function followUp(
  id: string,
  question: string,
  ctx?: { snapshot: Snapshot; analysis: AnalysisResult | LightResult },
): Promise<void> {
  let session = sessions.get(id);
  // 收藏条目直接追问：会话不存在时用上下文现场构造
  if (!session && ctx) {
    session = {
      id,
      kind: 'analysis',
      snapshot: ctx.snapshot,
      guess: guessMode(ctx.snapshot.text),
      status: 'done',
      buffer: '',
      result: ctx.analysis,
      chat: [],
      createdAt: Date.now(),
    };
    sessions.set(id, session);
  }
  if (!session) throw new AiError('unknown', '分析会话不存在或已过期');
  const { cfg, settings } = await resolveEndpoint();

  const history = session.chat.filter((m) => !m.streaming);
  const analysis = session.result ?? null;
  const prompt = buildChatPrompt(question, history, analysis, { snapshot: session.snapshot, settings });

  session.chat.push({ role: 'user', content: question });
  const assistant: ChatMessage = { role: 'assistant', content: '', streaming: true };
  session.chat.push(assistant);

  const controller = new AbortController();
  session.chatController = controller;

  void (async () => {
    try {
      const acc = await chatCompletionWithRetry(cfg, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        stream: true,
        signal: controller.signal,
        onDelta: (d, accNow) => {
          assistant.content = accNow;
          broadcast({ type: 'chunk', channel: channels.chat(id), delta: d });
        },
      });
      assistant.content = acc;
      assistant.streaming = false;
      broadcast({ type: 'done', channel: channels.chat(id), ok: true });
    } catch (err) {
      assistant.streaming = false;
      const code = err instanceof AiError ? err.code : 'unknown';
      assistant.error = err instanceof Error ? err.message : String(err);
      broadcast({
        type: 'done',
        channel: channels.chat(id),
        ok: false,
        errorCode: code,
        errorMessage: assistant.error,
      });
    } finally {
      persistSoon();
    }
  })();
}

export function cancelFollowUp(id: string): void {
  sessions.get(id)?.chatController?.abort();
}

// ---------- 学习训练 ----------

export async function practiceGenerate(types: string[], count: number): Promise<Question[]> {
  const { cfg } = await resolveEndpoint();
  const all = await listEntriesRaw();
  const preview = all
    .slice(0, Math.max(count * 3, 12))
    .map((e) => ({
      text: e.text,
      type: e.type,
      context_meaning: e.analysis && 'summary' in e.analysis ? e.analysis.summary : undefined,
      word_info:
        e.analysis && 'word_info' in e.analysis && e.analysis.word_info
          ? {
              context_meaning: e.analysis.word_info.context_meaning,
              morphology: e.analysis.word_info.morphology,
            }
          : undefined,
      collocations:
        e.analysis && 'collocations' in e.analysis
          ? e.analysis.collocations?.map((c) => `${c.phrase}: ${c.meaning}`)
          : undefined,
      grammar_titles:
        e.analysis && 'grammar_points' in e.analysis
          ? e.analysis.grammar_points?.map((g) => g.title)
          : undefined,
      note: e.note || undefined,
    }));
  const previewJson = JSON.stringify(preview).slice(0, 6000);

  const prompt = buildPracticeGeneratePrompt(previewJson, types, count);
  const acc = await chatCompletionWithRetry(cfg, {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    stream: false,
    jsonObject: true,
  });
  const obj = extractJsonObject(acc) as { questions?: unknown } | undefined;
  const questions = Array.isArray(obj?.questions) ? (obj.questions as Question[]) : [];
  if (questions.length === 0) throw new AiError('parse', '未能生成练习题，请稍后重试');
  return questions.filter((q) => q && typeof q.prompt === 'string' && typeof q.answer === 'string');
}

export async function practiceGrade(session: PracticeSession): Promise<{ gradings: { questionId: string; verdict: string; comment: string }[]; overall_comment?: string }> {
  const { cfg } = await resolveEndpoint();
  const subjective = session.questions.filter(
    (q) => q.type === 'translation' || q.type === 'imitation' || q.type === 'correction',
  );
  const answers = session.answers.filter((a) => subjective.some((q) => q.id === a.questionId));
  if (answers.length === 0) return { gradings: [] };
  const prompt = buildPracticeGradePrompt(subjective, answers);
  const acc = await chatCompletionWithRetry(cfg, {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    stream: false,
    jsonObject: true,
  });
  const obj = extractJsonObject(acc) as
    | { gradings?: { questionId: string; verdict: string; comment: string }[]; overall_comment?: string }
    | undefined;
  return { gradings: obj?.gradings ?? [], overall_comment: obj?.overall_comment };
}

// ---------- 状态查询（Panel 恢复用） ----------

export function listSessionViews(): SessionView[] {
  return [...sessions.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SESSION_CACHE_LIMIT)
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      action: s.action,
      status: s.status,
      snapshot: s.snapshot,
      text: s.snapshot.text,
      sourceTitle: s.snapshot.title,
      buffer: s.buffer,
      result: s.result,
      degraded: s.degraded,
      raw: s.raw,
      errorCode: s.errorCode,
      errorMessage: s.errorMessage,
      chat: s.chat.map((m) => ({ role: m.role, content: m.content })),
      guess: s.guess,
    }));
}
