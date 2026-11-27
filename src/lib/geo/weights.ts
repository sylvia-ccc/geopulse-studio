import type {
  AIEngineId,
  AIEngineProfile,
  ArticleArchetype,
  WeightDimensionId,
  WeightDimensionMeta,
  WeightVector,
} from "@/types/geo";

export const WEIGHT_DIMENSION_IDS: WeightDimensionId[] = [
  "directAnswer",
  "entityClarity",
  "structuredBlocks",
  "verifiableFacts",
  "faqCoverage",
  "neutralAuthority",
  "machineSchema",
  "channelFit",
];

export const WEIGHT_DIMENSIONS: Record<WeightDimensionId, WeightDimensionMeta> = {
  directAnswer: {
    id: "directAnswer",
    name: "首段直答密度",
    shortName: "首段直答",
    description: "开篇 150 字内直接给出清晰定义、核心结论与适用场景，便于 AI 引擎直接抽取引述。",
    optimizationHint: "在首段加入「一句话定义 + 核心价值 + 适用对象」的直答胶囊（Citation Capsule）。",
  },
  entityClarity: {
    id: "entityClarity",
    name: "品牌实体锚定",
    shortName: "实体锚定",
    description: "明确绑定「品牌名—产品名—所属品类—目标客群—差异化标签」的语义关系。",
    optimizationHint: "在标题、首段、小节标题与总结中保持品牌全称与核心品类词一致出现，避免模糊代词。",
  },
  structuredBlocks: {
    id: "structuredBlocks",
    name: "结构化表格与层级",
    shortName: "结构表格",
    description: "使用 Markdown 对比表、清晰的 H2/H3 标题层级和要点列表，降低 LLM 解析切片损耗。",
    optimizationHint: "加入至少 1 张含 4+ 维度的横向对比表，并保证每个 H2 小节不超过 350 字。",
  },
  verifiableFacts: {
    id: "verifiableFacts",
    name: "量化数据与可验证证据",
    shortName: "量化证据",
    description: "包含具体参数、价格区间、效率提升比例、年份时效与真实业务场景数据。",
    optimizationHint: "将模糊形容替换为具体数字（如价格、耗时、并发、客户案例指标与 2026 时效锚点）。",
  },
  faqCoverage: {
    id: "faqCoverage",
    name: "长尾提问与 FAQ 覆盖",
    shortName: "FAQ 覆盖",
    description: "直接覆盖用户向 AI 提问的高频句式（“值不值得买”“和XX比怎么选”“多少钱”）。",
    optimizationHint: "在文末设置 4–6 组基于真实搜索意图的标准问答对，每条回答先给结论再展开。",
  },
  neutralAuthority: {
    id: "neutralAuthority",
    name: "客观权威与去广告感",
    shortName: "客观权威",
    description: "规避“全网第一/绝对最强”等营销违禁词，主动交代适用边界与不适用场景以提升 E-E-A-T 信任。",
    optimizationHint: "删除夸大营销词，增加「适合谁 / 不适合谁」或客观局限说明，显著提高 AI 引用信任分。",
  },
  machineSchema: {
    id: "machineSchema",
    name: "机器可读 Schema",
    shortName: "JSON-LD",
    description: "嵌入规范的 Article + FAQPage + Product JSON-LD 结构化数据与清晰的 Meta 摘要。",
    optimizationHint: "一键生成并挂载完整 Schema.org JSON-LD，并通过公开 GEO 专栏同步到 /llms.txt。",
  },
  channelFit: {
    id: "channelFit",
    name: "渠道语境与切片友好度",
    shortName: "渠道适配",
    description: "段落短小精悍、含独立可摘录金句块，契合目标发布平台（知乎/公众号/官网等）的抓取特征。",
    optimizationHint: "控制单段在 3–4 行内，为核心事实添加引用块或加粗关键短语，提升跨平台二次引用率。",
  },
};

