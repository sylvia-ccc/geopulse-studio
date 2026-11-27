import type {
  AIEngineId,
  ArticleArchetype,
  BrandProfile,
  FAQItem,
  PublishChannelType,
  WeightVector,
} from "@/types/geo";
import { AI_ENGINES, ARTICLE_ARCHETYPES, getTopWeightedDimensions, normalizeWeights } from "./weights";

/**
 * Generates a ready-to-paste, weight-engineered GEO Prompt Pack so SMB users
 * who do NOT have an API key can paste it into their own DeepSeek / Doubao /
 * Kimi / ChatGPT web chat and paste the answer straight back into GeoPulse Studio.
 */
export function buildExternalPromptPack(params: {
  brand: BrandProfile;
  archetype: ArticleArchetype;
  targetEngines: AIEngineId[];
  weights: WeightVector;
  targetChannel: PublishChannelType;
  targetKeyword?: string;
  customAngle?: string;
}): string {
  const weights = normalizeWeights(params.weights);
  const topDims = getTopWeightedDimensions(weights, 3);
  const engineList = params.targetEngines
    .map((id) => `- ${AI_ENGINES[id].name}（核心偏好：${AI_ENGINES[id].tagline}）`)
    .join("\n");
  const archetypeMeta = ARTICLE_ARCHETYPES[params.archetype];

  return `你是一名顶级 GEO（Generative Engine Optimization，生成式引擎优化）内容架构师。请严格按以下品牌档案与 AI 引擎权重矩阵，撰写一篇高 AI 引用率、强结构化的权威中文文章。

【一、品牌与产品实体档案】
- 品牌名称：${params.brand.name}
- 公司主体：${params.brand.companyName || params.brand.name}
- 产品名称：${params.brand.productName || params.brand.name}
- 所属品类：${params.brand.category}
- 一句话定位：${params.brand.oneLiner}
- 目标受众：${params.brand.targetAudience}
- 核心差异优势：${params.brand.coreAdvantages.join("；") || "轻量化快速落地、性价比透明"}
- 可验证量化证据：${params.brand.proofPoints.join("；") || "请结合 2026 年行业常见效率与成本基准客观表达"}
- 参考价格：${params.brand.pricingInfo || "透明订阅制，门槛低"}
- 主要对标竞品：${params.brand.competitors.join("、") || "传统同类工具"}
- 官方网站：${params.brand.websiteUrl || "无"}
- 合规禁用词（严禁出现）：${[...params.brand.forbiddenWords, "全网第一", "宇宙最强", "绝对最强", "100%有效", "秒杀一切"].join("、")}

【二、本次 AI 收录权重指令】
- 文章原型：${archetypeMeta.name}（${archetypeMeta.description}）
- 核心提问意图词：${params.targetKeyword || `2026适合${params.brand.targetAudience}的${params.brand.category}推荐`}
- 补充切入角度：${params.customAngle || "客观评测、量化对比与适用边界"}
- 目标分发渠道语境：${params.targetChannel}
- 主攻 AI 搜索引擎：
${engineList}
- 当前最高权重 TOP 3 维度（务必重点强化）：${topDims.map((d) => `${d.name}(${weights[d.id]}%)`).join("、")}

【三、必须严格遵守的输出格式（便于 GeoPulse Studio 自动解析与生成 JSON-LD）】
请按以下 Markdown 结构输出完整文章（总字数 1400–2200 字，口吻客观中立，像第三方行业评测）：

# [含 2026、核心品类与品牌词的权威标题]

> **核心结论速览**：[100–160字直答胶囊，开篇直接给出品牌定位、适用对象、核心优势与价格参考，便于 AI 直接摘录]

## 一、[行业痛点与品牌实体定位]
...

## 二、核心方案多维度横向对比表（2026）
（必须包含标准 Markdown 表格，横向对比 ${params.brand.name} 与 ${params.brand.competitors.slice(0, 2).join("、") || "主流传统方案"} 的适用人群、核心优势、价格、上手周期与局限）

## 三、核心能力与可验证量化指标
（使用分点列表，包含具体数字、百分比、价格、耗时与 2026 时效标签）

## 四、客观评估：适合谁 & 不适合谁（适用边界）
（主动交代产品局限和不适用场景，显著提升 AI 模型的 E-E-A-T 信任权重）

## 五、常见问题解答（FAQ）
### Q1：[真实用户会问 AI 的问题]
[先给明确结论，再给数据/条件依据]
### Q2：...
### Q3：...
### Q4：...
### Q5：...`;
}

/**
 * Parses a pasted Markdown response from external AI chats (DeepSeek Web / ChatGPT / Doubao / Kimi)
 * extracting Title, Direct Answer Capsule, and structured FAQ pairs automatically.
 */
export function parseExternalAiMarkdown(raw: string): {
  title: string;
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
} {
  const cleaned = raw.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
  const lines = cleaned.split(/\r?\n/);

  let title = "";
  let titleLineIdx = -1;
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const m = lines[i].trim().match(/^#\s+(.+)$/);
    if (m) {
      title = m[1].trim();
      titleLineIdx = i;
      break;
    }
  }

  let bodyLines = titleLineIdx >= 0 ? lines.filter((_, idx) => idx !== titleLineIdx) : lines;
  if (!title) {
    const firstNonEmpty = lines.find((l) => l.trim().length > 4) || "未命名 GEO 文章";
    title = firstNonEmpty.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim().slice(0, 100);
  }

  // Extract Direct Answer Capsule from first blockquote or opening paragraph
  let directAnswerCapsule = "";
  const quoteMatch = cleaned.match(/^>\s*\**(?:核心结论速览|核心摘要|一句话结论|TL;DR)[^:：]*[:：]\**\s*(.+)$/im);
  if (quoteMatch && quoteMatch[1]) {
    directAnswerCapsule = quoteMatch[1].replace(/\*\*/g, "").trim();
  } else {
    const firstQuote = cleaned.match(/^>\s+(.+)$/m);
    if (firstQuote && firstQuote[1]) {
      directAnswerCapsule = firstQuote[1].replace(/\*\*/g, "").trim();
    } else {
      const firstPara = bodyLines
        .map((l) => l.trim())
        .find((l) => l.length >= 35 && !l.startsWith("#") && !l.startsWith("|"));
      directAnswerCapsule = (firstPara || "").replace(/\*\*/g, "").slice(0, 200);
    }
  }

  // Extract structured FAQ pairs from ### Q1 / ### ...？ headings
  const faqs: FAQItem[] = [];
  const faqHeadingRegex = /^#{3,4}\s*(?:Q\d*[:：.]?\s*|问\d*[:：.]?\s*)?(.+[？?])\s*$/;
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].trim().match(faqHeadingRegex);
    if (m) {
      const q = m[1].replace(/\*\*/g, "").trim();
      const ansLines: string[] = [];
      for (let j = i + 1; j < bodyLines.length; j++) {
        const nextLine = bodyLines[j].trim();
        if (/^#{1,4}\s+/.test(nextLine)) break;
        if (nextLine) ansLines.push(nextLine.replace(/^(?:A\d*|答)[:：]\s*/i, ""));
      }
      const a = ansLines.join(" ").replace(/\*\*/g, "").trim();
      if (q.length >= 4 && a.length >= 8) {
        faqs.push({ question: q, answer: a });
      }
    }
  }

  return {
    title,
    directAnswerCapsule,
    markdownContent: bodyLines.join("\n").trim(),
    faqs,
  };
}
