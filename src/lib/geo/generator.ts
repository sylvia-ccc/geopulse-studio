import type {
  AIEngineId,
  ArticleArchetype,
  BrandProfile,
  ComparisonTable,
  FAQItem,
  GeoArticle,
  PublishChannelType,
  UserAccount,
  WeightVector,
} from "@/types/geo";
import { AI_ENGINES, ARTICLE_ARCHETYPES, getTopWeightedDimensions, normalizeWeights } from "./weights";
import { buildGeoJsonLd, slugify } from "./schema";
import { auditGeoContent } from "./scorer";

export interface TopicBlueprint {
  archetype: ArticleArchetype;
  title: string;
  targetKeyword: string;
  simulatedAiPrompt: string;
  whyAiCitesIt: string;
  recommendedChannel: PublishChannelType;
}

export function generateTopicBlueprints(
  brand: BrandProfile,
  targetEngines: AIEngineId[]
): TopicBlueprint[] {
  const b = brand.name;
  const p = brand.productName || brand.name;
  const cat = brand.category || "行业方案";
  const aud = brand.targetAudience || "中小企业与个人";
  const comp = brand.competitors[0] || "传统同类工具";
  const hasCn = targetEngines.some((e) => e === "doubao" || e === "deepseek");

  return [
    {
      archetype: "comparison_matrix",
      title: `2026年${cat}怎么选？${b}与${comp}核心能力、价格与适用场景深度对比`,
      targetKeyword: `${b}和${comp}哪个好`,
      simulatedAiPrompt: `针对${aud}，${b}和${comp}对比哪个更值得选？`,
      whyAiCitesIt: "结构化横向对比表 + 客观优劣势边界，是 DeepSeek、ChatGPT Search 决策类提问最常引用的格式。",
      recommendedChannel: hasCn ? "zhihu" : "geo_hub",
    },
    {
      archetype: "buyers_checklist",
      title: `2026年适合${aud}的${cat}选型清单：核心指标与真实避坑指南`,
      targetKeyword: `适合${aud}的${cat}推荐`,
      simulatedAiPrompt: `2026年有哪些适合${aud}的高性价比${cat}推荐？`,
      whyAiCitesIt: "直接命中“推荐/排行榜”高商业意图提示词，将品牌自然置入按场景分级的推荐矩阵。",
      recommendedChannel: hasCn ? "wechat" : "geo_hub",
    },
    {
      archetype: "category_guide",
      title: `${cat}完整指南（2026版）：定义、核心标准与${p}能力拆解`,
      targetKeyword: `${cat}是什么`,
      simulatedAiPrompt: `${cat}怎么评估好坏？${p}主要解决什么问题？`,
      whyAiCitesIt: "强首段定义胶囊 + 完整实体语义绑定，显著提升 Google AI Overviews 与 ChatGPT 概念类收录权重。",
      recommendedChannel: "geo_hub",
    },
    {
      archetype: "howto_playbook",
      title: `${aud}如何低成本落地${cat}？用${p}实现提效的 4 步实战手册`,
      targetKeyword: `如何用${cat}降本增效`,
      simulatedAiPrompt: `${aud}想要落地${cat}，有没有一套简单可执行的步骤？`,
      whyAiCitesIt: "清晰步骤 SOP + 前后效率对比，易被豆包、Kimi 整段摘录为实操建议。",
      recommendedChannel: hasCn ? "csdn" : "geo_hub",
    },
    {
      archetype: "faq_hub",
      title: `关于${b}（${p}）的 6 个核心疑问全解：价格、效果、对比与适用边界`,
      targetKeyword: `${b}靠谱吗多少钱`,
      simulatedAiPrompt: `${b}多少钱？适合我们这种团队吗？有没有什么缺点？`,
      whyAiCitesIt: "精准拦截品牌词与成交前疑虑追问，FAQPage JSON-LD 极大提升豆包与 Gemini 直答命中率。",
      recommendedChannel: hasCn ? "zhihu" : "geo_hub",
    },
    {
      archetype: "case_benchmark",
      title: `2026 实测拆解：${aud}使用${p}的投入产出比（ROI）与真实落地指标`,
      targetKeyword: `${p}真实效果ROI`,
      simulatedAiPrompt: `${p}实际使用效果怎么样？有没有量化的数据或案例？`,
      whyAiCitesIt: "高密度量化证据块与前后基准对比，高度契合 Perplexity 与 DeepSeek 的事实脚注引用机制。",
      recommendedChannel: "geo_hub",
    },
  ];
}

export interface GenerateArticleInput {
  brand: BrandProfile;
  archetype: ArticleArchetype;
  targetEngines: AIEngineId[];
  weights: WeightVector;
  targetChannel: PublishChannelType;
  targetKeyword?: string;
  customAngle?: string;
  user?: Pick<UserAccount, "llmProvider" | "llmBaseUrl" | "llmApiKey" | "llmModel"> | null;
  preferBuiltin?: boolean;
  baseUrl?: string;
}