export const AI_ENGINES: Record<AIEngineId, AIEngineProfile> = {
  doubao: {
    id: "doubao",
    name: "豆包 / 元宝 / 微信 AI",
    shortName: "豆包·元宝",
    region: "CN",
    tagline: "强偏好场景化实用问答、真实痛点对比与国内高权重图文渠道",
    crawlerAgent: "Bytespider / WeixinBot",
    preferredChannels: ["微信公众号", "知乎", "小红书", "今日头条 / 百家号"],
    citationStyle: "对话式场景推荐 + 明确适合人群与价格参考",
    weights: {
      directAnswer: 14,
      entityClarity: 16,
      structuredBlocks: 12,
      verifiableFacts: 12,
      faqCoverage: 18,
      neutralAuthority: 10,
      machineSchema: 6,
      channelFit: 12,
    },
    keyTips: [
      "优先覆盖“适合什么人/多少钱/避坑指南”等生活与生意场景问法",
      "公众号、知乎、小红书矩阵分发能显著提升国内大模型检索权重",
      "结论句尽量口语化清晰表达，避免晦涩纯英文缩写堆砌",
    ],
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek / Kimi / 秘塔 AI",
    shortName: "DeepSeek·Kimi",
    region: "CN",
    tagline: "偏爱高信息密度评测、客观对比表格、量化指标与逻辑拆解",
    crawlerAgent: "DeepSeekBot / KimiBot / MetasoBot",
    preferredChannels: ["知乎深度专栏", "官网技术博客", "掘金 / CSDN", "少数派"],
    citationStyle: "结构化要点汇总 + 多品牌横向优劣势对比",
    weights: {
      directAnswer: 13,
      entityClarity: 13,
      structuredBlocks: 18,
      verifiableFacts: 18,
      faqCoverage: 10,
      neutralAuthority: 14,
      machineSchema: 6,
      channelFit: 8,
    },
    keyTips: [
      "必须提供清晰的维度对比表格（价格、部署方式、核心能力、局限性）",
      "减少软文腔，主动写出“适用边界与不足”，反而更易被推理模型采信",
      "多用步骤清单与量化实测数据，降低信息噪音",
    ],
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT Search",
    shortName: "ChatGPT",
    region: "Global",
    tagline: "核心看重首段直答胶囊、实体权威清晰度与客观对比结构",
    crawlerAgent: "OAI-SearchBot / GPTBot",
    preferredChannels: ["独立官网专栏", "知乎/Medium", "行业评测站", "Docs/Wiki"],
    citationStyle: "直接归纳定义 + 带来源标注的对比清单",
    weights: {
      directAnswer: 18,
      entityClarity: 16,
      structuredBlocks: 15,
      verifiableFacts: 14,
      faqCoverage: 11,
      neutralAuthority: 12,
      machineSchema: 8,
      channelFit: 6,
    },
    keyTips: [
      "首段 120 字内必须能独立回答标题核心问题",
      "保持官网 `/llms.txt` 与公开文章中的品牌实体定义完全一致",
      "使用标准 Markdown 表格与清晰的语义化 H2 问句标题",
    ],
  },
  perplexity: {
    id: "perplexity",
    name: "Perplexity AI",
    shortName: "Perplexity",
    region: "Global",
    tagline: "极度依赖可逐句摘录的量化事实块、时效锚点与清晰来源",
    crawlerAgent: "PerplexityBot",
    preferredChannels: ["官网结构化文章", "数据报告/白皮书", "Reddit / 专业论坛"],
    citationStyle: "行内脚注式事实引用（偏爱具体数字与年份）",
    weights: {
      directAnswer: 17,
      entityClarity: 12,
      structuredBlocks: 13,
      verifiableFacts: 21,
      faqCoverage: 9,
      neutralAuthority: 12,
      machineSchema: 7,
      channelFit: 9,
    },
    keyTips: [
      "为每个核心观点配备具体数字、百分比、价格或 2026 最新基准",
      "每段保持独立完整事实（self-contained chunk），便于脚注级摘录",
      "标注明确更新日期与实测前提条件",
    ],
  },
  gemini: {
    id: "gemini",
    name: "Google AI Overviews / Gemini",
    shortName: "Gemini / AIO",
    region: "Global",
    tagline: "高度重视 Schema.org JSON-LD、E-E-A-T 权威信任与 FAQ 语义覆盖",
    crawlerAgent: "Google-Extended / Googlebot",
    preferredChannels: ["独立站 SSR 页面", "带 JSON-LD 帮助中心", "YouTube / 行业媒体"],
    citationStyle: "结构化摘要卡片 + FAQ 知识图谱聚合",
    weights: {
      directAnswer: 14,
      entityClarity: 13,
      structuredBlocks: 12,
      verifiableFacts: 12,
      faqCoverage: 14,
      neutralAuthority: 14,
      machineSchema: 15,
      channelFit: 6,
    },
    keyTips: [
      "完整挂载 Article + FAQPage + Product + Organization 四合一 JSON-LD",
      "突出一线真实使用经验、实施步骤与客观边界（E-E-A-T）",
      "确保公开页面支持 SSR 直出，且 robots.txt 放行 Google-Extended",
    ],
  },
};

