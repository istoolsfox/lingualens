// ============================================================
// shared/providers.ts —— 厂商预设（小白只需：选厂商 → 贴密钥）
// 模型列表是"常用推荐"，输入框可改（模型命名随厂商更新，预设只是起点）
// ============================================================

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  /** 密钥获取页提示 */
  keyHint?: string;
  note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek（深度求索）',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'platform.deepseek.com → API Keys',
    note: '国内直连，性价比高，推荐首选',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3.2', 'Qwen/Qwen3-32B', 'Qwen/Qwen2.5-7B-Instruct'],
    keyHint: 'cloud.siliconflow.cn → API 密钥',
    note: '一个 Key 用多家模型，部分小模型免费',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4.6'],
    keyHint: 'open.bigmodel.cn → API Keys',
    note: 'glm-4-flash 免费',
  },
  {
    id: 'moonshot',
    name: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-32k'],
    keyHint: 'platform.moonshot.cn → API Key',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼（通义千问）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    keyHint: 'bailian.console.aliyun.com → API-KEY',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4.1-mini'],
    keyHint: 'platform.openai.com → API Keys',
    note: '国内网络需要代理',
  },
  {
    id: 'ollama',
    name: 'Ollama（本机模型）',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen3:8b'],
    keyHint: '本机无需密钥，随便填一个即可',
    note: '需本机已安装 Ollama 并运行 ollama serve',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本机模型）',
    baseUrl: 'http://localhost:1234/v1',
    models: ['local-model'],
    keyHint: '本机无需密钥，随便填一个即可',
  },
  {
    id: 'custom',
    name: '其他 / 自定义',
    baseUrl: '',
    models: [],
    note: '手动填 API 地址（OpenAI 兼容格式，一般以 /v1 结尾）',
  },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** 根据已保存的 baseUrl 反推厂商（老配置迁移用） */
export function matchPresetByBaseUrl(baseUrl: string): string {
  if (!baseUrl) return 'deepseek';
  const hit = PROVIDER_PRESETS.find((p) => p.baseUrl && p.baseUrl === baseUrl);
  return hit?.id ?? 'custom';
}
