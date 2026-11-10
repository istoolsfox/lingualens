// ============================================================
// background/index.ts —— Service Worker 入口
// 消息路由 / 双入口（浮动栏 + 图标激活）/ pending 快照接力
// ============================================================

import { guessMode } from '../ai/router';
import { isNewer } from '../shared/version';
import {
  PORT_NAME,
  isMsg,
  type ArticlePayload,
  type GetStateResponse,
  type Msg,
  type Snapshot,
  type StartResponse,
} from '../shared/messages';
import type { Entry, LightAction } from '../shared/types';
import { addEntry, newId } from '../storage/favorites';
import {
  addPort,
  broadcast,
  cancelAnalysis,
  cancelArticle,
  cancelFollowUp,
  cancelFullPageTranslate,
  followUp,
  getArticleState,
  initService,
  listSessionViews,
  practiceGenerate,
  practiceGrade,
  setArticleError,
  startAnalysis,
  startArticleTranslate,
  startFullPageTranslate,
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

async function setPendingArticle(payload: ArticlePayload): Promise<void> {
  await chrome.storage.session.remove(RESTRICTED_KEY);
  broadcast({ type: 'pending-article', payload });
}

async function getPending(): Promise<
  { snapshot: Snapshot; action: 'analyze' | 'translate' | 'explain' } | undefined
> {
  const res = await chrome.storage.session.get(PENDING_KEY);
  const p = res[PENDING_KEY] as
    { snapshot: Snapshot; action: 'analyze' | 'translate' | 'explain' } | undefined;
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

// ---------- 快捷键命令（Chrome commands，用户可在 chrome://extensions/shortcuts 自定义） ----------

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'translate-article') return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== 'number') return;
    try {
      // v0.5：正文翻译效果与全文一致（页面注入 + 转圈占位 + pill）
      await chrome.tabs.sendMessage(tab.id, { type: 'DO_EXTRACT_ARTICLE' });
    } catch {
      await chrome.storage.session.set({ [RESTRICTED_KEY]: true });
      await openPanel(tab.id);
    }
  })();
});

// ---------- 右键菜单：文章翻译 ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'll-article-translate',
      title: '文章翻译（LinguaLens）',
      contexts: ['page', 'selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'll-article-translate' || typeof tab?.id !== 'number') return;
  void chrome.tabs.sendMessage(tab.id, { type: 'DO_EXTRACT_ARTICLE' }).catch(() => undefined);
});

// ---------- 消息路由 ----------

