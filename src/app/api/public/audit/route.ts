import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { runLiveSiteGeoAudit } from "@/lib/geo/site-auditor";
import { auditGeoContent } from "@/lib/geo/scorer";
import { blendEngineWeights } from "@/lib/geo/weights";
import { parseExternalAiMarkdown } from "@/lib/geo/prompt-pack";
import { recordLeadAuditClick } from "@/lib/outreach";
import { recordTelemetryEvent, signAuditReceipt, shouldExcludeTelemetry } from "@/lib/telemetry";

const publicAuditSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("site"),
    url: z.string().min(4, "请输入要体检的官网网址").max(260),
    lid: z.string().max(40).optional(),
    lsig: z.string().max(40).optional(),
  }),
  z.object({
    mode: z.literal("content"),
    brandName: z.string().max(80).optional().default(""),
    category: z.string().max(80).optional().default(""),
    content: z.string().min(20, "请粘贴至少 20 字的品牌文案或文章草稿").max(12000),
  }),
]);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit({ key: `pub-audit:${ip}`, limit: 12, windowMs: 10 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `免费体验次数已达频率限制，请登录账号解锁不限次体检（或 ${rl.retryAfterSec} 秒后重试）` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const parsed = publicAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "参数无效" },
        { status: 400 }
      );
    }

    if (parsed.data.mode === "site") {
      const raw = parsed.data.url.trim();
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const full = await runLiveSiteGeoAudit(normalized);
      if (parsed.data.lid && parsed.data.lsig && !shouldExcludeTelemetry(req.headers)) {
        recordLeadAuditClick(parsed.data.lid, parsed.data.lsig);
      }
      recordTelemetryEvent({
        headers: req.headers,
        eventType: "public_audit",
        path: "/audit",
        userAgent: req.headers.get("user-agent") || "",
        referer: req.headers.get("referer") || "",
        meta: `site:${full.origin} (${full.overallScore}/100)`,
      });
      return NextResponse.json({
        mode: "site",
        auditToken: signAuditReceipt({
          websiteUrl: full.targetUrl,
          auditScore: full.overallScore,
          auditGrade: full.grade,
          auditMissing: full.recommendations.slice(0, 6).map((r) => r.title.slice(0, 160)),
        }),
        report: {
          targetUrl: full.targetUrl,
          origin: full.origin,
          overallScore: full.overallScore,
          grade: full.grade,
          ttfbMs: full.ttfbMs,
          checks: full.checks,
          botPermissions: full.botPermissions,
          topRecommendations: full.recommendations.slice(0, 2).map((r) => ({
            severity: r.severity,
            title: r.title,
            detail: r.detail,
          })),
          totalRecommendations: full.recommendations.length,
        },
      });
    }

    const extracted = parseExternalAiMarkdown(parsed.data.content);
    const weights = blendEngineWeights(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]);
    const audit = auditGeoContent({
      title: extracted.title,
      directAnswerCapsule: extracted.directAnswerCapsule,
      markdownContent: extracted.markdownContent,
      faqs: extracted.faqs,
      jsonLd: "",
      brand: parsed.data.brandName
        ? {
            id: "pub",
            userId: "pub",
            name: parsed.data.brandName,
            companyName: parsed.data.brandName,
            productName: parsed.data.brandName,
            category: parsed.data.category || "",
            oneLiner: "",
            targetAudience: "",
            coreAdvantages: [],
            proofPoints: [],
            pricingInfo: "",
            competitors: [],
            websiteUrl: "",
            forbiddenWords: [],
            regionFocus: "CN",
            createdAt: "",
            updatedAt: "",
          }
        : null,
      weights,
    });

    recordTelemetryEvent({
      headers: req.headers,
      eventType: "public_audit",
      path: "/audit",
      userAgent: req.headers.get("user-agent") || "",
      referer: req.headers.get("referer") || "",
      meta: `content (${audit.overallScore}/100)`,
    });
    return NextResponse.json({
      mode: "content",
      auditToken: signAuditReceipt({
        websiteUrl: "",
        auditScore: audit.overallScore,
        auditGrade: audit.grade,
        auditMissing: audit.issues.slice(0, 6).map((r) => r.title.slice(0, 160)),
      }),
      audit: {
        overallScore: audit.overallScore,
        grade: audit.grade,
        engineScores: audit.engineScores,
        dimensionScores: audit.dimensionScores,
        metrics: audit.metrics,
        topIssues: audit.issues.slice(0, 3),
        totalIssues: audit.issues.length,
        strengths: audit.strengths.slice(0, 3),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "体检失败，请检查链接或内容" },
      { status: 400 }
    );
  }
}
