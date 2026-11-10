// ============================================================
// content/fullpage.ts —— 全文注入翻译模式
// 收集页面全部可见文字 → 批量翻译 → 译文注入原位 + 讲解点虚线下划线
// 点击虚线弹卡（Shadow DOM）查看"什么意思 + 为什么这样写"
// 再按快捷键切换显示/隐藏；全部注入节点带 data-ll 标记可整体清除
// ============================================================

import { Readability } from '@mozilla/readability';
import { ERROR_MESSAGES, FULLPAGE_MAX_CHARS } from '../shared/constants';
import { mergeSettings } from '../shared/settings';
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
let pillState: 'run' | 'done' | 'err' = 'run';
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

/**
 * 块级锚：行内元素（a/sup/s/span 等）向上归并到最近块级容器。
 * v0.5.1 核心修复：unit 必须按块级锚分组——按直接父元素分组会让脚注 [1]、
 * 返回箭头 ↩、mailing list 链接、tags 全都碎成一行行独立翻译。
 * v0.5.2：nav/header/footer 等结构性容器也作锚（否则其中链接各自成块）；
 * 兜底沿父级向上找首个非行内元素，绝不把行内元素自己当锚。
 */
const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, figcaption, td, th, div, section, article, nav, header, footer, aside, ul, ol, table, main';

