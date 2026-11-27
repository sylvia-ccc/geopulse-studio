import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { createArticle, getBrandById } from "@/lib/db";
import { auditGeoContent } from "@/lib/geo/scorer";
import { buildGeoJsonLd, slugify } from "@/lib/geo/schema";
import { blendEngineWeights } from "@/lib/geo/weights";
import { parseExternalAiMarkdown } from "@/lib/geo/prompt-pack";
import type { AIEngineId } from "@/types/geo";

const importSchema = z.object({
  brandId: z.string().min(1),
  title: z.string().max(200).optional().default(""),
  markdownContent: z.string().min(30, "请粘贴至少 30 字的文章正文"),
  targetEngines: z
    .array(z.enum(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]))
    .min(1)
    .default(["doubao", "deepseek", "chatgpt"]),
  targetKeyword: z.string().max(160).optional().default(""),
  smartParse: z.boolean().optional().default(true),
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

    const extracted = parsed.data.smartParse
      ? parseExternalAiMarkdown(parsed.data.markdownContent)
      : {
          title: parsed.data.title,
          directAnswerCapsule: "",
          markdownContent: parsed.data.markdownContent,
          faqs: [],
        };

    const finalTitle = parsed.data.title.trim() || extracted.title || `${brand.name} GEO 文章`;
    const finalCapsule = extracted.directAnswerCapsule;
    const finalMarkdown = extracted.markdownContent;
    const finalFaqs = extracted.faqs;

    const slug = slugify(`${brand.name}-geo-${Date.now().toString(36).slice(-4)}`, "geo");
    const summary = (finalCapsule || finalMarkdown)
      .replace(/[#>*`|]/g, "")
      .trim()
      .slice(0, 160);

    const jsonLd = buildGeoJsonLd({
      title: finalTitle,
      slug,
      summary,
      directAnswerCapsule: finalCapsule,
      targetKeyword: parsed.data.targetKeyword || brand.category,
      faqs: finalFaqs,
      brand,
      baseUrl: getBaseUrl(req),
    });

    const audit = auditGeoContent({
      title: finalTitle,
      slug,
      summary,
      targetKeyword: parsed.data.targetKeyword || brand.category,
      directAnswerCapsule: finalCapsule,
      markdownContent: finalMarkdown,
      faqs: finalFaqs,
      jsonLd,
      brand,
      weights,
    });

    const article = createArticle(user.id, {
      brandId: brand.id,
      title: finalTitle,
      slug,
      summary,
      archetype: "category_guide",
      targetEngines: engines,
      customWeights: weights,
      targetChannel: "geo_hub",
      targetKeyword: parsed.data.targetKeyword || brand.category,
      directAnswerCapsule: finalCapsule,
      markdownContent: finalMarkdown,
      faqs: finalFaqs,
      comparisonTable: null,
      jsonLd,
      geoScore: audit.overallScore,
      engineScores: audit.engineScores,
      dimensionScores: audit.dimensionScores,
      status: "draft",
      generationMode: "builtin",
      publishedAt: null,
    });

    return NextResponse.json(
      {
        article,
        audit,
        extractedFaqCount: finalFaqs.length,
        extractedCapsule: Boolean(finalCapsule),
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "文章导入失败" },
      { status: 500 }
    );
  }
}