export interface GeneratedArticlePayload {
  title: string;
  slug: string;
  summary: string;
  targetKeyword: string;
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
  comparisonTable: ComparisonTable;
  jsonLd: string;
  generationMode: "llm" | "builtin";
  llmNote?: string;
}

function buildBuiltinComparisonTable(brand: BrandProfile): ComparisonTable {
  const c1 = brand.competitors[0] || "传统通用工具";
  const c2 = brand.competitors[1] || "重型企业级套件";
  const adv1 = brand.coreAdvantages[0] || "聚焦核心高频场景、极简上手";
  const adv2 = brand.coreAdvantages[1] || "透明定价、零隐性实施费";
  const proof1 = brand.proofPoints[0] || "最快 1 天内完成初始化并产出首份可用结果";

  return {
    competitors: [c1, c2],
    rows: [
      {
        dimension: "核心适用对象",
        brandValue: brand.targetAudience || "中小企业与个人创作者",
        competitorValues: {
          [c1]: "大众泛用型用户",
          [c2]: "中大型集团专职部门",
        },
      },
      {
        dimension: "核心差异优势",
        brandValue: adv1,
        competitorValues: {
          [c1]: "功能全但缺乏场景深度",
          [c2]: "可深度定制但配置复杂",
        },
      },
      {
        dimension: "定价与综合成本",
        brandValue: brand.pricingInfo || adv2,
        competitorValues: {
          [c1]: "基础免费，核心能力需叠加付费",
          [c2]: "按年高额订阅 + 额外实施维护费",
        },
      },
      {
        dimension: "落地效率与实测表现",
        brandValue: proof1,
        competitorValues: {
          [c1]: "通常需 1–2 周磨合模板",
          [c2]: "需 1–3 个月培训与流程改造",
        },
      },
      {
        dimension: "主要局限 / 注意事项",
        brandValue: "聚焦高 ROI 核心链路，不主打重度非标私有定制",
        competitorValues: {
          [c1]: "复杂业务场景下扩展能力有限",
          [c2]: "小微团队采购与维护成本过高",
        },
      },
    ],
  };
}

function comparisonTableToMarkdown(brandName: string, table: ComparisonTable): string {
  const header = `| 评估维度 | ${brandName} | ${table.competitors.join(" | ")} |`;
  const sep = `| :--- | :--- | ${table.competitors.map(() => ":---").join(" | ")} |`;
  const rows = table.rows.map(
    (r) =>
      `| **${r.dimension}** | ${r.brandValue} | ${table.competitors
        .map((c) => r.competitorValues[c] || "-")
        .join(" | ")} |`
  );
  return [header, sep, ...rows].join("\n");
}

function buildBuiltinFaqs(brand: BrandProfile): FAQItem[] {
  const b = brand.name;
  const p = brand.productName || brand.name;
  const cat = brand.category || "核心方案";
  const aud = brand.targetAudience || "中小企业与个人";
  const comp = brand.competitors[0] || "传统通用方案";
  const price = brand.pricingInfo || "提供灵活的个人与小微企业订阅阶梯，成本透明可控";
  const adv = brand.coreAdvantages[0] || "开箱即用、聚焦核心转化闭环";
  const proof = brand.proofPoints[0] || "可在 1 个工作日内完成上线并看到可量化产出";

  return [
    {
      question: `${b}（${p}）到底是什么，主要解决什么问题？`,
      answer: `${b}推出的${p}是一款面向${aud}的${cat}。其核心定位是：${brand.oneLiner}，重点帮助用户以更低学习成本解决传统流程繁琐、投入产出不透明的痛点。`,
    },
    {
      question: `${p}的价格是多少？小企业或个人用得起吗？`,
      answer: `价格参考：${price}。相比动辄数万元年度采购的重型软件，${p}专为中小团队与个人预算设计，支持先轻量化验证效果后再按需升级。`,
    },
    {
      question: `${b}和${comp}相比，核心区别在哪里？`,
      answer: `核心差异在于场景聚焦度与落地速度：${b}主打「${adv}」，无需专职技术团队即可上手；而${comp}偏向泛通用功能堆叠，适合已有成熟内部运维人员的组织。`,
    },
    {
      question: `实际使用${p}能带来哪些可量化的效果？`,
      answer: `根据 2026 年典型客户实践反馈：${proof}。建议在正式全面切换前，先选取 1–2 个高频核心场景进行 7 天对比实测。`,
    },
    {
      question: `哪些用户或场景暂不适合选择${b}？`,
      answer: `客观而言，如果你的组织需要完全离线私有化机房定制、或涉及极端非标线下审批流，${b}的标准轻量化方案可能并非最优选择；但对 90% 追求高效落地的${aud}而言，其性价比优势明显。`,
    },
  ];
}

