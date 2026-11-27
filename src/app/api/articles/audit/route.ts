import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getBrandById } from "@/lib/db";
import { applyQuickFix, auditGeoContent } from "@/lib/geo/scorer";
import { blendEngineWeights, normalizeWeights } from "@/lib/geo/weights";
import type { AIEngineId, DiagnosticIssue, FAQItem, WeightVector } from "@/types/geo";

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const body = (await req.json()) as {
      brandId?: string;
      title?: string;
      slug?: string;
      summary?: string;
      targetKeyword?: string;
      directAnswerCapsule?: string;
      markdownContent?: string;
      faqs?: FAQItem[];
      jsonLd?: string;
      targetEngines?: AIEngineId[];
      weights?: Partial<WeightVector>;
      fixAction?: DiagnosticIssue["fixAction"];
    };

    const brand = body.brandId ? getBrandById(body.brandId) : null;
    const ownedBrand = brand && brand.userId === user.id ? brand : null;

    const weights = body.weights
      ? normalizeWeights(body.weights)
      : blendEngineWeights(body.targetEngines || ["doubao", "deepseek", "chatgpt"]);

    let directAnswerCapsule = body.directAnswerCapsule || "";
    let markdownContent = body.markdownContent || "";
    let faqs = Array.isArray(body.faqs) ? body.faqs : [];
    let jsonLd = body.jsonLd || "";
    let changeNote: string | null = null;

    if (body.fixAction) {
      const fixed = applyQuickFix({
        action: body.fixAction,
        title: body.title || "GEO 文章",
        slug: body.slug || "geo-article",
        summary: body.summary || "",
        targetKeyword: body.targetKeyword || "",
        directAnswerCapsule,
        markdownContent,
        faqs,
        brand: ownedBrand,
        baseUrl: getBaseUrl(req),
      });
      directAnswerCapsule = fixed.directAnswerCapsule;
      markdownContent = fixed.markdownContent;
      faqs = fixed.faqs;
      jsonLd = fixed.jsonLd;
      changeNote = fixed.changeNote;
    }

    const audit = auditGeoContent({
      title: body.title || "",
      slug: body.slug,
      summary: body.summary,
      targetKeyword: body.targetKeyword,
      directAnswerCapsule,
      markdownContent,
      faqs,
      jsonLd,
      brand: ownedBrand,
      weights,
    });

    return NextResponse.json({
      audit,
      patched: body.fixAction
        ? {
            directAnswerCapsule,
            markdownContent,
            faqs,
            jsonLd,
            changeNote,
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "诊断失败" },
      { status: 500 }
    );
  }
}
