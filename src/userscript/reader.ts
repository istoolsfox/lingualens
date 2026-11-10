// ============================================================
// userscript/reader.ts —— 划词浮动栏 + 精读抽屉（Shadow DOM）
// 扩展侧边栏的页内等价物：四模式结构化讲解 / 轻翻译 / 追问 / 手动输入。
// 复用：guessMode / buildAnalysisPrompt / buildLightPrompt / buildChatPrompt /
//       parseAnalysis / parseLight / ERROR_MESSAGES / MODE_LABELS
// ============================================================

import { chatCompletion, type EndpointConfig } from '../ai/client';
import { guessMode } from '../ai/router';
import { parseAnalysis, parseLight } from '../ai/parser';
import { buildAnalysisPrompt, buildChatPrompt, buildLightPrompt } from '../ai/promptBuilder';
import { ERROR_MESSAGES, MODE_LABELS } from '../shared/constants';
import { mergeSettings, type Settings } from '../shared/settings';
import type { AnalysisResult, LightResult, Mode } from '../shared/types';
import type { Snapshot } from '../shared/messages';
import { loadApiKey } from '../background/secureStore';
import { gmStorageLike } from './gm';
import { gmGetValueRaw } from './gmRaw';
import { startPageTranslate } from '../content/fullpage';

const TAG = 'data-ll-lite';

const CSS = `
  :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* ---- 划词浮动栏 ---- */
  .bar { position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 2px;
    background: #fff; border: 0.5px solid rgba(15,23,42,.14); border-radius: 10px; padding: 4px;
    box-shadow: 0 6px 20px rgba(15,23,42,.14); font-size: 12px; color: #334155; }
  .bar button { appearance: none; border: 0; background: transparent; color: #334155; font-size: 12px;
    padding: 6px 9px; border-radius: 6px; cursor: pointer; white-space: nowrap; font-family: inherit; }
  .bar button:hover { background: #f1f5f9; color: #1e293b; }
  .bar button.primary { background: #2563eb; color: #fff; font-weight: 600; }
  .bar button.primary:hover { background: #1d4ed8; }
  /* ---- 抽屉 ---- */
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 92vw; z-index: 2147483646;
    background: #fff; border-left: 0.5px solid rgba(15,23,42,.14); box-shadow: -8px 0 28px rgba(15,23,42,.10);
    display: flex; flex-direction: column; color: #1e293b; font-size: 13px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 0.5px solid rgba(15,23,42,.08);
    background: #f8fafc; flex: none; }
  .logo { width: 24px; height: 24px; border-radius: 7px; background: #2563eb; color: #fff; font-weight: 700;
    font-size: 13px; display: flex; align-items: center; justify-content: center; flex: none; }
  .head b { font-size: 14px; flex: 1; }
  .head .icon-btn { appearance: none; border: 0; background: transparent; color: #64748b; font-size: 13px;
    cursor: pointer; padding: 4px 6px; border-radius: 6px; font-family: inherit; }
  .head .icon-btn:hover { background: #f1f5f9; color: #1e293b; }
  .body { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .manual { display: flex; gap: 6px; }
  .manual textarea { flex: 1; height: 56px; resize: vertical; border: 0.5px solid rgba(15,23,42,.14);
    border-radius: 8px; padding: 7px 9px; font-size: 12px; font-family: inherit; outline: none; }
  .manual textarea:focus { border-color: #2563eb; }
  .manual button { appearance: none; border: 0; background: #f1f5f9; color: #334155; border-radius: 8px;
    padding: 0 10px; font-size: 11px; cursor: pointer; font-family: inherit; flex: none; }
  .src { background: #f8fafc; border: 0.5px solid rgba(15,23,42,.08); border-radius: 8px; padding: 8px 10px;
    color: #475569; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
  .sum { border-left: 3px solid #2563eb; padding: 2px 0 2px 10px; line-height: 1.7; font-size: 13px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pair > div { background: #f8fafc; border: 0.5px solid rgba(15,23,42,.08); border-radius: 8px; padding: 8px 10px; }
  .pair .t { font-size: 10px; color: #94a3b8; margin-bottom: 4px; }
  details { border: 0.5px solid rgba(15,23,42,.08); border-radius: 8px; background: #fff; }
  summary { cursor: pointer; list-style: none; padding: 8px 10px; font-size: 12px; font-weight: 600;
    color: #1e293b; display: flex; align-items: center; gap: 6px; }
  summary::after { content: '▸'; color: #94a3b8; font-size: 10px; margin-left: auto; }
  details[open] summary::after { transform: rotate(90deg); }
  details .list { padding: 2px 10px 8px; display: flex; flex-direction: column; gap: 8px; }
  .item { font-size: 12px; line-height: 1.65; color: #475569; }
  .item b { color: #1e293b; font-size: 12px; }
  .item .en { color: #2563eb; }
  .kind { display: inline-block; font-size: 10px; color: #64748b; background: #f1f5f9;
    border: 0.5px solid rgba(15,23,42,.08); border-radius: 6px; padding: 1px 6px; margin-left: 4px; vertical-align: 1px; }
  .spin { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 12px; padding: 6px 0; }
  .spin i { width: 14px; height: 14px; border: 2px solid #dbeafe; border-top-color: #2563eb; border-radius: 50%;
    animation: llr 0.8s linear infinite; flex: none; }
  @keyframes llr { to { transform: rotate(360deg); } }
  .err { background: #fef2f2; border: 0.5px solid rgba(220,38,38,.25); color: #b91c1c;
    border-radius: 8px; padding: 9px 11px; font-size: 12px; line-height: 1.6; }
  .err button { appearance: none; border: 0.5px solid rgba(220,38,38,.35); background: #fff; color: #b91c1c;
    border-radius: 6px; padding: 4px 10px; font-size: 11px; margin-top: 6px; cursor: pointer; font-family: inherit; }
  .follow { display: flex; gap: 6px; border-top: 0.5px solid rgba(15,23,42,.08); padding-top: 10px; margin-top: auto; }
  .follow input { flex: 1; border: 0.5px solid rgba(15,23,42,.14); border-radius: 8px; padding: 8px 10px;
    font-size: 12px; font-family: inherit; outline: none; }
  .follow input:focus { border-color: #2563eb; }
  .follow button { appearance: none; border: 0; background: #2563eb; color: #fff; border-radius: 8px;
    padding: 0 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; flex: none; }
  .chat { display: flex; flex-direction: column; gap: 6px; }
  .chat .m { font-size: 12px; line-height: 1.65; padding: 6px 10px; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .chat .m.u { background: #eff6ff; color: #1e40af; align-self: flex-end; max-width: 85%; }
  .chat .m.a { background: #f8fafc; border: 0.5px solid rgba(15,23,42,.08); color: #334155; max-width: 95%; }
  .foot { flex: none; padding: 10px 14px 12px; }
  .empty { color: #94a3b8; font-size: 12px; text-align: center; padding: 18px 0; }
`;

