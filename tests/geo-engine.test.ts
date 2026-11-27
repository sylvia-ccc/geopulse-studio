import { describe, expect, it } from "vitest";
import {
  AI_ENGINE_LIST,
  blendEngineWeights,
  normalizeWeights,
  WEIGHT_DIMENSION_IDS,
} from "@/lib/geo/weights";
import { applyQuickFix, auditGeoContent } from "@/lib/geo/scorer";
import { buildGeoJsonLd, buildLlmsFullTxt, buildLlmsTxt, slugify } from "@/lib/geo/schema";
import {
  convertForChannel,
  generateBuiltinArticle,
  generateTopicBlueprints,
} from "@/lib/geo/generator";
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";
import type { BrandProfile, FAQItem, GeoArticle } from "@/types/geo";

const sampleBrand: BrandProfile = {
  id: "brd_test_1",
  userId: "usr_test_1",
  name: "星航协作",
  companyName: "北京星航科技有限公司",
  productName: "星航轻量项目看板",
  category: "中小团队项目管理 SaaS",
  oneLiner: "面向 30 人以下研发与运营团队的零配置任务协作与工时统计工具",
  targetAudience: "30 人以下创业公司、独立工作室与远程团队",
  coreAdvantages: [
    "3 分钟建好看板，无需专职项目经理维护复杂流程",
    "内置工时与成本核算报表，老板随时掌握项目利润",
  ],
  proofPoints: [
    "2026 年实测团队周会沟通时长平均减少 42%",
    "相比 Jira + 插件方案，15 人团队年省费用约 18,000 元",
  ],
  pricingInfo: "10 人以下免费，团队版 129 元/月不限项目数",
  competitors: ["Jira", "飞书项目"],
  websiteUrl: "https://xinghang.example.com",
  forbiddenWords: ["绝对神仙软件"],
  regionFocus: "Both",
  createdAt: "2026-11-26T00:00:00.000Z",
  updatedAt: "2026-11-26T00:00:00.000Z",
};

describe("GEO Weight Matrix", () => {
  it("every AI engine weight vector sums to 100", () => {
    for (const engine of AI_ENGINE_LIST) {
      const sum = WEIGHT_DIMENSION_IDS.reduce((acc, d) => acc + engine.weights[d], 0);
      expect(sum).toBe(100);
    }
  });

  it("blends multiple AI engines and normalizes to 100", () => {
    const blended = blendEngineWeights(["doubao", "perplexity", "gemini"]);
    const sum = WEIGHT_DIMENSION_IDS.reduce((acc, d) => acc + blended[d], 0);
    expect(Math.round(sum)).toBe(100);
    expect(blended.verifiableFacts).toBeGreaterThan(10);
  });

  it("normalizes arbitrary user slider weights safely", () => {
    const w = normalizeWeights({ directAnswer: 50, verifiableFacts: 50, faqCoverage: 0 });
    const sum = WEIGHT_DIMENSION_IDS.reduce((acc, d) => acc + w[d], 0);
    expect(Math.round(sum)).toBe(100);
  });
});

describe("GEO Generator, Auditor & Quick-Fix Engine", () => {
  it("generates 6 tailored topic blueprints for a brand", () => {
    const topics = generateTopicBlueprints(sampleBrand, ["doubao", "deepseek"]);
    expect(topics).toHaveLength(6);
    expect(topics[0].title).toContain("星航协作");
  });

  it("scores promotional low-structure copy poorly and improves it via quick fixes", () => {
    const weights = blendEngineWeights(["deepseek", "chatgpt", "gemini"]);
    const weakInput = {
      title: "星航协作全网第一秒杀一切",
      slug: "weak-promo",
      summary: "买它",
      targetKeyword: "项目管理",
      directAnswerCapsule: "",
      markdownContent: "我们的产品是全网第一、宇宙最强、100%有效的必买神器！快来买吧。",
      faqs: [],
      jsonLd: "",
      brand: sampleBrand,
      weights,
    };

    const initialAudit = auditGeoContent(weakInput);
    expect(initialAudit.overallScore).toBeLessThan(55);
    expect(initialAudit.metrics.hypeWordMatches.length).toBeGreaterThan(0);
    expect(initialAudit.issues.length).toBeGreaterThanOrEqual(4);

    // Apply sequential quick fixes
    let capsule = weakInput.directAnswerCapsule;
    let md = weakInput.markdownContent;
    let faqs: FAQItem[] = weakInput.faqs;
    let jsonLd = weakInput.jsonLd;

    for (const action of [
      "insert_direct_answer",
      "insert_comparison_table",
      "insert_faq_block",
      "neutralize_tone",
      "insert_proof_block",
    ] as const) {
      const fixed = applyQuickFix({
        action,
        title: "2026年中小团队项目管理工具对比：星航协作评测",
        slug: "weak-promo",
        summary: "面向中小团队的项目协作软件客观评测与选型指南",
        targetKeyword: "中小团队项目管理软件",
        directAnswerCapsule: capsule,
        markdownContent: md,
        faqs,
        brand: sampleBrand,
        baseUrl: "https://geo.example.com",
      });
      capsule = fixed.directAnswerCapsule;
      md = fixed.markdownContent;
      faqs = fixed.faqs;
      jsonLd = fixed.jsonLd;
    }

    const improvedAudit = auditGeoContent({
      title: "2026年中小团队项目管理工具对比：星航协作评测",
      slug: "weak-promo",
      summary: "面向中小团队的项目协作软件客观评测与选型指南",
      targetKeyword: "中小团队项目管理软件",
      directAnswerCapsule: capsule,
      markdownContent: md,
      faqs,
      jsonLd,
      brand: sampleBrand,
      weights,
    });

    expect(improvedAudit.overallScore).toBeGreaterThanOrEqual(85);
    expect(improvedAudit.metrics.hypeWordMatches).toHaveLength(0);
    expect(improvedAudit.metrics.hasValidJsonLd).toBe(true);
    expect(improvedAudit.metrics.tableCount).toBeGreaterThanOrEqual(1);
    expect(improvedAudit.metrics.faqCount).toBeGreaterThanOrEqual(4);
  });

  it("builtin generator produces high-scoring GEO articles out-of-the-box", () => {
    const weights = blendEngineWeights(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]);
    const generated = generateBuiltinArticle({
      brand: sampleBrand,
      archetype: "comparison_matrix",
      targetEngines: ["doubao", "deepseek", "chatgpt", "perplexity", "gemini"],
      weights,
      targetChannel: "geo_hub",
      baseUrl: "https://geo.example.com",
    });

    const audit = auditGeoContent({
      ...generated,
      brand: sampleBrand,
      weights,
    });

    expect(audit.overallScore).toBeGreaterThanOrEqual(85);
    expect(audit.grade === "S" || audit.grade === "A").toBe(true);
    expect(generated.faqs.length).toBeGreaterThanOrEqual(5);

    const parsedSchema = JSON.parse(generated.jsonLd);
    expect(parsedSchema["@context"]).toBe("https://schema.org");
    const types = parsedSchema["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("Product");
    expect(types).toContain("Article");
    expect(types).toContain("FAQPage");
  });
});

