// ============================================================
// background/index.ts —— Service Worker 入口
// 消息路由 / 双入口（浮动栏 + 图标激活）/ pending 快照接力
// ============================================================

import { guessMode } from '../ai/router';
import {
  PORT_NAME,
  isMsg,
  type GetStateResponse,
  type Snapshot,
  type StartResponse,
} from '../shared/messages';
import type { Entry, LightAction } from '../shared/types';
import { addEntry, newId } from '../storage/favorites';
import {
  addPort,
  broadcast,
  cancelAnalysis,
  cancelFollowUp,
  followUp,
  initService,
  listSessionViews,
  practiceGenerate,
  practiceGrade,
  startAnalysis,
  startLight,
} from './aiService';

const PENDING_KEY = 'll_pending';
const RESTRICTED_KEY = 'll_restricted';

// ---------- pending 快照接力 ----------

async function setPending(snapshot: Snapshot, action: 'analyze' | 'translate' | 'explain'): Promise<void> {
  await chrome.storage.session.set({ [PENDING_KEY]: { snapshot, action } });
  await chrome.storage.session.remove(RESTRICTED_KEY);
  broadcast({ type: 'pending', snapshot, action });
}

async function getPending(): Promise<{ snapshot: Snapshot; action: 'analyze' | 'translate' | 'explain' } | undefined> {
  const res = await chrome.storage.session.get(PENDING_KEY);
  const p = res[PENDING_KEY] as { snapshot: Snapshot; action: 'analyze' | 'translate' | 'explain' } | undefined;
  return p?.snapshot ? p : undefined;
}

async function clearPending(): Promise<void> {
  await chrome.storage.session.remove(PENDING_KEY);
  await chrome.storage.session.remove(RESTRICTED_KEY);
}

// ---------- 侧边栏打开（主路径 sidePanel，失败回退弹窗） ----------

async function openPanel(tabId?: number): Promise<void> {
  if (typeof tabId === 'number') {
    try {
      await chrome.sidePanel.open({ tabId });
      return;
    } catch {
      // 受限页/手势缺失等场景回退弹窗
    }
  }
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html'),
      type: 'popup',
      width: 420,
      height: 720,
    });
  } catch {
    /* 全部失败时静默：用户仍可点图标重试 */
  }
}

// ---------- 图标激活入口 ----------

/** 在页面里读取选区快照（ISOLATED world，纯函数随 executeScript 注入） */
function grabSelectionInPage(): {
  text?: string;
  contextBefore?: string;
  contextAfter?: string;
  url?: string;
  title?: string;
} {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return {};
  const range = sel.getRangeAt(0);
  const raw = range.toString().replace(/\s+/g, ' ').trim();
  if (!raw) return {};

  let container: Node = document.body;
  for (let node: Node | null = range.commonAncestorContainer; node && node !== document.body; node = node.parentNode) {
    const len = node.textContent?.length ?? 0;
    if (len > 0 && len <= 1500) {
      container = node;
      break;
    }
  }
  const full = container.textContent ?? '';
  const idx = full.indexOf(raw);
  return {
    text: raw.slice(0, 2000),
    contextBefore: idx >= 0 ? full.slice(Math.max(0, idx - 300), idx) : '',
    contextAfter: idx >= 0 ? full.slice(idx + raw.length, idx + raw.length + 300) : '',
    url: location.href,
    title: document.title,
  };
}

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    if (typeof tab.id !== 'number') return;
    let snapshot: Snapshot | undefined;
    let restricted = false;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: grabSelectionInPage,
      });
      const r = results?.[0]?.result as
        | { text?: string; contextBefore?: string; contextAfter?: string; url?: string; title?: string }
        | undefined;
      if (r?.text) {
        snapshot = {
          text: r.text,
          contextBefore: r.contextBefore ?? '',
          contextAfter: r.contextAfter ?? '',
          url: r.url ?? '',
          title: r.title ?? '',
          source: 'icon-activate',
        };
      }
    } catch {
      restricted = true; // chrome:// 等受限页
    }
    if (snapshot) await setPending(snapshot, 'analyze');
    else await chrome.storage.session.set({ [RESTRICTED_KEY]: restricted });
    await openPanel(tab.id);
  })();
});

