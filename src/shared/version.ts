// ============================================================
// shared/version.ts —— 语义版本比较（自动更新判断用）
// 只支持 x.y.z 数字段；段数不齐按 0 补齐；任何非数字段视为不可比（返回 0）
// ============================================================

function parse(v: string): number[] | null {
  const parts = v.trim().split('.');
  const nums: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0) return null;
    nums.push(n);
  }
  return nums;
}

/** a<b → -1，a=b → 0，a>b → 1；无法解析（含预发布标签）视为相等 0 */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** remote 是否比 current 更新 */
export function isNewer(remote: string, current: string): boolean {
  return compareVersions(remote, current) > 0;
}
