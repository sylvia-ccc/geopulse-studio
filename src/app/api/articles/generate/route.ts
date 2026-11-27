import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { PLAN_QUOTAS } from "@/lib/auth";
import {
  countUserArticlesThisMonth,
  createArticle,
  createPublishLog,
  getBrandById,
} from "@/lib/db";
import { generateGeoArticle } from "@/lib/geo/generator";
import { auditGeoContent } from "@/lib/geo/scorer";
import { blendEngineWeights, normalizeWeights } from "@/lib/geo/weights";
import type { AIEngineId, WeightVector } from "@/types/geo";

const generateSchema = z.object({
  brandId: z.string().min(1),
  archetype: z
    .enum([
      "category_guide",
      "comparison_matrix",
      "buyers_checklist",
      "howto_playbook",
      "faq_hub",
      "case_benchmark",
    ])
    .default("comparison_matrix"),
  targetEngines: z
    .array(z.enum(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]))
    .min(1)
    .default(["doubao", "deepseek", "chatgpt"]),
  customWeights: z.record(z.string(), z.number()).optional(),
  targetChannel: z
    .enum(["geo_hub", "zhihu", "wechat", "xiaohongshu", "csdn", "wordpress", "webhook"])
    .default("geo_hub"),
  targetKeyword: z.string().max(160).optional().default(""),
  customAngle: z.string().max(240).optional().default(""),
  preferBuiltin: z.boolean().optional().default(false),
  autoPublish: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const quota = PLAN_QUOTAS[user.plan];
    const usedThisMonth = countUserArticlesThisMonth(user.id);
    if (usedThisMonth >= quota.maxArticlesPerMonth) {
      return NextResponse.json(
        { error: `本月已达套餐上限（${quota.maxArticlesPerMonth} 篇），请在设置页升级套餐` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "生成参数无效" },
        { status: 400 }
      );
    }

    const brand = getBrandById(parsed.data.brandId);
    if (!brand || brand.userId !== user.id) {
      return NextResponse.json({ error: "未找到对应品牌档案" }, { status: 404 });
    }

    const targetEngines = parsed.data.targetEngines as AIEngineId[];
    const weights: WeightVector = parsed.data.customWeights
      ? normalizeWeights(parsed.data.customWeights as Partial<WeightVector>)
      : blendEngineWeights(targetEngines);

    const baseUrl = getBaseUrl(req);
    const generated = await generateGeoArticle({
      brand,
      archetype: parsed.data.archetype,
      targetEngines,
      weights,
      targetChannel: parsed.data.targetChannel,
      targetKeyword: parsed.data.targetKeyword,
      customAngle: parsed.data.customAngle,
      user,
      preferBuiltin: parsed.data.preferBuiltin,
      baseUrl,
    });

    const audit = auditGeoContent({
      title: generated.title,
      slug: generated.slug,
      summary: generated.summary,
      targetKeyword: generated.targetKeyword,
      directAnswerCapsule: generated.directAnswerCapsule,
      markdownContent: generated.markdownContent,
      faqs: generated.faqs,
      comparisonTable: generated.comparisonTable,
      jsonLd: generated.jsonLd,
      brand,
      weights,
    });

    const now = new Date().toISOString();
    const article = createArticle(user.id, {
      brandId: brand.id,
      title: generated.title,
      slug: generated.slug,
      summary: generated.summary,
      archetype: parsed.data.archetype,
      targetEngines,
      customWeights: weights,
      targetChannel: parsed.data.targetChannel,
      targetKeyword: generated.targetKeyword,
      directAnswerCapsule: generated.directAnswerCapsule,
      markdownContent: generated.markdownContent,
      faqs: generated.faqs,
      comparisonTable: generated.comparisonTable,
      jsonLd: generated.jsonLd,
      geoScore: audit.overallScore,
      engineScores: audit.engineScores,
      dimensionScores: audit.dimensionScores,
      status: parsed.data.autoPublish ? "published" : "draft",
      generationMode: generated.generationMode,
      publishedAt: parsed.data.autoPublish ? now : null,
    });

    if (parsed.data.autoPublish) {
      createPublishLog(user.id, {
        articleId: article.id,
        channelType: "geo_hub",
        channelName: "GeoPulse 公开 GEO 专栏",
        status: "success",
        httpStatus: 200,
        externalUrl: `/p/${article.slug}`,
        message: "生成并自动发布至公开 GEO 专栏，已同步 /llms.txt",
      });
    }

    return NextResponse.json(
      {
        article,
        audit,
        llmNote: generated.llmNote || null,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "文章生成失败" },
      { status: 500 }
    );
  }
}
