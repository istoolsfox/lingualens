// ============================================================
// ai/promptBuilder.ts —— Prompt 模板组装
// prompts/*.md 为唯一事实源（?raw 导入），本模块只做变量填充与拼接
// ============================================================

import disciplineMd from '../../prompts/common_discipline.md?raw';
import wordMd from '../../prompts/word_analysis.md?raw';
import phraseMd from '../../prompts/phrase_analysis.md?raw';
import sentenceMd from '../../prompts/sentence_analysis.md?raw';
import paragraphMd from '../../prompts/paragraph_analysis.md?raw';
import conversationMd from '../../prompts/conversation.md?raw';
import translateMd from '../../prompts/translate.md?raw';
import explainMd from '../../prompts/explain.md?raw';
import practiceGenerateMd from '../../prompts/practice_generate.md?raw';
import practiceGradeMd from '../../prompts/practice_grade.md?raw';

import wordSchema from '../../prompts/schemas/word.json';
import phraseSchema from '../../prompts/schemas/phrase.json';
import sentenceSchema from '../../prompts/schemas/sentence.json';
import paragraphSchema from '../../prompts/schemas/paragraph.json';
import lightSchema from '../../prompts/schemas/light.json';
import practiceSchema from '../../prompts/schemas/practice.json';

import { DEPTH_LABELS, LEVEL_LABELS } from '../shared/constants';
import type { Snapshot } from '../shared/messages';
import type { Settings } from '../shared/settings';
import type { AnalysisResult, ChatMessage, LightAction, LightResult, Mode, Question } from '../shared/types';
import { routeHint } from './router';

export interface BuiltPrompt {
  system: string;
  user: string;
  /** strictJson 开启时随请求发送的 response_format schema */
  schema?: object;
  schemaName?: string;
}

const MODE_TEMPLATES: Record<Mode, string> = {
  word: wordMd,
  phrase: phraseMd,
  sentence: sentenceMd,
  paragraph: paragraphMd,
};

const MODE_SCHEMAS: Record<Mode, object> = {
  word: wordSchema,
  phrase: phraseSchema,
  sentence: sentenceSchema,
  paragraph: paragraphSchema,
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => vars[key] ?? m);
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

interface PromptContext {
  snapshot: Snapshot;
  settings: Settings;
}

function commonVars(ctx: PromptContext, extra: Record<string, string> = {}): Record<string, string> {
  const cl = Math.max(50, Math.min(ctx.settings.ui.contextLength, 1000));
  return {
    ORIGINAL_TEXT: ctx.snapshot.text,
    CONTEXT_BEFORE: clamp(ctx.snapshot.contextBefore, cl),
    CONTEXT_AFTER: clamp(ctx.snapshot.contextAfter, cl),
    PAGE_TITLE: ctx.snapshot.title || '(未知页面)',
    PAGE_URL: ctx.snapshot.url || '(未知地址)',
    USER_LEVEL_DESC: LEVEL_LABELS[ctx.settings.user.level] ?? LEVEL_LABELS.intermediate!,
    DEPTH_DESC: DEPTH_LABELS[ctx.settings.user.depth] ?? DEPTH_LABELS.standard!,
    ...extra,
  };
}

function appendSchema(user: string, schema: object): string {
  return `${user}\n\n[输出 JSON Schema contract]\n${JSON.stringify(schema)}`;
}

/** 四模式分析 prompt */
export function buildAnalysisPrompt(
  mode: Mode,
  guess: Mode,
  manual: Mode | undefined,
  ctx: PromptContext,
): BuiltPrompt {
  const template = MODE_TEMPLATES[mode];
  const vars = commonVars(ctx, { MODE_HINT: routeHint(guess, manual) });
  const user = fill(template, vars);
  return {
    system: fill(disciplineMd, {}),
    user: appendSchema(user, MODE_SCHEMAS[mode]),
    schema: MODE_SCHEMAS[mode],
    schemaName: `lingualens_${mode}`,
  };
}

