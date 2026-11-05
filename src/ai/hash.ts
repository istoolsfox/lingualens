// ============================================================
// ai/hash.ts —— 轻量内容指纹（FNV-1a 32bit，纯函数可测）
// 用途：页面内容变化检测 + 译文记忆（memo）键
// ============================================================

/** FNV-1a 32bit → 8 位 hex */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 段落级译文记忆键：hash + 长度双校验，降低碰撞误复用 */
export function textKey(text: string): string {
  return `${fnv1a(text)}-${text.length}`;
}

/** 由段落文本序列合成整页指纹（顺序敏感） */
export function pageFingerprint(texts: string[]): string {
  return fnv1a(texts.map((t) => `${t.length}:${t}`).join('\u0001'));
}
