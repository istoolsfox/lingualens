import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../../src/shared/settings';

describe('mergeSettings 设置合并', () => {
  it('空数据回落默认值', () => {
    const s = mergeSettings(undefined);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.api.temperature).toBe(0.3);
    expect(s.ui.contextLength).toBe(300);
  });

  it('部分字段更新保留其余默认', () => {
    const s = mergeSettings({ api: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' } });
    expect(s.api.model).toBe('deepseek-chat');
    expect(s.api.temperature).toBe(0.3);
    expect(s.user.level).toBe('intermediate');
  });

  it('旧版本缺字段不炸', () => {
    const s = mergeSettings({ ui: {} });
    expect(s.ui.floatingBar).toBe('all');
  });
});