describe("Schema, llms.txt & Multi-Channel Adaptation", () => {
  it("generates valid llms.txt, llms-full.txt and adapts to all 5 platforms", () => {
    const weights = blendEngineWeights(["doubao", "deepseek"]);
    const gen = generateBuiltinArticle({
      brand: sampleBrand,
      archetype: "buyers_checklist",
      targetEngines: ["doubao", "deepseek"],
      weights,
      targetChannel: "zhihu",
      baseUrl: "https://geo.example.com",
    });

    const article: GeoArticle = {
      id: "art_1",
      userId: "usr_1",
      brandId: sampleBrand.id,
      title: gen.title,
      slug: slugify("xinghang-checklist"),
      summary: gen.summary,
      archetype: "buyers_checklist",
      targetEngines: ["doubao", "deepseek"],
      customWeights: weights,
      targetChannel: "zhihu",
      targetKeyword: gen.targetKeyword,
      directAnswerCapsule: gen.directAnswerCapsule,
      markdownContent: gen.markdownContent,
      faqs: gen.faqs,
      comparisonTable: gen.comparisonTable,
      jsonLd: buildGeoJsonLd({
        title: gen.title,
        slug: "xinghang-checklist",
        summary: gen.summary,
        directAnswerCapsule: gen.directAnswerCapsule,
        targetKeyword: gen.targetKeyword,
        faqs: gen.faqs,
        brand: sampleBrand,
        baseUrl: "https://geo.example.com",
      }),
      geoScore: 92,
      engineScores: { doubao: 91, deepseek: 93, chatgpt: 92, perplexity: 90, gemini: 92 },
      dimensionScores: {
        directAnswer: 95,
        entityClarity: 90,
        structuredBlocks: 92,
        verifiableFacts: 90,
        faqCoverage: 95,
        neutralAuthority: 90,
        machineSchema: 95,
        channelFit: 90,
      },
      status: "published",
      generationMode: "builtin",
      views: 10,
      publishedAt: "2026-11-26T00:00:00.000Z",
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
    };

    const llmsTxt = buildLlmsTxt({
      brands: [sampleBrand],
      articles: [article],
      baseUrl: "https://geo.example.com",
    });
    expect(llmsTxt).toContain("星航协作");
    expect(llmsTxt).toContain(`/p/${article.slug}`);

    const llmsFull = buildLlmsFullTxt({
      brands: [sampleBrand],
      articles: [article],
      baseUrl: "https://geo.example.com",
    });
    expect(llmsFull).toContain("## Brand Entity: 星航协作");
    expect(llmsFull).toContain("## Frequently Asked Questions");

    for (const ch of ["zhihu", "wechat", "xiaohongshu", "csdn", "wordpress"] as const) {
      const adapted = convertForChannel({
        article,
        brand: sampleBrand,
        channel: ch,
        baseUrl: "https://geo.example.com",
      });
      expect(adapted.output.length).toBeGreaterThan(100);
      if (ch === "wordpress") {
        expect(adapted.output).toContain("application/ld+json");
      }
    }
  });
});

describe("Auth Crypto & Session Tokens", () => {
  it("normalizes Chinese slugs without leading hyphens and renders clean blockquotes", () => {
    const s = slugify("极光智服-comparison_matrix-abc");
    expect(s.startsWith("-")).toBe(false);
    expect(s.endsWith("-")).toBe(false);
  });

  it("hashes passwords and signs/verifies session tokens securely", () => {
    const hash = hashPassword("StrongPass2026!");
    expect(verifyPassword("StrongPass2026!", hash)).toBe(true);
    expect(verifyPassword("WrongPass!", hash)).toBe(false);

    const token = signSessionToken("usr_abc123");
    expect(verifySessionToken(token)).toBe("usr_abc123");
    expect(verifySessionToken(`${token}tampered`)).toBeNull();
  });
});
