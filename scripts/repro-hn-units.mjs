// 诊断脚本：把 content/fullpage.ts 的 collectUnits/blockAnchor 原样跑在真实 HN 页面
// 用法：node scripts/repro-hn-units.mjs
import { chromium } from 'playwright';

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
const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, figcaption, td, th, div, section, article, nav, header, footer, aside, ul, ol, table, main';
const FULLPAGE_MAX_CHARS = 50000;

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('https://news.ycombinator.com/item?id=50376313', { timeout: 60000 });
await page.waitForSelector('.commtext', { timeout: 30000 });

const result = await page.evaluate(
  ({ TAG, SKIP_TAGS, BLOCK_SELECTOR, FULLPAGE_MAX_CHARS }) => {
    const SKIP = new Set(SKIP_TAGS);
    function blockAnchor(el) {
      const hit = el.closest(BLOCK_SELECTOR);
      if (hit) return hit;
      let cur = el.parentElement;
      while (cur && cur !== document.body) {
        if (cur.closest(BLOCK_SELECTOR)) return cur.closest(BLOCK_SELECTOR);
        cur = cur.parentElement;
      }
      return document.body;
    }
    function isVisible(el) {
      const w = el;
      if (typeof w.checkVisibility === 'function')
        return w.checkVisibility({ checkOpacity: true, visibilityProperty: true });
      return el.offsetParent !== null || el.getClientRects().length > 0;
    }
    const groups = new Map();
    let total = 0;
    let truncated = false;
    let rejectedVisible = 0;
    let rejectedSkip = 0;
    let seen = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        seen++;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(parent.tagName)) {
          rejectedSkip++;
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(`[${TAG}]`)) return NodeFilter.FILTER_REJECT;
        const anchor = blockAnchor(parent);
        if (!isVisible(anchor)) {
          rejectedVisible++;
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.nodeValue ?? '';
        if (text.trim().length < 1) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let current;
    let lastAccepted = '';
    while ((current = walker.nextNode())) {
      const parent = current.parentElement;
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
      lastAccepted = t.slice(0, 60);
    }
    const units = [];
    let id = 0;
    for (const [anchor, texts] of groups) {
      const text = texts.join(' ').replace(/\s+/g, ' ').trim();
      const meaningful = text.replace(/[\s\p{P}\p{S}]/gu, '');
      if (meaningful.length < 2) continue;
      units.push({
        id: id++,
        len: text.length,
        anchor: anchor.tagName + (anchor.className ? '.' + String(anchor.className).split(' ')[0] : ''),
        preview: text.slice(0, 70),
      });
    }
    const commtextCount = document.querySelectorAll('.commtext').length;
    const bodyText = document.body.innerText.length;
    return {
      seen,
      rejectedSkip,
      rejectedVisible,
      total,
      truncated,
      rawGroups: groups.size,
      units: units.length,
      commtextCount,
      bodyText,
      lastAccepted,
      first: units.slice(0, 6),
      last: units.slice(-4),
      biggest: [...units].sort((a, b) => b.len - a.len).slice(0, 3),
    };
  },
  { TAG, SKIP_TAGS: [...SKIP_TAGS], BLOCK_SELECTOR, FULLPAGE_MAX_CHARS },
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
