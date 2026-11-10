// ============================================================
// userscript/chromeShim.ts —— 最小 chrome.* 兼容层（油猴环境）
// 让扩展的 content/fullpage.ts 原样复用：
// - storage.local → GM 原生值（secureStore 的 AES 密文可直接走 gmStorageLike）
// - storage.onChanged → 本页内事件（设置面板保存后自动刷新热键缓存）
// - runtime.sendMessage → 页内总线：PAGE_TRANSLATE 交给油猴版翻译引擎，
//   引擎产物（FULLPAGE_BATCH/DONE/ERROR、LL_PILL）回灌 content 的消息处理器
// ============================================================

import { APP_VERSION } from '../shared/constants';
import { gmGetValueRaw, gmSetValueRaw, gmRemoveValueRaw } from './gmRaw';

type ContentHandler = (msg: unknown) => boolean;

const state = {
  contentHandler: null as ContentHandler | null,
  storageListeners: new Set<(changes: Record<string, unknown>, area: string) => void>(),
  pageTranslateHandler: null as ((payload: unknown) => Promise<void>) | null,
  cancelHandler: null as (() => void) | null,
  toolbarActionHandler: null as ((snapshot: unknown, action: string) => void) | null,
};

/** main.ts 在装配完引擎后注册；content 侧处理器由 registerContentHandler 注册 */
export function registerContentHandler(h: ContentHandler): void {
  state.contentHandler = h;
}
export function registerPageTranslate(h: (payload: unknown) => Promise<void>): void {
  state.pageTranslateHandler = h;
}
export function registerCancel(h: () => void): void {
  state.cancelHandler = h;
}
/** 讲解卡「深度精读」等 TOOLBAR_ACTION 的页内承接 */
export function registerToolbarAction(h: (snapshot: unknown, action: string) => void): void {
  state.toolbarActionHandler = h;
}
/** 引擎回灌 content 侧消息（等效扩展里 SW→CS 的 tabs.sendMessage） */
export function pushToContent(msg: unknown): void {
  state.contentHandler?.(msg);
}
function fireStorageChanged(keys: string[]): void {
  const changes: Record<string, unknown> = {};
  for (const k of keys) changes[k] = { newValue: gmGetValueRaw(k) };
  for (const fn of state.storageListeners) fn(changes, 'local');
}

export function installChromeShim(): void {
  const g = globalThis as Record<string, unknown>;
  g['chrome'] = {
    runtime: {
      getManifest: () => ({ version: APP_VERSION }),
      // content 脚本方向的发消息：油猴里路由到页内引擎
      sendMessage: (msg: { type?: string; snapshot?: unknown; action?: string }) => {
        const t = msg?.type;
        if (t === 'PAGE_TRANSLATE' && state.pageTranslateHandler) {
          void state.pageTranslateHandler((msg as { payload?: unknown }).payload);
        } else if (t === 'FULLPAGE_CANCEL' && state.cancelHandler) {
          state.cancelHandler();
        } else if (t === 'TOOLBAR_ACTION' && state.toolbarActionHandler) {
          state.toolbarActionHandler(msg.snapshot, msg.action ?? 'analyze');
        }
        return Promise.resolve(null);
      },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) {
            const v = gmGetValueRaw(k);
            if (v !== undefined) out[k] = v;
          }
          return out;
        },
        set: async (obj: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(obj)) gmSetValueRaw(k, v);
          fireStorageChanged(Object.keys(obj));
        },
        remove: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) gmRemoveValueRaw(k);
          fireStorageChanged(list);
        },
      },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
          state.storageListeners.add(fn);
        },
      },
    },
  };
}