/** 轻动作 prompt（翻译/解释） */
export function buildLightPrompt(action: LightAction, guess: Mode, ctx: PromptContext): BuiltPrompt {
  const template = action === 'translate' ? translateMd : explainMd;
  const hint = `本地预判内容类型为 "${guess}"，可据此调整讲解侧重。`;
  const user = fill(template, commonVars(ctx, { MODE_HINT: hint }));
  const schema = lightSchema[action === 'translate' ? 'translate' : 'explain'] as object;
  return {
    system: fill(disciplineMd, {}),
    user: appendSchema(user, schema),
    schema,
    schemaName: `lingualens_${action}`,
  };
}

/** 追问对话 prompt（模板内含历史与问题，整体作为 user 消息） */
export function buildChatPrompt(
  question: string,
  history: ChatMessage[],
  analysis: AnalysisResult | LightResult | null,
  ctx: PromptContext,
): BuiltPrompt {
  const digest = analysis ? analysisDigest(analysis) : '(尚无分析结果)';
  const historyText =
    history.length === 0
      ? '(尚无对话)'
      : history
          .slice(-20)
          .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n')
          .slice(-3000);
  const user = fill(conversationMd, commonVars(ctx, { ANALYSIS_DIGEST: digest, CHAT_HISTORY: historyText, QUESTION: question }));
  return { system: fill(disciplineMd, {}), user };
}

/** 分析结果 → 紧凑摘要（喂给对话，控制 token） */
export function analysisDigest(a: AnalysisResult | LightResult): string {
  const f = a as Partial<AnalysisResult>;
  const obj: Record<string, unknown> = { summary: a.summary };
  if (a.translation) {
    obj.literal = a.translation.literal;
    obj.natural = a.translation.natural;
    if (a.translation.intent) obj.intent = a.translation.intent;
  }
  if (f.word_info) {
    obj.word = f.word_info.word;
    obj.context_meaning = f.word_info.context_meaning;
    obj.pos = f.word_info.pos;
    if (f.word_info.compare) obj.compare = f.word_info.compare;
  }
  if (f.grammar_points) {
    obj.grammar_titles = f.grammar_points.map((g) => g.title);
  }
  if (f.vocabulary) {
    obj.vocab = f.vocabulary.map((v) => `${v.word}(${v.pos}): ${v.context_meaning}`);
  }
  if (f.collocations) {
    obj.collocations = f.collocations.map((c) => `${c.phrase}: ${c.meaning}`);
  }
  if (f.expression) {
    obj.expression_titles = f.expression.map((e) => e.title);
  }
  const json = JSON.stringify(obj);
  return json.length > 1500 ? json.slice(0, 1500) + '…' : json;
}

/** 练习生成 prompt */
export function buildPracticeGeneratePrompt(
  entriesPreview: string,
  types: string[],
  count: number,
): BuiltPrompt {
  const user = fill(practiceGenerateMd, {
    ENTRIES: entriesPreview,
    TYPES: types.join(', '),
    COUNT: String(count),
  });
  const schema = (practiceSchema as Record<string, object>).generate ?? {};
  return { system: fill(disciplineMd, {}), user: appendSchema(user, schema), schema, schemaName: 'lingualens_quiz' };
}

/** 主观题批改 prompt */
export function buildPracticeGradePrompt(questions: Question[], answers: { questionId: string; answer: string }[]): BuiltPrompt {
  const qJson = JSON.stringify(
    questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, answer: q.answer })),
  );
  const aJson = JSON.stringify(answers);
  const user = fill(practiceGradeMd, { QUESTIONS: qJson, ANSWERS: aJson });
  const schema = (practiceSchema as Record<string, object>).grade ?? {};
  return { system: fill(disciplineMd, {}), user: appendSchema(user, schema), schema, schemaName: 'lingualens_grade' };
}

/** 重试提示（L3：解析失败后追加的纠偏指令） */
export const RETRY_INSTRUCTION =
  '你上一次的输出无法解析为合法 JSON。请重新输出：只输出一个合法 JSON 对象，不要 markdown 围栏、不要任何解释文字、字符串内正确转义引号。';
