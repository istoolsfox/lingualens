// ============================================================
// options/App.tsx —— 设置页
// API 配置（密钥加密存储）/ 分析偏好 / 界面 / 隐私 / 数据管理
// ============================================================

import { useEffect, useState, type ReactNode } from 'react';
import { chatCompletion } from '../ai/client';
import { AiError } from '../ai/errors';
import { DEFAULT_CONTEXT_LENGTH, LEVEL_LABELS, DEPTH_LABELS } from '../shared/constants';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { getSettings, saveSettings } from '../storage/settings';
import { clearApiKey, hasApiKey, loadApiKey, saveApiKey } from '../background/secureStore';
import { chromeStorageLike } from '../background/storageLike';
import { clearLibrary } from '../storage/favorites';
import { Btn } from '../sidepanel/components/bits';

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'fail'; message: string };

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [probe, setProbe] = useState<string>('');

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
      setHasKey(await hasApiKey(chromeStorageLike));
    })();
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  };

  const persist = async () => {
    await saveSettings(settings);
    if (keyInput) {
      await saveApiKey(chromeStorageLike, keyInput.trim());
      setKeyInput('');
      setHasKey(true);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnection = async () => {
    setTest({ kind: 'testing' });
    try {
      const apiKey = keyInput.trim() || (await loadApiKey(chromeStorageLike));
      if (!settings.api.baseUrl || !settings.api.model || !apiKey) {
        setTest({ kind: 'fail', message: '请先填写 API 地址、模型名称和密钥并保存。' });
        return;
      }
      await chatCompletion(
        {
          baseUrl: settings.api.baseUrl,
          apiKey,
          model: settings.api.model,
          temperature: 0,
          maxTokens: 8,
          timeoutMs: 15000,
        },
        { messages: [{ role: 'user', content: '回复 ok' }], stream: false },
      );
      setTest({ kind: 'ok' });
    } catch (err) {
      setTest({ kind: 'fail', message: err instanceof AiError ? `${err.code}: ${err.message}` : String(err) });
    }
  };

  const probeStrictJson = async () => {
    setProbe('探测中…');
    try {
      const apiKey = keyInput.trim() || (await loadApiKey(chromeStorageLike));
      await chatCompletion(
        {
          baseUrl: settings.api.baseUrl,
          apiKey,
          model: settings.api.model,
          temperature: 0,
          maxTokens: 16,
          timeoutMs: 15000,
        },
        {
          messages: [{ role: 'user', content: '输出 JSON：{"ok":true}' }],
          stream: false,
          jsonObject: true,
        },
      );
      setProbe('端点支持 json_object 模式，可以开启。');
    } catch (err) {
      setProbe(`端点不支持（${err instanceof Error ? err.message : err}），建议保持关闭。`);
    }
  };

  return (
    <div className="mx-auto max-w-[640px] p-6">
      <h1 className="text-lg font-bold">LinguaLens 设置</h1>
      <p className="mt-1 text-xs text-ink-400">兼容 OpenAI API 格式的任意模型服务（DeepSeek / 硅基流动 / OpenAI / 本地端点等）。</p>

      <Section title="API 连接">
        <Field label="API 地址（Base URL）">
          <input
            value={settings.api.baseUrl}
            onChange={(e) => update({ api: { ...settings.api, baseUrl: e.target.value.trim() } })}
            placeholder="https://api.deepseek.com/v1"
            className={inputCls}
          />
        </Field>
        <Field label="模型名称">
          <input
            value={settings.api.model}
            onChange={(e) => update({ api: { ...settings.api, model: e.target.value.trim() } })}
            placeholder="deepseek-chat / gpt-4o-mini / …"
            className={inputCls}
          />
        </Field>
        <Field label="API 密钥" hint={hasKey ? '已加密保存过密钥。留空则保持不变。' : '密钥以 AES-256-GCM 加密存放在本机。'}>
          <div className="flex gap-1.5">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasKey ? '••••••••（已保存）' : 'sk-…'}
              className={inputCls}
              autoComplete="off"
            />
            <Btn onClick={() => setShowKey((v) => !v)}>{showKey ? '隐藏' : '显示'}</Btn>
            {hasKey && (
              <Btn
                variant="danger"
                onClick={async () => {
                  if (!confirm('删除已保存的密钥？')) return;
                  await clearApiKey(chromeStorageLike);
                  setHasKey(false);
                }}
              >
                删除
              </Btn>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Temperature：${settings.api.temperature}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={settings.api.temperature}
              onChange={(e) => update({ api: { ...settings.api, temperature: Number(e.target.value) } })}
              className="w-full"
            />
          </Field>
          <Field label="最大输出 Tokens">
            <input
              type="number"
              value={settings.api.maxTokens}
              min={256}
              max={32000}
              onChange={(e) => update({ api: { ...settings.api, maxTokens: Number(e.target.value) || 4096 } })}
              className={inputCls}
            />
          </Field>
          <Field label="请求超时（毫秒）">
            <input
              type="number"
              value={settings.api.timeoutMs}
              min={10000}
              max={300000}
              step={5000}
              onChange={(e) => update({ api: { ...settings.api, timeoutMs: Number(e.target.value) || 60000 } })}
              className={inputCls}
            />
          </Field>
          <Field label="强制 JSON 输出模式" hint="部分端点不支持，先探测">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={settings.api.strictJson}
                onChange={(e) => update({ api: { ...settings.api, strictJson: e.target.checked } })}
                className="accent-indigo-600"
              />
              <Btn onClick={() => void probeStrictJson()}>探测端点</Btn>
            </div>
          </Field>
        </div>
        {probe && <p className="text-[11px] text-ink-500">{probe}</p>}
        <div className="flex items-center gap-2 pt-1">
          <Btn onClick={() => void testConnection()}>测试连接</Btn>
          {test.kind === 'testing' && <span className="text-xs text-ink-400">测试中…</span>}
          {test.kind === 'ok' && <span className="text-xs text-emerald-600 dark:text-emerald-400">连接成功 ✓</span>}
          {test.kind === 'fail' && <span className="text-xs text-red-500">{test.message}</span>}
        </div>
      </Section>

      <Section title="分析偏好">
        <div className="grid grid-cols-2 gap-3">
          <Field label="我的英语水平">
            <select
              value={settings.user.level}
              onChange={(e) => update({ user: { ...settings.user, level: e.target.value as Settings['user']['level'] } })}
              className={inputCls}
            >
              {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="分析深度">
            <select
              value={settings.user.depth}
              onChange={(e) => update({ user: { ...settings.user, depth: e.target.value as Settings['user']['depth'] } })}
              className={inputCls}
            >
              {Object.entries(DEPTH_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`上下文长度：${settings.ui.contextLength} 字符`} hint={`选区前后各取多少字符（默认 ${DEFAULT_CONTEXT_LENGTH}）`}>
            <input
              type="range"
              min={100}
              max={800}
              step={50}
              value={settings.ui.contextLength}
              onChange={(e) => update({ ui: { ...settings.ui, contextLength: Number(e.target.value) } })}
              className="w-full"
            />
          </Field>
        </div>
      </Section>

      <Section title="界面与浮动栏">
        <div className="grid grid-cols-2 gap-3">
          <Field label="主题">
            <select
              value={settings.ui.theme}
              onChange={(e) => update({ ui: { ...settings.ui, theme: e.target.value as Settings['ui']['theme'] } })}
              className={inputCls}
            >
              <option value="auto">跟随系统</option>
              <option value="light">亮色</option>
              <option value="dark">暗色</option>
            </select>
          </Field>
          <Field label="浮动工具栏" hint="关闭后仍可用图标入口精读本页">
            <select
              value={settings.ui.floatingBar}
              onChange={(e) => update({ ui: { ...settings.ui, floatingBar: e.target.value as Settings['ui']['floatingBar'] } })}
              className={inputCls}
            >
              <option value="all">全站开启</option>
              <option value="off">关闭</option>
            </select>
          </Field>
        </div>
        <Field label="排除站点" hint="每行一个域名，浮动栏在这些站点不出现（如 example.com）">
          <textarea
            rows={3}
            value={settings.ui.excludedDomains.join('\n')}
            onChange={(e) =>
              update({
                ui: {
                  ...settings.ui,
                  excludedDomains: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="隐私与安全">
        <ul className="space-y-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
          <li>· 发送范围：仅选中文本 + 有限上下文 + 页面标题/网址。无后台静默抓取。</li>
          <li>· 密钥以 AES-256-GCM 加密存放在本机；网页内容会被包裹为纯数据，不能指挥模型。</li>
          <li>· 模型输出经白名单净化渲染，防止注入。</li>
          <li>· 本地加密防密钥明文泄露；若设备已被完全控制则无法防御，公开发布版建议改服务端代理。</li>
        </ul>
      </Section>

      <Section title="数据管理">
        <div className="flex flex-wrap gap-2">
          <Btn
            variant="danger"
            onClick={async () => {
              if (!confirm('清空知识库（收藏/笔记/练习记录）？导出备份后再操作更稳妥。')) return;
              await clearLibrary();
              alert('知识库已清空。');
            }}
          >
            清空知识库
          </Btn>
          <Btn
            variant="danger"
            onClick={async () => {
              if (!confirm('清除全部本地数据（知识库 + 设置 + 密钥）？不可恢复。')) return;
              await clearLibrary();
              await clearApiKey(chromeStorageLike);
              await chrome.storage.local.remove(['ll_settings']);
              setSettings(DEFAULT_SETTINGS);
              setHasKey(false);
              alert('全部本地数据已清除。');
            }}
          >
            清除全部本地数据
          </Btn>
        </div>
        <p className="mt-1 text-[11px] text-ink-400">完整导出/导入在侧边栏「知识库」视图。</p>
      </Section>

      <div className="sticky bottom-0 mt-4 flex items-center gap-2 border-t border-ink-200 bg-ink-50 py-3 dark:border-ink-800 dark:bg-ink-950">
        <Btn variant="primary" onClick={() => void persist()}>
          保存设置
        </Btn>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">已保存 ✓（密钥已加密落盘）</span>}
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">{hint}</p>}
    </div>
  );
}
