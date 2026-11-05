// ============================================================
// ai/errors.ts —— AI 请求错误分类
// ============================================================

import { ERROR_MESSAGES } from '../shared/constants';

export class AiError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown);
    this.name = 'AiError';
    this.code = code;
  }
}

/** HTTP 状态 → 错误码 */
export function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 400 || status === 404 || status === 422) return 'bad_request';
  if (status >= 500) return 'server';
  return 'server';
}

/** 可自动重试的错误码 */
export function isRetryable(code: string): boolean {
  return code === 'network' || code === 'timeout' || code === 'rate_limit' || code === 'server';
}

/** 从服务端错误响应体里提取可读信息 */
export function extractServerMessage(bodyText: string): string | undefined {
  try {
    const obj = JSON.parse(bodyText) as { error?: { message?: string }; message?: string };
    return obj?.error?.message ?? obj?.message ?? undefined;
  } catch {
    return bodyText.slice(0, 200) || undefined;
  }
}
