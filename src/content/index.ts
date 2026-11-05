// ============================================================
// content/index.ts —— 选区捕获 + 浮动工具栏（Shadow DOM）+ 正文提取
// 职责刻意保持最小：捕获快照、渲染浮动栏、发消息。
// 不做 AI 调用、不做存储逻辑。
// ============================================================

import { Readability } from '@mozilla/readability';
import type { ArticleExtractRequest, ArticlePayload, Snapshot } from '../shared/messages';
import { ARTICLE_MAX_CHARS, MAX_SELECTION_LENGTH } from '../shared/constants';
import { handleFullPageMessage, initFullPage, toggleFullPage } from './fullpage';

const BAR_ID = 'lingualens-bar-host';
const CONTEXT_LIMIT = 300;

interface Captured {
  snapshot: Snapshot;
}

let captured: Captured | null = null;
let host: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let settingsCache: { floatingBar: 'all' | 'off'; excluded: string[]; at: number } | null = null;

// ---------- 设置（低频读取，30s 缓存） ----------

async function getBarSettings(): Promise<{ on: boolean }> {
  try {
    if (settingsCache && Date.now() - settingsCache.at < 30000) {
      const hostname = location.hostname;
      const excluded = settingsCache.excluded.some((d) => hostname === d || hostname.endsWith(`.${d}`));
      return { on: settingsCache.floatingBar === 'all' && !excluded };
    }
    const res = await chrome.storage.local.get('ll_settings');
    const s = (res['ll_settings'] ?? {}) as {
      ui?: { floatingBar?: 'all' | 'off'; excludedDomains?: string[] };
    };
    settingsCache = {
      floatingBar: s.ui?.floatingBar === 'off' ? 'off' : 'all',
      excluded: Array.isArray(s.ui?.excludedDomains) ? (s.ui?.excludedDomains as string[]) : [],
      at: Date.now(),
    };
    return await getBarSettings();
  } catch {
    return { on: true };
  }
}

// ---------- 选区与上下文捕获 ----------

