// ============================================================
// background/storageLike.ts —— chrome.storage 的最小接口抽象
// 便于 secureStore 在单元测试中注入内存实现
// ============================================================

export interface StorageLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** chrome.storage.local 适配 */
export const chromeStorageLike: StorageLike = {
  async get(key) {
    const res = await chrome.storage.local.get(key);
    return res[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
};
