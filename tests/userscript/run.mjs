// ============================================================
// tests/userscript/run.mjs —— 油猴版 E2E（自包含，无需扩展环境）
// GM_* 用 stub 注入：GM_xmlhttpRequest 经 exposeFunction 桥到 Node 侧
// fetch（绕开页面 CORS，等效真实脚本管理器行为）；密钥按 secureStore 的
// AES-GCM 方案在页内加密预置。
// 断言：无 key 预检 / 划词精读抽屉 / 全文注入 / 讲解卡→深度精读 / 缓存 0 请求
// 运行：pnpm build:userscript && pnpm e2e:userscript
// ============================================================

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const userJs = join(root, 'dist-userscript', 'lingualens-lite.user.js');
const shotDir = join(root, 'notes', 'e2e-us');
mkdirSync(shotDir, { recursive: true });

const FIXTURE_PORT = 18889;
const AI_PORT = 18740 + (Date.now() % 500); // 随机端口：防上一次跑挂的孤儿服务器劫持

// ---- fixture 文章页（与扩展 smoke 同构） ----
const ARTICLE_HTML = `<!doctype html><html><head><title>US Fixture</title></head><body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<article>
<h1>Userscript Fixture</h1>
<p>A computer on steroids is a common English idiom. It means an enhanced version of something. People use it when comparing products.</p>
<ul><li>A Tai Chi training program that promises to get you ripped like a superhero in 20 days.</li>
<li>Glasses that can adapt to any prescription are not how glasses work, according to experts.</li></ul>
<p>The problem is the scammers only need to get through to a very small percentage of people to make their money back.</p>
<p>If you would like to receive these posts in your inbox, why not sign up to my <a href="#ml">mailing list</a>.</p>
<p>Whenever you watch a video on YouTube now, you will likely get an advert for a scammy product.</p>
</article></body></html>`;

// ---- 假 AI 服务器（独立端口，避免与扩展 smoke 冲突） ----
const fakeProc = spawn('node', [join(root, 'scripts', 'fake-ai-server.mjs'), `--port=${AI_PORT}`], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 800));
const fixtureServer = await (async () => {
  const { createServer } = await import('node:http');
  const srv = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(ARTICLE_HTML);
  });
  await new Promise((r) => srv.listen(FIXTURE_PORT, r));
  return srv;
})();
console.log(`fixture :${FIXTURE_PORT}, fake-ai :${AI_PORT}`);

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('[页面异常]', String(e).slice(0, 300)));

// ---- GM stub + Node 桥 ----
await page.exposeFunction('llGmFetch', async ({ url, method, headers, body }) => {
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(60000) });
  return { status: res.status, text: await res.text() };
});
await page.addInitScript(() => {
  // GM 存储用 sessionStorage 兜底：page.reload 会重跑本脚本，纯内存对象会被清空
  const load = () => {
    try {
      return JSON.parse(sessionStorage.getItem('__gm') || '{}');
    } catch {
      return {};
    }
  };
  window.__gm = load();
  const persist = () => {
    try {
      sessionStorage.setItem('__gm', JSON.stringify(window.__gm));
    } catch {
      /* 容量异常容忍 */
    }
  };
  window.GM_getValue = (k, f) => (k in window.__gm ? window.__gm[k] : f);
  window.GM_setValue = (k, v) => {
    window.__gm[k] = v;
    persist();
  };
  window.GM_deleteValue = (k) => {
    delete window.__gm[k];
    persist();
  };
  window.GM_registerMenuCommand = () => {};
  window.GM_xmlhttpRequest = (o) => {
    window
      .llGmFetch({ url: o.url, method: o.method, headers: o.headers, body: o.data, timeout: o.timeout })
      .then((r) => o.onload({ status: r.status, responseText: r.text }))
      .catch((e) => o.onerror({ error: String(e) }));
  };
  // secureStore 同款 AES-GCM 预置（测试辅助）
  window.__seedKey = async (apiKey, settings) => {
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const raw = crypto.getRandomValues(new Uint8Array(32));
    window.__gm['ll_dk'] = b64(raw.buffer);
    const dk = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dk, new TextEncoder().encode(apiKey));
    window.__gm['ll_key_enc'] = JSON.stringify({ iv: b64(iv.buffer), ct: b64(ct) });
    if (settings) window.__gm['ll_settings'] = settings;
    persist();
  };
});

