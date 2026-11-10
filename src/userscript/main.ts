// ============================================================
// userscript/main.ts —— LinguaLens Lite 油猴版入口（装配）
// 与扩展共用同一份源码：content/fullpage（注入/讲解卡/pill/快捷键）、
// ai/*（prompt/分批/解析/缓存）、shared/*。差异只在传输层与容器。
// ============================================================

import { setHttpTransport } from '../ai/client';
import { initFullPage, startPageTranslate, handleFullPageMessage } from '../content/fullpage';
import type { Snapshot } from '../shared/messages';
import {
  installChromeShim,
  registerContentHandler,
  registerPageTranslate,
  registerCancel,
  registerToolbarAction,
} from './chromeShim';
import { handlePageTranslate, cancelEngine } from './translateEngine';
import { initReader, openDrawer, openDeepRead } from './reader';
import { openSettings } from './settingsPanel';
import { gmFetch, registerMenu } from './gm';

// 1) chrome 兼容层必须先装（fullpage 的 storage/runtime 调用全部经由它）
installChromeShim();
// 2) AI 传输换成 GM_xmlhttpRequest（跨域直连，无 CORS 限制）
setHttpTransport((url, init, timeoutMs) => gmFetch(url, init, timeoutMs));
// 3) 总线装配：content 侧处理器收引擎产物；引擎收 content 发起的请求
registerContentHandler(handleFullPageMessage);
registerPageTranslate(handlePageTranslate);
registerCancel(cancelEngine);
// 讲解卡「深度精读」→ 精读抽屉（扩展里是 TOOLBAR_ACTION→侧边栏，油猴里就地打开抽屉）
registerToolbarAction((snapshot, action) => {
  if (action === 'analyze') openDeepRead(snapshot as Snapshot);
});
// 4) 启动各模块（顺序：注入模块先于划词栏，保证快捷键/热键缓存就绪）
initFullPage();
initReader();

// 5) 脚本管理器菜单
registerMenu('⚙ LinguaLens 设置', openSettings);
registerMenu('📖 打开精读面板', openDrawer);
registerMenu('🌐 全文翻译本页', () => {
  void startPageTranslate('full');
});

export {};
