// ============================================================
// tests/e2e/smoke.mjs —— 真机冒烟：本机 Chrome 真加载扩展
// 步骤：fixture 文章页 → 配置假 API → 弹窗截图 → 全文翻译注入断言
//       → 二次全文缓存断言 → 翻译本文断言侧栏 → 截图存 notes/e2e/
// 运行：node tests/e2e/smoke.mjs（需先起 fake-ai-server）
// ============================================================

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(root, 'dist');
const shotDir = join(root, 'notes', 'e2e');
mkdirSync(shotDir, { recursive: true });

// fixture 文章页（真实 DOM 结构，供 Readability 与全文注入）
const ARTICLE_HTML = `<!doctype html><html><head><title>Fixture Article</title></head><body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<article>
<h1>Why On Steroids Matters</h1>
<div class="meta">Published on: <span>August 28, 2026</span></div>
<div class="tags"><a href="#p">#posts</a> <a href="#ai">#AI</a> <a href="#rant">#rant</a></div>
<p>A computer on steroids is a common English idiom. It means an enhanced version of something. People use it when comparing products.</p>
<ul>
<li>A Tai Chi training program that promises to get you ripped like <s>someone on steroids</s> a superhero in 20 days.</li>
<li>Glasses that can adapt to any prescription are not how glasses work, according to experts.</li>
</ul>
<p>The problem is the scammers only need to get through to a very small percentage of people to make their money back.</p>
<p>It's not just adverts. I have my email in my footer <sup><a id="fn1">[1]</a></sup> and tend to get a lot of spam. Take this email I got the other day: come say hi if you're a human <a href="#back">↩</a></p>
<p>If you would like to receive these posts in your inbox, why not sign up to my <a href="#ml">mailing list</a>.</p>
<div style="background:#e74c3c;color:#fff;padding:24px;border-radius:8px;">
<p>In a world of noise and uncertainty, this dark card finds meaning hidden within the chaos, revealing light where none seemed to exist for every reader.</p>
</div>
<p>Whenever you watch a video on YouTube now, you will likely get an advert for a scammy product.</p>
</article>
<footer>Next: <a href="#n">August Round Up</a> | Previous: <a href="#p2">July Round Up</a></footer></body></html>`;

const fixture = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(ARTICLE_HTML);
});
await new Promise((r) => fixture.listen(18888, r));
console.log('fixture on :18888');

const userDataDir = mkdtempSync(join(tmpdir(), 'll-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false, // 扩展加载需有头（上游限制）
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    // Chrome 137+ 默认禁用命令行加载扩展，此 flag 重新允许（E2E 专用）
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  viewport: { width: 1280, height: 800 },
});

