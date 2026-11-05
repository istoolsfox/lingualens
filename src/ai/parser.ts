// ============================================================
// ai/parser.ts —— 模型输出解析与四级降级
// L1 严格 JSON → L2 宽松提取（截取大括号 + 修尾随逗号）
// L3（重试，由 aiService 编排） → L4 Markdown 兜底（degraded）
// 本模块只做纯解析，不发请求，方便单测
// ============================================================

import type { AnalysisResult, CollocationItem, ExpressionNote, GrammarPoint, LightResult, Mode, SenseChunk, StructureItem, VocabCard, WordInfo } from '../shared/types';
import { guessMode } from './router';

export type ParseOk<T> = { ok: true; data: T; level: 1 | 2 };
export type ParseFail = { ok: false; reason: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

/** 从任意模型输出中尽力提取 JSON 对象 */
export function extractJsonObject(raw: string): unknown | undefined {
  let text = raw.trim();
  // 去掉 markdown 代码围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();

  // L1 严格解析
  try {
    return JSON.parse(text) as unknown;
  } catch {
    /* 继续降级 */
  }

  // L2 宽松：截取首个 { 到末个 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let body = text.slice(start, end + 1);
  // 修正常见脏输出：尾随逗号
  body = body.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

const VALID_MODES: Mode[] = ['word', 'phrase', 'sentence', 'paragraph'];

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

function coerceMode(v: unknown, fallbackText: string): Mode {
  return typeof v === 'string' && (VALID_MODES as string[]).includes(v) ? (v as Mode) : guessMode(fallbackText);
}

function coerceTranslation(v: unknown): AnalysisResult['translation'] {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    literal: asString(o.literal),
    natural: asString(o.natural),
    intent: typeof o.intent === 'string' && o.intent ? o.intent : undefined,
  };
}

function coerceChunks(v: unknown): SenseChunk[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x): SenseChunk | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!asString(o.text)) return null;
      return { text: asString(o.text), meaning: asString(o.meaning), role: asString(o.role) };
    })
    .filter((x): x is SenseChunk => x !== null);
  return out.length ? out : undefined;
}

function coerceStructure(v: unknown): StructureItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x): StructureItem | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!asString(o.text)) return null;
      return { component: asString(o.component) || '成分', text: asString(o.text), explanation: asString(o.explanation) };
    })
    .filter((x): x is StructureItem => x !== null);
  return out.length ? out : undefined;
}

function coerceGrammar(v: unknown): GrammarPoint[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x): GrammarPoint | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!asString(o.title) && !asString(o.explanation)) return null;
      return {
        title: asString(o.title) || '语法点',
        quote: asString(o.quote) || undefined,
        explanation: asString(o.explanation),
        alternative: asString(o.alternative) || undefined,
        kind: (o.kind === 'rule' || o.kind === 'habit' || o.kind === 'style' ? o.kind : undefined) as GrammarPoint['kind'],
      };
    })
    .filter((x): x is GrammarPoint => x !== null);
  return out.length ? out : undefined;
}

function coerceVocab(v: unknown): VocabCard[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x): VocabCard | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!asString(o.word)) return null;
      return {
        word: asString(o.word),
        pos: asString(o.pos),
        context_meaning: asString(o.context_meaning),
        morphology: asString(o.morphology) || undefined,
        collocations: asStringArray(o.collocations),
        synonym_diff: asString(o.synonym_diff) || undefined,
      };
    })
    .filter((x): x is VocabCard => x !== null);
  return out.length ? out : undefined;
}

function coerceCollocations(v: unknown): CollocationItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x): CollocationItem | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!asString(o.phrase)) return null;
      return {
        phrase: asString(o.phrase),
        meaning: asString(o.meaning),
        usage_note: asString(o.usage_note) || undefined,
        examples: asStringArray(o.examples),
        kind: (o.kind === 'rule' || o.kind === 'habit' || o.kind === 'style' ? o.kind : undefined) as CollocationItem['kind'],
      };
    })
    .filter((x): x is CollocationItem => x !== null);
  return out.length ? out : undefined;
}

function coerceExpression(v: unknown): ExpressionNote[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x): ExpressionNote | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!asString(o.title)) return null;
      return {
        title: asString(o.title),
        en_side: asString(o.en_side),
        cn_side: asString(o.cn_side),
        kind: (o.kind === 'rule' || o.kind === 'habit' || o.kind === 'style' ? o.kind : undefined) as ExpressionNote['kind'],
      };
    })
    .filter((x): x is ExpressionNote => x !== null);
  return out.length ? out : undefined;
}