// ---------- 全局状态 ----------

let rootHost: HTMLDivElement | null = null;
let drawerBody: HTMLElement | null = null;
let followInput: HTMLInputElement | null = null;
let lastResult: AnalysisResult | LightResult | null = null;
let lastSnapshot: Snapshot | null = null;
let chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
let barHost: HTMLDivElement | null = null;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function kindLabel(k: unknown): string {
  const map: Record<string, string> = { rule: '规则', habit: '习惯', style: '风格' };
  const s = String(k ?? '');
  return map[s] ? `<span class="kind">${map[s]}</span>` : '';
}
function sec(title: string, body: string, open = false): string {
  return body
    ? `<details${open ? ' open' : ''}><summary>${title}</summary><div class="list">${body}</div></details>`
    : '';
}

async function resolveConfig(): Promise<EndpointConfig | null> {
  const settings: Settings = mergeSettings(gmGetValueRaw('ll_settings'));
  const apiKey = await loadApiKey(gmStorageLike);
  if (!settings.api.baseUrl || !settings.api.model || !apiKey) return null;
  return {
    baseUrl: settings.api.baseUrl,
    apiKey,
    model: settings.api.model,
    temperature: settings.api.temperature,
    maxTokens: settings.api.maxTokens,
    timeoutMs: settings.api.timeoutMs,
  };
}

// ---------- 抽屉 ----------

