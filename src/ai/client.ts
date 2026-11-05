// ============================================================
// ai/client.ts —— OpenAI 兼容客户端（SSE 流式 / 超时 / 中止）
// 只负责一次 HTTP 调用；重试策略由上层（aiService）编排
// ============================================================

import { AiError, classifyStatus, extractServerMessage } from './errors';

export interface EndpointConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessageInput[];
  stream: boolean;
  /** 开启时附带 response_format: {type:'json_object'}（兼容端点普遍支持） */
  jsonObject?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** 流式回调：delta 为增量，acc 为累计全文 */
  onDelta?: (delta: string, acc: string) => void;
  /** 块间无数据的最长等待（毫秒），默认 45s */
  stallMs?: number;
}

const CHAT_PATH = '/chat/completions';

function endpointUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new AiError('not_configured');
  return trimmed.endsWith(CHAT_PATH) ? trimmed : trimmed + CHAT_PATH;
}

/** 合并外部 signal 与本请求的超时/卡顿控制 */
class AbortHub {
  readonly controller = new AbortController();
  private wholeTimer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private userAborted = false;

  constructor(timeoutMs: number, external?: AbortSignal) {
    if (external) {
      if (external.aborted) this.userAborted = true;
      else external.addEventListener('abort', () => { this.userAborted = true; this.controller.abort(); }, { once: true });
    }
    this.wholeTimer = setTimeout(() => this.controller.abort(), timeoutMs);
    // stall 计时只服务流式读取（每收到一块重置）；非流式请求仅受总超时约束
  }

  armStall(stallMs: number): void {
    clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => this.controller.abort(), stallMs);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get abortedByUser(): boolean {
    return this.userAborted;
  }

  dispose(): void {
    clearTimeout(this.wholeTimer);
    clearTimeout(this.stallTimer);
  }
}

/** 抛出正确的错误码 */
function normalizeThrow(err: unknown, hub: AbortHub): never {
  if (err instanceof AiError) throw err;
  if (err instanceof DOMException && err.name === 'AbortError') {
    throw new AiError(hub.abortedByUser ? 'aborted' : 'timeout');
  }
  throw new AiError('network', err instanceof Error ? err.message : undefined);
}

/** 单次对话补全（流式或非流式），返回完整文本 */
export async function chatCompletion(cfg: EndpointConfig, opts: ChatOptions): Promise<string> {
  if (!cfg.apiKey) throw new AiError('not_configured');
  const stallMs = opts.stallMs ?? 45000;
  const hub = new AbortHub(Math.max(cfg.timeoutMs, 5000), opts.signal);

  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: opts.messages,
      temperature: opts.temperature ?? cfg.temperature,
      max_tokens: opts.maxTokens ?? cfg.maxTokens,
      stream: opts.stream,
    };
    if (opts.jsonObject) body.response_format = { type: 'json_object' };

    const res = await fetch(endpointUrl(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: hub.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AiError(classifyStatus(res.status), extractServerMessage(text));
    }

    if (!opts.stream) {
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      if (!content) throw new AiError('empty');
      return content;
    }

    if (!res.body) throw new AiError('network', '响应无内容流');

    return await readSse(res.body, opts.onDelta, hub, stallMs);
  } catch (err) {
    normalizeThrow(err, hub);
  } finally {
    hub.dispose();
  }
}

/** 逐行解析 SSE data 帧 */
async function readSse(
  stream: ReadableStream<Uint8Array>,
  onDelta: ((delta: string, acc: string) => void) | undefined,
  hub: AbortHub,
  stallMs: number,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  let buf = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hub.armStall(stallMs);
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return acc;
        try {
          const obj = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; message?: { content?: string } }[];
          };
          const delta =
            obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.message?.content ?? '';
          if (delta) {
            acc += delta;
            onDelta?.(delta, acc);
          }
        } catch {
          // 单帧解析失败容忍：跳过残缺帧
        }
      }
    }
    return acc;
  } finally {
    reader.releaseLock();
  }
}

/** 带一次重试的调用（网络/超时/限流/5xx 自动退避重试；用户中止与鉴权错误不重试） */
export async function chatCompletionWithRetry(
  cfg: EndpointConfig,
  opts: ChatOptions,
): Promise<string> {
  try {
    return await chatCompletion(cfg, opts);
  } catch (err) {
    if (err instanceof AiError && isRetryableCode(err.code)) {
      await sleep(2000);
      return chatCompletion(cfg, opts);
    }
    throw err;
  }
}

function isRetryableCode(code: string): boolean {
  return code === 'network' || code === 'timeout' || code === 'rate_limit' || code === 'server';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
