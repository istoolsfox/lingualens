// ============================================================
// ai/article.ts —— 整文翻译的纯函数层（批处理切分/译文复用，可单测）
// ============================================================

import { ARTICLE_BATCH_CHARS } from '../shared/constants';
import type { ArticlePayload } from '../shared/messages';
import { textKey } from './hash';

export interface ArticleBatch {
  index: number;
  total: number;
  blocks: { id: number; text: string }[];
}

/**
 * 把正文段落切成请求批次。
 * 规则：按顺序累积，单批不超 ARTICLE_BATCH_CHARS；单个超长段落独立成批
 * （不把一个语义段劈成两半，交给模型处理长段）。
 */
export function splitBlocksIntoBatches(
  blocks: ArticlePayload['blocks'],
  maxChars: number = ARTICLE_BATCH_CHARS,
): ArticleBatch[] {
  const clean = blocks.filter((b) => typeof b.text === 'string' && b.text.trim().length > 0);
  const batches: ArticleBatch[] = [];
  let cur: { id: number; text: string }[] = [];
  let curChars = 0;

  const flush = () => {
    if (cur.length > 0) {
      batches.push({ index: batches.length, total: 0, blocks: cur });
      cur = [];
      curChars = 0;
    }
  };

  for (const b of clean) {
    const len = b.text.length;
    if (curChars > 0 && curChars + len > maxChars) {
      flush();
    }
    cur.push(b);
    curChars += len;
  }
  flush();

  return batches.map((b, i) => ({ ...b, index: i, total: batches.length }));
}

/**
 * 段落级译文复用：先查记忆（memo），命中的直接回填，未命中的再切批翻译。
 * 这是"优先找我们翻译过的，不重复浪费 token"的核心纯函数。
 */
export function planWithMemo(
  blocks: { id: number; text: string }[],
  memo: Map<string, string>,
): { reused: { id: number; natural: string }[]; pending: { id: number; text: string }[] } {
  const reused: { id: number; natural: string }[] = [];
  const pending: { id: number; text: string }[] = [];
  for (const b of blocks) {
    const hit = memo.get(textKey(b.text));
    if (hit) reused.push({ id: b.id, natural: hit });
    else pending.push(b);
  }
  return { reused, pending };
}