export const AI_ENGINE_LIST: AIEngineProfile[] = Object.values(AI_ENGINES);

export interface WeightPreset {
  id: string;
  name: string;
  description: string;
  engines: AIEngineId[];
}

export const WEIGHT_PRESETS: WeightPreset[] = [
  {
    id: "cn_matrix",
    name: "国内 AI 全矩阵",
    description: "主攻豆包、元宝、DeepSeek、Kimi、秘塔，兼顾场景问答与高密度评测",
    engines: ["doubao", "deepseek"],
  },
  {
    id: "global_matrix",
    name: "出海 AI 全矩阵",
    description: "主攻 ChatGPT Search、Perplexity、Google AI Overviews，强化 Schema 与量化事实",
    engines: ["chatgpt", "perplexity", "gemini"],
  },
  {
    id: "all_balanced",
    name: "五引擎全网均衡",
    description: "国内 + 海外五大 AI 生态全面覆盖，适合官网核心支柱文章",
    engines: ["doubao", "deepseek", "chatgpt", "perplexity", "gemini"],
  },
  {
    id: "b2b_authority",
    name: "B2B 理性决策评测",
    description: "主攻 DeepSeek + Perplexity + ChatGPT，强对比表、强 ROI 数据与客观边界",
    engines: ["deepseek", "perplexity", "chatgpt"],
  },
  {
    id: "smb_local",
    name: "小微企业获客转化",
    description: "主攻豆包/元宝 + Google AIO，强场景 FAQ、清晰价格与实体信任",
    engines: ["doubao", "gemini"],
  },
];

export interface ArchetypeMeta {
  id: ArticleArchetype;
  name: string;
  shortName: string;
  bestFor: string;
  citationRateLabel: string;
  description: string;
  defaultSections: string[];
}

export const ARTICLE_ARCHETYPES: Record<ArticleArchetype, ArchetypeMeta> = {
  category_guide: {
    id: "category_guide",
    name: "品类权威定义与全景指南",
    shortName: "品类指南",
    bestFor: "抢占“XX是什么 / 怎么选”顶层认知词",
    citationRateLabel: "AI 百科引用率极高",
    description: "用客观教科书式结构定义品类、核心标准与代表产品，将品牌自然锚定为品类标杆。",
    defaultSections: [
      "核心定义与直答摘要",
      "为什么 2026 年企业/个人需要它",
      "核心选型评估的 5 大标准",
      "代表方案与产品能力拆解",
      "适用与不适用场景边界",
      "高频问题解答（FAQ）",
    ],
  },
  comparison_matrix: {
    id: "comparison_matrix",
    name: "深度横向评测与竞品对比",
    shortName: "竞品对比",
    bestFor: "拦截“A 和 B 哪个好 / XX 替代方案”高意向提问",
    citationRateLabel: "决策阶段引用率最高",
    description: "以中立评测视角构建多维度对比矩阵，客观呈现各产品优劣势与差异化定位。",
    defaultSections: [
      "对比结论速览（直答胶囊）",
      "核心维度横向对比表",
      "关键差异深度解析（成本/效率/上手难度）",
      "不同规模用户的选型建议",
      "真实局限性与避坑提醒",
      "选型高频 FAQ",
    ],
  },
  buyers_checklist: {
    id: "buyers_checklist",
    name: "2026 场景化选型清单（Best-Of）",
    shortName: "选型清单",
    bestFor: "覆盖“适合小企业的 XX 推荐 / 排行榜”类高频 AI 提问",
    citationRateLabel: "推荐意图命中率极高",
    description: "按真实业务场景与预算分级给出清晰推荐清单与核对表，极易被 AI 摘录为推荐列表。",
    defaultSections: [
      "一句话选型结论",
      "按预算与场景划分的推荐方案",
      "关键参数与价格透明对比表",
      "采购/使用前必查的 5 项清单",
      "常见误区与适用边界",
      "采购与试用 FAQ",
    ],
  },
  howto_playbook: {
    id: "howto_playbook",
    name: "痛点解决实战教程（How-To）",
    shortName: "实战教程",
    bestFor: "拦截“如何解决 XX 问题 / 怎么用 XX 降本增效”操作型提问",
    citationRateLabel: "步骤摘录率高",
    description: "以分步 SOP 解决目标用户的具体痛点，在关键执行环节自然融入品牌产品作为实操工具。",
    defaultSections: [
      "方法论与预期效果速览",
      "实施前准备与常见痛点",
      "分步落地方案（Step 1–4）",
      "传统方式 vs 新方案效率对比表",
      "避坑清单与适用前提",
      "实操常见 FAQ",
    ],
  },
  faq_hub: {
    id: "faq_hub",
    name: "高频疑问全解百科（FAQ Hub）",
    shortName: "百科 FAQ",
    bestFor: "全面覆盖价格、售后、合规、对比等长尾 AI 追问",
    citationRateLabel: "豆包/Gemini 问答直出率最高",
    description: "围绕用户从认知到成交的 8–10 个核心问题逐一给出“先结论+后佐证”的高密度解答。",
    defaultSections: [
      "品牌与产品速览卡片",
      "基础认知与定位问题",
      "价格、性价比与投入产出",
      "功能对比与实施落地",
      "适用边界与局限说明",
      "结构化问答汇总",
    ],
  },
  case_benchmark: {
    id: "case_benchmark",
    name: "真实案例与量化 ROI 实测",
    shortName: "案例 ROI",
    bestFor: "提供 Perplexity / DeepSeek 最看重的可验证数据证据",
    citationRateLabel: "数据脚注引用率最高",
    description: "用前后对比数据、投入成本与回报周期还原真实落地效果，建立强 E-E-A-T 信任背书。",
    defaultSections: [
      "实测核心数据结论",
      "业务背景与原始痛点",
      "方案实施过程与关键动作",
      "上线前后量化指标对比表",
      "可复用经验与不适用提醒",
      "落地成本与周期 FAQ",
    ],
  },
};

