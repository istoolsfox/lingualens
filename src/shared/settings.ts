// ============================================================
// shared/settings.ts —— 设置类型与默认值
// ============================================================

import type { Depth, FloatingBarMode, Level, Theme } from './types';
import { DEFAULT_CONTEXT_LENGTH } from './constants';

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
    theme: Theme;
    floatingBar: FloatingBarMode;
    excludedDomains: string[];
    contextLength: number;
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
    maxTokens: 4096,
    timeoutMs: 60000,
    strictJson: false,
  },
  ui: {
    theme: 'auto',
    floatingBar: 'all',
    excludedDomains: [],
    contextLength: DEFAULT_CONTEXT_LENGTH,
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
  return {
    api: { ...d.api, ...(r.api ?? {}) },
    ui: { ...d.ui, ...(r.ui ?? {}) },
    user: { ...d.user, ...(r.user ?? {}) },
    privacyAcknowledgedAt: r.privacyAcknowledgedAt ?? null,
  };
}
