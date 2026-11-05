// ============================================================
// content/fullpage.ts —— 全文注入翻译模式
// 收集页面全部可见文字 → 批量翻译 → 译文注入原位 + 讲解点虚线下划线
// 点击虚线弹卡（Shadow DOM）查看"什么意思 + 为什么这样写"
// 再按快捷键切换显示/隐藏；全部注入节点带 data-ll 标记可整体清除
// ============================================================

import { Readability } from '@mozilla/readability';
import { FULLPAGE_MAX_CHARS } from '../shared/constants';
import type { FullPageHighlight } from '../shared/messages';
import type { HotkeyLike } from './hotkeyTypes';

const TAG = 'data-ll';
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'SVG',
  'CANVAS',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'IFRAME',
  'TEMPLATE',
]);

// ---------- 状态 ----------

interface Unit {
  id: number;
  text: string;
  container: Element;
}

let unitContainers = new Map<number, Element>();
let injected = false;
let visible = false;
let translating = false;
let translatedCount = 0;
let pillHost: HTMLDivElement | null = null;
let cardHost: HTMLDivElement | null = null;

// ---------- 可见性与收集 ----------

function isVisible(el: Element): boolean {
  const withCheck = el as Element & {
    checkVisibility?: (o?: { checkOpacity?: boolean; visibilityProperty?: boolean }) => boolean;
  };
  if (typeof withCheck.checkVisibility === 'function') {
    return withCheck.checkVisibility({ checkOpacity: true, visibilityProperty: true });
  }
  const he = el as HTMLElement;
  return he.offsetParent !== null || he.getClientRects().length > 0;
}

function collectUnits(scope: Element = document.body): { units: Unit[]; truncated: boolean } {
  const groups = new Map<Element, string[]>();
  let total = 0;
  let truncated = false;

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${TAG}]`)) return NodeFilter.FILTER_REJECT;
      if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue ?? '';
      if (text.trim().length < 2) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current: Node | null;
  while ((current = walker.nextNode())) {
    const parent = (current as Text).parentElement;
    if (!parent) continue;
    const t = (current.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    if (total + t.length > FULLPAGE_MAX_CHARS) {
      truncated = true;
      break;
    }
    const arr = groups.get(parent) ?? [];
    arr.push(t);
    groups.set(parent, arr);
    total += t.length;
  }

  const out: Unit[] = [];
  let id = 0;
  for (const [parent, texts] of groups) {
    const text = texts.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    out.push({ id: id++, text, container: parent });
  }
  return { units: out, truncated };
}

/** 注入锚点：行内元素的译文挂到最近的块级祖先，避免打断行内布局 */
function blockAnchor(el: Element): Element {
  return (
    el.closest(
      'p, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, figcaption, td, th, div, section, article',
    ) ?? el
  );
}

// ---------- 注入 ----------

/** SVG 自旋转 spinner（animateTransform，不依赖页面 CSS，CSP 友好） */
function makeSpinnerNode(label: string): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute(TAG, '');
  div.setAttribute('data-ll-loading', '');
  div.style.cssText =
    'margin:4px 0 2px;padding-left:8px;border-left:2px solid rgba(37,99,235,.35);font-size:.9em;color:#94a3b8;display:flex;align-items:center;gap:6px;';
  div.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="flex:none">' +
    '<circle cx="12" cy="12" r="9" stroke="#dbeafe" stroke-width="3"/>' +
    '<path d="M21 12a9 9 0 0 0-9-9" stroke="#2563eb" stroke-width="3" stroke-linecap="round">' +
    '<animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path>' +
    '</svg><span>' +
    label +
    '</span>';
  return div;
}

const loadingByUnit = new Map<number, HTMLDivElement>();

function injectLoadingPlaceholders(): void {
  for (const [id, container] of unitContainers) {
    if (!container.isConnected) continue;
    const node = makeSpinnerNode('翻译中…');
    blockAnchor(container).appendChild(node);
    loadingByUnit.set(id, node);
  }
}

function settleUnit(id: number, node: HTMLDivElement): void {
  const old = loadingByUnit.get(id);
  old?.remove();
  loadingByUnit.delete(id);
  blockAnchor(unitContainers.get(id) ?? (old?.parentElement as Element)).appendChild(node);
}

function makeTranslationNode(natural: string): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute(TAG, '');
  div.style.cssText =
    'margin:4px 0 2px;padding-left:8px;border-left:2px solid rgba(37,99,235,.45);font-size:.92em;line-height:1.65;color:#475569;white-space:pre-wrap;';
  div.textContent = natural;
  return div;
}

function injectBatch(items: { id: number; natural: string }[]): void {
  for (const it of items) {
    const container = unitContainers.get(it.id);
    if (!container || !container.isConnected) continue;
    const node = makeTranslationNode(it.natural);
    settleUnit(it.id, node);
    translatedCount++;
  }
}

function markFailed(ids: number[]): void {
  for (const id of ids) {
    const container = unitContainers.get(id);
    if (!container || !container.isConnected) continue;
    const node = makeTranslationNode('');
    node.style.color = '#b91c1c';
    node.textContent = '这一段翻译失败（该批返回无法解析）';
    settleUnit(id, node);
  }
}

/** 讲解点：在对应单元容器里找 expr 首次出现，包上虚线下划线 span */
function applyHighlights(highlights: FullPageHighlight[]): void {
  if (!showHighlights) return;
  for (const h of highlights) {
    try {
      const container = unitContainers.get(h.id);
      if (!container || !container.isConnected) continue;
      const node = findTextNodeWith(container, h.expr);
      if (!node) continue;
      const range = document.createRange();
      const start = (node.nodeValue ?? '').indexOf(h.expr);
      if (start < 0) continue;
      range.setStart(node, start);
      range.setEnd(node, start + h.expr.length);
      const span = document.createElement('span');
      span.setAttribute(TAG, '');
      span.setAttribute('data-ll-term', '');
      span.dataset['why'] = h.why;
      span.style.cssText =
        'border-bottom:1.5px dashed #2563eb;cursor:pointer;background:rgba(37,99,235,.06);border-radius:2px;';
      range.surroundContents(span);
    } catch {
      // 包裹失败（跨节点等）直接跳过该讲解点，不影响翻译
    }
  }
}

function findTextNodeWith(root: Element, expr: string): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent?.closest(`[${TAG}]`)) return NodeFilter.FILTER_REJECT;
      return (node.nodeValue ?? '').includes(expr) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  return (walker.nextNode() as Text | null) ?? null;
}

// ---------- 讲解弹卡（Shadow DOM） ----------

const CARD_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .card {
    position: fixed; z-index: 2147483647; max-width: 320px;
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 12px 14px; box-shadow: 0 8px 28px rgba(15,23,42,.12);
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1e293b; font-size: 13px; line-height: 1.6;
  }
  .expr { color: #2563eb; font-weight: 600; font-size: 13.5px; margin-bottom: 6px; }
  .why { color: #475569; white-space: pre-wrap; }
  .row { display: flex; gap: 6px; margin-top: 10px; }
  button {
    appearance:none;border:0;background:#f1f5f9;color:#334155;border-radius:6px;
    padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;
  }
  button.primary { background: #2563eb; color: #fff; font-weight: 600; }
  button:hover { filter: brightness(0.96); }
`;

