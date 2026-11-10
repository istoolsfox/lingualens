// ============================================================
// userscript/gm.ts —— GM_* API 声明与适配层
// GM_xmlhttpRequest → HttpResponseLike（供 ai/client 可插拔传输）
// GM 存储 → StorageLike（供 secureStore 原样复用 AES 加密）
// ============================================================

type GmResponse = {
  status: number;
  responseText: string;
};

declare const GM_xmlhttpRequest: (opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload: (r: GmResponse) => void;
  onerror: (r: { error?: string }) => void;
  ontimeout: () => void;
}) => unknown;

declare const GM_getValue: (key: string, fallback?: unknown) => unknown;
declare const GM_setValue: (key: string, value: unknown) => void;
declare const GM_deleteValue: (key: string) => void;
declare const GM_registerMenuCommand: (label: string, fn: () => void) => void;

/** GM_xmlhttpRequest → ai/client 的 HttpResponseLike（非流式） */
export async function gmFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: init.method,
      url,
      headers: init.headers,
      data: init.body,
      timeout: timeoutMs,
      onload: (r) => {
        resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          text: async () => r.responseText,
          json: async () => JSON.parse(r.responseText) as unknown,
        });
      },
      onerror: (r) => reject(new Error(r?.error ?? 'GM_xmlhttpRequest 网络错误')),
      ontimeout: () => reject(new Error('GM 请求超时')),
    });
  });
}

/** GM 存储 → StorageLike（secureStore 复用入口） */
export const gmStorageLike = {
  async get(key: string): Promise<unknown> {
    const v = GM_getValue(key, undefined);
    return v === undefined ? null : v;
  },
  async set(key: string, value: unknown): Promise<void> {
    GM_setValue(key, value);
  },
  async remove(key: string): Promise<void> {
    GM_deleteValue(key);
  },
};

/** 普通 KV（设置/缓存/记忆），带 JSON 容错 */
export const gmStore = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = GM_getValue(key, undefined);
      return v === undefined || v === null ? fallback : (JSON.parse(String(v)) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    GM_setValue(key, JSON.stringify(value));
  },
  delete(key: string): void {
    GM_deleteValue(key);
  },
};

export function registerMenu(label: string, fn: () => void): void {
  try {
    GM_registerMenuCommand(label, fn);
  } catch {
    // 个别管理器不支持菜单命令：静默（设置入口仍有悬浮栏/快捷面板）
  }
}
