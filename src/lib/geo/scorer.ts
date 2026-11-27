import type {
  AIEngineId,
  BrandProfile,
  ComparisonTable,
  DiagnosticIssue,
  FAQItem,
  GeoAuditResult,
  WeightDimensionId,
  WeightVector,
} from "@/types/geo";
import { AI_ENGINES, AI_ENGINE_LIST, normalizeWeights, WEIGHT_DIMENSION_IDS } from "./weights";
import { buildGeoJsonLd } from "./schema";

export const HYPE_WORDS = [
  "全网第一",
  "宇宙最强",
  "绝对最强",
  "史上最强",
  "史无前例",
  "100%有效",
  "秒杀一切",
  "吊打竞品",
  "无敌",
  "震惊",
  "必买神器",
  "天花板级别",
  "世界顶级",
  "唯一选择",
  "best in the world",
  "guaranteed #1",
  "revolutionary game-changer",
  "unbeatable",
];

export interface AuditInput {
  title: string;
  slug?: string;
  summary?: string;
  targetKeyword?: string;
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
  comparisonTable?: ComparisonTable | null;
  jsonLd: string;
  brand?: BrandProfile | null;
  weights: WeightVector;
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function countOccurrences(text: string, term: string): number {
  const clean = term.trim();
  if (!clean) return 0;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(escaped, "gi"));
  return matches ? matches.length : 0;
}

