// ============================================================
// content/fullpage.ts —— 全文注入翻译模式
// 收集页面全部可见文字 → 批量翻译 → 译文注入原位 + 讲解点虚线下划线
// 点击虚线弹卡（Shadow DOM）查看"什么意思 + 为什么这样写"
// 再按快捷键切换显示/隐藏；全部注入节点带 data-ll 标记可整体清除
// ============================================================

import { FULLPAGE_MAX_CHARS } from '../shared/constants';
import type { FullPageHighlight } from '../shared/messages';
import type { HotkeyLike } from './hotkeyTypes';

const TAG = 'data-ll';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'CANVAS', 'CODE', 'PRE', 'KBD', 'SAMP', 'IFRAME', 'TEMPLATE']);

// ---------- 状态 ----------

interface Unit {
  id: number;
  text: string;
  container: Element;
}

let units: Unit[] = [];
let unitContainers = new Map<number, Element>();
let injected = false;
let visible = false;
let translating = false;
let translatedCount = 0;
let highlightCount = 0;
let pillHost: HTMLDivElement | null = null;
let cardHost: HTMLDivElement | null = null;

// ---------- 可见性与收集 ----------

function isVisible(el: Element): boolean {
  const withCheck = el as Element & { checkVisibility?: (o?: { checkOpacity?: boolean; visibilityProperty?: boolean }) => boolean };
  if (typeof withCheck.checkVisibility === 'function') {
    return withCheck.checkVisibility({ checkOpacity: true, visibilityProperty: true });
  }
  const he = el as HTMLElement;
  return he.offsetParent !== null || he.getClientRects().length > 0;
}

function collectUnits(): { units: Unit[]; truncated: boolean } {
  const groups = new Map<Element, string[]>();
  let total = 0;
  let truncated = false;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
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
  return el.closest('p, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, figcaption, td, th, div, section, article') ?? el;
}

// ---------- 注入 ----------

function makeTranslationNode(natural: string): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute(TAG, '');
  div.style.cssText =
    'margin:4px 0 2px;padding-left:8px;border-left:2px solid rgba(26,136,255,.45);font-size:.92em;line-height:1.65;color:#9aa7b8;white-space:pre-wrap;';
  div.textContent = natural;
  return div;
}

function injectBatch(items: { id: number; natural: string }[]): void {
  for (const it of items) {
    const container = unitContainers.get(it.id);
    if (!container || !container.isConnected) continue;
    const node = makeTranslationNode(it.natural);
    blockAnchor(container).appendChild(node);
    translatedCount++;
  }
}