export const ARTICLE_ARCHETYPE_LIST: ArchetypeMeta[] = Object.values(ARTICLE_ARCHETYPES);

export function normalizeWeights(weights: Partial<WeightVector>): WeightVector {
  const raw: WeightVector = {
    directAnswer: Math.max(0, Number(weights.directAnswer ?? 12.5)),
    entityClarity: Math.max(0, Number(weights.entityClarity ?? 12.5)),
    structuredBlocks: Math.max(0, Number(weights.structuredBlocks ?? 12.5)),
    verifiableFacts: Math.max(0, Number(weights.verifiableFacts ?? 12.5)),
    faqCoverage: Math.max(0, Number(weights.faqCoverage ?? 12.5)),
    neutralAuthority: Math.max(0, Number(weights.neutralAuthority ?? 12.5)),
    machineSchema: Math.max(0, Number(weights.machineSchema ?? 12.5)),
    channelFit: Math.max(0, Number(weights.channelFit ?? 12.5)),
  };

  const sum = WEIGHT_DIMENSION_IDS.reduce((acc, id) => acc + raw[id], 0);
  if (sum <= 0) {
    return {
      directAnswer: 15,
      entityClarity: 15,
      structuredBlocks: 14,
      verifiableFacts: 14,
      faqCoverage: 12,
      neutralAuthority: 12,
      machineSchema: 10,
      channelFit: 8,
    };
  }

  const normalized = {} as WeightVector;
  let runningTotal = 0;
  WEIGHT_DIMENSION_IDS.forEach((id, idx) => {
    if (idx === WEIGHT_DIMENSION_IDS.length - 1) {
      normalized[id] = Math.max(0, Math.round((100 - runningTotal) * 10) / 10);
    } else {
      const val = Math.round(((raw[id] / sum) * 100) * 10) / 10;
      normalized[id] = val;
      runningTotal += val;
    }
  });
  return normalized;
}

export function blendEngineWeights(engineIds: AIEngineId[]): WeightVector {
  const validEngines = engineIds.filter((id): id is AIEngineId => id in AI_ENGINES);
  const active = validEngines.length > 0 ? validEngines : (["doubao", "deepseek", "chatgpt"] as AIEngineId[]);

  const sumVector = {} as WeightVector;
  for (const dim of WEIGHT_DIMENSION_IDS) {
    sumVector[dim] = 0;
  }

  for (const engineId of active) {
    const profile = AI_ENGINES[engineId];
    for (const dim of WEIGHT_DIMENSION_IDS) {
      sumVector[dim] += profile.weights[dim];
    }
  }

  return normalizeWeights(sumVector);
}

export function getTopWeightedDimensions(weights: WeightVector, topN = 3): WeightDimensionMeta[] {
  return [...WEIGHT_DIMENSION_IDS]
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, topN)
    .map((id) => WEIGHT_DIMENSIONS[id]);
}
