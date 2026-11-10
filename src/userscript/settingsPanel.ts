// ============================================================
// userscript/settingsPanel.ts —— 设置弹层（Shadow DOM）
// 厂商预设 / API 地址 / 模型 / 密钥（AES 加密经 gmStorageLike 落 GM 存储）
// 保存并测试连接 → 状态内联反馈；与扩展设置页同一交互习惯
// ============================================================

import { chatCompletion } from '../ai/client';
import { ERROR_MESSAGES } from '../shared/constants';
import { mergeSettings, type Settings } from '../shared/settings';
import { PROVIDER_PRESETS } from '../shared/providers';
import { loadApiKey, saveApiKey } from '../background/secureStore';
import { gmStorageLike } from './gm';
import { gmGetValueRaw, gmSetValueRaw } from './gmRaw';

const CSS = `
  :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .mask { position: fixed; inset: 0; z-index: 2147483646; background: rgba(15,23,42,.35); display: flex; align-items: center; justify-content: center; }
  .panel { width: 400px; max-width: calc(100vw - 32px); max-height: calc(100vh - 48px); overflow: auto;
    background: #fff; border: 0.5px solid rgba(15,23,42,.14); border-radius: 14px; box-shadow: 0 12px 40px rgba(15,23,42,.18);
    color: #1e293b; font-size: 13px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 0.5px solid rgba(15,23,42,.08);
    background: #f8fafc; border-radius: 14px 14px 0 0; }
  .head b { font-size: 15px; flex: 1; }
  .head button { appearance: none; border: 0; background: transparent; color: #64748b; font-size: 14px; cursor: pointer; }
  .body { padding: 14px 16px 4px; display: flex; flex-direction: column; gap: 10px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #64748b; }
  input, select { appearance: none; border: 0.5px solid rgba(15,23,42,.14); border-radius: 8px; padding: 8px 10px;
    font-size: 13px; font-family: inherit; outline: none; background: #fff; color: #1e293b; }
  input:focus, select:focus { border-color: #2563eb; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hint { font-size: 10px; color: #94a3b8; line-height: 1.5; }
  .foot { display: flex; align-items: center; gap: 8px; padding: 12px 16px 14px; }
  .foot .status { flex: 1; font-size: 11px; color: #64748b; }
  .foot .status.ok { color: #16a34a; }
  .foot .status.err { color: #dc2626; }
  button.primary { appearance: none; border: 0; background: #2563eb; color: #fff; font-weight: 600; font-size: 13px;
    border-radius: 8px; padding: 9px 14px; cursor: pointer; font-family: inherit; }
  button.primary:hover { background: #1d4ed8; }
  button.ghost { appearance: none; border: 0.5px solid rgba(15,23,42,.14); background: #fff; color: #334155;
    border-radius: 8px; padding: 8px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }
`;

let host: HTMLDivElement | null = null;

export function isSettingsOpen(): boolean {
  return !!host;
}

