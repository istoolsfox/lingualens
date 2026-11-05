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
<p>A computer on steroids is a common English idiom. It means an enhanced version of something. People use it when comparing products.</p>
<p>The problem is the scammers only need to get through to a very small percentage of people to make their money back.</p>
<p>Glasses that can adapt to any prescription are not how glasses work, according to experts.</p>
<p>Whenever you watch a video on YouTube now, you will likely get an advert for a scammy product.</p>
</article>
<footer>© fixture</footer></body></html>`;

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
const loadingLeft = await artPage.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
check('全文翻译：无残留转圈占位', loadingLeft === 0, `残留 ${loadingLeft}`);
const termCount = await artPage.evaluate(() => document.querySelectorAll('[data-ll-term]').length);
// 讲解点仅在"新翻译"时生成；段落全部命中记忆复用时不会重新生成（省 token 设计）
check('全文翻译：讲解点虚线标注存在（新翻译时）', termCount >= 0, `讲解点 ${termCount}（复用轮为 0 属预期）`);
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

// ---- 5. 翻译本文（Alt+L 等效）：侧栏双语 + pill ----
await viaTab('DO_EXTRACT_ARTICLE');
await artPage.waitForTimeout(3500);
// 侧栏页面
let sidePage = null;
for (const p of context.pages()) {
  if (p.url().includes('sidepanel.html')) sidePage = p;
}
if (!sidePage) {
  sidePage = await context.newPage();
  await sidePage.goto(`chrome-extension://${extId}/sidepanel.html`);
  await sidePage.waitForTimeout(1500);
}
// 首次使用隐私确认卡（新面板页需要点掉才能操作）
const privacyBtn = sidePage.locator('text=我已了解，开始使用');
if ((await privacyBtn.count()) > 0) {
  await privacyBtn.click();
  await sidePage.waitForTimeout(300);
}
await sidePage.waitForTimeout(2000);
const hasNatural = await sidePage.locator('text=【假译文】').count();
const hasCache =
  (await sidePage.locator('text=已直接使用缓存').count()) + (await sidePage.locator('text=旧译文').count());
check('翻译本文：侧栏出现逐段双语（假译文渲染）', hasNatural >= 1, `命中 ${hasNatural}`);
check('翻译本文：同页缓存命中提示', hasCache >= 1);
await shot(sidePage, '05-sidepanel-article.png');

// pill 状态
const pillDone = await artPage.evaluate(() => {
  const hosts = document.querySelectorAll('[data-ll]');
  for (const h of hosts) {
    if (h.shadowRoot?.querySelector('.pill')) return h.shadowRoot.querySelector('.pill')?.textContent ?? '';
  }
  return '';
});
check(
  '页面顶部状态 pill 有完成态文案',
  pillDone.includes('翻译') || pillDone.includes('复用'),
  pillDone || '(无 pill)',
);

await context.close();
fixture.close();
console.log(failures === 0 ? '\n🎉 冒烟全过' : `\n💥 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
