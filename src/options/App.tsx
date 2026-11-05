// ============================================================
// options/App.tsx —— 设置页（v0.2 小白化）
// 选厂商 → 贴密钥 → 测试，三步完成；改动自动保存；高级项折叠
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { chatCompletion } from '../ai/client';
import { AiError } from '../ai/errors';
import { DEFAULT_CONTEXT_LENGTH, LEVEL_LABELS, DEPTH_LABELS } from '../shared/constants';
import { DEFAULT_SETTINGS, formatHotkey, type HotkeyCombo, type Settings } from '../shared/settings';
import { PROVIDER_PRESETS, matchPresetByBaseUrl } from '../shared/providers';
import { getSettings, saveSettings } from '../storage/settings';
import { clearApiKey, hasApiKey, loadApiKey, saveApiKey } from '../background/secureStore';
import { chromeStorageLike } from '../background/storageLike';
import { clearLibrary } from '../storage/favorites';
import {
  isAutoBackupEnabled,
  lastBackupAt,
  pickBackupDir,
  removeBackupDir,
  setAutoBackupEnabled,
  syncBackupToDir,
} from '../storage/backup';
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
  const [recording, setRecording] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [backup, setBackup] = useState<{ enabled: boolean; lastAt: number; msg: string }>({
    enabled: false,
    lastAt: 0,
    msg: '',
  });
  const skipAutosave = useRef(true);

  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform || navigator.userAgent));
    void isAutoBackupEnabled().then(async (enabled) => {
      const lastAt = await lastBackupAt();
      setBackup((b) => ({ ...b, enabled, lastAt }));
    });
  }, []);

  // 录键器：捕获一次组合键写入设置（自动保存生效）
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      if (e.key.length !== 1) return; // 只接受单字符主键，修饰键继续等待
      const hasModifier = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
      if (!hasModifier) {
        setBackup((b) => ({ ...b, msg: '至少要带一个修饰键（Ctrl/Alt/⌘/Shift），避免和打字冲突' }));
        return;
      }
      const combo: HotkeyCombo = {
        key: e.key.toUpperCase(),
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
        shift: e.shiftKey,
      };
      setSettings((s) => ({ ...s, ui: { ...s.ui, hotkey: combo } }));
      setRecording(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);

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
    const nextModel =
      p.models.length > 0 && !p.models.includes(settings.api.model)
        ? (p.models[0] ?? '')
        : settings.api.model;
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
      setTest({
        kind: 'fail',
        message: err instanceof AiError ? `${err.code}: ${err.message}` : String(err),
      });
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
              {p.note && (
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-400 dark:text-ink-500">
                  {p.note}
                </div>
              )}
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
        <Field
          label="API 密钥"
          hint={
            hasKey
              ? '已加密保存 ✓（AES-256-GCM）。重新粘贴可覆盖。'
              : '密钥只存你自己电脑里，加密保存，不会上传。'
          }
        >
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
        <Field
          label="模型"
          hint={
            preset.models.length > 0 ? '点输入框可从常用模型里选，也可以自己改' : '填这个服务支持的模型名称'
          }
        >
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
          {test.kind === 'ok' && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              连接成功 ✓ 可以去读英文了！
            </span>
          )}
          {test.kind === 'fail' && <span className="text-xs text-red-500">{test.message}</span>}
        </div>
      </Section>

      <Section title="快捷键">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
              <p>
                <kbd className="rounded-md bg-accent-600 px-2 py-1 font-mono text-[11px] font-semibold text-white">
                  {isMac ? '⌘⇧L' : 'Alt + L'}
                </kbd>
                　翻译本文：智能提取正文，侧边栏逐段双语对照
              </p>
              <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">
                这个键由 Chrome 管理，点右边按钮去 Chrome 设置里改。
              </p>
            </div>
            <Btn onClick={openShortcutSettings} className="shrink-0">
              修改快捷键
            </Btn>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3 dark:border-ink-800">
            <div className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
              <p>
                <kbd className="rounded-md bg-accent-600 px-2 py-1 font-mono text-[11px] font-semibold text-white">
                  {formatHotkey(settings.ui.hotkey, isMac)}
                </kbd>
                　全文翻译：页面所有可见文字就地对照，重点表达虚线标注点击讲解（再按一次隐藏）
              </p>
              <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">
                {recording
                  ? '正在录制：按下想要的组合键（Esc 取消）'
                  : '这个键在本扩展里自定义，想换就点右边录制。'}
              </p>
            </div>
            <Btn
              variant={recording ? 'primary' : 'ghost'}
              className="shrink-0"
              onClick={() => setRecording((v) => !v)}
            >
              {recording ? '录制中…' : '自定义按键'}
            </Btn>
          </div>
          {backup.msg && recording && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{backup.msg}</p>
          )}
        </div>
      </Section>

      <details className="mt-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-wide text-ink-400">
          高级设置（一般不用动）
        </summary>
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
                onChange={(e) =>
                  update({ api: { ...settings.api, maxTokens: Number(e.target.value) || 8192 } })
                }
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
                onChange={(e) =>
                  update({ api: { ...settings.api, timeoutMs: Number(e.target.value) || 60000 } })
                }
                className={inputCls}
              />
            </Field>
            <Field label="我的英语水平">
              <select
                value={settings.user.level}
                onChange={(e) =>
                  update({ user: { ...settings.user, level: e.target.value as Settings['user']['level'] } })
                }
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
                onChange={(e) =>
                  update({ user: { ...settings.user, depth: e.target.value as Settings['user']['depth'] } })
                }
                className={inputCls}
              >
                {Object.entries(DEPTH_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`上下文长度：${settings.ui.contextLength} 字`}
              hint={`默认 ${DEFAULT_CONTEXT_LENGTH}`}
            >
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
            <Field label="讲解标注" hint="全文/文章翻译时在重点表达下加虚线，点击弹出讲解">
              <input
                type="checkbox"
                checked={settings.ui.showHighlights !== false}
                onChange={(e) => update({ ui: { ...settings.ui, showHighlights: e.target.checked } })}
                className="accent-indigo-600"
              />
            </Field>
            <Field label="浮动工具栏" hint="关闭后仍可用图标入口">
              <select
                value={settings.ui.floatingBar}
                onChange={(e) =>
                  update({
                    ui: { ...settings.ui, floatingBar: e.target.value as Settings['ui']['floatingBar'] },
                  })
                }
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

      <Section title="存储位置">
        <div className="space-y-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
          <p>
            默认：所有收藏/笔记/练习存在<b>浏览器本地</b>（Windows/Mac 一样，安全且离线可用）。
          </p>
          <p>
            想额外存一份到你指定的文件夹（比如网盘同步目录）：选择文件夹后，知识库每次变化会自动把备份写进去。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            onClick={async () => {
              const r = await pickBackupDir();
              if (r.ok) {
                const s = await syncBackupToDir();
                const lastAt = await lastBackupAt();
                setBackup((b) => ({ ...b, msg: s.message, lastAt, enabled: true }));
                await setAutoBackupEnabled(true);
              } else if (r.error && r.error !== '已取消') {
                setBackup((b) => ({ ...b, msg: r.error ?? '' }));
              }
            }}
          >
            选择备份文件夹
          </Btn>
          <Btn
            onClick={async () => {
              const r = await syncBackupToDir();
              const lastAt = await lastBackupAt();
              setBackup((b) => ({ ...b, msg: r.message, lastAt }));
            }}
          >
            立即同步
          </Btn>
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={backup.enabled}
              onChange={async (e) => {
                await setAutoBackupEnabled(e.target.checked);
                setBackup((b) => ({
                  ...b,
                  enabled: e.target.checked,
                  msg: e.target.checked ? '已开启自动备份' : '已关闭自动备份',
                }));
              }}
              className="accent-indigo-600"
            />
            自动备份（每次收藏后静默写入）
          </label>
          <Btn
            variant="danger"
            onClick={async () => {
              await removeBackupDir();
              setBackup({ enabled: false, lastAt: 0, msg: '已恢复为仅浏览器本地存储' });
            }}
          >
            停用文件夹备份
          </Btn>
        </div>
        {backup.msg && <p className="text-[11px] text-ink-500 dark:text-ink-400">{backup.msg}</p>}
        {backup.lastAt > 0 && (
          <p className="text-[11px] text-ink-400">
            上次同步：{new Date(backup.lastAt).toLocaleString('zh-CN')}
          </p>
        )}
      </Section>

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
