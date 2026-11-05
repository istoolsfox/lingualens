// ============================================================
// ai/router.ts —— 模式路由（本地启发式预判，LLM 最终校准）
// 预判只作 hint 注入 prompt；用户手动指定的模式优先级最高
// ============================================================

import type { Mode } from '../shared/types';

const WORD_LIMIT_SENTENCE = 12;
const WORD_LIMIT_PARAGRAPH = 60;

/** 启发式预判：单词 / 短语 / 句子 / 段落 */
export function guessMode(text: string): Mode {
  const t = text.trim();
  if (!t) return 'phrase';
  const words = t.split(/\s+/).filter(Boolean);
  const wc = words.length;

  if (wc === 1) return 'word';

  // 多句（句末标点后跟空白出现 ≥2 次）或含换行的多句 → 段落
  const sentenceEnds = t.match(/[.!?]["')\]]*(\s|$)/g)?.length ?? 0;
  if (sentenceEnds >= 2 || (t.includes('\n') && sentenceEnds >= 1)) return 'paragraph';
  if (wc > WORD_LIMIT_PARAGRAPH) return 'paragraph';

  const endsSentence = /[.!?]["')\]]*$/.test(t);
  if (endsSentence) return 'sentence';

  // 无句末标点：短片段按短语，长片段按句子（可能是无标点引用片段）
  if (wc <= WORD_LIMIT_SENTENCE) return 'phrase';
  return 'sentence';
}

/** 模式路由结果（供 prompt 注入 hint） */
export function routeHint(guess: Mode, manual?: Mode): string {
  if (manual) {
    return `用户已明确指定分析模式：${manual}。detected_type 必须返回 "${manual}"。`;
  }
  return `本地预判选中内容可能是 "${guess}"，请你结合内容校准 detected_type（允许纠正预判）。`;
}
