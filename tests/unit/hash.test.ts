import { describe, expect, it } from 'vitest';
import { fnv1a, textKey, pageFingerprint } from '../../src/ai/hash';
import { planWithMemo } from '../../src/ai/article';

describe('fnv1a 内容指纹', () => {
  it('已知向量稳定性（同输入同输出）', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
  });

  it('不同输入不同指纹；顺序敏感', () => {
    expect(fnv1a('hello world')).not.toBe(fnv1a('world hello'));
    expect(pageFingerprint(['a', 'b'])).not.toBe(pageFingerprint(['b', 'a']));
  });

  it('页面内容变化 → 指纹变化（变化检测依据）', () => {
    const before = pageFingerprint(['paragraph one text', 'paragraph two text']);
    const after = pageFingerprint(['paragraph one text', 'paragraph two CHANGED']);
    expect(before).not.toBe(after);
    expect(pageFingerprint(['paragraph one text', 'paragraph two text'])).toBe(before);
  });
});

describe('textKey 段落记忆键', () => {
  it('hash+长度双校验', () => {
    expect(textKey('abc')).toBe(`${fnv1a('abc')}-3`);
    expect(textKey('abc')).not.toBe(textKey('abd'));
  });
});

describe('planWithMemo 译文复用', () => {
  const blocks = [
    { id: 0, text: 'A computer on steroids.' },
    { id: 1, text: 'Brand new paragraph never seen.' },
    { id: 2, text: 'Glasses that adapt.' },
  ];
  const memo = new Map([[textKey('A computer on steroids.'), '超级强化版的电脑']]);

  it('命中的直接复用，未命中的进翻译队列', () => {
    const r = planWithMemo(blocks, memo);
    expect(r.reused).toEqual([{ id: 0, natural: '超级强化版的电脑' }]);
    expect(r.pending.map((b) => b.id)).toEqual([1, 2]);
  });

  it('全命中 → 无需翻译（零 token）', () => {
    const full = new Map(blocks.map((b) => [textKey(b.text), `译${b.id}`]));
    const r = planWithMemo(blocks, full);
    expect(r.reused.length).toBe(3);
    expect(r.pending.length).toBe(0);
  });
});
