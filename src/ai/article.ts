// ============================================================
// ai/article.ts —— 整文翻译的纯函数层（批处理切分，可单测）
// ============================================================

import { ARTICLE_BATCH_CHARS } from '../shared/constants';
import type { ArticlePayload } from '../shared/messages';

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