async function handleMessage(msg: Msg, sender: chrome.runtime.MessageSender): Promise<unknown> {
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
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return {
          error: code,
          errorMessage: err instanceof Error ? err.message : String(err),
        } satisfies StartResponse;
      }
    }

    case 'LIGHT_ACTION': {
      try {
        const id = await startLight(msg.snapshot, msg.action as LightAction);
        return { analysisId: id } satisfies StartResponse;
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return {
          error: code,
          errorMessage: err instanceof Error ? err.message : String(err),
        } satisfies StartResponse;
      }
    }

    case 'ARTICLE_TRANSLATE': {
      const tabId = sender.tab?.id;
      const pushToTab = (id: number, m: unknown) => chrome.tabs.sendMessage(id, m);
      try {
        await setPendingArticle(msg.payload);
        await startArticleTranslate(msg.payload, pushToTab, tabId);
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        setArticleError(code);
      }
      await openPanel(sender.tab?.id);
      return { ok: true };
    }

    case 'ARTICLE_CANCEL':
      cancelArticle();
      return { ok: true };

    case 'FULLPAGE_TRANSLATE': {
      // SW → CS 推送函数（逐批结果回到注入页面）
      const tabId = sender.tab?.id;
      const pushToTab = (id: number, msg: unknown) => chrome.tabs.sendMessage(id, msg);
      try {
        await startFullPageTranslate(msg.payload, pushToTab, tabId);
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        if (typeof tabId === 'number') {
          await pushToTab(tabId, {
            type: 'FULLPAGE_ERROR',
            errorCode: code,
            errorMessage: err instanceof Error ? err.message : undefined,
          }).catch(() => undefined);
        }
      }
      return { ok: true };
    }

    case 'PAGE_TRANSLATE': {
      const tabId = sender.tab?.id;
      const pushToTab = (id: number, m: unknown) => chrome.tabs.sendMessage(id, m);
      try {
        await startFullPageTranslate(msg.payload, pushToTab, tabId);
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        if (typeof tabId === 'number') {
          await pushToTab(tabId, {
            type: 'FULLPAGE_ERROR',
            errorCode: code,
            errorMessage: err instanceof Error ? err.message : undefined,
          }).catch(() => undefined);
        }
      }
      return { ok: true };
    }

    case 'FULLPAGE_CANCEL':
      cancelFullPageTranslate();
      return { ok: true };

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
      // restricted 按"当前活动 tab 是否 http/https"实时判定，不再依赖 session 标志
      //（旧实现：一次在受限页点过图标后标志残留，正常网页开侧栏也误报"浏览器内部页面"）
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const restricted = !activeTab?.url || !/^https?:/i.test(activeTab.url);
      const res: GetStateResponse = {
        pending: await getPending(),
        article: getArticleState(),
        restricted,
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
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
        return { error: code, errorMessage: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'PRACTICE_GRADE': {
      try {
        return await practiceGrade(msg.session);
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
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
    .catch((err) =>
      sendResponse({
        ok: false,
        error: 'handler_error',
        errorMessage: err instanceof Error ? err.message : String(err),
      }),
    );
  return true; // 异步响应
});

// ---------- 自动更新 ----------
// ① 磁盘热重载：每分钟比对磁盘上的 manifest 版本与运行中版本——
//    只要 dist 文件夹被更新（构建/脚本覆盖），扩展在 60 秒内自动重载，
//    用户不再需要"删除再安装"（reload 保留全部本地数据；已打开页面刷新后生效）
// ② 远程检查：每 6 小时拉一次服务器版本清单，有新版则标记，弹窗里提示一键下载

const UPDATE_FLAG_KEY = 'll_update_available';
const REMOTE_CHECK_URL = 'https://toolsfox.top/downloads/lingualens-version.json';
const WATCH_DISK_ALARM = 'll-watch-disk';
const CHECK_REMOTE_ALARM = 'll-check-remote';

async function watchDiskVersion(): Promise<void> {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'));
    const disk = (await res.json()) as { version?: string };
    const diskV = disk.version ?? '';
    const runV = chrome.runtime.getManifest().version;
    // 只在磁盘版本"更新"时重载（防手改降级造成反复重载）
    if (diskV && isNewer(diskV, runV)) {
      // SW 日志是自动重载触发链的唯一观测点（verify-selfupdate 依赖），豁免 no-console
      // eslint-disable-next-line no-console
      console.info(`[LL] 磁盘版本 ${diskV} > 运行中 ${runV}，自动重载扩展`);
      chrome.runtime.reload();
    }
  } catch {
    // 磁盘读取失败（构建中的瞬间态）等下个周期再比
  }
}

async function checkRemoteVersion(): Promise<void> {
  try {
    const res = await fetch(REMOTE_CHECK_URL, { cache: 'no-store' });
    const info = (await res.json()) as { version?: string; url?: string };
    if (!info.version) return;
    if (isNewer(info.version, chrome.runtime.getManifest().version)) {
      await chrome.storage.local.set({
        [UPDATE_FLAG_KEY]: { version: info.version, url: info.url ?? '', checkedAt: Date.now() },
      });
    }
  } catch {
    // 服务器不可达 / 无网络：静默，下个周期再查
  }
}

chrome.alarms.create(WATCH_DISK_ALARM, { periodInMinutes: 1 });
chrome.alarms.create(CHECK_REMOTE_ALARM, { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === WATCH_DISK_ALARM) void watchDiskVersion();
  if (a.name === CHECK_REMOTE_ALARM) void checkRemoteVersion();
});
void checkRemoteVersion(); // SW 启动即查一次

// ---------- 生命周期 ----------

chrome.runtime.onInstalled.addListener(() => {
  void initService();
});

chrome.runtime.onStartup.addListener(() => {
  void initService();
});

void initService();