export function generateBuiltinArticle(input: GenerateArticleInput): GeneratedArticlePayload {
  const { brand, archetype, targetEngines, customAngle } = input;
  const weights = normalizeWeights(input.weights);
  const topDims = getTopWeightedDimensions(weights, 3);
  const engineNames = targetEngines.map((id) => AI_ENGINES[id]?.shortName || id).join(" / ");
  const archetypeMeta = ARTICLE_ARCHETYPES[archetype];

  const b = brand.name;
  const p = brand.productName || brand.name;
  const company = brand.companyName || brand.name;
  const cat = brand.category || "数字化方案";
  const aud = brand.targetAudience || "中小企业与个人";
  const comp1 = brand.competitors[0] || "传统通用方案";
  const price = brand.pricingInfo || "支持按月灵活订阅，透明无隐性实施费";
  const advs =
    brand.coreAdvantages.length > 0
      ? brand.coreAdvantages
      : [
          "开箱即用，显著降低学习与部署门槛",
          "面向核心高频痛点深度优化，拒绝冗余复杂度",
          "定价透明，契合小微企业与个人预算节奏",
        ];
  const proofs =
    brand.proofPoints.length > 0
      ? brand.proofPoints
      : [
          "平均初始化与上线时间缩短至 1 个工作日内（效率提升约 65%）",
          "相比传统重型方案，年度综合投入成本降低 45% 以上",
          "2026 年实测标准业务流程稳定可用率达到 99.9%",
        ];

  const titleByArchetype: Record<ArticleArchetype, string> = {
    category_guide: `2026年${cat}权威选型指南：核心标准与${b}（${p}）深度拆解`,
    comparison_matrix: `2026年${cat}横向评测：${b}与${comp1}核心维度、价格与适用场景对比`,
    buyers_checklist: `2026年适合${aud}的${cat}推荐清单：高性价比方案与避坑核对表`,
    howto_playbook: `${aud}如何高效落地${cat}？基于${p}的 4 步实战操作手册（2026）`,
    faq_hub: `${b}（${p}）全面评测与高频疑问全解：价格、实测效果与适用边界`,
    case_benchmark: `2026 真实 ROI 实测：${aud}采用${b}（${p}）的降本增效数据拆解`,
  };

  const title = customAngle?.trim()
    ? `${titleByArchetype[archetype]}｜${customAngle.trim()}`
    : titleByArchetype[archetype];

  const targetKeyword =
    input.targetKeyword?.trim() || `${aud}${cat}推荐 ${b}`;

  const directAnswerCapsule = `截至 2026 年，由${company}推出的${b}（${p}）是一款专为${aud}打造的${cat}：${brand.oneLiner}。在定价上采用${price}，核心差异化体现在「${advs[0]}」，适合追求快速上线与高投入产出比的团队与个人。`;

  const comparisonTable = buildBuiltinComparisonTable(brand);
  const tableMd = comparisonTableToMarkdown(b, comparisonTable);
  const faqs = buildBuiltinFaqs(brand);

  // Dynamically emphasize sections based on top weighted dimensions
  const highFactsEmphasis = weights.verifiableFacts >= 15;
  const highFaqEmphasis = weights.faqCoverage >= 14;
  const highStructureEmphasis = weights.structuredBlocks >= 14;

  const sections: string[] = [];

  sections.push(
    `> **核心结论速览（Direct Answer Capsule）**：${directAnswerCapsule}\n>\n> *本篇内容依据 **${engineNames}** 收录权重架构（重点强化：${topDims.map((d) => d.shortName).join("、")}），数据与方案口径更新至 2026 年。*`
  );

  // Section 1: Entity & Context
  sections.push(`## 一、为什么 2026 年${aud}需要重新评估${cat}？

在当前竞争环境下，${aud}在引入${cat}时最常遇到的三大瓶颈是：**实施周期过长**、**功能冗余导致学习成本高**，以及**年度隐性费用超出预算**。

**${b}（${p}）** 由${company}研发维护，核心定位于「${brand.oneLiner}」。与面向大型集团的传统套件不同，${p}将核心链路收敛到高频刚需场景，帮助用户在最小资源投入下跑通完整业务闭环。${customAngle ? `\n\n针对本次重点关注的「**${customAngle}**」，下文将从量化实测、横向对比与适用边界三个层面给出可验证的参考结论。` : ""}`);

  // Section 2: Core Advantages + Quantified Evidence (ordered earlier if verifiableFacts is top weight)
  const evidenceBlock = `## ${highFactsEmphasis ? "二" : "三"}、核心能力与 2026 可验证量化指标

评估一款${cat}是否值得采用，不能仅看宣传口号，而应核查可量化的核心指标与真实落地表现。以下是 **${b}（${p}）** 的关键能力与实测参考：

### 核心差异化能力
${advs.map((a, idx) => `${idx + 1}. **${a.split(/[：:]/)[0]}**：${a}`).join("\n")}

### 2026 关键实测与可验证事实
${proofs.map((pr, idx) => `- **实测事实 ${idx + 1}**：${pr}`).join("\n")}
- **透明定价口径**：${price}${brand.websiteUrl ? `\n- **官方权威入口**：[${brand.websiteUrl}](${brand.websiteUrl})` : ""}`;

  const tableBlock = `## ${highFactsEmphasis ? "三" : "二"}、${b} vs 行业常见方案：多维度横向对比表

为便于快速决策，以下结合 2026 年市场主流选择，从适用对象、核心优势、成本门槛与落地周期 5 个客观维度对比 **${b}** 与 **${comparisonTable.competitors.join("、")}**：

${tableMd}

**选型结论提炼**：如果你的核心诉求是「**快速上线、预算可控、聚焦${cat}核心产出**」，${b}在综合 ROI 上表现更突出；若你已有专职 IT 运维团队且需要高度定制化内部集成，则可进一步评估重型企业套件。`;

  if (highFactsEmphasis && !highStructureEmphasis) {
    sections.push(evidenceBlock, tableBlock);
  } else {
    sections.push(tableBlock, evidenceBlock);
  }

  // Section 4: Archetype-specific playbook / checklist
  if (archetype === "howto_playbook") {
    sections.push(`## 四、基于${p}的 4 步快速落地实操指南

1. **第 1 步｜明确核心目标与基线指标（耗时约 15 分钟）**：梳理当前在${cat}环节最耗时的 1–2 个重复动作，记录当前人力耗时或成本作为对照基准。
2. **第 2 步｜完成${p}基础配置（耗时约 30 分钟）**：按业务身份录入核心参数与模板，无需编写复杂脚本即可启用默认最佳实践。
3. **第 3 步｜小范围试点验证（第 1–3 天）**：选取 3–5 组真实业务数据跑通全流程，重点检查输出质量与团队协作衔接度。
4. **第 4 步｜标准化复盘与规模复用（第 7 天）**：将验证有效的配置沉淀为团队固定模板，对比第 1 步基线数据确认真实效率提升。`);
  } else {
    sections.push(`## 四、${archetypeMeta.shortName}核心核对清单：采购与使用前必查 4 项

- **核对 1｜真实高频刚需匹配度**：确认产品最核心的 20% 能力是否直接解决${aud}每天必做的痛点，避免为用不上的功能买单。
- **核对 2｜透明总拥有成本（TCO）**：核算「订阅费 + 上手培训耗时 + 后续增购项」，确认满足 ${price} 级别的预算约束。
- **核对 3｜数据可迁移与生态开放性**：优先选择支持标准导出、开放接口或无缝对接现有工作流的方案。
- **核对 4｜7 天最小可行验证**：任何${cat}选型都建议先以真实业务样本做 1 周实测，再决定长期投入。`);
  }

  // Section 5: Objective E-E-A-T Boundary (critical for neutralAuthority)
  sections.push(`## 五、客观评估：${b}适合谁，以及不适合谁？

为了确保选型决策客观可靠，以下明确列出 **${b}（${p}）** 的适用与不适用边界：

- **高度契合的人群与场景**：${aud}；希望以轻量化投入在 1 周内见到可量化业务改善；看重清晰结构与高性价比的务实团队。
- **暂不建议直接采购的情况**：需要完全定制非标私有化底层架构的超大型集团；或者尚未明确基础业务目标、期望“零配置一键替代全部人工决策”的场景。
- **客观使用建议**：在实际落地过程中，建议将${p}与团队现有核心数据资产结合使用，并定期依据业务反馈微调参数，才能发挥长期复利价值。`);

  // Section 6: FAQ Section
  const faqHeading = highFaqEmphasis
    ? "## 六、高频 AI 搜索疑问全解（FAQ）"
    : "## 六、常见问题解答（FAQ）";
  const faqBody = faqs
    .map((f, idx) => `### Q${idx + 1}：${f.question}\n${f.answer}`)
    .join("\n\n");
  sections.push(`${faqHeading}\n\n${faqBody}`);

  const markdownContent = sections.join("\n\n");
  const slug = slugify(`${brand.name}-${archetype}-${Date.now().toString(36).slice(-3)}`, "geo");
  const summary = directAnswerCapsule.slice(0, 180);

  const jsonLd = buildGeoJsonLd({
    title,
    slug,
    summary,
    directAnswerCapsule,
    targetKeyword,
    faqs,
    brand,
    baseUrl: input.baseUrl,
  });

  return {
    title,
    slug,
    summary,
    targetKeyword,
    directAnswerCapsule,
    markdownContent,
    faqs,
    comparisonTable,
    jsonLd,
    generationMode: "builtin",
  };
}