function showCard(target: HTMLElement): void {
  hideCard();
  const why = target.dataset['why'] ?? '';
  const expr = target.textContent ?? '';
  cardHost = document.createElement('div');
  cardHost.setAttribute(TAG, '');
  const root = cardHost.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CARD_CSS;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="expr"></div><div class="why"></div>
    <div class="row"><button class="primary" data-a="deep">深度精读</button><button data-a="close">关闭</button></div>`;
  (card.querySelector('.expr') as HTMLElement).textContent = expr;
  (card.querySelector('.why') as HTMLElement).textContent = why;
  root.append(style, card);
  document.documentElement.appendChild(cardHost);

  card.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset['a'];
    if (act === 'close') hideCard();
    if (act === 'deep') {
      // 取该词所在段落文本作上下文，交给侧边栏做完整精读
      const container = target.closest(`[${TAG}]`)?.previousElementSibling ?? target.closest('p, li, div');
      const ctx = (container?.textContent ?? '').slice(0, 400);
      void chrome.runtime
        .sendMessage({
          type: 'TOOLBAR_ACTION',
          snapshot: {
            text: expr,
            contextBefore: ctx.slice(0, 200),
            contextAfter: '',
            url: location.href,
            title: document.title,
            source: 'floating-bar',
          },
          action: 'analyze',
        })
        .catch(() => undefined);
      hideCard();
    }
  });

  const rect = target.getBoundingClientRect();
  const cardEl = card;
  const w = 320;
  let x = rect.left + rect.width / 2 - w / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
  let y = rect.bottom + 8;
  if (y + 180 > window.innerHeight) y = Math.max(8, rect.top - 190);
  cardEl.style.left = `${Math.round(x)}px`;
  cardEl.style.top = `${Math.round(y)}px`;
  cardEl.style.position = 'fixed';

  setTimeout(() => {
    const outside = (ev: Event) => {
      const path = ev.composedPath();
      if (!cardHost || path.includes(cardHost) || (ev.target as HTMLElement)?.closest?.('[data-ll-term]'))
        return;
      hideCard();
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', esc, true);
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        hideCard();
        document.removeEventListener('mousedown', outside, true);
        document.removeEventListener('keydown', esc, true);
      }
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', esc, true);
  }, 0);
}

function hideCard(): void {
  cardHost?.remove();
  cardHost = null;
}

// ---------- 进度 pill ----------

function ensurePill(): ShadowRoot {
  if (pillHost?.isConnected) return pillHost.shadowRoot as ShadowRoot;
  pillHost = document.createElement('div');
  pillHost.setAttribute(TAG, '');
  const root = pillHost.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .pill {
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; background: #ffffff; color: #1e293b;
        border: 1px solid #e2e8f0; border-radius: 999px; padding: 6px 14px;
        font: 12px/1 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 4px 16px rgba(15,23,42,.12); cursor: pointer; white-space: nowrap;
      }
      .dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#2563eb; margin-right:6px; }
      .dot.done { background: #16a34a; }
      .dot.err { background: #dc2626; }
    </style>
    <div class="pill"><span class="dot"></span><span class="txt">准备中…</span></div>`;
  document.documentElement.appendChild(pillHost);
  root.querySelector('.pill')?.addEventListener('click', () => clearInjection());
  return root;
}