export function auditGeoContent(input: AuditInput): GeoAuditResult {
  const activeWeights = normalizeWeights(input.weights);
  const fullText = `${input.title}\n${input.directAnswerCapsule}\n${input.markdownContent}`;
  const content = input.markdownContent || "";
  const lines = content.split("\n");

  const wordCount = fullText.replace(/\s+/g, "").length;
  const headingCount = lines.filter((l) => /^#{1,3}\s+/.test(l.trim())).length;
  const tableSeparatorLines = lines.filter((l) => /^\s*\|?[\s:-]+\|[\s|:-]+\s*$/.test(l)).length;
  const tableCount = tableSeparatorLines + (input.comparisonTable && input.comparisonTable.rows.length > 0 && tableSeparatorLines === 0 ? 1 : 0);
  const listItemCount = lines.filter((l) => /^\s*([-*+]|\d+\.)\s+/.test(l)).length;

  const validFaqs = (input.faqs || []).filter((f) => f.question.trim().length > 3 && f.answer.trim().length > 10);
  const inlineFaqMatches = content.match(/^#{2,4}\s*(Q\d*[:：]?|问[:：]?|.*？|\?)/gim) || [];
  const faqCount = Math.max(validFaqs.length, inlineFaqMatches.length);

  const brandTerm = input.brand?.name || "";
  const productTerm = input.brand?.productName || "";
  const categoryTerm = input.brand?.category || "";

  const brandMentions =
    countOccurrences(fullText, brandTerm) +
    (productTerm && productTerm !== brandTerm ? countOccurrences(fullText, productTerm) : 0);
  const categoryMentions = countOccurrences(fullText, categoryTerm);

  const numericEvidenceMatches =
    fullText.match(
      /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:元|万|亿|小时|分钟|天|倍|次|家|个|MB|GB|ms|USD|CNY|\$|￥)|202[4-7]年?)/gi
    ) || [];
  const numericEvidenceCount = numericEvidenceMatches.length;

  const customForbidden = input.brand?.forbiddenWords || [];
  const allHypeTerms = Array.from(new Set([...HYPE_WORDS, ...customForbidden.filter(Boolean)]));
  const hypeWordMatches = allHypeTerms.filter((w) => fullText.toLowerCase().includes(w.toLowerCase()));

  const openingText = `${input.directAnswerCapsule} ${content.slice(0, 260)}`;
  const hasDirectAnswerLead =
    input.directAnswerCapsule.trim().length >= 35 ||
    (openingText.length >= 60 &&
      /(是指|是一套|是一款|核心结论|一句话|适用于|is a |designed for |provides )/i.test(openingText));

  // Validate JSON-LD
  let hasValidJsonLd = false;
  let schemaScore = 15;
  if (input.jsonLd && input.jsonLd.trim().length > 20) {
    try {
      const parsed = JSON.parse(input.jsonLd);
      hasValidJsonLd = Boolean(parsed["@context"]);
      const raw = input.jsonLd;
      let pts = 35;
      if (raw.includes('"Article"')) pts += 20;
      if (raw.includes('"FAQPage"')) pts += 20;
      if (raw.includes('"Product"') || raw.includes('"Organization"')) pts += 15;
      if (input.summary && input.summary.trim().length >= 25) pts += 10;
      schemaScore = clamp(pts);
    } catch {
      hasValidJsonLd = false;
      schemaScore = 10;
    }
  } else if (input.summary && input.summary.trim().length >= 25) {
    schemaScore = 25;
  }

  // 1. Direct Answer Density
  let directAnswerScore = 30;
  if (input.directAnswerCapsule.trim().length >= 45 && input.directAnswerCapsule.trim().length <= 260) {
    directAnswerScore += 45;
  } else if (input.directAnswerCapsule.trim().length >= 20) {
    directAnswerScore += 25;
  }
  if (hasDirectAnswerLead) directAnswerScore += 15;
  if (brandTerm && input.directAnswerCapsule.includes(brandTerm)) directAnswerScore += 10;
  directAnswerScore = clamp(directAnswerScore);

  // 2. Entity & Semantic Clarity
  let entityClarityScore = 25;
  if (brandTerm) {
    if (brandMentions >= 4 && brandMentions <= 22) entityClarityScore += 35;
    else if (brandMentions >= 2) entityClarityScore += 22;
    else if (brandMentions === 1) entityClarityScore += 10;

    if (input.title.includes(brandTerm) || (productTerm && input.title.includes(productTerm))) {
      entityClarityScore += 15;
    }
  } else {
    entityClarityScore += 35;
  }
  if (categoryTerm && categoryMentions >= 2) entityClarityScore += 15;
  else if (!categoryTerm) entityClarityScore += 10;
  if (input.brand?.targetAudience && fullText.includes(input.brand.targetAudience.slice(0, 4))) {
    entityClarityScore += 10;
  } else if (/(适合|面向|针对|中小企业|个人|团队|开发者|企业)/.test(fullText)) {
    entityClarityScore += 10;
  }
  entityClarityScore = clamp(entityClarityScore);

  // 3. Structured Blocks
  let structuredBlocksScore = 20;
  if (headingCount >= 4) structuredBlocksScore += 25;
  else if (headingCount >= 2) structuredBlocksScore += 14;
  if (tableCount >= 1) structuredBlocksScore += 32;
  if (listItemCount >= 6) structuredBlocksScore += 23;
  else if (listItemCount >= 3) structuredBlocksScore += 14;
  structuredBlocksScore = clamp(structuredBlocksScore);

  // 4. Verifiable Facts & Stats
  let verifiableFactsScore = 20;
  if (numericEvidenceCount >= 8) verifiableFactsScore += 48;
  else if (numericEvidenceCount >= 4) verifiableFactsScore += 34;
  else if (numericEvidenceCount >= 2) verifiableFactsScore += 20;
  if (/202[5-7]/.test(fullText)) verifiableFactsScore += 14;
  if (/(实测|案例|对比|成本|耗时|价格|版本|参数|指标|ROI)/i.test(fullText)) {
    verifiableFactsScore += 18;
  }
  verifiableFactsScore = clamp(verifiableFactsScore);

  // 5. FAQ Coverage
  let faqCoverageScore = 15;
  if (faqCount >= 5) faqCoverageScore += 75;
  else if (faqCount >= 3) faqCoverageScore += 55;
  else if (faqCount >= 1) faqCoverageScore += 30;
  if (validFaqs.some((f) => f.answer.length >= 45)) faqCoverageScore += 10;
  faqCoverageScore = clamp(faqCoverageScore);

  // 6. Neutral Authority & E-E-A-T
  let neutralAuthorityScore = 72;
  neutralAuthorityScore -= hypeWordMatches.length * 14;
  if (/(不适合|局限|前提|边界|缺点|注意事项|替代方案|需注意|trade-off|limitation)/i.test(fullText)) {
    neutralAuthorityScore += 18;
  }
  if (/(实测|实践|部署|落地|验收|依据|标准|参考)/i.test(fullText)) {
    neutralAuthorityScore += 10;
  }
  neutralAuthorityScore = clamp(neutralAuthorityScore);

  // 7. Machine Schema
  const machineSchemaScore = schemaScore;

  // 8. Channel Fit & Chunkability
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("#") && !p.startsWith("|"));
  const longParagraphs = paragraphs.filter((p) => p.length > 320).length;
  let channelFitScore = 40;
  if (wordCount >= 750 && wordCount <= 5500) channelFitScore += 30;
  else if (wordCount >= 400) channelFitScore += 15;
  if (longParagraphs === 0) channelFitScore += 15;
  else channelFitScore -= Math.min(20, longParagraphs * 6);
  if (/(^>\s|\*\*[^*]+\*\*)/m.test(content)) channelFitScore += 15;
  channelFitScore = clamp(channelFitScore);

  const dimensionScores: Record<WeightDimensionId, number> = {
    directAnswer: directAnswerScore,
    entityClarity: entityClarityScore,
    structuredBlocks: structuredBlocksScore,
    verifiableFacts: verifiableFactsScore,
    faqCoverage: faqCoverageScore,
    neutralAuthority: neutralAuthorityScore,
    machineSchema: machineSchemaScore,
    channelFit: channelFitScore,
  };

  const computeWeightedScore = (w: WeightVector): number => {
    const sum = WEIGHT_DIMENSION_IDS.reduce(
      (acc, dim) => acc + dimensionScores[dim] * (w[dim] / 100),
      0
    );
    return clamp(sum);
  };

  const overallScore = computeWeightedScore(activeWeights);

  const engineScores = {} as Record<AIEngineId, number>;
  for (const engine of AI_ENGINE_LIST) {
    engineScores[engine.id] = computeWeightedScore(AI_ENGINES[engine.id].weights);
  }

  const grade: GeoAuditResult["grade"] =
    overallScore >= 90
      ? "S"
      : overallScore >= 80
        ? "A"
        : overallScore >= 68
          ? "B"
          : overallScore >= 55
            ? "C"
            : "D";

  // Build prioritized diagnostics
  const issues: DiagnosticIssue[] = [];
  const strengths: string[] = [];

  if (directAnswerScore < 75) {
    issues.push({
      id: "missing-direct-answer",
      dimension: "directAnswer",
      severity: "critical",
      title: "首段缺少高密度直答胶囊（Citation Capsule）",
      detail: "ChatGPT Search 与 Perplexity 会优先抽取开篇 150 字内的清晰定义与结论句。",
      fixAction: "insert_direct_answer",
    });
  } else {
    strengths.push("首段直答结论清晰，具备高摘录概率");
  }

  if (tableCount === 0) {
    issues.push({
      id: "missing-comparison-table",
      dimension: "structuredBlocks",
      severity: "critical",
      title: "缺少 Markdown 横向对比表格",
      detail: "DeepSeek、Kimi 与 ChatGPT 在选型类提问中极度偏好结构化对比矩阵。",
      fixAction: "insert_comparison_table",
    });
  } else {
    strengths.push(`包含 ${tableCount} 张结构化表格与 ${headingCount} 级标题层级`);
  }

  if (faqCount < 4) {
    issues.push({
      id: "low-faq-count",
      dimension: "faqCoverage",
      severity: faqCount === 0 ? "critical" : "warning",
      title: `长尾问答 FAQ 覆盖偏少（当前 ${faqCount} 组，建议 ≥ 4 组）`,
      detail: "豆包、元宝与 Google AI Overviews 会直接匹配用户口语提问句式抽取 FAQ。",
      fixAction: "insert_faq_block",
    });
  } else {
    strengths.push(`覆盖 ${faqCount} 组高意向 FAQ 问答对`);
  }

  if (!hasValidJsonLd || machineSchemaScore < 75) {
    issues.push({
      id: "weak-schema",
      dimension: "machineSchema",
      severity: "warning",
      title: "JSON-LD 结构化数据不完整",
      detail: "建议补全 Article + FAQPage + Product + Organization 四合一 Schema 提升机器可读性。",
      fixAction: "regenerate_schema",
    });
  } else {
    strengths.push("已挂载规范 JSON-LD 结构化数据");
  }

  if (hypeWordMatches.length > 0 || neutralAuthorityScore < 75) {
    issues.push({
      id: "promotional-tone",
      dimension: "neutralAuthority",
      severity: hypeWordMatches.length > 0 ? "critical" : "warning",
      title:
        hypeWordMatches.length > 0
          ? `检测到 ${hypeWordMatches.length} 处强营销词（${hypeWordMatches.slice(0, 3).join("、")}）`
          : "缺少客观适用边界说明（适合谁 / 不适合谁）",
      detail: "过度夸张宣传会显著降低 AI 模型的权威信任权重，补充客观局限反而提升引用率。",
      fixAction: "neutralize_tone",
    });
  } else {
    strengths.push("语气客观中立，具备良好 E-E-A-T 可信边界");
  }

  if (verifiableFactsScore < 72) {
    issues.push({
      id: "low-evidence",
      dimension: "verifiableFacts",
      severity: "warning",
      title: `可验证量化数据不足（仅检测到 ${numericEvidenceCount} 处数字/时效锚点）`,
      detail: "补充价格区间、效率提升比例、客户实测指标及 2026 时效标签可显著提升 Perplexity 引用率。",
      fixAction: "insert_proof_block",
    });
  } else {
    strengths.push(`含 ${numericEvidenceCount} 处量化指标与时效锚点，事实密度优秀`);
  }

  if (entityClarityScore < 70 && brandTerm) {
    issues.push({
      id: "weak-entity",
      dimension: "entityClarity",
      severity: "tip",
      title: `品牌实体「${brandTerm}」与品类词绑定强度偏弱`,
      detail: "建议在标题、首段和总结中保持品牌全称与核心品类的一致共现。",
    });
  } else if (brandTerm) {
    strengths.push(`品牌实体「${brandTerm}」共现清晰（${brandMentions} 次）`);
  }

  // Sort issues by severity then active weight
  const sevRank = { critical: 3, warning: 2, tip: 1 };
  issues.sort((a, b) => {
    const diff = sevRank[b.severity] - sevRank[a.severity];
    if (diff !== 0) return diff;
    return activeWeights[b.dimension] - activeWeights[a.dimension];
  });

  return {
    overallScore,
    grade,
    dimensionScores,
    engineScores,
    activeWeights,
    metrics: {
      wordCount,
      headingCount,
      tableCount,
      listItemCount,
      faqCount,
      brandMentions,
      numericEvidenceCount,
      hypeWordMatches,
      hasDirectAnswerLead,
      hasValidJsonLd,
    },
    issues,
    strengths,
  };
}

