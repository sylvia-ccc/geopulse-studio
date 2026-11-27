import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  createCitationCheck,
  deleteCitationCheck,
  getBrandById,
  listCitationChecks,
} from "@/lib/db";
import { resolveEffectiveLlmConfig } from "@/lib/geo/generator";

const citationSchema = z.object({
  brandId: z.string().min(1),
  promptQuery: z.string().min(3, "请输入监测提问词").max(260),
  engineId: z.enum(["doubao", "deepseek", "chatgpt", "perplexity", "gemini"]),
  mode: z.enum(["manual", "live_llm"]).default("manual"),
  mentioned: z.boolean().optional().default(false),
  citedUrl: z.string().max(300).optional().default(""),
  sourceDomain: z.string().max(120).optional().default(""),
  competitorsMentioned: z.array(z.string().trim().min(1)).optional().default([]),
  hasHallucination: z.boolean().optional().default(false),
  funnelStage: z.enum(["awareness", "comparison", "decision", "trust"]).optional().default("comparison"),
  positionRank: z.number().int().min(1).max(20).nullable().optional().default(null),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional().default("neutral"),
  snippet: z.string().max(1000).optional().default(""),
});

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const brandId = req.nextUrl.searchParams.get("brandId") || undefined;
  return NextResponse.json({ checks: listCitationChecks(user.id, brandId) });
}

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = citationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "参数有误" },
      { status: 400 }
    );
  }

  const brand = getBrandById(parsed.data.brandId);
  if (!brand || brand.userId !== user.id) {
    return NextResponse.json({ error: "品牌不存在" }, { status: 404 });
  }

  if (parsed.data.mode === "live_llm") {
    const llm = resolveEffectiveLlmConfig(user);
    if (llm.source === "none") {
      return NextResponse.json(
        { error: "请先在「设置与配额」中配置 LLM API Key（或由管理员配置服务端全局模型池）后再执行实时探测" },
        { status: 400 }
      );
    }

    try {
      const res = await fetch(`${llm.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({
          model: llm.model,
          temperature: 0.2,
          messages: [{ role: "user", content: parsed.data.promptQuery }],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        return NextResponse.json({ error: `LLM 探测调用失败（HTTP ${res.status}）` }, { status: 502 });
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const answer = data.choices?.[0]?.message?.content || "";
      const mentioned =
        answer.includes(brand.name) ||
        (brand.productName ? answer.includes(brand.productName) : false);
      const rankIdx = answer.indexOf(brand.name);
      const positionRank = mentioned ? (rankIdx < 160 ? 1 : rankIdx < 420 ? 2 : 3) : null;

      // Auto-detect which configured competitors appeared in the LLM answer
      const detectedCompetitors = brand.competitors.filter((comp) =>
        answer.toLowerCase().includes(comp.toLowerCase())
      );

      const check = createCitationCheck(user.id, {
        brandId: brand.id,
        promptQuery: parsed.data.promptQuery,
        engineId: parsed.data.engineId,
        mentioned,
        citedUrl: brand.websiteUrl || "",
        sourceDomain: llm.provider,
        competitorsMentioned: detectedCompetitors,
        hasHallucination: false,
        funnelStage: parsed.data.funnelStage,
        positionRank,
        sentiment: mentioned ? "positive" : "neutral",
        snippet: answer.slice(0, 400),
        mode: "live_llm",
      });
      return NextResponse.json({ check }, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: `实时探测失败：${err instanceof Error ? err.message : "网络错误"}` },
        { status: 502 }
      );
    }
  }

  const check = createCitationCheck(user.id, {
    brandId: brand.id,
    promptQuery: parsed.data.promptQuery,
    engineId: parsed.data.engineId,
    mentioned: parsed.data.mentioned,
    citedUrl: parsed.data.citedUrl,
    sourceDomain: parsed.data.sourceDomain,
    competitorsMentioned: parsed.data.competitorsMentioned,
    hasHallucination: parsed.data.hasHallucination,
    funnelStage: parsed.data.funnelStage,
    positionRank: parsed.data.mentioned ? (parsed.data.positionRank ?? 1) : null,
    sentiment: parsed.data.sentiment,
    snippet: parsed.data.snippet,
    mode: "manual",
  });
  return NextResponse.json({ check }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  return NextResponse.json({ ok: deleteCitationCheck(id, user.id) });
}
