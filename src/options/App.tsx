// ============================================================
// options/App.tsx —— 设置页（v0.2 小白化）
// 选厂商 → 贴密钥 → 测试，三步完成；改动自动保存；高级项折叠
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { chatCompletion } from '../ai/client';
import { AiError } from '../ai/errors';
import { DEFAULT_CONTEXT_LENGTH, LEVEL_LABELS, DEPTH_LABELS } from '../shared/constants';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { PROVIDER_PRESETS, matchPresetByBaseUrl } from '../shared/providers';
import { getSettings, saveSettings } from '../storage/settings';
import { clearApiKey, hasApiKey, loadApiKey, saveApiKey } from '../background/secureStore';
import { chromeStorageLike } from '../background/storageLike';
import { clearLibrary } from '../storage/favorites';
import { Btn } from '../sidepanel/components/bits';

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'fail'; message: string };

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [providerId, setProviderId] = useState('deepseek');
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const skipAutosave = useRef(true);

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setSettings(s);
      setProviderId(matchPresetByBaseUrl(s.api.baseUrl));
      setHasKey(await hasApiKey(chromeStorageLike));
      skipAutosave.current = false;
    })();
  }, []);

  // 设置自动保存（防抖 500ms）：小白改哪存哪，不用找保存按钮
  useEffect(() => {
    if (skipAutosave.current) return;
    const t = setTimeout(() => {
      void saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 500);
    return () => clearTimeout(t);
  }, [settings]);

  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId) ?? PROVIDER_PRESETS[0]!;

  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  };

  const pickProvider = (id: string) => {
    setProviderId(id);
    const p = PROVIDER_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const nextModel = p.models.length > 0 && !p.models.includes(settings.api.model) ? (p.models[0] ?? '') : settings.api.model;
    update({
      api: {
        ...settings.api,
        baseUrl: id === 'custom' ? settings.api.baseUrl : p.baseUrl,
        model: nextModel,
      },
    });
  };

  const persistKey = async () => {
    if (keyInput.trim()) {
      await saveApiKey(chromeStorageLike, keyInput.trim());
      setKeyInput('');
      setHasKey(true);
    }
  };

  const saveAndTest = async () => {
    setTest({ kind: 'testing' });
    await saveSettings(settings);
    await persistKey();
    try {
      const apiKey = await loadApiKey(chromeStorageLike);
      if (!settings.api.baseUrl || !settings.api.model || !apiKey) {
        setTest({ kind: 'fail', message: '还差东西没填：厂商、模型、密钥三样都要有。' });
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

  const openShortcutSettings = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  return (
    <div className="mx-auto max-w-[680px] p-6 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">LinguaLens 设置</h1>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">已自动保存 ✓</span>}
      </div>
      <p className="mt-1 text-xs text-ink-400">三步搞定：选厂商 → 贴密钥 → 测试。改动会自动保存。</p>

      <Section title="第一步：选择 AI 厂商">
        <div className="grid grid-cols-3 gap-2">
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProvider(p.id)}
              className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                providerId === p.id
                  ? 'border-accent-500 bg-accent-50 dark:border-accent-400 dark:bg-accent-700/20'
                  : 'border-ink-200 hover:border-accent-300 dark:border-ink-700 dark:hover:border-ink-600'
              }`}
            >
              <div className="font-semibold">{p.name}</div>
              {p.note && <div className="mt-0.5 text-[10.5px] leading-snug text-ink-400 dark:text-ink-500">{p.note}</div>}
            </button>
          ))}
        </div>
        {(providerId === 'custom' || providerId === 'ollama' || providerId === 'lmstudio') && (
          <Field label="API 地址" hint="OpenAI 兼容格式，一般以 /v1 结尾">
            <input
              value={settings.api.baseUrl}
              onChange={(e) => update({ api: { ...settings.api, baseUrl: e.target.value.trim() } })}
              placeholder="https://example.com/v1"
              className={inputCls}
            />
          </Field>
        )}
      </Section>

      <Section title="第二步：填入密钥">
        {preset.keyHint && (
          <p className="text-xs text-ink-500 dark:text-ink-400">
            密钥从这里拿：<span className="font-mono">{preset.keyHint}</span>
          </p>
        )}
        <Field label="API 密钥" hint={hasKey ? '已加密保存 ✓（AES-256-GCM）。重新粘贴可覆盖。' : '密钥只存你自己电脑里，加密保存，不会上传。'}>
          <div className="flex gap-1.5">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onBlur={() => void persistKey()}
              placeholder={hasKey ? '••••••••（已保存）' : '粘贴你的密钥 sk-…'}
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
      </Section>

      <Section title="第三步：选模型并测试">
        <Field label="模型" hint={preset.models.length > 0 ? '点输入框可从常用模型里选，也可以自己改' : '填这个服务支持的模型名称'}>
          <input
            value={settings.api.model}
            onChange={(e) => update({ api: { ...settings.api, model: e.target.value.trim() } })}
            list="model-presets"
            placeholder="deepseek-chat"
            className={inputCls}
          />
          <datalist id="model-presets">
            {preset.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={() => void saveAndTest()}>
            保存并测试连接
          </Btn>
          {test.kind === 'testing' && <span className="text-xs text-ink-400">测试中…</span>}
          {test.kind === 'ok' && <span className="text-xs text-emerald-600 dark:text-emerald-400">连接成功 ✓ 可以去读英文了！</span>}
          {test.kind === 'fail' && <span className="text-xs text-red-500">{test.message}</span>}
        </div>
      </Section>

      <Section title="快捷键">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
            <p>
              <kbd className="rounded border border-ink-300 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] dark:border-ink-600 dark:bg-ink-800">Alt + L</kbd>
              　智能提取本文正文，逐段双语翻译（不翻导航/评论等无关内容）
            </p>
            <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">想在别的页面生效、或换成别的按键，去 Chrome 的快捷键设置里改。</p>
          </div>
          <Btn onClick={openShortcutSettings} className="shrink-0">
            修改快捷键
          </Btn>
        </div>
      </Section>

      <details className="mt-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-wide text-ink-400">高级设置（一般不用动）</summary>
        <div className="mt-3 space-y-3">
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
                onChange={(e) => update({ api: { ...settings.api, maxTokens: Number(e.target.value) || 8192 } })}
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
            <Field label={`上下文长度：${settings.ui.contextLength} 字`} hint={`默认 ${DEFAULT_CONTEXT_LENGTH}`}>
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
            <Field label="浮动工具栏" hint="关闭后仍可用图标入口">
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
          <Field label="排除站点" hint="每行一个域名，浮动栏在这些网站不出现">
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
          <Field label="强制 JSON 输出模式" hint="个别厂商需要；默认关闭即可，解析有自动降级兜底">
            <input
              type="checkbox"
              checked={settings.api.strictJson}
              onChange={(e) => update({ api: { ...settings.api, strictJson: e.target.checked } })}
              className="accent-indigo-600"
            />
          </Field>
        </div>
      </details>

      <Section title="隐私与数据">
        <ul className="space-y-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
          <li>· 发送范围：仅选中的文字 + 前后一小段上下文 + 页面标题/网址（整文翻译时为提取出的正文）。</li>
          <li>· 密钥加密存本机；网页内容会被当作纯数据，指挥不了 AI。</li>
          <li>· 收藏、笔记、练习全部存在本地，可导出备份。</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Btn
            variant="danger"
            onClick={async () => {
              if (!confirm('清空知识库（收藏/笔记/练习记录）？建议先在侧边栏「知识库」导出备份。')) return;
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
              setProviderId('deepseek');
              setHasKey(false);
              alert('全部本地数据已清除。');
            }}
          >
            清除全部本地数据
          </Btn>
        </div>
        <p className="text-[11px] text-ink-400">完整导出/导入在侧边栏「知识库」视图。</p>
      </Section>
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
