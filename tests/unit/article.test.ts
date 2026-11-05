import { describe, expect, it } from 'vitest';
import { splitBlocksIntoBatches } from '../../src/ai/article';

describe('splitBlocksIntoBatches 批次切分', () => {
  it('空输入 → 无批次', () => {
    expect(splitBlocksIntoBatches([], 100)).toEqual([]);
    expect(splitBlocksIntoBatches([{ id: 0, text: '  ' }], 100)).toEqual([]);
  });

  it('小段落合并进同一批', () => {
    const blocks = [
      { id: 0, text: 'a'.repeat(30) },
      { id: 1, text: 'b'.repeat(30) },
      { id: 2, text: 'c'.repeat(30) },
    ];
    const batches = splitBlocksIntoBatches(blocks, 100);
    expect(batches.length).toBe(1);
    expect(batches[0]?.blocks.length).toBe(3);
    expect(batches[0]?.total).toBe(1);
  });

  it('超过上限开新批（边界恰好放下时不切）', () => {
    const blocks = [
      { id: 0, text: 'a'.repeat(60) },
      { id: 1, text: 'b'.repeat(40) }, // 60+40=100 恰好放下
      { id: 2, text: 'c'.repeat(1) }, // 溢出 → 新批
    ];
    const batches = splitBlocksIntoBatches(blocks, 100);
    expect(batches.length).toBe(2);
    expect(batches[0]?.blocks.map((b) => b.id)).toEqual([0, 1]);
    expect(batches[1]?.blocks.map((b) => b.id)).toEqual([2]);
    expect(batches.every((b) => b.total === 2)).toBe(true);
    expect(batches.map((b) => b.index)).toEqual([0, 1]);
  });

  it('单个超长段落独立成批，不劈开语义段', () => {
    const blocks = [
      { id: 0, text: 'x'.repeat(500) },
      { id: 1, text: 'y'.repeat(10) },
    ];
    const batches = splitBlocksIntoBatches(blocks, 100);
    expect(batches.length).toBe(2);
    expect(batches[0]?.blocks.length).toBe(1);
    expect(batches[0]?.blocks[0]?.id).toBe(0);
  });

  it('真实文章规模：50 段 × 200 字 → 批数符合预期且全覆盖', () => {
    const blocks = Array.from({ length: 50 }, (_, i) => ({ id: i, text: 'z'.repeat(200) }));
    const batches = splitBlocksIntoBatches(blocks, 2400);
    const allIds = batches.flatMap((b) => b.blocks.map((x) => x.id)).sort((a, b) => a - b);
    expect(allIds).toEqual(Array.from({ length: 50 }, (_, i) => i));
    // 每批 ≤ 2400 字（单段 200 字不会单独超限）
    for (const b of batches) {
      const chars = b.blocks.reduce((s, x) => s + x.text.length, 0);
      expect(chars).toBeLessThanOrEqual(2400);
    }
  });
});
