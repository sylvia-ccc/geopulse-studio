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
import { blendEngineWeights } from "@/lib/geo/weights";
import type { AIEngineId, ArticleArchetype, GeoArticle, PublishChannelType } from "@/types/geo";

const batchSchema = z.object({
  brandId: z.string().min(1),
  targetEngines: z
    .array(z.enum(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]))
    .min(1)
    .default(["doubao", "deepseek", "chatgpt"]),
  archetypes: z
    .array(
      z.enum([
        "category_guide",
        "comparison_matrix",
        "buyers_checklist",
        "howto_playbook",
        "faq_hub",
        "case_benchmark",
      ])
    )
    .min(1)
    .max(6)
    .default(["comparison_matrix", "buyers_checklist", "faq_hub"]),
  autoPublish: z.boolean().optional().default(false),
});

const CHANNEL_BY_ARCHETYPE: Record<ArticleArchetype, PublishChannelType> = {
  comparison_matrix: "zhihu",
  buyers_checklist: "wechat",
  category_guide: "geo_hub",
  howto_playbook: "csdn",
  faq_hub: "geo_hub",
  case_benchmark: "geo_hub",
};

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "批量生成参数无效" }, { status: 400 });
    }

    const brand = getBrandById(parsed.data.brandId);
    if (!brand || brand.userId !== user.id) {
      return NextResponse.json({ error: "品牌档案不存在" }, { status: 404 });
    }

    const quota = PLAN_QUOTAS[user.plan];
    const used = countUserArticlesThisMonth(user.id);
    if (used + parsed.data.archetypes.length > quota.maxArticlesPerMonth) {
      return NextResponse.json(
        {
          error: `本月剩余配额不足（剩余 ${Math.max(0, quota.maxArticlesPerMonth - used)} 篇，需要 ${parsed.data.archetypes.length} 篇）`,
        },
        { status: 403 }
      );
    }

    const engines = parsed.data.targetEngines as AIEngineId[];
    const weights = blendEngineWeights(engines);
    const baseUrl = getBaseUrl(req);
    const created: GeoArticle[] = [];

    for (const archetype of parsed.data.archetypes) {
      const targetChannel = CHANNEL_BY_ARCHETYPE[archetype];
      const gen = await generateGeoArticle({
        brand,
        archetype,
        targetEngines: engines,
        weights,
        targetChannel,
        user,
        baseUrl,
      });

      const audit = auditGeoContent({
        title: gen.title,
        slug: gen.slug,
        summary: gen.summary,
        targetKeyword: gen.targetKeyword,
        directAnswerCapsule: gen.directAnswerCapsule,
        markdownContent: gen.markdownContent,
        faqs: gen.faqs,
        comparisonTable: gen.comparisonTable,
        jsonLd: gen.jsonLd,
        brand,
        weights,
      });

      const now = new Date().toISOString();
      const art = createArticle(user.id, {
        brandId: brand.id,
        title: gen.title,
        slug: gen.slug,
        summary: gen.summary,
        archetype,
        targetEngines: engines,
        customWeights: weights,
        targetChannel,
        targetKeyword: gen.targetKeyword,
        directAnswerCapsule: gen.directAnswerCapsule,
        markdownContent: gen.markdownContent,
        faqs: gen.faqs,
        comparisonTable: gen.comparisonTable,
        jsonLd: gen.jsonLd,
        geoScore: audit.overallScore,
        engineScores: audit.engineScores,
        dimensionScores: audit.dimensionScores,
        status: parsed.data.autoPublish ? "published" : "draft",
        generationMode: gen.generationMode,
        publishedAt: parsed.data.autoPublish ? now : null,
      });

      if (parsed.data.autoPublish) {
        createPublishLog(user.id, {
          articleId: art.id,
          channelType: "geo_hub",
          channelName: "GeoPulse 公开 GEO 专栏",
          status: "success",
          httpStatus: 200,
          externalUrl: `/p/${art.slug}`,
          message: "批量矩阵自动上线并同步 /llms.txt",
        });
      }

      created.push(art);
    }

    return NextResponse.json({ articles: created, count: created.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "批量生成失败" },
      { status: 500 }
    );
  }
}