function ensureDrawer(): void {
  if (rootHost?.isConnected) return;
  rootHost = document.createElement('div');
  rootHost.setAttribute(TAG, '');
  const root = rootHost.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.innerHTML = `
    <div class="head">
      <span class="logo">L</span><b>LinguaLens Lite</b>
      <button class="icon-btn act-settings" title="设置">⚙</button>
      <button class="icon-btn act-close" title="关闭">✕</button>
    </div>
    <div class="body">
      <div class="manual">
        <textarea placeholder="粘贴英文，或直接在网页里选中内容"></textarea>
        <button class="manual-go">精读</button>
      </div>
      <div class="out"><div class="empty">选中网页上的英文开始精读</div></div>
    </div>
    <div class="foot">
      <div class="follow">
        <input class="q" placeholder="追问：这个语法为什么这样用？" />
        <button class="ask">问</button>
      </div>
    </div>`;
  root.append(style, drawer);
  document.documentElement.appendChild(rootHost);

  drawerBody = drawer.querySelector('.body');
  followInput = drawer.querySelector('.q') as HTMLInputElement;
  drawer.querySelector('.act-close')?.addEventListener('click', closeDrawer);
  drawer.querySelector('.act-settings')?.addEventListener('click', () => {
    void import('./settingsPanel').then((m) => m.openSettings());
  });
  const manualGo = (): void => {
    const ta = drawer.querySelector('.manual textarea') as HTMLTextAreaElement;
    const text = ta.value.replace(/\s+/g, ' ').trim();
    if (text) void runAnalysis(text, undefined);
  };
  drawer.querySelector('.manual-go')?.addEventListener('click', manualGo);
  drawer.querySelector('.ask')?.addEventListener('click', () => {
    const q = (followInput as HTMLInputElement).value.trim();
    if (q) void runFollowUp(q);
  });
  followInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = followInput?.value.trim();
      if (q) void runFollowUp(q);
    }
  });
}

export function openDrawer(): void {
  ensureDrawer();
}

export function closeDrawer(): void {
  rootHost?.remove();
  rootHost = null;
  drawerBody = null;
  followInput = null;
}

function outEl(): HTMLElement {
  ensureDrawer();
  return (drawerBody?.querySelector('.out') as HTMLElement) ?? document.createElement('div');
}

function setBusy(label: string): void {
  const out = outEl();
  out.innerHTML = `<div class="spin"><i></i><span>${esc(label)}</span></div>`;
}

function setError(code: string, retry: () => void): void {
  const out = outEl();
  out.innerHTML = `<div class="err">${esc(ERROR_MESSAGES[code] ?? '发生未知错误，请重试。')}
    <button class="retry">重试</button></div>`;
  out.querySelector('.retry')?.addEventListener('click', retry);
}

function renderAnalysis(a: AnalysisResult): void {
  const out = outEl();
  const parts: string[] = [];
  parts.push(`<div class="sum">${esc(a.summary)}</div>`);
  if (a.translation?.literal || a.translation?.natural) {
    parts.push(`<div class="pair"><div><div class="t">直译</div>${esc(a.translation.literal)}</div>
      <div><div class="t">意译（推荐）</div>${esc(a.translation.natural)}</div></div>`);
  }
  parts.push(
    sec(
      `意群拆解${a.chunks?.length ? ` · ${a.chunks.length}` : ''}`,
      (a.chunks ?? [])
        .map((c) => `<div class="item"><span class="en">${esc(c.text)}</span> → <b>${esc(c.meaning)}</b>${c.role ? kindLabel(c.role) : ''}</div>`)
        .join(''),
    ),
  );
  parts.push(
    sec(
      `语法结构${a.structure?.length ? ` · ${a.structure.length}` : ''}`,
      (a.structure ?? [])
        .map((s) => `<div class="item"><b>${esc(s.component)}</b>：<span class="en">${esc(s.text)}</span> — ${esc(s.explanation)}</div>`)
        .join(''),
    ),
  );
  parts.push(
    sec(
      `语法要点${a.grammar_points?.length ? ` · ${a.grammar_points.length}` : ''}`,
      (a.grammar_points ?? [])
        .map((g) => `<div class="item"><b>${esc(g.title)}</b>${kindLabel(g.kind)}：${g.quote ? `<span class="en">${esc(g.quote)}</span> — ` : ''}${esc(g.explanation)}</div>`)
        .join(''),
      true,
    ),
  );
  parts.push(
    sec(
      `词汇与构词${a.vocabulary?.length ? ` · ${a.vocabulary.length}` : ''}`,
      (a.vocabulary ?? [])
        .map((v) => `<div class="item"><b><span class="en">${esc(v.word)}</span></b> ${esc(v.pos ?? '')}：<b>${esc(v.context_meaning)}</b>${v.morphology ? `（构词：${esc(v.morphology)}）` : ''}${v.collocations?.length ? `<br/>搭配：${esc(v.collocations.join(' / '))}` : ''}</div>`)
        .join(''),
    ),
  );
  parts.push(
    sec(
      `搭配与习语${a.collocations?.length ? ` · ${a.collocations.length}` : ''}`,
      (a.collocations ?? [])
        .map((c) => `<div class="item"><span class="en">${esc(c.phrase)}</span> → <b>${esc(c.meaning)}</b>${kindLabel(c.kind)}${c.usage_note ? `<br/>${esc(c.usage_note)}` : ''}${c.examples?.length ? `<br/>例：${esc(c.examples.join('　'))}` : ''}</div>`)
        .join(''),
    ),
  );
  parts.push(
    sec(
      `中英差异${a.expression?.length ? ` · ${a.expression.length}` : ''}`,
      (a.expression ?? [])
        .map((e) => `<div class="item"><b>${esc(e.title)}</b>${kindLabel(e.kind)}<br/>英：<span class="en">${esc(e.en_side)}</span><br/>中：${esc(e.cn_side)}</div>`)
        .join(''),
    ),
  );
  out.innerHTML = parts.join('');
  ensureFollowVisible();
}