/** 讲解点：在对应单元容器里找 expr 首次出现，包上虚线下划线 span */
function applyHighlights(highlights: FullPageHighlight[]): void {
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
      span.style.cssText = 'border-bottom:1.5px dashed #1a88ff;cursor:pointer;';
      range.surroundContents(span);
      highlightCount++;
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
    background: #1e1e1e; border: 1px solid #2f2f2d; border-radius: 10px;
    padding: 12px 14px; box-shadow: 0 8px 28px rgba(0,0,0,.45);
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #d9d9d4; font-size: 13px; line-height: 1.6;
  }
  .expr { color: #4da6ff; font-weight: 600; font-size: 13.5px; margin-bottom: 6px; }
  .why { color: #b9b9b3; white-space: pre-wrap; }
  .row { display: flex; gap: 6px; margin-top: 10px; }
  button {
    appearance:none;border:0;background:#2a2a28;color:#d9d9d4;border-radius:6px;
    padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;
  }
  button.primary { background: #1a88ff; color: #fff; font-weight: 600; }
  button:hover { filter: brightness(1.15); }
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
      void chrome.runtime.sendMessage({
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
      }).catch(() => undefined);
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
      if (!cardHost || path.includes(cardHost) || (ev.target as HTMLElement)?.closest?.('[data-ll-term]')) return;
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
        z-index: 2147483647; background: #1e1e1e; color: #d9d9d4;
        border: 1px solid #2f2f2d; border-radius: 999px; padding: 6px 14px;
        font: 12px/1 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,.4); cursor: pointer; white-space: nowrap;
      }
      .dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#1a88ff; margin-right:6px; }
      .dot.done { background: #30d475; }
      .dot.err { background: #f0524a; }
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
  units = [];
  unitContainers = new Map();
  injected = false;
  visible = false;
  translating = false;
  translatedCount = 0;
  highlightCount = 0;
}

function setAllVisible(v: boolean): void {
  document.querySelectorAll<HTMLElement>(`[${TAG}]`).forEach((n) => {
    n.style.display = v ? '' : 'none';
  });
  visible = v;
}

/** 快捷键 / 浮动栏按钮入口：运行中取消 → 已注入切显隐 → 否则开始 */
export async function toggleFullPage(): Promise<void> {
  if (translating) {
    await chrome.runtime.sendMessage({ type: 'FULLPAGE_CANCEL' }).catch(() => undefined);
    clearInjection();
    return;
  }
  if (injected) {
    setAllVisible(!visible);
    return;
  }
  clearInjection();
  const { units: collected, truncated } = collectUnits();
  if (collected.length === 0) {
    setPill('err', '这页没有可翻译的可见文字（点击关闭）');
    setTimeout(hidePill, 4000);
    return;
  }
  units = collected;
  unitContainers = new Map(units.map((u) => [u.id, u.container]));
  injected = true;
  visible = true;
  translating = true;
  setPill('run', truncated ? `全文翻译中…（内容过多，已取前 ${FULLPAGE_MAX_CHARS} 字符）` : '全文翻译中…');
  await chrome.runtime
    .sendMessage({
      type: 'FULLPAGE_TRANSLATE',
      payload: { url: location.href, title: document.title, units: units.map((u) => ({ id: u.id, text: u.text })), truncated },
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
    setPill('run', `全文翻译中… 已注入 ${translatedCount} 段`);
    return true;
  }
  if (m?.type === 'FULLPAGE_DONE') {
    translating = false;
    const d = msg as { translated: number; highlights: number; reused: number };
    highlightCount = d.highlights;
    const reusedPart = d.reused > 0 ? ` · 复用缓存 ${d.reused} 段` : '';
    setPill('done', `已翻译 ${d.translated} 段 · ${d.highlights} 个讲解点${reusedPart} · 点击关闭`);
    return true;
  }
  if (m?.type === 'FULLPAGE_ERROR') {
    translating = false;
    const e = msg as { errorCode: string; errorMessage?: string };
    const hint = e.errorCode === 'not_configured' ? '请先在 LinguaLens 设置里配置厂商与密钥' : (e.errorMessage ?? e.errorCode);
    setPill('err', `翻译失败：${hint}（点击关闭）`);
    return true;
  }
  return false;
}

// ---------- 应用内自定义快捷键 ----------

interface HotkeyComboLite {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
}

let hotkeyCache: HotkeyComboLite | null = null;

export async function refreshHotkeyCache(): Promise<void> {
  try {
    const res = await chrome.storage.local.get('ll_settings');
    const s = (res['ll_settings'] ?? {}) as { ui?: { hotkey?: HotkeyComboLite } };
    hotkeyCache = s.ui?.hotkey ?? null;
  } catch {
    hotkeyCache = null;
  }
}

function hotkeyMatches(e: KeyboardEvent, h: HotkeyLike): boolean {
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key !== h.key.toUpperCase()) return false;
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
  document.addEventListener('click', (e) => {
    const term = (e.target as HTMLElement)?.closest?.('[data-ll-term]') as HTMLElement | null;
    if (!term) return;
    e.preventDefault();
    e.stopPropagation();
    showCard(term);
  }, true);
}

export function injectionStats(): { injected: boolean; translated: number; highlights: number } {
  return { injected, translated: translatedCount, highlights: highlightCount };
}
