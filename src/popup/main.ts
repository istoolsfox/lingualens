// ============================================================
// popup/main.ts —— 弹窗主界面 v0.5：连接配置直接搬进来
// 厂商/模型/密钥三行改完即用（自动保存）；翻译按钮两级；删四宫格
// ============================================================

import './popup.css';
import { DEFAULT_SETTINGS, formatHotkey, type Settings } from '../shared/settings';

const I = {
  languages:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
  fileText:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  panelRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>',
  scanText:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h8"/><path d="M7 16h5"/></svg>',
  bookOpen:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const SETTINGS_KEY = 'll_settings';
const KEY_ENC_SLOT = 'll_key_enc';

async function loadState(): Promise<{ settings: Settings; hasKey: boolean }> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  const s = (res[SETTINGS_KEY] ?? {}) as Partial<Settings>;
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...s,
    api: { ...DEFAULT_SETTINGS.api, ...(s.api ?? {}) },
    ui: { ...DEFAULT_SETTINGS.ui, ...(s.ui ?? {}) },
    user: { ...DEFAULT_SETTINGS.user, ...(s.user ?? {}) },
  };
  const hasKey = Boolean((await chrome.storage.local.get(KEY_ENC_SLOT))[KEY_ENC_SLOT]);
  return { settings: merged, hasKey };
}

async function main(): Promise<void> {
  const { settings, hasKey } = await loadState();
  const isMac = /mac/i.test(navigator.platform || navigator.userAgent);

  const app = el('div', 'wrap');

  // ---- 头部 ----
  const header = el('div', 'header');
  header.innerHTML = `
    <div class="logo">L</div>
    <div class="title">LinguaLens</div>
    <div class="status"><span class="dot" id="dot"></span><span id="statusText">检查中…</span></div>`;
  app.appendChild(header);

  // ---- 语言卡 ----
  const lang = el('div', 'lang-card');
  lang.innerHTML = `
    <div class="lang-box">英语 English</div>
    <div class="lang-arrow">${I.arrow}</div>
    <div class="lang-box">简体中文</div>`;
  app.appendChild(lang);

  // ---- 主按钮：全文翻译 ----
  const mainBtn = el('button', 'main-btn');
  mainBtn.innerHTML = `${I.languages}<span>全文翻译页面</span>`;
  mainBtn.id = 'btn-fullpage';
  app.appendChild(mainBtn);

  // ---- 四宫格（恢复 v0.4 布局） ----
  const grid = el('div', 'grid');
  const mkBtn = (id: string, icon: string, label: string, hint: string) => {
    const b = el('button', 'fn-btn');
    b.id = id;
    b.innerHTML = `<span class="fn-icon">${icon}</span><span class="fn-label"><b>${label}</b><i>${hint}</i></span>`;
    return b;
  };
  grid.appendChild(mkBtn('btn-article', I.fileText, '文章翻译', '智能提取正文·注入对照'));
  grid.appendChild(mkBtn('btn-select', I.scanText, '划词精读', '选中内容深度讲解'));
  grid.appendChild(mkBtn('btn-panel', I.panelRight, '打开侧边栏', '精读工作台'));
  grid.appendChild(mkBtn('btn-practice', I.bookOpen, '练习复习', '基于你的收藏'));
  app.appendChild(grid);

  // ---- 快捷键提示（显著化：蓝底胶囊） ----
  const hotkeyRow = el('div', 'hotkey-row');
  hotkeyRow.innerHTML = `
    <span class="kbd">${isMac ? '⌘⇧L' : 'Alt + L'}</span><span class="hk-label">翻译本文</span>
    <span class="hk-sep"></span>
    <span class="kbd">${formatHotkey(settings.ui.hotkey, isMac)}</span><span class="hk-label">全文翻译</span>`;
  app.appendChild(hotkeyRow);

  // ---- 提示条 ----
  const tip = el('div', 'tip');
  tip.id = 'tip';
  tip.style.display = 'none';
  app.appendChild(tip);

  // ---- 底栏 ----
  const footer = el('div', 'footer');
  footer.innerHTML = `
    <button id="btn-settings">${I.settings}<span>设置</span></button>
    <div class="privacy">${I.shield}<span>数据仅存本机</span></div>`;
  app.appendChild(footer);

  document.body.appendChild(app);

  // ---- 状态与动作 ----
  const configured = Boolean(settings.api.baseUrl && settings.api.model && hasKey);
  const dot = document.getElementById('dot') as HTMLElement;
  const statusText = document.getElementById('statusText') as HTMLElement;
  dot.className = `dot ${configured ? 'ok' : 'err'}`;
  statusText.textContent = configured ? '已连接模型' : '未配置';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  const injectable = /^https?:/i.test(tab?.url ?? '');

  const showTip = (text: string) => {
    const t = document.getElementById('tip') as HTMLElement;
    t.textContent = text;
    t.className = 'tip warn';
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 4000);
  };
  const guard = (): boolean => {
    if (!configured) {
      showTip('先在上面填好厂商、模型和密钥');
      return false;
    }
    if (!injectable) {
      showTip('当前页面不支持（仅 http/https 网页可用）');
      return false;
    }
    return typeof tabId === 'number';
  };

  mainBtn.addEventListener('click', async () => {
    if (!guard() || typeof tabId !== 'number') return;
    await chrome.tabs.sendMessage(tabId, { type: 'DO_TRANSLATE_PAGE', mode: 'full' }).catch(() => undefined);
    window.close();
  });
  (document.getElementById('btn-article') as HTMLButtonElement).addEventListener('click', async () => {
    if (!guard() || typeof tabId !== 'number') return;
    await chrome.tabs
      .sendMessage(tabId, { type: 'DO_TRANSLATE_PAGE', mode: 'article' })
      .catch(() => undefined);
    window.close();
  });
  (document.getElementById('btn-select') as HTMLButtonElement).addEventListener('click', async () => {
    if (!guard() || typeof tabId !== 'number') return;
    const results = await chrome.scripting
      .executeScript({
        target: { tabId },
        func: () => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || sel.rangeCount === 0) return '';
          return sel.toString().replace(/\s+/g, ' ').trim().slice(0, 2000);
        },
      })
      .catch(() => null);
    const text = (results?.[0]?.result as string | undefined) ?? '';
    if (!text) {
      showTip('先在页面上选中一段英文，再点这里');
      return;
    }
    await chrome.runtime.sendMessage({
      type: 'SELECTION_SNAPSHOT',
      snapshot: {
        text,
        contextBefore: '',
        contextAfter: '',
        url: tab?.url ?? '',
        title: tab?.title ?? '',
        source: 'icon-activate',
      },
    });
    await chrome.sidePanel.open({ tabId });
    window.close();
  });
  (document.getElementById('btn-panel') as HTMLButtonElement).addEventListener('click', async () => {
    if (typeof tabId !== 'number') return;
    await chrome.sidePanel.open({ tabId });
    window.close();
  });
  (document.getElementById('btn-practice') as HTMLButtonElement).addEventListener('click', async () => {
    if (typeof tabId !== 'number') return;
    await chrome.storage.session.set({ ll_open_view: 'practice' });
    await chrome.sidePanel.open({ tabId });
    window.close();
  });
  (document.getElementById('btn-settings') as HTMLButtonElement).addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
    window.close();
  });
}

void main();