function renderLight(r: LightResult): void {
  const out = outEl();
  const parts: string[] = [];
  if (r.summary) parts.push(`<div class="sum">${esc(r.summary)}</div>`);
  if (r.translation?.natural || r.translation?.literal) {
    parts.push(`<div class="pair"><div><div class="t">直译</div>${esc(r.translation.literal)}</div>
      <div><div class="t">意译（推荐）</div>${esc(r.translation.natural)}</div></div>`);
  }
  if (r.word_info) {
    const w = r.word_info;
    parts.push(
      sec(
        '词汇与构词',
        `<div class="item"><b><span class="en">${esc(w.word)}</span></b> ${esc(w.pos)}：${esc(w.core_meanings?.join(' / ') ?? '')}；语境义 <b>${esc(w.context_meaning)}</b>${w.morphology ? `（构词：${esc(w.morphology)}）` : ''}${w.usage?.collocations?.length ? `<br/>搭配：${esc(w.usage.collocations.join(' / '))}` : ''}${w.compare?.length ? `<br/>近义对比：${esc(w.compare.map((c) => `${c.expression}（${c.difference}）`).join('；'))}` : ''}</div>`,
        true,
      ),
    );
  }
  if (r.expression?.length) {
    parts.push(
      sec(
        `表达讲解 · ${r.expression.length}`,
        r.expression
          .map((e) => `<div class="item"><b>${esc(e.title)}</b>${kindLabel(e.kind)}<br/>英：<span class="en">${esc(e.en_side)}</span><br/>中：${esc(e.cn_side)}</div>`)
          .join(''),
        true,
      ),
    );
  }
  out.innerHTML = parts.join('') || `<div class="empty">（无内容）</div>`;
  ensureFollowVisible();
}

function ensureFollowVisible(): void {
  const follow = drawerBody?.querySelector('.follow') as HTMLElement | null;
  if (follow) follow.style.display = lastResult ? 'flex' : 'none';
}

// ---------- 动作 ----------

async function runAnalysis(text: string, manual: Mode | undefined): Promise<void> {
  openDrawer();
  const guess = guessMode(text);
  const mode = manual ?? guess;
  const settings = mergeSettings(gmGetValueRaw('ll_settings'));
  lastSnapshot = {
    text: text.slice(0, 12000),
    contextBefore: '',
    contextAfter: '',
    url: location.href,
    title: document.title,
    source: 'floating-bar',
  };
  chatHistory = [];
  const cfg = await resolveConfig();
  setBusy(`AI ${MODE_LABELS[mode] ?? ''}精读中…`);
  if (!cfg) {
    setError('not_configured', () => void runAnalysis(text, manual));
    return;
  }
  const prompt = buildAnalysisPrompt(mode, guess, manual, { snapshot: lastSnapshot, settings });
  try {
    const acc = await chatCompletion(cfg, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: false,
      jsonObject: settings.api.strictJson,
    });
    const parsed = parseAnalysis(acc, lastSnapshot.text);
    if (!parsed.ok) {
      setError('parse', () => void runAnalysis(text, manual));
      return;
    }
    lastResult = parsed.data;
    renderAnalysis(parsed.data);
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
    setError(code, () => void runAnalysis(text, manual));
  }
}