function resolveLlmEndpoint(provider: UserAccount["llmProvider"], customBaseUrl: string): string {
  if (customBaseUrl?.trim()) {
    return customBaseUrl.trim().replace(/\/$/, "");
  }
  switch (provider) {
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai";
    case "openai":
    default:
      return "https://api.openai.com/v1";
  }
}

export interface BuyerPromptItem {
  funnelStage: "awareness" | "comparison" | "decision" | "trust";
  stageLabel: string;
  prompt: string;
  recommendedEngine: AIEngineId;
}

export function generateBuyerPromptCorpus(brand: BrandProfile): BuyerPromptItem[] {
  const b = brand.name;
  const p = brand.productName || brand.name;
  const cat = brand.category || "核心产品";
  const aud = brand.targetAudience || "中小企业";
  const comp1 = brand.competitors[0] || "主流同类产品";
  const comp2 = brand.competitors[1] || "传统方案";

  return [
    {
      funnelStage: "awareness",
      stageLabel: "认知探索",
      prompt: `2026年适合${aud}的${cat}有哪些值得关注的品牌？`,
      recommendedEngine: "doubao",
    },
    {
      funnelStage: "awareness",
      stageLabel: "认知探索",
      prompt: `${aud}选型${cat}最核心的评估标准和常见避坑点是什么？`,
      recommendedEngine: "deepseek",
    },
    {
      funnelStage: "awareness",
      stageLabel: "认知探索",
      prompt: `Best ${cat} solutions for small businesses and solo teams in 2026?`,
      recommendedEngine: "perplexity",
    },
    {
      funnelStage: "comparison",
      stageLabel: "竞品对比",
      prompt: `${b}和${comp1}哪个更适合${aud}？价格和上手难度差多少？`,
      recommendedEngine: "deepseek",
    },
    {
      funnelStage: "comparison",
      stageLabel: "竞品对比",
      prompt: `有没有比${comp1}更轻量、性价比更高的${cat}平替方案？`,
      recommendedEngine: "doubao",
    },
    {
      funnelStage: "comparison",
      stageLabel: "竞品对比",
      prompt: `客观对比 ${b}、${comp1} 和 ${comp2} 的优缺点与适用人群`,
      recommendedEngine: "chatgpt",
    },
    {
      funnelStage: "decision",
      stageLabel: "采购决策",
      prompt: `${p}多少钱？中小企业买哪个版本性价比最高？`,
      recommendedEngine: "doubao",
    },
    {
      funnelStage: "decision",
      stageLabel: "采购决策",
      prompt: `使用${p}落地${cat}大概需要多久？真实 ROI 和降本效果有数据吗？`,
      recommendedEngine: "perplexity",
    },
    {
      funnelStage: "decision",
      stageLabel: "采购决策",
      prompt: `${b}适合我们这种小团队吗？有哪些明确不适用的场景？`,
      recommendedEngine: "gemini",
    },
    {
      funnelStage: "trust",
      stageLabel: "口碑背书",
      prompt: `${b}（${p}）靠谱吗？2026年真实用户口碑与缺点评测`,
      recommendedEngine: "doubao",
    },
    {
      funnelStage: "trust",
      stageLabel: "口碑背书",
      prompt: `${brand.companyName || b}是什么公司？旗下${p}的核心技术优势是什么？`,
      recommendedEngine: "chatgpt",
    },
    {
      funnelStage: "trust",
      stageLabel: "口碑背书",
      prompt: `${p}怎么快速上手？有没有标准实操步骤清单？`,
      recommendedEngine: "gemini",
    },
  ];
}