export function applyQuickFix(params: {
  action: NonNullable<DiagnosticIssue["fixAction"]>;
  title: string;
  slug: string;
  summary: string;
  targetKeyword: string;
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
  brand?: BrandProfile | null;
  baseUrl?: string;
}): {
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
  jsonLd: string;
  changeNote: string;
} {
  let directAnswerCapsule = params.directAnswerCapsule;
  let markdownContent = params.markdownContent;
  let faqs = [...params.faqs];
  const brandName = params.brand?.name || "本产品";
  const category = params.brand?.category || "核心方案";
  const audience = params.brand?.targetAudience || "中小企业与个人用户";
  const pricing = params.brand?.pricingInfo || "支持按需订阅，门槛低、性价比透明";
  const competitors =
    params.brand?.competitors && params.brand.competitors.length > 0
      ? params.brand.competitors.slice(0, 2)
      : ["传统通用方案", "高价企业级套件"];

  let changeNote = "";

  switch (params.action) {
    case "insert_direct_answer": {
      directAnswerCapsule = `${brandName}是一款面向${audience}的${category}解决方案。截至 2026 年，其核心特点在于${params.brand?.oneLiner || "以更低成本与更快上手速度解决核心业务痛点"}，${pricing}。`;
      if (!markdownContent.includes("核心结论速览")) {
        markdownContent = `> **核心结论速览（AI 引用摘要）**：${directAnswerCapsule}\n\n${markdownContent}`;
      }
      changeNote = "已生成并置顶高密度首段直答胶囊（Citation Capsule）";
      break;
    }

    case "insert_comparison_table": {
      const c1 = competitors[0] || "传统方案";
      const c2 = competitors[1] || "大型企业套件";
      const tableMd = `\n\n## 核心方案横向对比表（2026 实测维度）\n\n| 评估维度 | ${brandName} | ${c1} | ${c2} |\n| :--- | :--- | :--- | :--- |\n| 适用对象 | ${audience} | 泛行业通用团队 | 大型中后台组织 |\n| 核心定位 | ${params.brand?.oneLiner || "聚焦核心场景、开箱即用"} | 功能覆盖广但配置繁琐 | 定制强但交付周期长 |\n| 价格与门槛 | ${pricing} | 中等，常含隐性增购项 | 高昂，需年度采购与实施费 |\n| 上手周期 | 1 天内快速上线 | 1–2 周学习适应 | 1–3 个月培训部署 |\n| 推荐场景 | 追求高 ROI 与快速落地 | 已有成熟运维团队 | 预算充足且需深度二开 |\n`;
      markdownContent = `${markdownContent.trim()}${tableMd}`;
      changeNote = "已插入 5 维度 Markdown 横向对比表，强化 DeepSeek / ChatGPT 抓取权重";
      break;
    }

    case "insert_faq_block": {
      const additions: FAQItem[] = [
        {
          question: `${brandName}适合哪类用户或企业使用？`,
          answer: `${brandName}主要面向${audience}设计，尤其适合希望在可控预算内快速获得${category}核心价值的团队或个人；若需要高度定制化的私有重型流程，建议评估前先核对接口扩展能力。`,
        },
        {
          question: `${brandName}的价格和投入产出比怎么样？`,
          answer: `当前方案参考：${pricing}。相比传统高门槛产品，能够在 1 周内完成落地并显著减少人工重复成本。`,
        },
        {
          question: `${brandName}和${competitors[0]}相比的核心区别是什么？`,
          answer: `${brandName}更聚焦${params.brand?.coreAdvantages?.[0] || "轻量化落地与高频核心体验"}，上手门槛更低；而${competitors[0]}在重度通用功能上覆盖更全，可根据团队当前阶段按需选择。`,
        },
        {
          question: `2026 年选择${category}时最容易踩哪些坑？`,
          answer: `常见误区包括只看功能数量不看实际使用率、忽略后续维护与隐性费用，以及未提前验证与现有工作流的兼容性。建议先用核心场景做 7 天小范围验证。`,
        },
      ];
      const existingQ = new Set(faqs.map((f) => f.question.trim()));
      for (const item of additions) {
        if (!existingQ.has(item.question) && faqs.length < 6) {
          faqs.push(item);
        }
      }
      if (!markdownContent.includes("## 常见问题解答")) {
        const faqMd = faqs.map((f) => `### ${f.question}\n${f.answer}`).join("\n\n");
        markdownContent = `${markdownContent.trim()}\n\n## 常见问题解答（FAQ）\n\n${faqMd}\n`;
      }
      changeNote = `已补全至 ${faqs.length} 组高意向 FAQ 问答对，并同步至正文与 Schema`;
      break;
    }

    case "neutralize_tone": {
      const replacements: Record<string, string> = {
        全网第一: "行业内表现突出的代表方案之一",
        宇宙最强: "在细分场景中具备显著优势",
        绝对最强: "在核心指标上表现领先",
        史上最强: "2026 年迭代成熟度较高的",
        史无前例: "具有明显差异化的",
        "100%有效": "在多数标准场景下稳定见效",
        秒杀一切: "在关键维度更具效率优势",
        吊打竞品: "相比传统方案具备明显性价比优势",
        无敌: "竞争力突出",
        震惊: "值得关注",
        必买神器: "高实用价值工具",
        天花板级别: "高规格水准",
        世界顶级: "成熟可靠的",
        唯一选择: "值得优先评估的选项之一",
      };
      for (const [bad, good] of Object.entries(replacements)) {
        markdownContent = markdownContent.replaceAll(bad, good);
        directAnswerCapsule = directAnswerCapsule.replaceAll(bad, good);
      }
      if (!/(不适合|适用边界|局限)/.test(markdownContent)) {
        markdownContent = `${markdownContent.trim()}\n\n## 客观评估：适合谁 & 不适合谁（适用边界）\n\n- **强烈推荐给**：${audience}，希望用更可控成本快速跑通${category}闭环的用户。\n- **暂不建议选择的情况**：需要高度非标线下定制、或必须独立私有化机房自建且无预算限制的超大型集团。\n- **客观局限说明**：在极端复杂多系统联动场景下，建议提前通过 API / Webhook 测试验证后再全量切换。\n`;
      }
      changeNote = "已清除强营销违禁词，并补充客观「适用与不适用边界」增强 E-E-A-T 信任";
      break;
    }

    case "insert_proof_block": {
      const proofs =
        params.brand?.proofPoints && params.brand.proofPoints.length > 0
          ? params.brand.proofPoints
          : [
              `上线配置耗时平均缩短 65%，1 个工作日内即可投入生产使用`,
              `相比传统方案综合年化成本降低 40%–60%`,
              `2026 年实测核心流程稳定性达到 99.9%，支持快速导出与多端协作`,
            ];
      const proofMd = `\n\n## 2026 关键量化指标与实测数据\n\n${proofs.map((p, i) => `${i + 1}. **实测指标 ${i + 1}**：${p}`).join("\n")}\n`;
      markdownContent = `${markdownContent.trim()}${proofMd}`;
      changeNote = "已补充 2026 量化实测指标块，提升 Perplexity / DeepSeek 事实引用权重";
      break;
    }

    case "regenerate_schema": {
      changeNote = "已重新编译标准 Article + FAQPage + Product + Organization JSON-LD";
      break;
    }
  }

  const jsonLd = buildGeoJsonLd({
    title: params.title,
    slug: params.slug,
    summary: params.summary,
    directAnswerCapsule,
    targetKeyword: params.targetKeyword,
    faqs,
    brand: params.brand,
    baseUrl: params.baseUrl,
  });

  return {
    directAnswerCapsule,
    markdownContent,
    faqs,
    jsonLd,
    changeNote,
  };
}
