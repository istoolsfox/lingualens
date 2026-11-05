// ============================================================
// sidepanel/store.ts —— 侧边栏状态中枢（Zustand）
// Port 接线 / 分析状态机 / 对话 / 知识库 / 练习
// ============================================================

import { create } from 'zustand';
import { guessMode } from '../ai/router';
import { extractOverviewPartial, type OverviewPartial } from '../ai/streamExtract';
import {
  PORT_NAME,
  type ArticlePayload,
  type GetStateResponse,
  type PortSwMsg,
  type SessionView,
  type Snapshot,
  type StartResponse,
} from '../shared/messages';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import type {
  AnalysisResult,
  ChatMessage,
  Entry,
  EntryType,
  LightResult,
  Mode,
  PracticeSession,
  Question,
  QuestionType,
  TagRow,
} from '../shared/types';
import {
  addEntry,
  clearLibrary,
  deleteEntries,
  deleteEntry,
  listEntries,
  listEntriesRaw,
  listTags,
  newId,
  savePracticeSession,
  updateEntry,
  type ListFilter,
} from '../storage/favorites';
import { exportToFile, importFromFile, autoBackupIfEnabled } from '../storage/backup';
import { getSettings, onSettingsChanged } from '../storage/settings';

export type ViewKey = 'analysis' | 'library' | 'practice' | 'article';

export interface ArticleSlice {
  phase: 'idle' | 'running' | 'done' | 'error';
  payload: ArticlePayload | null;
  results: Record<number, string>;
  totalBatches: number;
  doneBatches: number;
  errorCode?: string;
  errorMessage?: string;
  /** 缓存/复用信息（URL 命中或段落级复用） */
  cacheInfo?: { cached: boolean; reused: number; fresh: number };
}
export type TabKey = 'overview' | 'structure' | 'grammar' | 'vocab' | 'collocations' | 'expression' | 'chat';

function sendMessage<T = unknown>(msg: unknown): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

interface Grading {
  questionId: string;
  verdict: 'correct' | 'partial' | 'wrong';
  comment: string;
}

export interface PanelState {
  ready: boolean;
  view: ViewKey;
  settings: Settings;
  restrictedHint: boolean;
  manualOpen: boolean;
  manualText: string;

  currentId: string | null;
  session: SessionView | null;
  status: 'idle' | 'running' | 'streaming' | 'done' | 'error';
  buffer: string;
  partial: OverviewPartial;
  degraded: boolean;
  errorCode?: string;
  errorMessage?: string;
  tab: TabKey;

  chatStreaming: boolean;

  entries: Entry[];
  tags: TagRow[];
  libQuery: string;
  libType: string;
  libTag: string;
  libLoading: boolean;
  libSelectedId: string | null;
  importReport: string | null;

  practicePhase: 'config' | 'quiz' | 'result';
  practiceTypes: QuestionType[];
  practiceCount: number;
  practiceQuestions: Question[];
  practiceAnswers: Record<string, string>;
  practiceGradings: Grading[];
  practiceOverall: string;
  practiceScore: number | null;
  practiceBusy: string | null;
  practiceError: string | null;

  article: ArticleSlice;

  beginArticle(payload: ArticlePayload): void;
  cancelArticleAct(): void;
  retryArticle(): Promise<void>;

  init(): Promise<void>;
  setView(v: ViewKey): void;
  setTab(t: TabKey): void;
  applyTheme(): void;
  acknowledgePrivacy(): Promise<void>;

  startFromSnapshot(
    snapshot: Snapshot,
    action: 'analyze' | 'translate' | 'explain',
    mode?: Mode,
  ): Promise<void>;
  analyzeManualText(): Promise<void>;
  setManualOpen(v: boolean): void;
  setManualText(v: string): void;
  cancelCurrent(): void;
  cancelFollowUp(): void;
  reAnalyze(): Promise<void>;
  favoriteCurrent(tags?: string[]): Promise<void>;
  followUp(question: string): Promise<void>;
  openEntry(entryId: string): Promise<void>;

  loadLibrary(): Promise<void>;
  setLibFilter(patch: Partial<{ query: string; type: string; tag: string }>): void;
  removeEntries(ids: string[]): Promise<void>;
  removeEntry(id: string): Promise<void>;
  saveEntryNote(id: string, note: string): Promise<void>;
  saveEntryTags(id: string, tags: string[]): Promise<void>;
  selectEntry(id: string | null): void;
  exportData(): Promise<void>;
  importData(file: File): Promise<void>;
  clearLibraryData(): Promise<void>;

