// ============================================================
// shared/messages.ts —— 三端消息协议（唯一真相源）
// CS = content script, SW = service worker, SP = side panel
// ============================================================

import type { AnalysisResult, ChatMessage, Depth, Entry, LightAction, LightResult, Mode, PracticeSession } from './types';

/** 会话视图（SW → Panel 的会话序列化格式） */
export interface SessionView {
  id: string;
  kind: 'analysis' | 'light';
  action?: LightAction;
  status: 'running' | 'done' | 'error';
  snapshot: Snapshot;
  text: string;
  sourceTitle: string;
  buffer: string;
  result?: AnalysisResult | LightResult;
  degraded?: boolean;
  raw?: string;
  errorCode?: string;
  errorMessage?: string;
  chat: ChatMessage[];
  guess: Mode;
}

/** 选区快照（进入分析管线前的全部事实） */
export interface Snapshot {
  text: string;
  /** 选区前后上下文（有限字符） */
  contextBefore: string;
  contextAfter: string;
  url: string;
  title: string;
  /** 浮动栏定位用（仅浮动栏路径携带） */
  rect?: { x: number; y: number; width: number; height: number };
  /** 快照来源 */
  source: 'floating-bar' | 'icon-activate' | 'manual-input' | 'library';
  /** 原文超长被截断 */
  truncated?: boolean;
}

/** 整文翻译的正文提取结果（Readability） */
export interface ArticlePayload {
  title: string;
  byline?: string;
  siteName?: string;
  url: string;
  blocks: { id: number; text: string }[];
  /** 超长被截断 */
  truncated?: boolean;
}

/** SW → CS：请求提取正文（快捷键触发） */
export interface ArticleExtractRequest {
  type: 'DO_EXTRACT_ARTICLE';
}

/** 全文注入翻译的文本单元（来自 content script 收集） */
export interface FullPagePayload {
  url: string;
  title: string;
  units: { id: number; text: string }[];
  truncated?: boolean;
}

/** 讲解点：值得解释的表达（注入虚线下划线，点击弹卡） */
export interface FullPageHighlight {
  id: number;
  /** 原文片段（必须是单元文本的子串） */
  expr: string;
  /** 专门解释：什么意思 + 为什么这样写 */
  why: string;
}

/** SW → CS：全文翻译逐批结果 */
export interface FullPageBatchMsg {
  type: 'FULLPAGE_BATCH';
  index: number;
  total: number;
  items: { id: number; natural: string }[];
  highlights: FullPageHighlight[];
}

export interface FullPageDoneMsg {
  type: 'FULLPAGE_DONE';
  translated: number;
  highlights: number;
  reused: number;
}

export interface FullPageErrorMsg {
  type: 'FULLPAGE_ERROR';
  errorCode: string;
  errorMessage?: string;
}

export interface FullPageBatchItem {
  natural: string;
}

export interface FullPageHighlightItem {
  expr: string;
  why: string;
}

export type Msg =
  | { type: 'SELECTION_SNAPSHOT'; snapshot: Snapshot }
  | { type: 'OPEN_PANEL' }
  | { type: 'ANALYZE'; snapshot: Snapshot; mode?: Mode; depth?: Depth }
  | { type: 'LIGHT_ACTION'; snapshot: Snapshot; action: LightAction }
  | { type: 'ARTICLE_TRANSLATE'; payload: ArticlePayload }
  | { type: 'ARTICLE_CANCEL' }
  | { type: 'FULLPAGE_TRANSLATE'; payload: FullPagePayload }
  | { type: 'FULLPAGE_CANCEL' }
  | { type: 'ANALYZE_CANCEL'; analysisId: string }
  | { type: 'FOLLOWUP'; analysisId: string; question: string; ctx?: { snapshot: Snapshot; analysis: AnalysisResult | LightResult } }
  | { type: 'FOLLOWUP_CANCEL'; analysisId: string }
  | { type: 'SESSION_GET'; analysisId: string }
  | { type: 'TOOLBAR_ACTION'; snapshot: Snapshot; action: 'analyze' | 'translate' | 'explain' | 'favorite' }
  | { type: 'ICON_ACTIVATE_RESULT'; snapshot: Snapshot | null; restricted: boolean }
  | { type: 'FAVORITE_ADD'; entry: Entry }
  | { type: 'SETTINGS_UPDATED' }
  | { type: 'PRACTICE_GENERATE'; entryIds: string[]; types: string[]; count: number }
  | { type: 'PRACTICE_GRADE'; session: PracticeSession }
  | { type: 'GET_STATE' }
  | { type: 'CLEAR_PENDING' };

/** GET_STATE 响应 */
export interface GetStateResponse {
  pending?: { snapshot: Snapshot; action: 'analyze' | 'translate' | 'explain' };
  articlePending?: ArticlePayload;
  article?: ArticleStateView;
  restricted: boolean;
  sessions: unknown[];
}

/** ANALYZE / LIGHT_ACTION 响应 */
export interface StartResponse {
  analysisId?: string;
  error?: string;
  errorMessage?: string;
}

export interface AnalysisChunkMsg {
  type: 'chunk';
  channel: string;
  delta: string;
}

export interface AnalysisDoneMsg {
  type: 'done';
  channel: string;
  ok: boolean;
  /** ok=false 时的错误分类码 */
  errorCode?: string;
  errorMessage?: string;
  /** 解析降级为纯文本时 */
  degraded?: boolean;
  raw?: string;
  /** practice 等场景的随附数据 */
  payload?: unknown;
}

export interface SessionStateMsg {
  type: 'session';
  analysisId: string;
  /** 空闲/分析中/完成/失败 */
  status: 'idle' | 'running' | 'done' | 'error';
  bufferedText: string;
  result?: unknown;
  lightResult?: unknown;
  chat?: { role: 'user' | 'assistant'; content: string }[];
}

/** SW → Panel：有待处理的新快照（浮动栏/图标入口触发） */
export interface PendingMsg {
  type: 'pending';
  snapshot: Snapshot;
  action: 'analyze' | 'translate' | 'explain';
}

/** SW → Panel：快捷键触发整文翻译 */
export interface PendingArticleMsg {
  type: 'pending-article';
  payload: ArticlePayload;
}

/** SW → Panel：整文翻译逐批进度 */
export interface ArticleBatchMsg {
  type: 'article_batch';
  index: number;
  total: number;
  items: { id: number; natural: string }[];
}

export interface ArticleStateView {
  payload: ArticlePayload | null;
  running: boolean;
  totalBatches: number;
  doneBatches: number;
  results: Record<number, string>;
  errorCode?: string;
  truncated?: boolean;
}

export type PortSwMsg =
  | AnalysisChunkMsg
  | AnalysisDoneMsg
  | SessionStateMsg
  | PendingMsg
  | PendingArticleMsg
  | ArticleBatchMsg;

export type PortPanelMsg = { type: 'hello' } | { type: 'resync'; analysisId: string };

/** Port 通道名 */
export const PORT_NAME = 'lingualens-port';

export const channels = {
  analysis: (id: string) => `analysis:${id}`,
  chat: (id: string) => `chat:${id}`,
  practice: 'practice',
};

export const isMsg = (v: unknown): v is Msg =>
  typeof v === 'object' && v !== null && 'type' in v;
