// ============================================================
// userscript/gmRaw.ts —— GM 存储原生读写（不做 JSON 包裹）
// chrome shim 与 secureStore(gmStorageLike) 都走这里，保证同一份原始值
// ============================================================

declare const GM_getValue: (key: string, fallback?: unknown) => unknown;
declare const GM_setValue: (key: string, value: unknown) => void;
declare const GM_deleteValue: (key: string) => void;

export function gmGetValueRaw(key: string): unknown {
  try {
    return GM_getValue(key, undefined);
  } catch {
    return undefined;
  }
}
export function gmSetValueRaw(key: string, value: unknown): void {
  GM_setValue(key, value);
}
export function gmRemoveValueRaw(key: string): void {
  try {
    GM_deleteValue(key);
  } catch {
    /* 管理器差异容忍 */
  }
}
