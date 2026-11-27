import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { createArticle, getBrandById } from "@/lib/db";
import { auditGeoContent } from "@/lib/geo/scorer";
import { buildGeoJsonLd, slugify } from "@/lib/geo/schema";
import { blendEngineWeights } from "@/lib/geo/weights";
import type { AIEngineId } from "@/types/geo";

const importSchema = z.object({
  brandId: z.string().min(1),
  title: z.string().min(2, "请输入文章标题").max(200),
  markdownContent: z.string().min(30, "请粘贴至少 30 字的文章正文"),
  targetEngines: z
    .array(z.enum(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]))
    .min(1)
    .default(["doubao", "deepseek", "chatgpt"]),
  targetKeyword: z.string().max(160).optional().default(""),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "导入内容格式有误" },
        { status: 400 }
      );
    }

    const brand = getBrandById(parsed.data.brandId);
    if (!brand || brand.userId !== user.id) {
      return NextResponse.json({ error: "品牌档案不存在" }, { status: 404 });
    }

    const engines = parsed.data.targetEngines as AIEngineId[];
    const weights = blendEngineWeights(engines);
    const slug = slugify(`${brand.name}-imported-${Date.now().toString(36).slice(-4)}`, "geo");
    const summary = parsed.data.markdownContent.replace(/[#>*`|]/g, "").trim().slice(0, 150);

    const jsonLd = buildGeoJsonLd({
      title: parsed.data.title,
      slug,
      summary,
      directAnswerCapsule: "",
      targetKeyword: parsed.data.targetKeyword || brand.category,
      faqs: [],
      brand,
      baseUrl: getBaseUrl(req),
    });

    const audit = auditGeoContent({
      title: parsed.data.title,
      slug,
      summary,
      targetKeyword: parsed.data.targetKeyword || brand.category,
      directAnswerCapsule: "",
      markdownContent: parsed.data.markdownContent,
      faqs: [],
      jsonLd,
      brand,
      weights,
    });

    const article = createArticle(user.id, {
      brandId: brand.id,
      title: parsed.data.title.trim(),
      slug,
      summary,
      archetype: "category_guide",
      targetEngines: engines,
      customWeights: weights,
      targetChannel: "geo_hub",
      targetKeyword: parsed.data.targetKeyword || brand.category,
      directAnswerCapsule: "",
      markdownContent: parsed.data.markdownContent,
      faqs: [],
      comparisonTable: null,
      jsonLd,
      geoScore: audit.overallScore,
      engineScores: audit.engineScores,
      dimensionScores: audit.dimensionScores,
      status: "draft",
      generationMode: "builtin",
      publishedAt: null,
    });

    return NextResponse.json({ article, audit }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "文章导入失败" },
      { status: 500 }
    );
  }
}