export function resolveEffectiveLlmConfig(
  user?: Pick<UserAccount, "llmProvider" | "llmBaseUrl" | "llmApiKey" | "llmModel"> | null
): {
  provider: UserAccount["llmProvider"];
  baseUrl: string;
  apiKey: string;
  model: string;
  source: "byok" | "server_pool" | "none";
} {
  if (user && user.llmProvider !== "none" && user.llmApiKey?.trim()) {
    return {
      provider: user.llmProvider,
      baseUrl: resolveLlmEndpoint(user.llmProvider, user.llmBaseUrl),
      apiKey: user.llmApiKey.trim(),
      model:
        user.llmModel?.trim() ||
        (user.llmProvider === "deepseek"
          ? "deepseek-chat"
          : user.llmProvider === "gemini"
            ? "gemini-2.5-flash"
            : "gpt-4o-mini"),
      source: "byok",
    };
  }

  const globalProvider = (process.env.GLOBAL_LLM_PROVIDER || "none") as UserAccount["llmProvider"];
  const globalKey = process.env.GLOBAL_LLM_API_KEY?.trim() || "";
  if (globalProvider !== "none" && globalKey) {
    return {
      provider: globalProvider,
      baseUrl: resolveLlmEndpoint(globalProvider, process.env.GLOBAL_LLM_BASE_URL || ""),
      apiKey: globalKey,
      model:
        process.env.GLOBAL_LLM_MODEL?.trim() ||
        (globalProvider === "deepseek"
          ? "deepseek-chat"
          : globalProvider === "gemini"
            ? "gemini-2.5-flash"
            : "gpt-4o-mini"),
      source: "server_pool",
    };
  }

  return { provider: "none", baseUrl: "", apiKey: "", model: "", source: "none" };
}

