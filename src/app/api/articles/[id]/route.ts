import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { deleteArticle, getArticleById, getBrandById, updateArticle } from "@/lib/db";
import { auditGeoContent } from "@/lib/geo/scorer";
import { buildGeoJsonLd } from "@/lib/geo/schema";
import { normalizeWeights } from "@/lib/geo/weights";
import type { AIEngineId, FAQItem, PublishChannelType, WeightVector } from "@/types/geo";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;
  const article = getArticleById(id);
  if (!article || article.userId !== user.id) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  const brand = getBrandById(article.brandId);
  const audit = auditGeoContent({
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    targetKeyword: article.targetKeyword,
    directAnswerCapsule: article.directAnswerCapsule,
    markdownContent: article.markdownContent,
    faqs: article.faqs,
    comparisonTable: article.comparisonTable,
    jsonLd: article.jsonLd,
    brand,
    weights: article.customWeights,
  });
  return NextResponse.json({ article, brand, audit });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;

  const current = getArticleById(id);
  if (!current || current.userId !== user.id) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  const body = (await req.json()) as Partial<{
    title: string;
    slug: string;
    summary: string;
    targetKeyword: string;
    targetEngines: AIEngineId[];
    customWeights: WeightVector;
    targetChannel: PublishChannelType;
    directAnswerCapsule: string;
    markdownContent: string;
    faqs: FAQItem[];
    jsonLd: string;
    status: "draft" | "published";
    regenerateSchema: boolean;
  }>;

  const brand = getBrandById(current.brandId);
  const nextTitle = body.title ?? current.title;
  const nextSlug = (body.slug ?? current.slug).trim().replace(/[^a-zA-Z0-9-_]/g, "-") || current.slug;
  const nextSummary = body.summary ?? current.summary;
  const nextKeyword = body.targetKeyword ?? current.targetKeyword;
  const nextCapsule = body.directAnswerCapsule ?? current.directAnswerCapsule;
  const nextMarkdown = body.markdownContent ?? current.markdownContent;
  const nextFaqs = body.faqs ?? current.faqs;
  const nextWeights = body.customWeights
    ? normalizeWeights(body.customWeights)
    : current.customWeights;

  const nextJsonLd =
    body.regenerateSchema || (!body.jsonLd && !current.jsonLd)
      ? buildGeoJsonLd({
          title: nextTitle,
          slug: nextSlug,
          summary: nextSummary,
          directAnswerCapsule: nextCapsule,
          targetKeyword: nextKeyword,
          faqs: nextFaqs,
          brand,
          baseUrl: getBaseUrl(req),
        })
      : (body.jsonLd ?? current.jsonLd);

  const audit = auditGeoContent({
    title: nextTitle,
    slug: nextSlug,
    summary: nextSummary,
    targetKeyword: nextKeyword,
    directAnswerCapsule: nextCapsule,
    markdownContent: nextMarkdown,
    faqs: nextFaqs,
    comparisonTable: current.comparisonTable,
    jsonLd: nextJsonLd,
    brand,
    weights: nextWeights,
  });

  const updated = updateArticle(id, user.id, {
    title: nextTitle,
    slug: nextSlug,
    summary: nextSummary,
    targetKeyword: nextKeyword,
    targetEngines: body.targetEngines ?? current.targetEngines,
    customWeights: nextWeights,
    targetChannel: body.targetChannel ?? current.targetChannel,
    directAnswerCapsule: nextCapsule,
    markdownContent: nextMarkdown,
    faqs: nextFaqs,
    jsonLd: nextJsonLd,
    geoScore: audit.overallScore,
    engineScores: audit.engineScores,
    dimensionScores: audit.dimensionScores,
    status: body.status ?? current.status,
  });

  return NextResponse.json({ article: updated, audit });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;
  const ok = deleteArticle(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
