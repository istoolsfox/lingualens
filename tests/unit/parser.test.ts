import { describe, expect, it } from 'vitest';
import { extractJsonObject, parseAnalysis, parseLight } from '../../src/ai/parser';

describe('extractJsonObject 四级降级', () => {
  it('L1 严格 JSON 直接过', () => {
    const raw = '{"detected_type":"sentence","summary":"ok"}';
    expect(extractJsonObject(raw)).toEqual({ detected_type: 'sentence', summary: 'ok' });
  });

  it('markdown 代码围栏包裹', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJsonObject(raw)).toEqual({ a: 1 });
  });

  it('前导解释文字 + 尾随逗号（L2 宽松）', () => {
    const raw = '好的，以下是分析结果：\n{"a": [1,2,], "b": "x",}';
    expect(extractJsonObject(raw)).toEqual({ a: [1, 2], b: 'x' });
  });

  it('字符串值内含大括号不误导截取', () => {
    const raw = '{"s":"包含 } 花括号","t":1}';
    const obj = extractJsonObject(raw) as { s: string; t: number };
    expect(obj.s).toBe('包含 } 花括号');
    expect(obj.t).toBe(1);
  });

  it('完全无 JSON 返回 undefined', () => {
    expect(extractJsonObject('抱歉，我无法完成')).toBeUndefined();
  });
});

describe('parseAnalysis 归一化', () => {
  const good = JSON.stringify({
    detected_type: 'sentence',
    original_text: 'A computer on steroids.',
    summary: '强化版电脑',
    translation: { literal: '一台在类固醇上的电脑', natural: '超级强化版的电脑', intent: '夸张修辞' },
    grammar_points: [{ title: 'on steroids 习语', explanation: '表示增强版' }],
    vocabulary: [{ word: 'steroids', pos: 'n.', context_meaning: '类固醇（习语）' }],
  });

  it('完整结果解析', () => {
    const r = parseAnalysis(good, 'A computer on steroids.');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.detected_type).toBe('sentence');
      expect(r.data.translation.natural).toBe('超级强化版的电脑');
      expect(r.data.grammar_points?.[0]?.title).toBe('on steroids 习语');
    }
  });

  it('缺字段容错（无 chunks/structure 不炸）', () => {
    const r = parseAnalysis(
      '{"detected_type":"word","summary":"x","word_info":{"word":"likely","pos":"adv.","core_meanings":["可能"],"context_meaning":"很可能"}}',
      'likely',
    );
    expect(r.ok).toBe(true);
  });

  it('非法 detected_type 回落到启发式', () => {
    const r = parseAnalysis(
      '{"detected_type":"alien","summary":"x","translation":{"literal":"a","natural":"b"}}',
      'Do it.',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.detected_type).toBe('sentence');
  });

  it('纯文本兜底判定失败（触发上层 L3/L4）', () => {
    expect(parseAnalysis('抱歉我无法输出 JSON', 'test').ok).toBe(false);
    expect(parseAnalysis('{"summary":""}', 'test').ok).toBe(false);
  });
});

describe('parseLight', () => {
  it('translate 模式必须有译文', () => {
    const ok = parseLight('{"translation":{"literal":"a","natural":"b"},"summary":"s"}', 'translate', 'x');
    expect(ok.ok).toBe(true);
    const bad = parseLight('{"summary":"没有译文"}', 'translate', 'x');
    expect(bad.ok).toBe(false);
  });

  it('explain 模式必须有 summary', () => {
    const ok = parseLight(
      '{"summary":"解释内容","expression":[{"title":"t","en_side":"e","cn_side":"c"}]}',
      'explain',
      'x',
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.expression?.[0]?.title).toBe('t');
    const bad = parseLight('{"expression":[]}', 'explain', 'x');
    expect(bad.ok).toBe(false);
  });
});
