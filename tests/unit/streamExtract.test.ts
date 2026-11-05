import { describe, expect, it } from 'vitest';
import { extractOverviewPartial } from '../../src/ai/streamExtract';

describe('extractOverviewPartial 流式增量提取', () => {
  it('完整字段全部提取', () => {
    const json = '{"detected_type":"sentence","summary":"最终理解","translation":{"literal":"直译","natural":"意译"},"chunks":[]}';
    const p = extractOverviewPartial(json);
    expect(p).toEqual({ detectedType: 'sentence', summary: '最终理解', literal: '直译', natural: '意译' });
  });

  it('流式进行中：未闭合字符串返回已到部分', () => {
    const json = '{"detected_type":"sentence","summary":"作者想说","translation":{"literal":"部分直';
    const p = extractOverviewPartial(json);
    expect(p.detectedType).toBe('sentence');
    expect(p.summary).toBe('作者想说');
    expect(p.literal).toBe('部分直');
    expect(p.natural).toBeUndefined();
  });

  it('转义引号不中断读取', () => {
    const json = '{"summary":"他说\\"你好\\"然后离开","translation":{"literal":"a","natural":"b"}}';
    const p = extractOverviewPartial(json);
    expect(p.summary).toBe('他说"你好"然后离开');
  });

  it('转义换行解码', () => {
    const p = extractOverviewPartial('{"summary":"第一行\\n第二行"}');
    expect(p.summary).toBe('第一行\n第二行');
  });

  it('空输入不崩溃', () => {
    expect(extractOverviewPartial('')).toEqual({});
    expect(extractOverviewPartial('{"detected')).toEqual({});
  });

  it('值中含键名字样不误匹配后段', () => {
    // "summary" 的值里包含 "literal" 字样，但值未闭合前不应把其内容当作 natural 的键
    const json = '{"summary":"提到 literal 这个词","translation":{"literal":"L","natural":"N"}}';
    const p = extractOverviewPartial(json);
    expect(p.literal).toBe('L');
    expect(p.natural).toBe('N');
    expect(p.summary).toBe('提到 literal 这个词');
  });
});
