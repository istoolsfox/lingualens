// 验证：article 模式的启发式正文容器在 HN 评论区会抓到什么
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage();
await page.goto('https://news.ycombinator.com/item?id=50376313', { timeout: 60000 });
await page.waitForSelector('.commtext');
const r = await page.evaluate(() => {
  const candidates = [
    ...document.querySelectorAll(
      'article, main, [role="main"], #content, .post, .post-content, .article, .article-content, .entry-content',
    ),
  ];
  let best = null,
    bestLen = 0;
  for (const el of candidates) {
    const len = (el.textContent ?? '').length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  const bodyLen = (document.body.textContent ?? '').length;
  let picked =
    best && bestLen >= 500
      ? `主选择器命中: ${best.tagName}.${String(best.className).slice(0, 30)} (${bestLen}/${bodyLen})`
      : null;
  // 兜底路径
  const ps = [...document.querySelectorAll('p')].filter((p) => (p.textContent ?? '').trim().length > 40);
  const fallback = ps.length >= 3 ? ps[0]?.parentElement : null;
  return {
    picked,
    bodyLen,
    fallbackTag: fallback ? `${fallback.tagName}.${String(fallback.className).slice(0, 30)}` : null,
    fallbackLen: fallback ? (fallback.textContent ?? '').length : 0,
    fallbackPct: fallback ? Math.round(((fallback.textContent ?? '').length / bodyLen) * 100) + '%' : null,
    fallbackPreview: fallback ? (fallback.textContent ?? '').slice(0, 80) : null,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