function coerceWordInfo(v: unknown): WordInfo | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!asString(o.word)) return undefined;
  const usage = (typeof o.usage === 'object' && o.usage !== null ? o.usage : {}) as Record<string, unknown>;
  const derivatives = Array.isArray(o.derivatives)
    ? o.derivatives
        .map((d): { word: string; meaning: string } | null => {
          const d0 = (d ?? {}) as Record<string, unknown>;
          return asString(d0.word) ? { word: asString(d0.word), meaning: asString(d0.meaning) } : null;
        })
        .filter((d): d is { word: string; meaning: string } => d !== null)
    : undefined;
  const compare = Array.isArray(o.compare)
    ? o.compare
        .map((c): { expression: string; difference: string } | null => {
          const c0 = (c ?? {}) as Record<string, unknown>;
          return asString(c0.expression) ? { expression: asString(c0.expression), difference: asString(c0.difference) } : null;
        })
        .filter((c): c is { expression: string; difference: string } => c !== null)
    : undefined;
  return {
    word: asString(o.word),
    ipa_us: asString(o.ipa_us) || undefined,
    ipa_uk: asString(o.ipa_uk) || undefined,
    pos: asString(o.pos),
    core_meanings: asStringArray(o.core_meanings),
    context_meaning: asString(o.context_meaning),
    morphology: asString(o.morphology) || undefined,
    inflections: asStringArray(o.inflections).length ? asStringArray(o.inflections) : undefined,
    derivatives,
    grammar_role: asString(o.grammar_role) || undefined,
    compare,
    usage: {
      examples: asStringArray(usage.examples),
      collocations: asStringArray(usage.collocations),
      synonyms: asStringArray(usage.synonyms),
      antonyms: asStringArray(usage.antonyms),
      confusables: asStringArray(usage.confusables),
      scenarios: asString(usage.scenarios) || undefined,
    },
  };
}

/** 归一化分析结果：容忍缺字段，绝不抛错 */
export function normalizeAnalysis(raw: unknown, fallbackText: string): AnalysisResult {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const result: AnalysisResult = {
    detected_type: coerceMode(o.detected_type, fallbackText),
    original_text: asString(o.original_text) || fallbackText,
    summary: asString(o.summary),
    translation: coerceTranslation(o.translation),
  };
  result.chunks = coerceChunks(o.chunks);
  result.structure = coerceStructure(o.structure);
  result.grammar_points = coerceGrammar(o.grammar_points);
  result.vocabulary = coerceVocab(o.vocabulary);
  result.collocations = coerceCollocations(o.collocations);
  result.expression = coerceExpression(o.expression);
  const wi = coerceWordInfo(o.word_info);
  if (wi) result.word_info = wi;
  return result;
}

/** 解析完整分析输出（L1/L2） */
export function parseAnalysis(raw: string, fallbackText: string): ParseResult<AnalysisResult> {
  const obj = extractJsonObject(raw);
  if (obj === undefined) return { ok: false, reason: 'no-json-found' };
  const normalized = normalizeAnalysis(obj, fallbackText);
  // 结构底线：必须有 translation 或 summary 或 word_info 之一有实质内容
  const hasContent =
    normalized.summary.length > 0 ||
    normalized.translation.natural.length > 0 ||
    !!normalized.word_info;
  if (!hasContent) return { ok: false, reason: 'empty-content' };
  return { ok: true, data: normalized, level: raw === JSON.stringify(obj) ? 1 : 2 };
}

/** 解析轻动作（翻译/解释）输出 */
export function parseLight(raw: string, action: 'translate' | 'explain', fallbackText: string): ParseResult<LightResult> {
  const obj = extractJsonObject(raw);
  if (obj === undefined) return { ok: false, reason: 'no-json-found' };
  const o = (typeof obj === 'object' && obj !== null ? obj : {}) as Record<string, unknown>;
  const result: LightResult = { action, original_text: fallbackText };
  if (action === 'translate') {
    result.translation = coerceTranslation(o.translation);
    result.summary = asString(o.summary);
    const expr = coerceExpression(o.expression);
    if (expr) result.expression = expr;
    if (!result.translation.natural && !result.translation.literal) return { ok: false, reason: 'empty-content' };
  } else {
    result.summary = asString(o.summary);
    const expr = coerceExpression(o.expression);
    if (expr) result.expression = expr;
    const wi = coerceWordInfo(o.word_info);
    if (wi) result.word_info = wi;
    if (!result.summary) return { ok: false, reason: 'empty-content' };
  }
  return { ok: true, data: result, level: 1 };
}