// 轮询拿扩展 id（SW 可能早于监听启动）
let extId = '';
for (let i = 0; i < 30; i++) {
  const sws = context.serviceWorkers();
  const bgs = context.backgroundPages();
  const sw =
    sws.find((w) => w.url().startsWith('chrome-extension://')) ??
    bgs.find((w) => w.url().startsWith('chrome-extension://'));
  if (sw) {
    extId = new URL(sw.url()).host;
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!extId) {
  console.error('❌ 扩展未加载——诊断信息：');
  console.error(
    'serviceWorkers:',
    context.serviceWorkers().map((w) => w.url()),
  );
  console.error(
    'backgroundPages:',
    context.backgroundPages().map((w) => w.url()),
  );
  console.error(
    'pages:',
    context.pages().map((w) => w.url()),
  );
  const dbg = await context.newPage();
  await dbg.goto('chrome://extensions/').catch(() => undefined);
  await dbg.waitForTimeout(1500);
  await dbg.screenshot({ path: join(shotDir, 'debug-extensions.png') });
  console.error('📸 chrome://extensions 截图 → notes/e2e/debug-extensions.png');
  process.exit(1);
}
console.log('extension id:', extId);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const shot = async (page, name) => {
  const p = join(shotDir, name);
  await page.screenshot({ path: p });
  console.log(`📸 ${p}`);
};

// ---- 1. 配置假 API（options 页） ----
const optsPage = await context.newPage();
await optsPage.goto(`chrome-extension://${extId}/options.html`);
await optsPage.waitForSelector('#root');
// 选自定义厂商并指向本地假服务器
await optsPage.click('text=其他 / 自定义');
await optsPage.fill('input[placeholder="https://example.com/v1"]', 'http://localhost:18734');
await optsPage.fill('input[placeholder="deepseek-chat"]', 'fake-model');
await optsPage.locator('input[type="password"]').fill('sk-fake-key');
await optsPage.click('text=保存并测试连接');
await optsPage.waitForTimeout(1500);
const okText = await optsPage.locator('text=连接成功').count();
check('设置页连接测试通过（假服务器）', okText > 0);
await shot(optsPage, '01-options.png');

// ---- 2. 弹窗截图 ----
const popupPage = await context.newPage();
await popupPage.goto(`chrome-extension://${extId}/popup.html`);
await popupPage.waitForTimeout(400);
await popupPage.setViewportSize({ width: 372, height: 560 });
await shot(popupPage, '02-popup.png');
const hasFullpageBtn = await popupPage.locator('#btn-fullpage').count();
check('弹窗主界面渲染（全文翻译主按钮）', hasFullpageBtn === 1);
// v0.5.1 定案：连接卡移回设置页，弹窗恢复四宫格
const hasConnCard = await popupPage.locator('.conn-card').count();
const gridBtns = await popupPage.locator('.fn-btn').count();
check(
  '弹窗恢复四宫格且无连接卡',
  hasConnCard === 0 && gridBtns === 4,
  `连接卡 ${hasConnCard}，宫格按钮 ${gridBtns}`,
);
const kbdCount = await popupPage.locator('.kbd').count();
check('快捷键显著化（蓝底胶囊×2）', kbdCount === 2, `kbd ${kbdCount}`);

// ---- 3. fixture 页全文翻译（含转圈占位与注入） ----
const artPage = await context.newPage();
await artPage.goto('http://localhost:18888/');
await artPage.waitForTimeout(300);
// 在 popup 上下文里查询 fixture 页 tabId
const artTabId = await popupPage.evaluate(
  () =>
    new Promise((resolve) => {
      chrome.tabs.query({ url: 'http://localhost:18888/*' }, (tabs) => resolve(tabs[0]?.id ?? -1));
    }),
);
if (artTabId < 0) throw new Error('找不到 fixture tab');
await shot(artPage, '03-before.png');

// 通过 CS 消息直接触发全文翻译（等效点击弹窗按钮）
const viaTab = (type) =>
  popupPage.evaluate(
    (payload) =>
      new Promise((resolve) => {
        chrome.tabs.sendMessage(payload.tabId, { type: payload.type }, () => resolve(null));
      }),
    { tabId: artTabId, type },
  );
// 触发全文翻译（等效弹窗按钮）
await viaTab('DO_FULLPAGE_TOGGLE');
// 等注入完成（译文节点出现且无 loading 残留）
let injected = 0;
for (let i = 0; i < 40; i++) {
  await artPage.waitForTimeout(500);
  // 严格计数：只认真译文文本节点，防止"失败占位"假阳性
  injected = await artPage.evaluate(
    () =>
      [...document.querySelectorAll('[data-ll]')].filter((n) => n.textContent?.includes('【假译文】')).length,
  );
  const loading = await artPage.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
  if (injected >= 6 && loading === 0) break;
}
check('全文翻译：真译文注入原文本（≥6 段）', injected >= 6, `实际 ${injected}`);
// 碎片化专项（真信号）：行内元素（sup/a/s）内部不得有注入节点（新逻辑只挂块锚尾部）；
// 译文块总数应≈块级段落数（fixture 预期 13；旧碎片逻辑会产生 20+）
const inlineInjected = await artPage.evaluate(
  () => document.querySelectorAll('sup [data-ll], a > [data-ll], a[data-ll], s [data-ll]').length,
);
check(
  '全文翻译：行内元素不独立注入（脚注/箭头/链接并入段落）',
  inlineInjected === 0,
  `行内注入 ${inlineInjected}`,
);
const totalBlocks = await artPage.evaluate(
  () =>
    [...document.querySelectorAll('[data-ll]')].filter((n) => n.textContent?.includes('【假译文】')).length,
);
check('全文翻译：译文块数≈块级段落数（≤15，防碎片化）', totalBlocks <= 15, `译文块 ${totalBlocks}`);
const loadingLeft = await artPage.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
check('全文翻译：无残留转圈占位', loadingLeft === 0, `残留 ${loadingLeft}`);
const termCount = await artPage.evaluate(() => document.querySelectorAll('[data-ll-term]').length);
// 讲解点仅在"新翻译"时生成；段落全部命中记忆复用时不会重新生成（省 token 设计）
check('全文翻译：讲解点虚线标注存在（新翻译时）', termCount >= 1, `讲解点 ${termCount}`);
// 点击虚线词 → 卡片弹层（Shadow DOM）：头部徽标 + 正文 + 按钮区
if (termCount > 0) {
  await artPage.evaluate(() =>
    document
      .querySelector('[data-ll-term]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
  );
  await artPage.waitForTimeout(400);
  const cardOk = await artPage.evaluate(() =>
    [...document.querySelectorAll('[data-ll]')].some(
      (n) => n.shadowRoot && n.shadowRoot.textContent.includes('深度精读'),
    ),
  );
  check('讲解卡卡片化：点击虚线词弹出卡片（头部徽标+正文+按钮区）', cardOk);
  await shot(artPage, '09-term-card.png');
}
await shot(artPage, '04-fullpage-injected.png');

// ---- 4. 二次全文 → 缓存复用（假服务器请求数不增） ----
const countBefore = await fetch('http://localhost:18734/count')
  .then((r) => r.json())
  .catch(() => ({ count: -1 }));
await viaTab('DO_FULLPAGE_TOGGLE'); // 隐藏（已注入 → 切显隐，不重译）
await artPage.waitForTimeout(300);
await viaTab('DO_FULLPAGE_TOGGLE'); // 再显示
await artPage.waitForTimeout(1500);
const countAfter = await fetch('http://localhost:18734/count')
  .then((r) => r.json())
  .catch(() => ({ count: -1 }));
check(
  '再次切换显隐不重复翻译（0 新请求）',
  countAfter.count - countBefore.count === 0,
  `${countBefore.count} → ${countAfter.count}`,
);

// ---- 5. 文章翻译（Alt+L / 右键菜单等效）：页面注入，与全文效果一致 ----
// 先隐藏全文注入（article 只翻正文容器，避免旧注入文本干扰判断）
await viaTab('DO_FULLPAGE_TOGGLE');
await artPage.waitForTimeout(300);
await viaTab('DO_TRANSLATE_PAGE', 'article');
// 等 article 注入完成（正文段译文出现）
let articleInjected = 0;
for (let i = 0; i < 40; i++) {
  await artPage.waitForTimeout(500);
  articleInjected = await artPage.evaluate(
    () =>
      [...document.querySelectorAll('[data-ll]')].filter((n) => n.textContent?.includes('【假译文】')).length,
  );
  const loading = await artPage.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
  if (articleInjected >= 5 && loading === 0) break;
}
check('文章翻译：正文注入与全文效果一致（≥5 段真译文）', articleInjected >= 5, `实际 ${articleInjected}`);
await shot(artPage, '05-article-injected.png');

// ---- 6. 缓存秒出：清注入后同模式重译应 0 新请求 ----
const countBefore2 = await fetch('http://localhost:18734/count')
  .then((r) => r.json())
  .catch(() => ({ count: -1 }));
await artPage.evaluate(() => {
  // 与产品清理一致：讲解 span 先解包还原原词，再删注入节点（否则原文丢词 → 指纹变化 → 缓存失效）
  document.querySelectorAll('[data-ll-term]').forEach((n) => n.replaceWith(...Array.from(n.childNodes)));
  document.querySelectorAll('[data-ll]').forEach((n) => n.remove());
});
await viaTab('DO_TRANSLATE_PAGE', 'article');
await artPage.waitForTimeout(2500);
const articleCached = await artPage.evaluate(
  () =>
    [...document.querySelectorAll('[data-ll]')].filter((n) => n.textContent?.includes('【假译文】')).length,
);
const countAfter2 = await fetch('http://localhost:18734/count')
  .then((r) => r.json())
  .catch(() => ({ count: -1 }));
check(
  '文章翻译二次触发走 URL 缓存（0 新请求）',
  articleCached >= 5 && countAfter2.count - countBefore2.count === 0,
  `译文 ${articleCached}，请求 ${countBefore2.count} → ${countAfter2.count}`,
);
await shot(artPage, '06-article-cached.png');

// ---- 7. 侧栏可达 ----
const sidePage = await context.newPage();
await sidePage.goto(`chrome-extension://${extId}/sidepanel.html`);
await sidePage.waitForTimeout(1200);
const privacyBtn = sidePage.locator('text=我已了解，开始使用');
if ((await privacyBtn.count()) > 0) {
  await privacyBtn.click();
  await sidePage.waitForTimeout(300);
}
const idleOk = await sidePage.locator('text=选中网页上的英文开始精读').count();
check('侧边栏可达（idle 态正常）', idleOk >= 1);
await shot(sidePage, '07-sidepanel.png');

// ---- 8. 无 key 兜底：全新 profile 未配置 → 触发全文 → 立即报错 pill + 零转圈占位 ----
{
  const dir2 = mkdtempSync(join(tmpdir(), 'll-e2e-nokey-'));
  const ctx2 = await chromium.launchPersistentContext(dir2, {
    headless: false,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1280, height: 800 },
  });
  let extId2 = '';
  for (let i = 0; i < 30; i++) {
    const sw = ctx2.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    if (sw) {
      extId2 = new URL(sw.url()).host;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:18888/');
  await p2.waitForTimeout(800); // 等 content script 初始化（预检缓存读 storage）
  const pop2 = await ctx2.newPage();
  await pop2.goto(`chrome-extension://${extId2}/popup.html`);
  await pop2.evaluate(
    (url) =>
      new Promise((resolve) => {
        chrome.tabs.query({ url }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'DO_FULLPAGE_TOGGLE' }, () => resolve(null));
        });
      }),
    'http://localhost:18888/*',
  );
  await p2.waitForTimeout(1500);
  const noKeyLoading = await p2.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
  const noKeyPill = await p2.evaluate(
    () => document.querySelector('[data-ll]')?.shadowRoot?.textContent ?? '',
  );
  check(
    '无 key 兜底：不注入转圈占位（预检直接报错）',
    noKeyLoading === 0 && noKeyPill.includes('还没配置 API'),
    `占位 ${noKeyLoading}，pill="${noKeyPill.slice(0, 30)}"`,
  );
  await shot(p2, '08-nokey-error.png');
  await ctx2.close();
}

await context.close();
fixture.close();
console.log(failures === 0 ? '\n🎉 冒烟全过' : `\n💥 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
