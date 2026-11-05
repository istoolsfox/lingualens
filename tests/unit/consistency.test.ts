import { describe, expect, it } from 'vitest';
import { buildRollingContext, mergeTerms } from '../../src/ai/article';

describe('buildRollingContext 滚动上下文预算', () => {
  const rows = [
    { src: 'sentence one long text here', nat: '第一句假译文' },
    { src: 'sentence two', nat: '第二句' },
    { src: 'sentence three', nat: '第三句' },
  ];

  it('预算内全装', () => {
    const out = buildRollingContext(rows, 10_000);
    expect(out).toContain('第一句假译文');
    expect(out).toContain('第三句');
    // 最新行在最后（时序正确）
    expect(out.indexOf('第三句')).toBeGreaterThan(out.indexOf('第一句假译文'));
  });

  it('预算超限只保留最近的行', () => {
    // 预算 30：只装得下最后一行（第三行整行 20 字符，再加任何一行都超预算）
    const out = buildRollingContext(rows, 30);
    expect(out).toContain('第三句');
    expect(out).not.toContain('第一句假译文');
    expect(out).not.toContain('第二句');
  });

  it('空行输入返回空串', () => {
    expect(buildRollingContext([], 100)).toBe('');
  });
});

describe('mergeTerms 术语合并', () => {
  it('去重（en 不区分大小写）+ 上限截断', () => {
    const acc = [{ en: 'adapter', zh: '适配器' }];
    mergeTerms(acc, [
      { en: 'Adapter', zh: '转接器' }, // 重复，跳过
      { en: 'steroids', zh: '强化剂' },
      { en: 'scammy', zh: '诈骗感' },
    ]);
    expect(acc.length).toBe(3);
    expect(acc[1]?.en).toBe('steroids');
  });

  it('非法项跳过', () => {
    const acc: { en: string; zh: string }[] = [];
    mergeTerms(acc, [
      { en: 'ok', zh: '好' },
      { en: 123, zh: '数字' },
      { en: '', zh: '空' },
    ]);
    expect(acc.length).toBe(1);
  });
});