async function runLight(action: 'translate' | 'explain', text: string): Promise<void> {
  openDrawer();
  const guess = guessMode(text);
  const settings = mergeSettings(gmGetValueRaw('ll_settings'));
  lastSnapshot = {
    text: text.slice(0, 12000),
    contextBefore: '',
    contextAfter: '',
    url: location.href,
    title: document.title,
    source: 'floating-bar',
  };
  chatHistory = [];
  const cfg = await resolveConfig();
  setBusy(action === 'translate' ? '翻译中…' : '讲解中…');
  if (!cfg) {
    setError('not_configured', () => void runLight(action, text));
    return;
  }
  const prompt = buildLightPrompt(action, guess, { snapshot: lastSnapshot, settings });
  try {
    const acc = await chatCompletion(cfg, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: false,
      jsonObject: settings.api.strictJson,
    });
    const parsed = parseLight(acc, action, lastSnapshot.text);
    if (!parsed.ok) {
      setError('parse', () => void runLight(action, text));
      return;
    }
    lastResult = parsed.data;
    renderLight(parsed.data);
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
    setError(code, () => void runLight(action, text));
  }
}

async function runFollowUp(question: string): Promise<void> {
  if (!lastSnapshot) return;
  const cfg = await resolveConfig();
  if (!cfg) {
    setError('not_configured', () => void runFollowUp(question));
    return;
  }
  const settings = mergeSettings(gmGetValueRaw('ll_settings'));
  chatHistory.push({ role: 'user', content: question });
  renderChat();
  if (followInput) followInput.value = '';
  setBusy('思考中…');
  const prompt = buildChatPrompt(question, chatHistory, lastResult, { snapshot: lastSnapshot, settings });
  try {
    const acc = await chatCompletion(cfg, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: false,
      maxTokens: settings.api.maxTokens,
    });
    chatHistory.push({ role: 'assistant', content: acc });
    renderChat();
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
    setError(code, () => renderChat());
  }
}

function renderChat(): void {
  const out = outEl();
  const html: string[] = [];
  if (lastResult) html.push(renderLastCompact());
  for (const m of chatHistory) {
    html.push(`<div class="m ${m.role === 'user' ? 'u' : 'a'}">${esc(m.content)}</div>`);
  }
  out.innerHTML = `<div class="chat">${html.join('')}</div>`;
  ensureFollowVisible();
}

function renderLastCompact(): string {
  const a = lastResult;
  if (!a) return '';
  if ('summary' in a && a.summary) return `<div class="m a">${esc(a.summary)}</div>`;
  return '';
}

/** 讲解卡「深度精读」入口：带着卡片上下文直接开精读 */
export function openDeepRead(snapshot: Snapshot): void {
  if (!snapshot?.text) return;
  void runAnalysis(snapshot.text, undefined);
}

// ---------- 划词浮动栏 ----------

function hideBar(): void {
  barHost?.remove();
  barHost = null;
}

function selectionText(): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return '';
  return sel.toString().replace(/\s+/g, ' ').trim();
}

function showBar(x: number, y: number, text: string): void {
  hideBar();
  barHost = document.createElement('div');
  barHost.setAttribute(TAG, '');
  const root = barHost.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `
    <button class="primary deep">AI 精读</button>
    <button data-a="translate">翻译</button>
    <button data-a="explain">解释</button>
    <button data-a="full">全文</button>`;
  root.append(style, bar);
  document.documentElement.appendChild(barHost);
  const rect = bar.getBoundingClientRect();
  bar.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  bar.style.top = `${Math.max(8, Math.min(y + 10, window.innerHeight - rect.height - 8))}px`;
  bar.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    hideBar();
    if (el.classList.contains('deep')) void runAnalysis(text, undefined);
    else if (el.dataset['a'] === 'translate') void runLight('translate', text);
    else if (el.dataset['a'] === 'explain') void runLight('explain', text);
    else if (el.dataset['a'] === 'full') void startPageTranslate('full');
  });
  window.addEventListener('mousedown', function onDoc(e) {
    const path = e.composedPath();
    if (!barHost || path.includes(barHost)) return;
    hideBar();
    window.removeEventListener('mousedown', onDoc, true);
  }, true);
}

// ---------- 入口 ----------

export function initReader(): void {
  document.addEventListener('mouseup', () => {
    const text = selectionText();
    if (!text || text.length < 1) return;
    if ((window.getSelection() as Selection)?.anchorNode?.parentElement?.closest(`[${TAG}]`)) return;
    const sel = window.getSelection();
    const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    showBar(rect?.left ?? 100, rect?.bottom ?? 100, text.slice(0, 12000));
  });
}
