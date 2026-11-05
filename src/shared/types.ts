// ============================================================
// shared/types.ts —— 全局领域类型（唯一真相源，禁止各端重复定义）
// ============================================================

/** 分析模式 */
export type Mode = 'word' | 'phrase' | 'sentence' | 'paragraph';

/** 轻量动作（浮动栏的翻译/解释） */
export type LightAction = 'translate' | 'explain';

/** 分析深度 */
export type Depth = 'quick' | 'standard' | 'deep';

/** 用户英语水平 */
export type Level = 'beginner' | 'intermediate' | 'advanced';

/** 知识条目类型 */
export type EntryType = Mode | 'note';

/** 语法知识三分类：规则（确定）/ 习惯（惯例）/ 风格（个案） */
export type KnowledgeKind = 'rule' | 'habit' | 'style';

/** 主题 */
export type Theme = 'auto' | 'light' | 'dark';

/** 浮动栏模式 */
export type FloatingBarMode = 'all' | 'off';

// ---------- AI 分析结果结构（JSON 契约的 TS 镜像） ----------

export interface TranslationPair {
  /** 结构直译：尽量保留英文组织方式 */
  literal: string;
  /** 自然意译：符合中文习惯 */
  natural: string;
  /** 言外之意：讽刺/幽默/反问等，作者真正想表达什么（可选） */
  intent?: string;
}

/** 意群 */
export interface SenseChunk {
  /** 意群原文 */
  text: string;
  /** 这个组合的意思 */
  meaning: string;
  /** 在整句中的作用 */
  role: string;
}

/** 句子结构成分 */
export interface StructureItem {
  /** 主语/谓语/宾语/定语/状语/补语/表语/从句/插入语 等 */
  component: string;
  /** 对应原文片段 */
  text: string;
  /** 作用解释 */
  explanation: string;
}

/** 语法解析点 */
export interface GrammarPoint {
  title: string;
  /** 原文对应片段 */
  quote?: string;
  /** 讲作用与原因，不是贴标签 */
  explanation: string;
  /** 若替换或删除会怎样（可选） */
  alternative?: string;
  kind?: KnowledgeKind;
}

/** 重点词汇卡片 */
export interface VocabCard {
  word: string;
  pos: string;
  /** 当前语境下的意思 */
  context_meaning: string;
  /** 构词/词形（可选，如 scam+(-y)） */
  morphology?: string;
  /** 常见搭配 */
  collocations?: string[];
  /** 近义词差异（可选） */
  synonym_diff?: string;
}

/** 短语/搭配/习语条目 */
export interface CollocationItem {
  phrase: string;
  /** 含义（含字面→习语的桥接说明） */
  meaning: string;
  /** 为什么不能逐词翻译 / 使用场景 */
  usage_note?: string;
  examples?: string[];
  kind?: KnowledgeKind;
}

/** 表达习惯与中英差异 */
export interface ExpressionNote {
  title: string;
  /** 英语为什么这样组织 */
  en_side: string;
  /** 中文为什么需要调整 / 差异在哪 */
  cn_side: string;
  kind?: KnowledgeKind;
}

/** 单词模式的完整信息 */
export interface WordInfo {
  word: string;
  ipa_us?: string;
  ipa_uk?: string;
  /** 当前句中词性 */
  pos: string;
  /** 核心中文意思（多个） */
  core_meanings: string[];
  /** 当前语境下的具体意思 */
  context_meaning: string;
  /** 词根词缀构词分析（不确定必须说明） */
  morphology?: string;
  /** 词形变化 */
  inflections?: string[];
  /** 同根词/派生词 */
  derivatives?: { word: string; meaning: string }[];
  /** 句中语法作用：修饰谁、为什么这个位置、能否替换 */
  grammar_role?: string;
  /** 与近义表达的对比（likely vs probably） */
  compare?: { expression: string; difference: string }[];
  /** 实际使用 */
  usage?: {
    examples: string[];
    collocations: string[];
    synonyms?: string[];
    antonyms?: string[];
    confusables?: string[];
    scenarios?: string;
  };
}

/** 完整分析结果 */
export interface AnalysisResult {
  /** LLM 校准后的类型 */
  detected_type: Mode;
  original_text: string;
  /** 一句话总括：作者真正想表达什么（概览的"最终理解"） */
  summary: string;
  translation: TranslationPair;
  /** 意群拆解（sentence/paragraph） */
  chunks?: SenseChunk[];
  /** 句子结构（sentence） */
  structure?: StructureItem[];
  /** 语法深度解析 */
  grammar_points?: GrammarPoint[];
  /** 词汇重点 */
  vocabulary?: VocabCard[];
  /** 短语搭配/习语 */
  collocations?: CollocationItem[];
  /** 表达习惯与中英差异 */
  expression?: ExpressionNote[];
  /** word 模式专有 */
  word_info?: WordInfo;
}

/** 轻量动作结果（翻译/解释按钮） */
export interface LightResult {
  action: LightAction;
  original_text: string;
  /** translate：literal/natural；explain：放 expression[0] 或 summary */
  translation?: TranslationPair;
  summary?: string;
  expression?: ExpressionNote[];
  word_info?: WordInfo;
}

// ---------- 对话 ----------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 流式未完成标记 */
  streaming?: boolean;
  error?: string;
}

// ---------- 收藏库 ----------

export interface Entry {
  id: string;
  type: EntryType;
  text: string;
  /** 分析快照（可后补，pending 条目为 null） */
  analysis: AnalysisResult | LightResult | null;
  note: string;
  tags: string[];
  sourceUrl: string;
  sourceTitle: string;
  createdAt: number;
  updatedAt: number;
}

export interface TagRow {
  name: string;
  count: number;
}

// ---------- 练习 ----------

export type QuestionType =
  | 'word_meaning'
  | 'phrase_meaning'
  | 'grammar_choice'
  | 'translation'
  | 'imitation'
  | 'synonym'
  | 'correction';

export interface Question {
  id: string;
  type: QuestionType;
  /** 题干（含来源句/原句） */
  prompt: string;
  /** 选择题选项 */
  options?: string[];
  /** 参考答案（选择题为选项文本；主观题为参考答案） */
  answer: string;
  explanation: string;
}

export interface PracticeSession {
  id: string;
  createdAt: number;
  types: QuestionType[];
  questions: Question[];
  /** 用户作答 */
  answers: { questionId: string; answer: string }[];
  /** 批改结果（主观题由 AI 批改） */
  gradings?: { questionId: string; verdict: 'correct' | 'partial' | 'wrong'; comment: string }[];
  score?: number;
}

// ---------- 导入导出 ----------

export interface BackupFile {
  schemaVersion: 1;
  exportedAt: number;
  appVersion: string;
  entries: Entry[];
  tags: TagRow[];
  practiceSessions?: PracticeSession[];
}
