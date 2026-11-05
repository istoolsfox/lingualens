// ============================================================
// shared/settings.ts —— 设置类型与默认值
// ============================================================

import type { Depth, FloatingBarMode, Level, Theme } from './types';
import { DEFAULT_CONTEXT_LENGTH, DEFAULT_HOTKEY } from './constants';

export interface HotkeyCombo {
  /** 主键：单个字母/数字（大写存储） */
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
}

export interface Settings {
  api: {
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    /** 开启后请求带 response_format json_object（端点不支持时会失败，设置页有探测） */
    strictJson: boolean;
  };
  ui: {
    /** 已废弃（v0.3 固定暗色主题），字段保留仅为旧数据兼容 */
    theme: Theme;
    floatingBar: FloatingBarMode;
    excludedDomains: string[];
    contextLength: number;
    /** 应用内自定义快捷键（全文翻译注入），清空 key 则停用 */
    hotkey: HotkeyCombo;
  };
  user: {
    level: Level;
    depth: Depth;
  };
  /** 完成隐私说明确认的时间戳 */
  privacyAcknowledgedAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  api: {
    baseUrl: '',
    model: '',
    temperature: 0.3,
    maxTokens: 8192,
    timeoutMs: 60000,
    strictJson: false,
  },
  ui: {
    theme: 'dark',
    floatingBar: 'all',
    excludedDomains: [],
    contextLength: DEFAULT_CONTEXT_LENGTH,
    hotkey: { ...DEFAULT_HOTKEY },
  },
  user: {
    level: 'intermediate',
    depth: 'standard',
  },
  privacyAcknowledgedAt: null,
};

/** 深合并默认值，容忍旧版本缺字段 */
export function mergeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const r = (raw ?? {}) as Partial<Settings>;
  const hotkey = (r.ui?.hotkey ?? {}) as Partial<HotkeyCombo>;
  return {
    api: { ...d.api, ...(r.api ?? {}) },
    ui: {
      ...d.ui,
      ...(r.ui ?? {}),
      hotkey: {
        key: typeof hotkey.key === 'string' ? hotkey.key : d.ui.hotkey.key,
        ctrl: hotkey.ctrl ?? d.ui.hotkey.ctrl,
        alt: hotkey.alt ?? d.ui.hotkey.alt,
        meta: hotkey.meta ?? d.ui.hotkey.meta,
        shift: hotkey.shift ?? d.ui.hotkey.shift,
      },
    },
    user: { ...d.user, ...(r.user ?? {}) },
    privacyAcknowledgedAt: r.privacyAcknowledgedAt ?? null,
  };
}

/** 快捷键展示文案（跨平台：Mac 用 ⌃⌥，其余 Ctrl+Alt） */
export function formatHotkey(h: HotkeyCombo, isMac: boolean): string {
  if (!h.key) return '未设置';
  const parts: string[] = [];
  if (h.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
  if (h.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (h.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (h.meta) parts.push(isMac ? '⌘' : 'Win');
  parts.push(h.key.toUpperCase());
  return parts.join(isMac ? '' : '+');
}