function blockAnchor(el: Element): Element {
  const hit = el.closest(BLOCK_SELECTOR);
  if (hit) return hit;
  let cur: Element | null = el.parentElement;
  while (cur && cur !== document.body) {
    if (cur.closest(BLOCK_SELECTOR)) return cur.closest(BLOCK_SELECTOR) as Element;
    cur = cur.parentElement;
  }
  return document.body;
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
      const anchor = blockAnchor(parent);
      if (!isVisible(anchor)) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue ?? '';
      if (text.trim().length < 1) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current: Node | null;
  while ((current = walker.nextNode())) {
    const parent = (current as Text).parentElement;
    if (!parent) continue;
    const anchor = blockAnchor(parent);
    const t = (current.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (total + t.length > FULLPAGE_MAX_CHARS) {
      truncated = true;
      break;
    }
    const arr = groups.get(anchor) ?? [];
    arr.push(t);
    groups.set(anchor, arr);
    total += t.length;
  }

  const out: Unit[] = [];
  let id = 0;
  for (const [anchor, texts] of groups) {
    const text = texts.join(' ').replace(/\s+/g, ' ').trim();
    // 过滤纯标记/符号块：脚注角标、返回箭头、孤立标点（去掉字母数字汉字后不足 2 字符）
    const meaningful = text.replace(/[\s\p{P}\p{S}]/gu, '');
    if (meaningful.length < 2) continue;
    out.push({ id: id++, text, container: anchor });
  }
  return { units: out, truncated };
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
    'margin:4px 0 2px;padding-left:8px;border-left:2px solid rgba(37,99,235,.55);font-size:.92em;line-height:1.65;color:inherit;opacity:.72;white-space:pre-wrap;';
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
    position: fixed; z-index: 2147483647; max-width: 340px; overflow: hidden;
    background: #ffffff; border: 0.5px solid rgba(15,23,42,.14); border-radius: 14px;
    box-shadow: 0 8px 28px rgba(15,23,42,.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #1e293b; font-size: 13px; line-height: 1.6;
  }
  .head {
    display: flex; align-items: center; gap: 7px;
    padding: 9px 14px 8px; background: #f8fafc; border-bottom: 0.5px solid rgba(15,23,42,.08);
  }
  .badge {
    flex: none; font-size: 10px; font-weight: 600; color: #64748b;
    background: #f1f5f9; border: 0.5px solid rgba(15,23,42,.08); border-radius: 6px;
    padding: 1px 6px; letter-spacing: .5px;
  }
  .expr { color: #1e293b; font-weight: 600; font-size: 13px; overflow-wrap: anywhere; }
  .body { padding: 10px 14px 2px; color: #475569; white-space: pre-wrap; }
  .row { display: flex; gap: 6px; margin: 10px 14px 12px; }
  button {
    appearance:none;border:0;background:#f1f5f9;color:#334155;border-radius:8px;
    padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit;
  }
  button.primary { background: #2563eb; color: #fff; font-weight: 600; flex: 1; font-size: 12px; }
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
  card.innerHTML = `<div class="head"><span class="badge">讲解</span><span class="expr"></span></div>
    <div class="body"></div>
    <div class="row"><button class="primary" data-a="deep">深度精读</button><button data-a="close">关闭</button></div>`;
  (card.querySelector('.expr') as HTMLElement).textContent = expr;
  (card.querySelector('.body') as HTMLElement).textContent = why;
  root.append(style, card);
  document.documentElement.appendChild(cardHost);

  card.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset['a'];
    if (act === 'close') hideCard();
    if (act === 'deep') {
      // 取该词所在的原文块容器作上下文（term span 自带 data-ll，不能再用 closest(TAG)）
      const container = target.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, div');
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
  if (y + 210 > window.innerHeight) y = Math.max(8, rect.top - 220);
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
        border: 0.5px solid rgba(15,23,42,.14); border-radius: 999px; padding: 7px 14px;
        font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        box-shadow: 0 4px 16px rgba(15,23,42,.12); cursor: pointer; white-space: nowrap;
      }
      .dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#2563eb; margin-right:6px; }
      .dot.done { background: #16a34a; }
      .dot.err { background: #dc2626; }
    </style>
    <div class="pill"><span class="dot"></span><span class="txt">准备中…</span></div>`;
  document.documentElement.appendChild(pillHost);
  // 错误态点击只关提示（保留可能已注入的部分译文）；完成态点击整体清除
  root.querySelector('.pill')?.addEventListener('click', () => {
    if (pillState === 'err') hidePill();
    else clearInjection();
  });
  return root;
}

function setPill(state: 'run' | 'done' | 'err', text: string): void {
  const root = ensurePill();
  pillState = state;
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
  // 讲解点 span 包裹的是原文单词——先解包还原原词再删其余注入节点，否则原文丢词
  document.querySelectorAll(`[${TAG}-term]`).forEach((n) => {
    const span = n as HTMLElement;
    span.replaceWith(...Array.from(span.childNodes));
  });
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

/** 启发式正文容器：article/main 优先，取文本量最大者。
 * 占比守门：候选容器必须持有全页 ≥20% 的文字，否则视为"本页没有正文容器"回落整页。
 * 真实案例（HN 讨论帖 50376313）：兜底曾抓到第一条评论的 commtext（仅占全页 1%，
 * 800/65293 字）→"文章翻译"只翻第一条评论的 4 段，其余 179 条评论全不动。 */
function heuristicArticleRoot(): Element | null {
  const bodyLen = (document.body.textContent ?? '').length;
  const majority = (el: Element | null): boolean => {
    if (!el) return false;
    const len = (el.textContent ?? '').length;
    return len >= 500 && bodyLen > 0 && len / bodyLen >= 0.2;
  };
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
  if (majority(best)) return best;
  const ps = [...document.querySelectorAll('p')].filter((p) => (p.textContent ?? '').trim().length > 40);
  if (ps.length >= 3) {
    const parent = ps[0]?.parentElement;
    if (parent && majority(parent)) return parent;
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
  // 预检：未配置直接报错结束——页面干干净净，不出现转圈占位（缓存随 storage 变化自动刷新）
  if (configuredCache === false) {
    setPill('err', '还没配置 API：先在 LinguaLens 设置里填厂商与密钥（点击关闭）');
    setTimeout(hidePill, 12000);
    return;
  }
  clearInjection();
  // 再兜底剥离残留注入：讲解点先解包还原原词，正文提取不被污染也不丢词
  document.querySelectorAll(`[${TAG}-term]`).forEach((n) => {
    const span = n as HTMLElement;
    span.replaceWith(...Array.from(span.childNodes));
  });
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
    setPill(pl.state, pl.text);
    // 完成即走 2 秒；错误停留 12 秒让人看清原因
    if (pl.state === 'done') setTimeout(hidePill, 2000);
    if (pl.state === 'err') setTimeout(hidePill, 12000);
    return true;
  }
  if (m?.type === 'FULLPAGE_DONE') {
    translating = false;
    const d = msg as {
      translated: number;
      highlights: number;
      reused: number;
      failed?: number;
      truncated?: boolean;
    };
    // 清掉没有等到译文的占位（失败批已在 markFailed 处理）
    for (const [, node] of loadingByUnit) node.remove();
    loadingByUnit.clear();
    const reusedPart = d.reused > 0 ? ` · 复用 ${d.reused}` : '';
    const failedPart = d.failed ? ` · 失败 ${d.failed}` : '';
    const truncPart = d.truncated ? `（长页面已截断：仅前 ${FULLPAGE_MAX_CHARS} 字符）` : '';
    setPill(
      'done',
      `已翻译 ${d.translated} 段 · ${d.highlights} 个讲解点${reusedPart}${failedPart}${truncPart}`,
    );
    // 完成即走：2 秒自动消失；截断提示需要时间读，停 8 秒
    setTimeout(hidePill, d.truncated ? 8000 : 2000);
    return true;
  }
  if (m?.type === 'FULLPAGE_ERROR') {
    translating = false;
    // 硬失败（无 key / 网络断 / 鉴权失败）：清掉全部转圈占位直接结束，绝不空转
    for (const [, node] of loadingByUnit) node.remove();
    loadingByUnit.clear();
    if (translatedCount === 0) {
      // 一段译文都没有：整页归零，下次触发重新开始
      clearInjection();
    }
    const e = msg as { errorCode: string; errorMessage?: string };
    const hint = ERROR_MESSAGES[e.errorCode] ?? e.errorMessage ?? e.errorCode;
    const part = translatedCount > 0 ? `（已完成 ${translatedCount} 段，其余失败）` : '';
    setPill('err', `翻译失败：${hint}${part}（点击关闭）`);
    setTimeout(hidePill, 12000);
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
/** 预检缓存：未配置（厂商/模型/密钥任一缺失）时直接报错结束，不注入转圈占位 */
let configuredCache: boolean | null = null;

export async function refreshHotkeyCache(): Promise<void> {
  try {
    const res = await chrome.storage.local.get(['ll_settings', 'll_key_enc']);
    // 必须合并默认值：全新安装（从未保存过设置）时 ui.hotkey 不存在，
    // 不合并会导致热键缓存为 null、快捷键永不触发
    const s = mergeSettings(res['ll_settings']);
    hotkeyCache = s.ui.hotkey ?? null;
    showHighlights = s.ui.showHighlights !== false;
    configuredCache = Boolean(s.api.baseUrl && s.api.model && res['ll_key_enc']);
  } catch {
    hotkeyCache = null;
    configuredCache = null;
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
    if (area === 'local' && (changes['ll_settings'] || changes['ll_key_enc'])) {
      void refreshHotkeyCache();
    }
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