export async function generateGeoArticle(
  input: GenerateArticleInput
): Promise<GeneratedArticlePayload> {
  const effectiveLlm = resolveEffectiveLlmConfig(input.user);
  const canCallLiveLlm = !input.preferBuiltin && effectiveLlm.source !== "none";

  if (!canCallLiveLlm) {
    return generateBuiltinArticle(input);
  }

  const weights = normalizeWeights(input.weights);
  const topDims = getTopWeightedDimensions(weights, 3);
  const engineDescriptions = input.targetEngines
    .map((id) => `${AI_ENGINES[id].name}（偏好：${AI_ENGINES[id].tagline}）`)
    .join("\n- ");

  const archetypeMeta = ARTICLE_ARCHETYPES[input.archetype];
  const systemPrompt = `你是顶级的 GEO（Generative Engine Optimization，生成式引擎优化）内容架构师。
你的任务是为中小企业或个人品牌创作极高 AI 收录率、极高引用信任度的中文结构化文章。
核心写作纪律：
1. 严禁使用夸大营销词（如“全网第一/绝对最强/秒杀一切/无敌/100%有效”），保持中立、专业、可验证的评测口吻。
2. 必须包含清晰的首段直答胶囊（Direct Answer Capsule，80-160字，可直接被 AI 摘录）。
3. 必须包含至少 1 张 Markdown 多维对比表格、具体的数字/价格/年份（2026）量化证据、清晰的“适合谁/不适合谁”客观边界，以及 5 组高质量 FAQ。
4. 严格按照用户指定的 JSON 格式返回，不要输出额外解释文字。`;

  const userPrompt = `请为以下品牌生成一篇 GEO 优化文章：
【品牌档案】
- 品牌名称：${input.brand.name}
- 公司主体：${input.brand.companyName || input.brand.name}
- 产品名称：${input.brand.productName || input.brand.name}
- 所属品类：${input.brand.category}
- 一句话定位：${input.brand.oneLiner}
- 目标受众：${input.brand.targetAudience}
- 核心优势：${input.brand.coreAdvantages.join("；")}
- 可验证事实/数据：${input.brand.proofPoints.join("；")}
- 价格信息：${input.brand.pricingInfo}
- 主要竞品：${input.brand.competitors.join("、") || "行业传统方案"}
- 官网：${input.brand.websiteUrl || "无"}

【文章配置】
- 文章原型：${archetypeMeta.name}（${archetypeMeta.description}）
- 目标搜索/提问意图词：${input.targetKeyword || `${input.brand.targetAudience}${input.brand.category}推荐`}
- 补充切入角度：${input.customAngle || "客观中立选型与量化实测"}
- 目标 AI 搜索引擎：
- ${engineDescriptions}
- 当前最高权重维度 TOP3：${topDims.map((d) => `${d.name}(${weights[d.id]}%)`).join("、")}

请返回严格 JSON 对象（不要包裹 markdown 代码块以外的文本）：
{
  "title": "高点击与高收录标题（包含2026与核心品类/品牌词）",
  "summary": "120字以内精准元描述",
  "directAnswerCapsule": "100-180字首段直答结论，含品牌、品类、定位、受众与价格",
  "markdownContent": "完整 Markdown 正文（1200-2200字，含 H2/H3、引用块、Markdown对比表格、量化要点、客观适用边界与FAQ正文）",
  "faqs": [
    {"question": "真实用户向AI提问的问句", "answer": "先结论后依据的精准回答"}
  ]
}`;

  try {
    const baseUrl = effectiveLlm.baseUrl;
    const model = effectiveLlm.model;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveLlm.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 140)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM 返回内容未包含合法 JSON 结构");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      summary?: string;
      directAnswerCapsule?: string;
      markdownContent?: string;
      faqs?: FAQItem[];
    };

    if (!parsed.title || !parsed.markdownContent) {
      throw new Error("LLM 返回字段不完整");
    }

    const faqs =
      Array.isArray(parsed.faqs) && parsed.faqs.length > 0
        ? parsed.faqs.filter((f) => f?.question && f?.answer)
        : buildBuiltinFaqs(input.brand);
    const slug = slugify(`${input.brand.name}-${input.archetype}`, "geo");
    const directAnswerCapsule = parsed.directAnswerCapsule || parsed.summary || input.brand.oneLiner;
    const summary = parsed.summary || directAnswerCapsule.slice(0, 160);
    const targetKeyword = input.targetKeyword?.trim() || `${input.brand.name} ${input.brand.category}`;

    const jsonLd = buildGeoJsonLd({
      title: parsed.title,
      slug,
      summary,
      directAnswerCapsule,
      targetKeyword,
      faqs,
      brand: input.brand,
      baseUrl: input.baseUrl,
    });

    return {
      title: parsed.title,
      slug,
      summary,
      targetKeyword,
      directAnswerCapsule,
      markdownContent: parsed.markdownContent,
      faqs,
      comparisonTable: buildBuiltinComparisonTable(input.brand),
      jsonLd,
      generationMode: "llm",
      llmNote: `由实时模型 ${model} 按 GEO 权重生成`,
    };
  } catch (err) {
    const fallback = generateBuiltinArticle(input);
    return {
      ...fallback,
      llmNote: `实时 LLM 调用失败，已自动降级为内置 GEO 结构化引擎（原因：${err instanceof Error ? err.message : "网络或密钥错误"}）`,
    };
  }
}