// ---------- Port ----------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAME) addPort(port);
});

// ---------- 收藏（浮动栏免分析直接收藏） ----------

async function favoriteFromSnapshot(snapshot: Snapshot): Promise<void> {
  const entry: Entry = {
    id: newId(),
    type: guessMode(snapshot.text),
    text: snapshot.text,
    analysis: null,
    note: '',
    tags: [],
    sourceUrl: snapshot.url,
    sourceTitle: snapshot.title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await addEntry(entry);
}

// ---------- 消息路由 ----------

async function handleMessage(msg: import('../shared/messages').Msg, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'SELECTION_SNAPSHOT':
      await setPending(msg.snapshot, 'analyze');
      await openPanel(sender.tab?.id);
      return { ok: true };

    case 'OPEN_PANEL':
      await openPanel(sender.tab?.id);
      return { ok: true };

    case 'TOOLBAR_ACTION': {
      const { snapshot, action } = msg;
      if (action === 'favorite') {
        await favoriteFromSnapshot(snapshot);
        return { ok: true };
      }
      await setPending(snapshot, action as 'analyze' | 'translate' | 'explain');
      await openPanel(sender.tab?.id);
      return { ok: true };
    }

    case 'ANALYZE': {
      try {
        const id = await startAnalysis(msg.snapshot, msg.mode);
        return { analysisId: id } satisfies StartResponse;
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return { error: code, errorMessage: err instanceof Error ? err.message : String(err) } satisfies StartResponse;
      }
    }

    case 'LIGHT_ACTION': {
      try {
        const id = await startLight(msg.snapshot, msg.action as LightAction);
        return { analysisId: id } satisfies StartResponse;
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return { error: code, errorMessage: err instanceof Error ? err.message : String(err) } satisfies StartResponse;
      }
    }

    case 'ANALYZE_CANCEL':
      cancelAnalysis(msg.analysisId);
      return { ok: true };

    case 'FOLLOWUP':
      try {
        await followUp(msg.analysisId, msg.question, msg.ctx);
        return { ok: true };
      } catch (err) {
        return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
      }

    case 'FOLLOWUP_CANCEL':
      cancelFollowUp(msg.analysisId);
      return { ok: true };

    case 'SESSION_GET': {
      const view = listSessionViews().find((s) => s.id === msg.analysisId);
      return { session: view ?? null };
    }

    case 'GET_STATE': {
      const res: GetStateResponse = {
        pending: await getPending(),
        restricted: Boolean((await chrome.storage.session.get(RESTRICTED_KEY))[RESTRICTED_KEY]),
        sessions: listSessionViews(),
      };
      return res;
    }

    case 'CLEAR_PENDING':
      await clearPending();
      return { ok: true };

    case 'FAVORITE_ADD':
      await addEntry(msg.entry);
      return { ok: true };

    case 'PRACTICE_GENERATE': {
      try {
        const questions = await practiceGenerate(msg.types, msg.count);
        return { questions };
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return { error: code, errorMessage: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'PRACTICE_GRADE': {
      try {
        return await practiceGrade(msg.session);
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return { error: code, errorMessage: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'SETTINGS_UPDATED':
      return { ok: true };

    default:
      return { ok: false, error: 'unknown_message' };
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isMsg(msg)) {
    sendResponse({ ok: false, error: 'bad_message' });
    return false;
  }
  void handleMessage(msg, sender)
    .then((resp) => sendResponse(resp))
    .catch((err) => sendResponse({ ok: false, error: 'handler_error', errorMessage: err instanceof Error ? err.message : String(err) }));
  return true; // 异步响应
});

// ---------- 生命周期 ----------

chrome.runtime.onInstalled.addListener(() => {
  void initService();
});

chrome.runtime.onStartup.addListener(() => {
  void initService();
});

void initService();
