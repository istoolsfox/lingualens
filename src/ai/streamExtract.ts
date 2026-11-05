// ============================================================
// ai/streamExtract.ts —— 流式增量提取概览字段
// 在 JSON 还没传完时，先把已完成的 overview 字段渐进渲染出来
// 只提取已知键：detected_type / summary / translation.literal / translation.natural
// ============================================================

export interface OverviewPartial {
  detectedType?: string;
  summary?: string;
  literal?: string;
  natural?: string;
}

/** 顶层或一层嵌套内的字符串字段键（与 schema 对应） */
const TARGET_KEYS = ['detected_type', 'summary', 'literal', 'natural'] as const;

/** 从未完成的 JSON 文本中提取已完成（或进行中）的目标字符串字段 */
export function extractOverviewPartial(partial: string): OverviewPartial {
  const out: OverviewPartial = {};

  for (const key of TARGET_KEYS) {
    const value = readFieldValue(partial, key);
    if (value !== undefined) {
      if (key === 'detected_type') out.detectedType = value;
      else if (key === 'summary') out.summary = value;
      else if (key === 'literal') out.literal = value;
      else if (key === 'natural') out.natural = value;
    }
  }
  return out;
}

/**
 * 找到形如 `"key" : "` 的字段起点，读取字符串值。
 * 若字符串尚未闭合（流式进行中），返回已到达的部分文本。
 * 引号在 JSON 字符串值内部必然转义（\"），因此带引号的键名匹配在实践中是安全的。
 */
function readFieldValue(text: string, key: string): string | undefined {
  const keyIdx = text.indexOf(`"${key}"`);
  if (keyIdx < 0) return undefined;

  // 从键名后找到冒号与起始引号
  let i = keyIdx + key.length + 2;
  while (i < text.length && /\s/.test(text[i] ?? '')) i++;
  if (text[i] !== ':') return undefined;
  i++;
  while (i < text.length && /\s/.test(text[i] ?? '')) i++;
  if (text[i] !== '"') return undefined;
  i++; // 进入字符串内部

  let out = '';
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) return unescapeProgress(out); // 流截断在转义符上
      out += unescapePair(next);
      i += 2;
      continue;
    }
    if (ch === '"') return out; // 闭合，完整值
    out += ch;
    i++;
  }
  return unescapeProgress(out); // 流式进行中：返回已到部分
}

function unescapePair(b: string): string {
  switch (b) {
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case 'r':
      return '\r';
    case '"':
      return '"';
    case '\\':
      return '\\';
    case '/':
      return '/';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'u': {
      // \uXXXX 需要后续 4 位；流式截断时按字面返回
      return `\\${b}`;
    }
    default:
      return b;
  }
}

function unescapeProgress(s: string): string {
  // 进行中的值不做 \u 还原，直接展示已解码部分
  return s;
}
