import { describe, expect, it } from 'vitest';
import { PROVIDER_PRESETS, getPreset, matchPresetByBaseUrl } from '../../src/shared/providers';
import { ARTICLE_BATCH_CHARS, LONG_TEXT_THRESHOLD, MAX_SELECTION_LENGTH } from '../../src/shared/constants';

describe('厂商预设完整性', () => {
  it('预设表结构合法（baseUrl 可解析、id 唯一）', () => {
    const ids = new Set<string>();
    for (const p of PROVIDER_PRESETS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      if (p.id !== 'custom') {
        expect(() => new URL(p.baseUrl)).not.toThrow();
        expect(['http:', 'https:']).toContain(new URL(p.baseUrl).protocol);
      }
      expect(p.name.length).toBeGreaterThan(0);
    }
    expect(ids.size).toBeGreaterThanOrEqual(8);
    expect(getPreset('deepseek')?.baseUrl).toContain('deepseek');
  });

  it('baseUrl 反推厂商', () => {
    expect(matchPresetByBaseUrl('https://api.deepseek.com')).toBe('deepseek');
    expect(matchPresetByBaseUrl('https://api.siliconflow.cn/v1')).toBe('siliconflow');
    expect(matchPresetByBaseUrl('https://my-own.example.com/v1')).toBe('custom');
    expect(matchPresetByBaseUrl('')).toBe('deepseek'); // 默认建议
  });
});

describe('长文相关常量关系', () => {
  it('阈值关系成立：长文阈值 < 选区上限；批大小远小于选区上限', () => {
    expect(LONG_TEXT_THRESHOLD).toBeLessThan(MAX_SELECTION_LENGTH);
    expect(ARTICLE_BATCH_CHARS).toBeLessThan(MAX_SELECTION_LENGTH);
    expect(MAX_SELECTION_LENGTH).toBeGreaterThanOrEqual(8000); // 修复长选区问题的下限
  });
});