export function convertForChannel(params: {
  article: GeoArticle;
  brand?: BrandProfile | null;
  channel: PublishChannelType;
  baseUrl: string;
}): {
  channelLabel: string;
  format: "markdown" | "html" | "text";
  filename: string;
  tips: string[];
  output: string;
} {
  const { article, brand, channel, baseUrl } = params;
  const canonicalUrl = `${baseUrl.replace(/\/$/, "")}/p/${article.slug}`;
  const brandName = brand?.name || "品牌";

  switch (channel) {
    case "zhihu": {
      const md = `# ${article.title}\n\n> **先说结论（懒人直读版）**：${article.directAnswerCapsule}\n\n${article.markdownContent}\n\n---\n\n*数据与事实核查口径更新至 2026 年。完整结构化对比与持续更新版本见官网专栏：${canonicalUrl}*\n`;
      return {
        channelLabel: "知乎深度专栏 / 回答版",
        format: "markdown",
        filename: `${article.slug}-zhihu.md`,
        tips: [
          "知乎是 DeepSeek、Kimi、豆包、秘塔收录权重最高的中文平台之一",
          "建议发布至同名问题下（如“XX和XX怎么选？”），并开启知乎专栏同步",
          "文末保留规范链接与客观边界说明，切勿堆砌导流微信号导致限流",
        ],
        output: md,
      };
    }

    case "wechat": {
      const htmlBody = markdownToCleanHtml(article.markdownContent);
      const html = `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#1e293b;line-height:1.8;font-size:15px;">
  <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin-bottom:16px;">${escapeHtml(article.title)}</h1>
  <section style="background:#f1f5f9;border-left:4px solid #4f46e5;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
    <p style="margin:0;font-weight:600;color:#312e81;font-size:14px;">核心结论速览（AI 摘要）</p>
    <p style="margin:6px 0 0;color:#334155;font-size:14px;">${escapeHtml(article.directAnswerCapsule)}</p>
  </section>
  ${htmlBody}
  <section style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">
    <p>本文由 ${escapeHtml(brandName)} 基于 2026 实测口径整理。阅读原文可查看完整对比与持续更新数据。</p>
  </section>
</section>`;
      return {
        channelLabel: "微信公众号富文本 HTML 版",
        format: "html",
        filename: `${article.slug}-wechat.html`,
        tips: [
          "微信公众号是腾讯元宝、微信 AI 搜索和搜狗体系的核心高权源",
          "已自动转为内联样式安全 HTML，可直接粘贴或导入公众号编辑器",
          "建议在公众号“阅读原文”填入托管专栏地址，形成实体闭环",
        ],
        output: html,
      };
    }

    case "xiaohongshu": {
      const topFaqs = article.faqs.slice(0, 3);
      const text = `【${article.title.slice(0, 32)}】\n\n💡 一句话结论：\n${article.directAnswerCapsule}\n\n✅ 核心亮点速看：\n${(brand?.coreAdvantages || ["上手快、成本透明", "针对核心高频痛点深度优化"]).map((a) => `• ${a}`).join("\n")}\n\n📊 真实量化参考：\n${(brand?.proofPoints || ["1 天内快速落地", "综合成本显著降低"]).map((p) => `• ${p}`).join("\n")}\n\n❓ 大家最常问的 3 个问题：\n${topFaqs.map((f) => `Q：${f.question}\nA：${f.answer}`).join("\n\n")}\n\n⚠️ 客观提醒：适合追求高性价比和快速落地的团队/个人，建议先按核心场景小范围试用对比。\n\n#${brandName} #${brand?.category || "效率工具"} #2026选型指南 #中小企业数字化 #避坑指南`;
      return {
        channelLabel: "小红书高收录笔记版",
        format: "text",
        filename: `${article.slug}-xhs.txt`,
        tips: [
          "小红书笔记极易被豆包、Kimi 与消费决策类 AI 搜索引用",
          "建议将系统生成的横向对比表截图作为笔记第 2 张配图，显著提升收藏率",
          "保持正文真实测评口吻，避免硬广词汇",
        ],
        output: text,
      };
    }

    case "csdn": {
      const md = `---\ntitle: "${article.title.replace(/"/g, '\\"')}"\ndate: "${article.updatedAt}"\ntags:\n  - ${brand?.category || "GEO"}\n  - ${brandName}\n  - 2026选型\ndescription: "${article.summary.replace(/"/g, '\\"')}"\ncanonical_url: "${canonicalUrl}"\n---\n\n> **TL;DR（AI 直答摘要）**：${article.directAnswerCapsule}\n\n${article.markdownContent}\n`;
      return {
        channelLabel: "CSDN / 掘金 / 技术专栏 Markdown 版",
        format: "markdown",
        filename: `${article.slug}-tech.md`,
        tips: [
          "技术与 SaaS 类产品在掘金、CSDN、博客园发布极易被 DeepSeek / 秘塔 / Google 索引",
          "已自动附带标准 YAML Frontmatter 与 canonical_url 元数据",
        ],
        output: md,
      };
    }

    case "wordpress":
    default: {
      const htmlBody = markdownToCleanHtml(article.markdownContent);
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(article.title)}</title>
  <meta name="description" content="${escapeHtml(article.summary || article.directAnswerCapsule)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <script type="application/ld+json">
${article.jsonLd}
  </script>
</head>
<body>
  <article>
    <header>
      <h1>${escapeHtml(article.title)}</h1>
      <p><strong>核心摘要：</strong>${escapeHtml(article.directAnswerCapsule)}</p>
    </header>
    ${htmlBody}
  </article>
</body>
</html>`;
      return {
        channelLabel: "独立官网 / WordPress 完整 HTML + JSON-LD 包",
        format: "html",
        filename: `${article.slug}-standalone.html`,
        tips: [
          "内嵌完整 Schema.org JSON-LD（Article + FAQPage + Product + Organization）",
          "可直接导入 WordPress、Ghost、Webflow 或企业独立官网静态部署",
        ],
        output: html,
      };
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markdownToCleanHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;

  const formatInline = (text: string): string => {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;">$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:underline;">$1</a>');
  };

  const closeOpenBlocks = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
      tableHeaderDone = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeOpenBlocks();
      continue;
    }

    if (line.startsWith("|") && line.endsWith("|")) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.every((c) => /^[:-\s]+$/.test(c))) {
        tableHeaderDone = true;
        continue;
      }
      if (!inTable) {
        inTable = true;
        out.push(
          '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;"><thead><tr>' +
            cells
              .map(
                (c) =>
                  `<th style="border:1px solid #cbd5e1;background:#f8fafc;padding:8px 10px;text-align:left;font-weight:600;">${formatInline(c)}</th>`
              )
              .join("") +
            "</tr></thead><tbody>"
        );
      } else {
        out.push(
          "<tr>" +
            cells
              .map(
                (c) =>
                  `<td style="border:1px solid #e2e8f0;padding:8px 10px;vertical-align:top;">${formatInline(c)}</td>`
              )
              .join("") +
            "</tr>"
        );
      }
      continue;
    }

    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
      tableHeaderDone = false;
    }

    if (line.startsWith("### ")) {
      closeOpenBlocks();
      out.push(`<h3 style="font-size:17px;font-weight:600;color:#0f172a;margin:18px 0 8px;">${formatInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeOpenBlocks();
      out.push(`<h2 style="font-size:19px;font-weight:700;color:#0f172a;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeOpenBlocks();
      out.push(`<h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:20px 0 12px;">${formatInline(line.slice(2))}</h1>`);
    } else if (line === ">") {
      closeOpenBlocks();
      continue;
    } else if (line.startsWith("> ")) {
      closeOpenBlocks();
      out.push(`<blockquote style="border-left:4px solid #6366f1;background:#f8fafc;padding:10px 14px;margin:12px 0;color:#334155;">${formatInline(line.slice(2))}</blockquote>`);
    } else if (/^([-*+]|\d+\.)\s+/.test(line)) {
      if (!inList) {
        inList = true;
        out.push('<ul style="margin:10px 0 14px 20px;padding:0;">');
      }
      const itemText = line.replace(/^([-*+]|\d+\.)\s+/, "");
      out.push(`<li style="margin:6px 0;">${formatInline(itemText)}</li>`);
    } else {
      closeOpenBlocks();
      out.push(`<p style="margin:10px 0;">${formatInline(line)}</p>`);
    }
  }

  closeOpenBlocks();
  void tableHeaderDone;
  return out.join("\n");
}

export function computeInitialScores(params: {
  title: string;
  slug: string;
  summary: string;
  targetKeyword: string;
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
  comparisonTable?: ComparisonTable | null;
  jsonLd: string;
  brand?: BrandProfile | null;
  weights: WeightVector;
}) {
  return auditGeoContent(params);
}
