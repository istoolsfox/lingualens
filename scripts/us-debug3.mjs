import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userJs = join(root, 'dist-userscript', 'lingualens-lite.user.js');
const AI_PORT = 18735;
const { createServer } = await import('node:http');
const srv = createServer((q, s) => {
  s.writeHead(200, { 'Content-Type': 'text/html' });
  s.end('<html><body><article><p>A computer on steroids is a common English idiom. It means an enhanced version of something.</p></article></body></html>');
});
await new Promise((r) => srv.listen(18892, r));
const fake = spawn('node', [join(root, 'scripts', 'fake-ai-server.mjs'), `--port=${AI_PORT}`], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[页面异常]', String(e).slice(0, 300)));
await page.exposeFunction('llGmFetch', async ({ url, method, headers, body }) => {
  const res = await fetch(url, { method, headers, body });
  const t = await res.text();
  console.log('[桥] ←', res.status, t.slice(0, 200));
  return { status: res.status, text: t };
});
await page.addInitScript(() => {
  window.__gm = {};
  const persist = () => { try { sessionStorage.setItem('__gm', JSON.stringify(window.__gm)); } catch {} };
  window.GM_getValue = (k, f) => (k in window.__gm ? window.__gm[k] : f);
  window.GM_setValue = (k, v) => { window.__gm[k] = v; persist(); };
  window.GM_deleteValue = (k) => { delete window.__gm[k]; persist(); };
  window.GM_registerMenuCommand = () => {};
  window.GM_xmlhttpRequest = (o) => {
    window.llGmFetch({ url: o.url, method: o.method, headers: o.headers, body: o.data })
      .then((r) => o.onload({ status: r.status, responseText: r.text }))
      .catch((e) => o.onerror({ error: String(e) }));
  };
  window.__seed = async () => {
    const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
    const raw = crypto.getRandomValues(new Uint8Array(32));
    window.__gm['ll_dk'] = b64(raw.buffer);
    const dk = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dk, new TextEncoder().encode('sk-fake-key'));
    window.__gm['ll_key_enc'] = JSON.stringify({ iv: b64(iv.buffer), ct: b64(ct) });
    window.__gm['ll_settings'] = { api: { baseUrl: 'http://localhost:18735', model: 'fake-model' } };
    persist();
  };
});
await page.goto('http://localhost:18892/');
await page.evaluate(() => window.__seed());
await page.addScriptTag({ content: readFileSync(userJs, 'utf8') });
await page.waitForTimeout(400);
await page.evaluate(() => {
  const p = document.querySelector('article p');
  const range = document.createRange();
  range.selectNodeContents(p);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const bar = document.querySelector('[data-ll-lite]');
  bar.shadowRoot.querySelector('button.primary').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(3000);
const body = await page.evaluate(() => {
  const hosts = [...document.querySelectorAll('[data-ll-lite]')];
  return hosts.map((h) => {
    const style = h.shadowRoot?.querySelector('style');
    let t = h.shadowRoot?.textContent ?? '';
    if (style) t = t.replace(style.textContent, '');
    return t.replace(/\s+/g, ' ').slice(0, 200);
  });
});
console.log('宿主:', JSON.stringify(body, null, 1));
await browser.close();
srv.close();
fake.kill();
process.exit(0);
