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
}

export type Msg =
  | { type: 'SELECTION_SNAPSHOT'; snapshot: Snapshot }
  | { type: 'OPEN_PANEL' }
  | { type: 'ANALYZE'; snapshot: Snapshot; mode?: Mode; depth?: Depth }
  | { type: 'LIGHT_ACTION'; snapshot: Snapshot; action: LightAction }
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

export type PortSwMsg = AnalysisChunkMsg | AnalysisDoneMsg | SessionStateMsg | PendingMsg;

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