const userSrc = readFileSync(userJs, 'utf8');
const inject = async () => {
  await page.addScriptTag({ content: userSrc });
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const shot = async (name) => {
  const p = join(shotDir, name);
  await page.screenshot({ path: p });
  console.log(`📸 ${p}`);
};

await page.goto(`http://localhost:${FIXTURE_PORT}/`);
await page.waitForTimeout(300);

// ---- 1. 无 key 预检：全文快捷键 → 零转圈 + 报错 pill ----
await inject();
await page.keyboard.press('Control+Alt+KeyL');
await page.waitForTimeout(800);
const noKeyLoading = await page.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
const noKeyPill = await page.evaluate(
  () => document.querySelector('[data-ll]')?.shadowRoot?.textContent ?? '',
);
check(
  '无 key 预检：不注入转圈，直接报错',
  noKeyLoading === 0 && noKeyPill.includes('还没配置 API'),
  `占位 ${noKeyLoading}`,
);
await shot('us-01-nokey.png');

// ---- 2. 预置配置与密钥 → 重载注入 → 全文翻译 ----
await page.evaluate(
  async (aiPort) => {
    await window.__seedKey('sk-fake-key', {
      api: { baseUrl: `http://localhost:${aiPort}`, model: 'fake-model' },
    });
  },
  AI_PORT,
);
await page.reload();
await page.waitForTimeout(300);
await inject();
await page.waitForTimeout(300);
await page.keyboard.press('Control+Alt+KeyL');
let injected = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500);
  injected = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-ll]')].filter((n) =>
        n.textContent?.includes('【假译文】'),
      ).length,
  );
  const loading = await page.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
  if (injected >= 6 && loading === 0) break;
}
check('全文翻译：真译文注入（≥6 段）', injected >= 6, `实际 ${injected}`);
const loadingLeft = await page.evaluate(() => document.querySelectorAll('[data-ll-loading]').length);
check('全文翻译：无残留转圈占位', loadingLeft === 0, `残留 ${loadingLeft}`);
await shot('us-02-fullpage.png');

// ---- 3. 缓存复用：再按两次（隐藏→显示）0 新请求 ----
const countBefore = await fetch(`http://localhost:${AI_PORT}/count`).then((r) => r.json());
await page.keyboard.press('Control+Alt+KeyL'); // 隐藏
await page.waitForTimeout(300);
await page.keyboard.press('Control+Alt+KeyL'); // 显示
await page.waitForTimeout(1000);
const countAfter = await fetch(`http://localhost:${AI_PORT}/count`).then((r) => r.json());
check('缓存复用：显隐切换 0 新请求', countAfter.count - countBefore.count === 0, `${countBefore.count} → ${countAfter.count}`);

// ---- 4. 划词 → 浮动栏 → AI 精读抽屉 ----
await page.evaluate(() => {
  const p = [...document.querySelectorAll('article p')][0];
  const range = document.createRange();
  range.selectNodeContents(p);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await page.waitForTimeout(400);
const barBtn = page.locator('[data-ll-lite] button.primary');
check('划词浮动栏出现', (await barBtn.count()) >= 1);
await page.evaluate(() => {
  const bar = document.querySelector('[data-ll-lite]');
  bar.shadowRoot
    .querySelector('button.primary')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
let analysisOk = false;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  analysisOk = await page.evaluate(
    () => document.querySelector('[data-ll-lite]')?.shadowRoot?.textContent?.includes('【假服务器】') ?? false,
  );
  if (analysisOk) break;
}
check('划词精读：抽屉渲染结构化结果', analysisOk);
await shot('us-03-reader.png');

// ---- 5. 讲解卡 → 深度精读（抽屉复用） ----
const termCount = await page.evaluate(() => document.querySelectorAll('[data-ll-term]').length);
check('讲解点虚线标注存在', termCount >= 1, `讲解点 ${termCount}`);
if (termCount >= 1) {
  await page.evaluate(() =>
    document
      .querySelector('[data-ll-term]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('[data-ll]')].find(
      (n) => n.shadowRoot && n.shadowRoot.textContent.includes('深度精读'),
    );
    card?.shadowRoot?.querySelector('[data-a="deep"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(1500);
  const deepOk = await page.evaluate(
    () => document.querySelector('[data-ll-lite]')?.shadowRoot?.textContent?.includes('【假服务器】') ?? false,
  );
  check('讲解卡深度精读 → 抽屉接住', deepOk);
  await shot('us-04-deep.png');
}

await browser.close();
fixtureServer.close();
fakeProc.kill('SIGKILL');
console.log(failures === 0 ? '\n🎉 油猴版 E2E 全过' : `\n💥 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
