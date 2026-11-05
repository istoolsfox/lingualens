import { describe, expect, it } from 'vitest';
import { guessMode } from '../../src/ai/router';

describe('guessMode 模式路由启发式', () => {
  it('单词', () => {
    expect(guessMode('likely')).toBe('word');
    expect(guessMode('scammy')).toBe('word');
    expect(guessMode('e.g.')).toBe('word');
  });

  it('短语', () => {
    expect(guessMode('get through to someone')).toBe('phrase');
    expect(guessMode('on steroids')).toBe('phrase');
    expect(guessMode('a computer on steroids')).toBe('phrase');
    expect(guessMode('not how glasses work')).toBe('phrase');
  });

  it('句子', () => {
    expect(guessMode('A computer on steroids.')).toBe('sentence');
    expect(guessMode('Do it.')).toBe('sentence');
    expect(
      guessMode(
        'The problem is the scammers only need to get through to a very small percentage of people to make their money back.',
      ),
    ).toBe('sentence');
  });

  it('段落', () => {
    expect(guessMode('This is the first sentence. This is the second one! And a third?')).toBe('paragraph');
    expect(guessMode('line one\nline two. line two continues!')).toBe('paragraph');
    expect(guessMode(`${'word '.repeat(70)}.`)).toBe('paragraph');
  });

  it('边界：空串不崩溃', () => {
    expect(['word', 'phrase', 'sentence', 'paragraph']).toContain(guessMode(''));
  });

  it('真实案例：spec 案例 1 是句子', () => {
    expect(
      guessMode(
        'Whenever you watch a video on YouTube now, you will likely get an advert for a scammy product.',
      ),
    ).toBe('sentence');
  });
});