  togglePracticeType(t: QuestionType): void;
  setPracticeCount(n: number): void;
  startPractice(): Promise<void>;
  setAnswer(qid: string, answer: string): void;
  submitPractice(): Promise<void>;
  resetPractice(): void;
}

export const useStore = create<PanelState>()((set, get) => {
  // ---------- Port 接线 ----------

  let port: chrome.runtime.Port | null = null;
  const disposed = false;

  function handlePortMsg(msg: PortSwMsg): void {
    const st = get();
    if (msg.type === 'pending') {
      set({ manualOpen: false, view: 'analysis' });
      void st.startFromSnapshot(msg.snapshot, msg.action);
      return;
    }
    if (msg.type === 'pending-article') {
      get().beginArticle(msg.payload);
      return;
    }
    if (msg.type === 'article_batch') {
      const art = get().article;
      const results = { ...art.results };
      for (const it of msg.items) results[it.id] = it.natural;
      set({
        article: {
          ...art,
          results,
          doneBatches: Math.max(art.doneBatches, msg.index + 1),
          totalBatches: msg.total,
        },
      });
      return;
    }
    if (msg.type === 'chunk') {
      if (msg.channel.startsWith('analysis:')) {
        const id = msg.channel.slice('analysis:'.length);
        if (id === st.currentId) {
          const buffer = st.buffer + msg.delta;
          set({ buffer, partial: extractOverviewPartial(buffer), status: 'streaming' });
        }
      } else if (msg.channel.startsWith('chat:')) {
        if (st.session) {
          set({
            session: { ...st.session, chat: appendChatDelta(st.session.chat, msg.delta) },
          });
        }
      }
      return;
    }
    if (msg.type === 'done') {
      if (msg.channel.startsWith('analysis:')) {
        const id = msg.channel.slice('analysis:'.length);
        if (id !== st.currentId) return;
        if (!msg.ok) {
          set({ status: 'error', errorCode: msg.errorCode, errorMessage: msg.errorMessage });
          return;
        }
        if (msg.degraded) set({ degraded: true });
        void refreshSession(id);
      } else if (msg.channel.startsWith('chat:')) {
        if (!msg.ok) {
          if (st.session) {
            set({
              session: {
                ...st.session,
                chat: markChatError(st.session.chat, msg.errorMessage ?? '生成失败'),
              },
              chatStreaming: false,
            });
          }
          return;
        }
        void refreshSession(st.session?.id ?? null).then(() => set({ chatStreaming: false }));
      } else if (msg.channel === 'article') {
        const art = get().article;
        const info = msg.payload as { cached?: boolean; reused?: number; fresh?: number } | undefined;
        if (!msg.ok) {
          set({
            article: { ...art, phase: 'error', errorCode: msg.errorCode, errorMessage: msg.errorMessage },
          });
        } else {
          set({
            article: {
              ...art,
              phase: 'done',
              cacheInfo:
                info && typeof info.reused === 'number'
                  ? { cached: info.cached === true, reused: info.reused ?? 0, fresh: info.fresh ?? 0 }
                  : art.cacheInfo,
            },
          });
        }
      }
    }
  }

  function appendChatDelta(chat: ChatMessage[], delta: string): ChatMessage[] {
    const next = [...chat];
    for (let i = next.length - 1; i >= 0; i--) {
      const m = next[i];
      if (m && m.role === 'assistant' && m.streaming) {
        next[i] = { ...m, content: m.content + delta };
        return next;
      }
    }
    next.push({ role: 'assistant', content: delta, streaming: true });
    return next;
  }

  function markChatError(chat: ChatMessage[], error: string): ChatMessage[] {
    const next = [...chat];
    for (let i = next.length - 1; i >= 0; i--) {
      const m = next[i];
      if (m && m.role === 'assistant' && m.streaming) {
        next[i] = { ...m, streaming: false, error };
        return next;
      }
    }
    return next;
  }

  function connectPort(): void {
    if (disposed) return;
    port = chrome.runtime.connect({ name: PORT_NAME });
    port.onMessage.addListener((msg: PortSwMsg) => handlePortMsg(msg));
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connectPort, 800);
    });
  }

  async function refreshSession(id: string | null): Promise<void> {
    if (!id) return;
    try {
      const res = await sendMessage<{ session: SessionView | null }>({ type: 'SESSION_GET', analysisId: id });
      if (res.session) {
        set({
          session: res.session,
          status: res.session.status === 'error' ? 'error' : 'done',
          buffer: res.session.buffer,
          errorCode: res.session.errorCode,
          errorMessage: res.session.errorMessage,
        });
      }
    } catch {
      /* SW 重启边缘场景：保留当前状态 */
    }
  }

  return {
    ready: false,
    view: 'analysis',
    settings: DEFAULT_SETTINGS,
    restrictedHint: false,
    manualOpen: false,
    manualText: '',

    currentId: null,
    session: null,
    status: 'idle',
    buffer: '',
    partial: {},
    degraded: false,
    tab: 'overview',

    chatStreaming: false,

    entries: [],
    tags: [],
    libQuery: '',
    libType: 'all',
    libTag: 'all',
    libLoading: false,
    libSelectedId: null,
    importReport: null,

    practicePhase: 'config',
    practiceTypes: ['word_meaning', 'phrase_meaning', 'grammar_choice', 'translation', 'imitation'],
    practiceCount: 5,
    practiceQuestions: [],
    practiceAnswers: {},
    practiceGradings: [],
    practiceOverall: '',
    practiceScore: null,
    practiceBusy: null,
    practiceError: null,

    article: {
      phase: 'idle',
      payload: null,
      results: {},
      totalBatches: 0,
      doneBatches: 0,
      cacheInfo: undefined,
    },

    beginArticle(payload) {
      set({
        view: 'article',
        article: {
          phase: 'running',
          payload,
          results: {},
          totalBatches: 0,
          doneBatches: 0,
          errorCode: undefined,
          errorMessage: undefined,
          cacheInfo: undefined,
        },
      });
    },

    cancelArticleAct() {
      void sendMessage({ type: 'ARTICLE_CANCEL' });
      const art = get().article;
      set({ article: { ...art, phase: 'error', errorCode: 'aborted' } });
    },

    async retryArticle() {
      const payload = get().article.payload;
      if (!payload) return;
      await sendMessage({ type: 'ARTICLE_TRANSLATE', payload });
      get().beginArticle(payload);
    },

    async init() {
      connectPort();
      const settings = await getSettings();
      set({ settings });
      onSettingsChanged((s) => {
        set({ settings: s });
        get().applyTheme();
      });
      get().applyTheme();

      const state = await sendMessage<GetStateResponse>({ type: 'GET_STATE' });
      const latest = (state.sessions as SessionView[])[0] ?? null;
      if (state.pending) {
        set({ manualOpen: false });
        await get().startFromSnapshot(state.pending.snapshot, state.pending.action);
      } else if (state.article?.payload) {
        // 整文翻译进行中/已完成：恢复视图
        const a = state.article;
        set({
          view: 'article',
          article: {
            phase: a.running ? 'running' : a.errorCode ? 'error' : 'done',
            payload: a.payload,
            results: a.results,
            totalBatches: a.totalBatches,
            doneBatches: a.doneBatches,
            errorCode: a.errorCode,
            cacheInfo: a.cacheInfo,
          },
        });
      } else if (state.restricted) {
        set({ restrictedHint: true, manualOpen: true });
      } else if (latest && latest.status === 'done') {
        set({
          session: latest,
          currentId: latest.id,
          status: 'done',
          buffer: latest.buffer,
          degraded: latest.degraded === true,
        });
      }
      await get().loadLibrary();
      set({ ready: true });
      await sendMessage({ type: 'CLEAR_PENDING' }).catch(() => undefined);
    },

    setView(v) {
      set({ view: v });
    },

    setTab(t) {
      set({ tab: t });
    },

    applyTheme() {
      // v0.4 定案：白底单色主题，清掉历史 dark 残留
      document.documentElement.classList.remove('dark');
    },

    async acknowledgePrivacy() {
      const s = get().settings;
      await chrome.storage.local.set({ ll_settings: { ...s, privacyAcknowledgedAt: Date.now() } });
    },

    async startFromSnapshot(snapshot, action, mode) {
      set({
        view: 'analysis',
        status: 'running',
        buffer: '',
        partial: {},
        degraded: false,
        errorCode: undefined,
        errorMessage: undefined,
        session: null,
        currentId: null,
        tab: 'overview',
        chatStreaming: false,
        restrictedHint: false,
      });
      try {
        const res =
          action === 'analyze'
            ? await sendMessage<StartResponse>({ type: 'ANALYZE', snapshot, mode })
            : await sendMessage<StartResponse>({ type: 'LIGHT_ACTION', snapshot, action });
        if (res.error) {
          set({ status: 'error', errorCode: res.error, errorMessage: res.errorMessage });
          return;
        }
        set({ currentId: res.analysisId ?? null });
      } catch (err) {
        set({
          status: 'error',
          errorCode: 'unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async analyzeManualText() {
      const text = get().manualText.trim();
      if (!text) return;
      const snapshot: Snapshot = {
        text,
        contextBefore: '',
        contextAfter: '',
        url: '',
        title: '(手动输入)',
        source: 'manual-input',
      };
      set({ manualText: '', manualOpen: false });
      await get().startFromSnapshot(snapshot, 'analyze');
    },

    setManualOpen(v) {
      set({ manualOpen: v });
    },

    setManualText(v) {
      set({ manualText: v });
    },

    cancelCurrent() {
      const id = get().currentId;
      if (id) void sendMessage({ type: 'ANALYZE_CANCEL', analysisId: id });
    },

    cancelFollowUp() {
      const id = get().session?.id;
      if (id) void sendMessage({ type: 'FOLLOWUP_CANCEL', analysisId: id });
      // 本地把流式占位标记为结束
      const s = get().session;
      if (s) {
        set({
          session: {
            ...s,
            chat: s.chat.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
          },
          chatStreaming: false,
        });
      }
    },

    async reAnalyze() {
      const s = get().session;
      if (!s) return;
      const action = s.kind === 'light' ? (s.action === 'translate' ? 'translate' : 'explain') : 'analyze';
      await get().startFromSnapshot(s.snapshot, action);
    },

    async favoriteCurrent(tags) {
      const s = get().session;
      if (!s) return;
      const entry: Entry = {
        id: newId(),
        type: (s.result && 'detected_type' in s.result
          ? s.result.detected_type
          : guessMode(s.text)) as EntryType,
        text: s.text,
        analysis: s.result ?? null,
        note: '',
        tags: tags ?? [],
        sourceUrl: s.snapshot.url,
        sourceTitle: s.snapshot.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await addEntry(entry);
      await get().loadLibrary();
    },

    async followUp(question) {
      const s = get().session;
      if (!s || !question.trim()) return;
      const ctx = s.result
        ? { snapshot: s.snapshot, analysis: s.result as AnalysisResult | LightResult }
        : undefined;
      set({
        session: {
          ...s,
          chat: [
            ...s.chat,
            { role: 'user', content: question },
            { role: 'assistant', content: '', streaming: true },
          ],
        },
        chatStreaming: true,
        tab: 'chat',
      });
      await sendMessage({ type: 'FOLLOWUP', analysisId: s.id, question, ctx });
    },

    async openEntry(entryId) {
      const entry =
        get().entries.find((e) => e.id === entryId) ?? (await listEntriesRaw()).find((e) => e.id === entryId);
      if (!entry) return;
      const view: SessionView = {
        id: entry.id,
        kind: 'analysis',
        status: entry.analysis ? 'done' : 'error',
        snapshot: {
          text: entry.text,
          contextBefore: '',
          contextAfter: '',
          url: entry.sourceUrl,
          title: entry.sourceTitle,
          source: 'library',
        },
        text: entry.text,
        sourceTitle: entry.sourceTitle,
        buffer: '',
        result: entry.analysis ?? undefined,
        errorCode: entry.analysis ? undefined : 'empty',
        errorMessage: entry.analysis ? undefined : '该条目还没有分析结果，点击「重新分析」补充。',
        chat: [],
        guess: guessMode(entry.text),
      };
      set({
        view: 'analysis',
        session: view,
        currentId: entry.id,
        status: entry.analysis ? 'done' : 'error',
        buffer: '',
        partial: {},
        tab: 'overview',
        degraded: false,
      });
    },

    async loadLibrary() {
      set({ libLoading: true });
      const st = get();
      const filter: ListFilter = {};
      if (st.libQuery) filter.query = st.libQuery;
      if (st.libType !== 'all') filter.type = st.libType;
      if (st.libTag !== 'all') filter.tag = st.libTag;
      const [entries, tags] = await Promise.all([listEntries(filter), listTags()]);
      set({ entries, tags, libLoading: false });
      // 自定义备份目录：库变更后静默同步（未授权/未开启时内部自动跳过）
      void autoBackupIfEnabled();
    },

    setLibFilter(patch) {
      const st = get();
      set({
        libQuery: patch.query ?? st.libQuery,
        libType: patch.type ?? st.libType,
        libTag: patch.tag ?? st.libTag,
      });
      void get().loadLibrary();
    },

    async removeEntries(ids) {
      await deleteEntries(ids);
      if (ids.includes(get().libSelectedId ?? '')) set({ libSelectedId: null });
      await get().loadLibrary();
    },

    async removeEntry(id) {
      await deleteEntry(id);
      if (get().libSelectedId === id) set({ libSelectedId: null });
      await get().loadLibrary();
    },

    async saveEntryNote(id, note) {
      const entry = get().entries.find((e) => e.id === id);
      if (!entry) return;
      await updateEntry({ ...entry, note });
      await get().loadLibrary();
    },

    async saveEntryTags(id, tags) {
      const entry = get().entries.find((e) => e.id === id);
      if (!entry) return;
      await updateEntry({ ...entry, tags });
      await get().loadLibrary();
    },

    selectEntry(id) {
      set({ libSelectedId: id });
    },

    async exportData() {
      const { filename, entries } = await exportToFile();
      set({ importReport: `已导出 ${entries} 条 → ${filename}` });
    },

    async importData(file) {
      try {
        const report = await importFromFile(file);
        set({
          importReport: `导入完成：新增 ${report.entriesAdded} 条，更新 ${report.entriesUpdated} 条，练习 ${report.practiceAdded} 组`,
        });
        await get().loadLibrary();
      } catch (err) {
        set({ importReport: `导入失败：${err instanceof Error ? err.message : String(err)}` });
      }
    },

    async clearLibraryData() {
      await clearLibrary();
      set({ entries: [], tags: [], libSelectedId: null, importReport: '本地知识库已清空' });
    },

    togglePracticeType(t) {
      const cur = get().practiceTypes;
      set({ practiceTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
    },

    setPracticeCount(n) {
      set({ practiceCount: Math.max(1, Math.min(10, n)) });
    },

    async startPractice() {
      const { practiceTypes: types, practiceCount: count } = get();
      if (types.length === 0) {
        set({ practiceError: '请至少选择一种题型' });
        return;
      }
      set({ practiceBusy: 'generating', practiceError: null });
      try {
        const res = await sendMessage<{ questions?: Question[]; error?: string; errorMessage?: string }>({
          type: 'PRACTICE_GENERATE',
          entryIds: [],
          types,
          count,
        });
        if (res.error) {
          set({ practiceError: res.errorMessage ?? res.error, practiceBusy: null });
          return;
        }
        set({
          practiceQuestions: res.questions ?? [],
          practiceAnswers: {},
          practicePhase: 'quiz',
          practiceBusy: null,
          practiceGradings: [],
          practiceScore: null,
          practiceOverall: '',
        });
      } catch (err) {
        set({ practiceError: err instanceof Error ? err.message : String(err), practiceBusy: null });
      }
    },

    setAnswer(qid, answer) {
      set({ practiceAnswers: { ...get().practiceAnswers, [qid]: answer } });
    },

    async submitPractice() {
      const { practiceQuestions: questions, practiceAnswers: answers } = get();
      set({ practiceBusy: 'grading', practiceError: null });
      const gradings: Grading[] = [];
      for (const q of questions) {
        if (q.options && q.options.length > 0) {
          const user = answers[q.id]?.trim() ?? '';
          gradings.push({
            questionId: q.id,
            verdict: user === q.answer ? 'correct' : 'wrong',
            comment: user === q.answer ? '回答正确。' : `正确答案：${q.answer}。${q.explanation}`,
          });
        }
      }
      const ps: PracticeSession = {
        id: newId(),
        createdAt: Date.now(),
        types: [...new Set(questions.map((q) => q.type))],
        questions,
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' })),
      };
      const subjective = questions.filter((q) => !q.options || q.options.length === 0);
      if (subjective.length > 0) {
        try {
          const res = await sendMessage<{ gradings?: Grading[]; overall_comment?: string; error?: string }>({
            type: 'PRACTICE_GRADE',
            session: ps,
          });
          if (res.gradings) gradings.push(...res.gradings);
          if (res.overall_comment) set({ practiceOverall: res.overall_comment });
        } catch (err) {
          set({ practiceError: err instanceof Error ? err.message : String(err) });
        }
      }
      const correct = gradings.filter((g) => g.verdict === 'correct').length;
      const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
      ps.gradings = gradings;
      ps.score = score;
      await savePracticeSession(ps);
      set({ practiceGradings: gradings, practiceScore: score, practicePhase: 'result', practiceBusy: null });
    },

    resetPractice() {
      set({
        practicePhase: 'config',
        practiceQuestions: [],
        practiceAnswers: {},
        practiceGradings: [],
        practiceScore: null,
        practiceError: null,
        practiceOverall: '',
      });
    },
  };
});