export function openSettings(): void {
  if (host) return;
  host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.append(style);

  const settings: Settings = mergeSettings(gmGetValueRaw('ll_settings'));
  const hasKey = Boolean(gmGetValueRaw('ll_key_enc'));

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="head"><b>LinguaLens Lite 设置</b><button class="close" title="关闭">✕</button></div>
    <div class="body">
      <label>厂商预设（自动填地址与常用模型）
        <select class="provider"></select>
      </label>
      <label>API 地址
        <input class="baseUrl" placeholder="https://example.com/v1" />
      </label>
      <label>模型
        <input class="model" list="ll-models" placeholder="deepseek-chat" />
        <datalist class="models" id="ll-models"></datalist>
      </label>
      <label>API 密钥（AES 加密存本脚本，仅存本机）
        <input class="key" type="password" placeholder="${hasKey ? '已配置 · 输入新值可更换' : 'sk-...'}" />
      </label>
      <div class="hint">工作目录：请求由本脚本直连所选厂商，不经任何中间服务器。自定义厂商请自行在脚本头部 @connect 里加你的 API 域名。</div>
    </div>
    <div class="foot">
      <span class="status"></span>
      <button class="ghost test">测试连接</button>
      <button class="primary save">保存</button>
    </div>`;
  root.append(panel);
  document.documentElement.appendChild(host);

  const $ = <T extends HTMLElement>(c: string): T => panel.querySelector(c) as T;
  const providerSel = $<HTMLSelectElement>('.provider');
  const baseUrl = $<HTMLInputElement>('.baseUrl');
  const model = $<HTMLInputElement>('.model');
  const models = $<HTMLDataListElement>('.models');
  const keyInput = $<HTMLInputElement>('.key');
  const status = $<HTMLElement>('.status');

  for (const p of PROVIDER_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    providerSel.append(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom';
  customOpt.textContent = '自定义';
  providerSel.append(customOpt);

  // 回填当前值：按 baseUrl 匹配预设
  const matched = PROVIDER_PRESETS.find((p) => settings.api.baseUrl.startsWith(p.baseUrl));
  providerSel.value = settings.api.baseUrl ? (matched?.id ?? '__custom') : PROVIDER_PRESETS[0]?.id ?? '';
  const applyPreset = (): void => {
    const p = PROVIDER_PRESETS.find((x) => x.id === providerSel.value);
    models.innerHTML = '';
    if (p) {
      baseUrl.value = p.baseUrl;
      for (const m of p.models) {
        const o = document.createElement('option');
        o.value = m;
        models.append(o);
      }
      if (!p.models.includes(model.value)) model.value = p.models[0] ?? '';
    }
  };
  if (matched) applyPreset();
  else if (settings.api.baseUrl) {
    baseUrl.value = settings.api.baseUrl;
    model.value = settings.api.model;
  }
  providerSel.addEventListener('change', applyPreset);
  model.addEventListener('input', () => {
    if (providerSel.value !== '__custom' && !PROVIDER_PRESETS.find((p) => p.id === providerSel.value)?.models.includes(model.value))
      providerSel.value = '__custom';
  });

  const say = (text: string, cls = ''): void => {
    status.textContent = text;
    status.className = `status ${cls}`;
  };
  const collect = async (): Promise<Settings> => {
    const raw = {
      api: {
        baseUrl: baseUrl.value.trim(),
        model: model.value.trim(),
      },
    };
    return mergeSettings(raw);
  };
  const currentKey = async (): Promise<string> => {
    const typed = keyInput.value.trim();
    if (typed) return typed;
    return loadApiKey(gmStorageLike);
  };
  const close = (): void => {
    host?.remove();
    host = null;
  };
  panel.querySelector('.close')?.addEventListener('click', close);
  panel.querySelector('.mask')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });

  panel.querySelector('.test')?.addEventListener('click', () => {
    void (async () => {
      try {
        say('测试中…');
        const cfg = {
          baseUrl: baseUrl.value.trim(),
          apiKey: await currentKey(),
          model: model.value.trim(),
          temperature: 0,
          maxTokens: 8,
          timeoutMs: 20000,
        };
        if (!cfg.baseUrl || !cfg.model || !cfg.apiKey) {
          say('请先填齐地址、模型和密钥', 'err');
          return;
        }
        await chatCompletion(cfg, {
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
          maxTokens: 8,
        });
        say('✓ 连接成功', 'ok');
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        say(ERROR_MESSAGES[code] ?? '连接失败，请检查配置', 'err');
      }
    })();
  });

  panel.querySelector('.save')?.addEventListener('click', () => {
    void (async () => {
      try {
        const s = await collect();
        if (!s.api.baseUrl || !s.api.model) {
          say('地址与模型必填', 'err');
          return;
        }
        gmSetValueRaw('ll_settings', s);
        const typed = keyInput.value.trim();
        if (typed) await saveApiKey(gmStorageLike, typed);
        say('已保存', 'ok');
        setTimeout(close, 500);
      } catch {
        say('保存失败', 'err');
      }
    })();
  });
}
