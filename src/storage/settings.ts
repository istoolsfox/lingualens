// ============================================================
// storage/settings.ts —— 设置读写（chrome.storage.local）
// 注意：API Key 不存这里（走 background/secureStore 加密存储）
// ============================================================

import { mergeSettings, type Settings } from '../shared/settings';

const SETTINGS_KEY = 'll_settings';

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return mergeSettings(res[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** 深合并式局部更新 */
export async function patchSettings(patch: {
  api?: Partial<Settings['api']>;
  ui?: Partial<Settings['ui']>;
  user?: Partial<Settings['user']>;
  privacyAcknowledgedAt?: number;
}): Promise<Settings> {
  const cur = await getSettings();
  const next: Settings = {
    ...cur,
    api: { ...cur.api, ...(patch.api ?? {}) },
    ui: { ...cur.ui, ...(patch.ui ?? {}) },
    user: { ...cur.user, ...(patch.user ?? {}) },
    privacyAcknowledgedAt: patch.privacyAcknowledgedAt ?? cur.privacyAcknowledgedAt,
  };
  await saveSettings(next);
  return next;
}

/** 订阅设置变化（三端同步用） */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[SETTINGS_KEY]) {
      cb(mergeSettings(changes[SETTINGS_KEY]?.newValue));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** 清除全部本地数据（含密钥与设置）——由 SW 的 clearAllData 调用 */
export async function clearSettingsStorage(): Promise<void> {
  await chrome.storage.local.remove([SETTINGS_KEY]);
}