function setPill(state: 'run' | 'done' | 'err', text: string): void {
  const root = ensurePill();
  const dot = root.querySelector('.dot') as HTMLElement;
  const txt = root.querySelector('.txt') as HTMLElement;
  dot.className = `dot ${state === 'run' ? '' : state}`;
  txt.textContent = text;
}

function hidePill(): void {
  pillHost?.remove();
  pillHost = null;
}

// ---------- 注入生命周期 ----------

function clearInjection(): void {
  document.querySelectorAll(`[${TAG}]`).forEach((n) => n.remove());
  loadingByUnit.clear();
  unitContainers = new Map();
  injected = false;
  visible = false;
  translating = false;
  translatedCount = 0;
}

function setAllVisible(v: boolean): void {
  document.querySelectorAll<HTMLElement>(`[${TAG}]`).forEach((n) => {
    n.style.display = v ? '' : 'none';
  });
  visible = v;
}

/** 快捷键 / 浮动栏按钮入口（full 模式）：运行中取消 → 已注入切显隐 → 否则开始 */
export async function toggleFullPage(): Promise<void> {
  await startPageTranslate('full');
}

// ---------- 正文容器定位（article 模式） ----------

/** 启发式正文容器：article/main 优先，取文本量最大者 */
function heuristicArticleRoot(): Element | null {
  const candidates = [
    ...document.querySelectorAll(
      'article, main, [role="main"], #content, .post, .post-content, .article, .article-content, .entry-content',
    ),
  ];
  let best: Element | null = null;
  let bestLen = 0;
  for (const el of candidates) {
    const len = (el.textContent ?? '').length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  if (best && bestLen >= 500) return best;
  const ps = [...document.querySelectorAll('p')].filter((p) => (p.textContent ?? '').trim().length > 40);
  if (ps.length >= 3) {
    const parent = ps[0]?.parentElement;
    if (parent && (parent.textContent ?? '').length >= 500) return parent;
  }
  return null;
}

/**
 * 统一页面翻译入口（v0.5：article 与 full 效果一致——都是页面注入）。
 * article = 智能定位正文容器后注入（标题也翻）；full = 全页注入。
 */
export async function startPageTranslate(mode: 'article' | 'full'): Promise<void> {
  if (translating) {
    await chrome.runtime.sendMessage({ type: 'FULLPAGE_CANCEL' }).catch(() => undefined);
    clearInjection();
    return;
  }
  // DOM 里已无注入节点（页面刷新/SPA 重渲染/被手动清除）时，内部标志必须归零重译
  if (injected && !document.querySelector(`[${TAG}]`)) {
    injected = false;
    visible = false;
    translating = false;
  }
  if (injected) {
    setAllVisible(!visible);
    return;
  }
  clearInjection();
  // 先剥离旧注入，正文提取不被自己污染
  document.querySelectorAll(`[${TAG}]`).forEach((n) => n.remove());

  let title = document.title;
  let scope: Element = document.body;
  if (mode === 'article') {
    try {
      const article = new Readability(document.cloneNode(true) as Document).parse();
      if (article?.title) title = article.title;
    } catch {
      // 标题拿不到就用 document.title
    }
    scope = heuristicArticleRoot() ?? document.body;
  }

  const { units: collected, truncated } = collectUnits(scope);
  if (collected.length === 0) {
    setPill('err', mode === 'article' ? '没有找到正文（点击关闭）' : '这页没有可翻译的可见文字（点击关闭）');
    setTimeout(hidePill, 4000);
    return;
  }
  unitContainers = new Map(collected.map((u) => [u.id, u.container]));
  injected = true;
  visible = true;
  translating = true;
  const label = mode === 'article' ? '正文翻译中…' : '全文翻译中…';
  setPill('run', truncated ? `${label}（内容过多，已取前 ${FULLPAGE_MAX_CHARS} 字符）` : label);
  // 每段先放转圈占位，批次回来逐个替换
  injectLoadingPlaceholders();
  await chrome.runtime
    .sendMessage({
      type: 'PAGE_TRANSLATE',
      payload: {
        url: location.href,
        title,
        mode,
        units: collected.map((u) => ({ id: u.id, text: u.text })),
        truncated,
      },
    })
    .catch(() => undefined);
}

// ---------- SW → CS 结果接收 ----------

export function handleFullPageMessage(msg: unknown): boolean {
  const m = msg as { type?: string };
  if (m?.type === 'FULLPAGE_BATCH') {
    const b = msg as { items: { id: number; natural: string }[]; highlights: FullPageHighlight[] };
    injectBatch(b.items);
    applyHighlights(b.highlights ?? []);
    setPill('run', `全文翻译中… 已完成 ${translatedCount}/${unitContainers.size} 段`);
    return true;
  }
  if (m?.type === 'FULLPAGE_BATCH_FAILED') {
    const f = msg as { ids: number[] };
    markFailed(f.ids);
    return true;
  }
  if (m?.type === 'LL_PILL') {
    const pl = msg as { state: 'run' | 'done' | 'err'; text: string };
    setPill(pl.state, pl.text + (pl.state === 'done' ? '（点击关闭）' : ''));
    if (pl.state !== 'run') setTimeout(hidePill, 12000);
    return true;
  }
  if (m?.type === 'FULLPAGE_DONE') {
    translating = false;
    const d = msg as { translated: number; highlights: number; reused: number; failed?: number };
    // 清掉没有等到译文的占位（失败批已在 markFailed 处理）
    for (const [, node] of loadingByUnit) node.remove();
    loadingByUnit.clear();
    const reusedPart = d.reused > 0 ? ` · 复用缓存 ${d.reused} 段` : '';
    const failedPart = d.failed ? ` · 失败 ${d.failed} 段` : '';
    setPill(
      'done',
      `已翻译 ${d.translated} 段 · ${d.highlights} 个讲解点${reusedPart}${failedPart} · 点击关闭`,
    );
    return true;
  }
  if (m?.type === 'FULLPAGE_ERROR') {
    translating = false;
    const e = msg as { errorCode: string; errorMessage?: string };
    const hint =
      e.errorCode === 'not_configured'
        ? '请先在 LinguaLens 设置里配置厂商与密钥'
        : (e.errorMessage ?? e.errorCode);
    setPill('err', `翻译失败：${hint}（点击关闭）`);
    return true;
  }
  return false;
}

// ---------- 应用内自定义快捷键 ----------

interface HotkeyComboLite {
  key: string;
  code?: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
}

let hotkeyCache: HotkeyComboLite | null = null;
let showHighlights = true;

export async function refreshHotkeyCache(): Promise<void> {
  try {
    const res = await chrome.storage.local.get('ll_settings');
    const s = (res['ll_settings'] ?? {}) as { ui?: { hotkey?: HotkeyComboLite; showHighlights?: boolean } };
    hotkeyCache = s.ui?.hotkey ?? null;
    showHighlights = s.ui?.showHighlights !== false;
  } catch {
    hotkeyCache = null;
  }
}

function hotkeyMatches(e: KeyboardEvent, h: HotkeyLike): boolean {
  // 核心修复：按物理键位 e.code 匹配——组合键（尤其 Alt）会改变 e.key 字符（Mac ⌥L 产生 ¬），
  // 按 e.key 匹配在真实键盘上永远不中（v0.4 快捷键失效真因）
  if (h.code) {
    if (e.code !== h.code) return false;
  } else {
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (key !== h.key.toUpperCase()) return false;
  }
  return (
    (e.ctrlKey || false) === h.ctrl &&
    (e.altKey || false) === h.alt &&
    (e.metaKey || false) === h.meta &&
    (e.shiftKey || false) === h.shift
  );
}

export function initFullPage(): void {
  void refreshHotkeyCache();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['ll_settings']) void refreshHotkeyCache();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (!hotkeyCache || !hotkeyCache.key || e.repeat) return;
      if (!hotkeyMatches(e, hotkeyCache)) return;
      e.preventDefault();
      e.stopPropagation();
      void toggleFullPage();
    },
    true,
  );
  // 讲解点点击 → 弹卡（事件委托，注入的 span 无需单独绑）
  document.addEventListener(
    'click',
    (e) => {
      const term = (e.target as HTMLElement)?.closest?.('[data-ll-term]') as HTMLElement | null;
      if (!term) return;
      e.preventDefault();
      e.stopPropagation();
      showCard(term);
    },
    true,
  );
}
