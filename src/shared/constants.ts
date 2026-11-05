// ============================================================
// shared/constants.ts —— 常量与文案
// ============================================================

export const APP_NAME = 'LinguaLens';
export const APP_VERSION = '0.1.0';

/** 默认上下文截取长度（选区前后各 N 字符） */
export const DEFAULT_CONTEXT_LENGTH = 300;
/** 选区文本上限（超长自动截断并提示，不再静默丢弃） */
export const MAX_SELECTION_LENGTH = 12000;
/** 超过此长度走"长文精简分析"（概览为主，减少语法/词汇条数） */
export const LONG_TEXT_THRESHOLD = 4000;
/** 整文翻译：单批段落最大字符数 */
export const ARTICLE_BATCH_CHARS = 2400;
/** 整文翻译：正文总字符上限 */
export const ARTICLE_MAX_CHARS = 60000;
/** 全文注入翻译：文本总量上限 */
export const FULLPAGE_MAX_CHARS = 50000;

/** 应用内自定义快捷键默认组合（Ctrl/Cmd + Alt + L，触发全文翻译注入） */
export const DEFAULT_HOTKEY = { key: 'L', ctrl: true, alt: true, meta: false, shift: false } as const;
/** 对话历史滚动窗口（轮） */
export const CHAT_HISTORY_ROUNDS = 10;
/** 会话缓存上限（条） */
export const SESSION_CACHE_LIMIT = 20;

/** 错误分类码 → 用户可读文案 */
export const ERROR_MESSAGES: Record<string, string> = {
  not_configured: '还没配置 AI 接口。点击右上角 ⚙ 设置，选择厂商并填入密钥即可开始。',
  network: '网络请求失败，请检查网络或 API 地址是否可达。',
  timeout: '请求超时。可在设置中调大超时时间，或稍后重试。',
  auth: 'API 密钥无效或无权限（401/403）。请到设置中重新粘贴密钥。',
  rate_limit: '请求过于频繁或额度不足（429）。稍等片刻再试。',
  server: '模型服务端出错（5xx）。稍后重试，或换个模型试试。',
  bad_request: '请求被服务端拒绝（400）。请检查厂商与模型是否匹配，模型名称是否拼写正确。',
  parse: '模型返回的内容无法解析为结构化结果。已用简化视图展示，可点「重新分析」重试。',
  aborted: '已停止本次分析。',
  empty: '模型返回了空内容。',
  no_article: '没有在这页找到正文。这个页面可能不是文章页（比如首页或列表页）。',
  fullpage_empty: '这页没有可翻译的可见文字。',
  unknown: '发生未知错误，请重试。',
};

export const MODE_LABELS: Record<string, string> = {
  word: '单词',
  phrase: '短语',
  sentence: '句子',
  paragraph: '段落',
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: '入门（解释更基础，多举例）',
  intermediate: '进阶（标准解释）',
  advanced: '精通（简练，直击要点）',
};

export const DEPTH_LABELS: Record<string, string> = {
  quick: '快速（只讲核心）',
  standard: '标准',
  deep: '深挖（更详细的语法与对比）',
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  word_meaning: '单词理解',
  phrase_meaning: '短语含义',
  grammar_choice: '语法选择',
  translation: '句子翻译',
  imitation: '仿写练习',
  synonym: '近义辨析',
  correction: '表达纠错',
};
