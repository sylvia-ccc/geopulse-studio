export interface LlmProviderPreset {
  id: string;
  providerKey: "deepseek" | "openai" | "gemini" | "custom";
  name: string;
  badge: string;
  region: "CN" | "Global";
  baseUrl: string;
  defaultModel: string;
  models: string[];
  keyUrl: string;
  costNote: string;
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: "deepseek",
    providerKey: "deepseek",
    name: "DeepSeek 官方",
    badge: "中文性价比首选",
    region: "CN",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyUrl: "https://platform.deepseek.com/api_keys",
    costNote: "约 ¥0.01/篇，中文结构化与对比评测质量极佳",
  },
  {
    id: "zhipu",
    providerKey: "custom",
    name: "智谱 BigModel (GLM)",
    badge: "含免费模型",
    region: "CN",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-plus", "glm-4-air"],
    keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    costNote: "glm-4-flash 提供免费调用额度，零成本上手首选",
  },
  {
    id: "siliconflow",
    providerKey: "custom",
    name: "硅基流动 SiliconFlow",
    badge: "国内直连多模型",
    region: "CN",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-72B-Instruct",
    models: [
      "Qwen/Qwen2.5-72B-Instruct",
      "deepseek-ai/DeepSeek-V3",
      "Qwen/Qwen2.5-7B-Instruct",
    ],
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
    costNote: "注册送赠金，国内直连无需代理，支持 Qwen/DeepSeek",
  },
  {
    id: "qwen",
    providerKey: "custom",
    name: "阿里云百炼 · 通义千问",
    badge: "企业稳定",
    region: "CN",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
    keyUrl: "https://bailian.console.aliyun.com/",
    costNote: "新用户享百万级免费 Token，企业合规开票方便",
  },
  {
    id: "kimi",
    providerKey: "custom",
    name: "月之暗面 Kimi",
    badge: "长文本强项",
    region: "CN",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k"],
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    costNote: "中文自然表达流畅，适合知乎/公众号深度专栏",
  },
  {
    id: "doubao",
    providerKey: "custom",
    name: "火山方舟 · 豆包大模型",
    badge: "抖音/豆包生态",
    region: "CN",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-1-5-pro-32k-250115",
    models: ["doubao-1-5-pro-32k-250115", "doubao-1-5-lite-32k-250115"],
    keyUrl: "https://console.volcengine.com/ark",
    costNote: "天然贴合豆包问答语感（需填入推理接入点或模型 ID）",
  },
  {
    id: "gemini",
    providerKey: "gemini",
    name: "Google Gemini",
    badge: "免费层 + 出海强",
    region: "Global",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    keyUrl: "https://aistudio.google.com/apikey",
    costNote: "Google AI Studio 提供慷慨免费额度，出海 GEO 极佳",
  },
  {
    id: "openai",
    providerKey: "openai",
    name: "OpenAI 官方",
    badge: "全球标准",
    region: "Global",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"],
    keyUrl: "https://platform.openai.com/api-keys",
    costNote: "出海英文/双语内容与 ChatGPT Search 风格高度一致",
  },
  {
    id: "openrouter",
    providerKey: "custom",
    name: "OpenRouter 全球聚合",
    badge: "1个Key通吃全模型",
    region: "Global",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-chat-v3-0324:free",
    models: [
      "deepseek/deepseek-chat-v3-0324:free",
      "google/gemini-2.5-flash",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
    ],
    keyUrl: "https://openrouter.ai/keys",
    costNote: "内置多款 :free 免费模型，支持随时切换 Claude/GPT/Gemini",
  },
];