function hasLatin(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

/** 从选区向上找一个"合适大小"的祖先容器，取其文本作为上下文 */
function captureContext(range: Range): { before: string; after: string } {
  let container: Node = document.body;
  for (let node: Node | null = range.commonAncestorContainer; node && node !== document.body; node = node.parentNode) {
    const len = node.textContent?.length ?? 0;
    if (len > 0 && len <= 1500) {
      container = node;
      break;
    }
  }
  const full = container.textContent ?? '';
  const sel = range.toString();
  const idx = full.indexOf(sel);
  if (idx < 0) return { before: '', after: '' };
  const start = Math.max(0, idx - CONTEXT_LIMIT);
  return {
    before: full.slice(start, idx),
    after: full.slice(idx + sel.length, idx + sel.length + CONTEXT_LIMIT),
  };
}

function buildSnapshot(range: Range, source: Snapshot['source']): Snapshot | null {
  const raw = range.toString().replace(/\s+/g, ' ').trim();
  if (!raw || !hasLatin(raw)) return null;
  const rect = range.getBoundingClientRect();
  const ctx = captureContext(range);
  // 超长选区：截断后照常浮动（提示条会显示"长文已截断"），不再静默丢弃
  const truncated = raw.length > MAX_SELECTION_LENGTH;
  return {
    text: truncated ? raw.slice(0, MAX_SELECTION_LENGTH) : raw,
    contextBefore: ctx.before,
    contextAfter: ctx.after,
    url: location.href,
    title: document.title,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    source,
    truncated,
  };
}

// ---------- 浮动栏渲染（Shadow DOM） ----------

const BAR_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .bar {
    position: fixed; z-index: 2147483647;
    display: flex; align-items: center; gap: 2px;
    background: #1e293b; border: 1px solid #334155; border-radius: 8px;
    padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.25);
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    opacity: 0; transform: translateY(2px); transition: opacity .12s ease, transform .12s ease;
  }
  .bar.show { opacity: 1; transform: translateY(0); }
  .btn {
    appearance: none; border: 0; background: transparent; color: #e2e8f0;
    font-size: 12px; line-height: 1; padding: 6px 9px; border-radius: 6px;
    cursor: pointer; white-space: nowrap; font-family: inherit;
  }
  .btn:hover { background: #334155; color: #fff; }
  .btn.primary { background: #4f46e5; color: #fff; font-weight: 600; }
  .btn.primary:hover { background: #4338ca; }
  .sep { width: 1px; height: 16px; background: #334155; margin: 0 2px; }
  .close { color: #64748b; font-size: 13px; padding: 6px 7px; }
`;

function ensureHost(): ShadowRoot {
  if (host && host.isConnected) return host.shadowRoot as ShadowRoot;
  host = document.createElement('div');
  host.id = BAR_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = BAR_CSS;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = [
    '<button class="btn primary" data-act="analyze">AI 精读</button>',
    '<button class="btn" data-act="translate">翻译</button>',
    '<button class="btn" data-act="explain">解释</button>',
    '<span class="sep"></span>',
    '<button class="btn" data-act="fullpage" title="全文翻译：页面所有可见文字注入对照，重点表达虚线标注">全文</button>',
    '<button class="btn" data-act="favorite">收藏</button>',
    '<button class="btn close" data-act="close" title="关闭">✕</button>',
    '<span class="warn" hidden style="color:#fbbf24;font-size:11px;padding:0 6px;">长文已截断</span>',
  ].join('');
  root.append(style, bar);
  document.documentElement.appendChild(host);
  bar.addEventListener('mousedown', (e) => e.stopPropagation());
  bar.addEventListener('click', onBarClick);
  return root;
}

function onBarClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-act]');
  if (!target || !captured) return;
  const act = (target as HTMLElement).dataset['act'] ?? '';
  if (act === 'close') {
    hideBar();
    return;
  }
  const snapshot = captured.snapshot;
  if (act === 'fullpage') {
    hideBar();
    void toggleFullPage();
    return;
  }
  void chrome.runtime.sendMessage({
    type: 'TOOLBAR_ACTION',
    snapshot,
    action: act,
  }).catch(() => undefined);
  hideBar();
}

function showBar(snapshot: Snapshot): void {
  if (!snapshot.rect) return;
  captured = { snapshot };
  const root = ensureHost();
  const bar = root.querySelector('.bar') as HTMLDivElement;
  const margin = 8;
  const barH = 34;
  const barW = 300;
  let x = snapshot.rect.x + snapshot.rect.width / 2 - barW / 2;
  let y = snapshot.rect.y + snapshot.rect.height + margin;
  if (y + barH > window.innerHeight - 8) y = snapshot.rect.y - barH - margin;
  x = Math.max(8, Math.min(x, window.innerWidth - barW - 8));
  if (y < 8) y = 8;
  bar.style.left = `${Math.round(x)}px`;
  bar.style.top = `${Math.round(y)}px`;
  const warn = bar.querySelector('.warn') as HTMLElement | null;
  if (warn) warn.hidden = !snapshot.truncated;
  bar.classList.add('show');
}

function hideBar(): void {
  captured = null;
  if (host?.isConnected) {
    const bar = host.shadowRoot?.querySelector('.bar') as HTMLDivElement | null;
    bar?.classList.remove('show');
  }
}

// ---------- 事件接线 ----------

let mouseUpSeq = 0;

document.addEventListener('mouseup', (e: MouseEvent) => {
  // 点击浮动栏自身不处理
  const path = e.composedPath();
  if (host && path.includes(host)) return;
  clearTimeout(hideTimer);
  const seq = ++mouseUpSeq;
  hideTimer = setTimeout(async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideBar();
      return;
    }
    const { on } = await getBarSettings();
    if (!on) return;
    // 用户在延迟期间又按下了鼠标 → 放弃本轮
    if (seq !== mouseUpSeq) return;
    const snapshot = buildSnapshot(sel.getRangeAt(0), 'floating-bar');
    if (!snapshot) {
      hideBar();
      return;
    }
    showBar(snapshot);
  }, 10);
}, true);

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) hideBar();
});

window.addEventListener(
  'scroll',
  () => {
    if (captured) hideBar();
  },
  { capture: true, passive: true },
);

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') hideBar();
});

// 页面卸载清理
window.addEventListener('pagehide', hideBar);

// ---------- 快捷键触发的正文提取（Readability，只取文章主体） ----------

function extractArticle(): ArticlePayload | { error: string } {
  try {
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    if (!article?.content) return { error: 'no_article' };

    const doc = new DOMParser().parseFromString(article.content, 'text/html');
    const nodes = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
    const blocks: { id: number; text: string }[] = [];
    let id = 0;
    let total = 0;
    let truncated = false;
    for (const n of nodes) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length < 2) continue;
      if (total + text.length > ARTICLE_MAX_CHARS) {
        truncated = true;
        break;
      }
      blocks.push({ id: id++, text });
      total += text.length;
    }
    if (blocks.length === 0) return { error: 'no_article' };

    return {
      title: article.title || document.title,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      url: location.href,
      blocks,
      truncated,
    };
  } catch {
    return { error: 'no_article' };
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  // 全文注入翻译的进度/结果推送（SW → CS）
  if (handleFullPageMessage(msg)) return false;
  const m = msg as Partial<ArticleExtractRequest>;
  if (m?.type !== 'DO_EXTRACT_ARTICLE') return false;
  const result = extractArticle();
  if ('error' in result) {
    sendResponse({ error: result.error });
  } else {
    void chrome.runtime.sendMessage({ type: 'ARTICLE_TRANSLATE', payload: result }).catch(() => undefined);
    sendResponse({ ok: true, blocks: result.blocks.length });
  }
  return false; // 同步响应
});

// 应用内自定义快捷键 + 讲解点点击弹卡（全文翻译注入）
initFullPage();
