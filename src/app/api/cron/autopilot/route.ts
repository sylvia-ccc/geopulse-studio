import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  addGrowthTopic,
  deleteGrowthTopic,
  listGrowthTopics,
  runNextAutopilotJob,
  seedOfficialAutopilotQueue,
} from "@/lib/autopilot";

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === cronSecret;
}

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可管理 GEO Autopilot 队列" }, { status: 403 });
  }
  return NextResponse.json({ topics: listGrowthTopics(user.id) });
}

const addTopicSchema = z.object({
  action: z.enum(["run_next", "seed_official", "add_topic"]).default("run_next"),
  brandId: z.string().optional(),
  titleHint: z.string().max(180).optional(),
  keyword: z.string().max(160).optional(),
  language: z.enum(["en", "zh"]).optional().default("en"),
  archetype: z
    .enum([
      "comparison_matrix",
      "category_guide",
      "buyers_checklist",
      "howto_playbook",
      "faq_hub",
      "case_benchmark",
    ])
    .optional()
    .default("comparison_matrix"),
  skipExternalBlast: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const viaCron = isAuthorizedCron(req);
  const user = viaCron ? null : await requireAuthUser(req);
  if (!viaCron && !user) return unauthorizedResponse();
  if (!viaCron && user && user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可触发 GEO Autopilot" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = addTopicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  const baseUrl = getBaseUrl(req);
  const action = viaCron ? "run_next" : parsed.data.action;

  if (action === "seed_official") {
    const seeded = seedOfficialAutopilotQueue(user!.id, baseUrl);
    return NextResponse.json(seeded, { status: 201 });
  }

  if (action === "add_topic") {
    if (!parsed.data.brandId || !parsed.data.titleHint || !parsed.data.keyword) {
      return NextResponse.json({ error: "请填写品牌、标题与目标关键词" }, { status: 400 });
    }
    const topic = addGrowthTopic({
      userId: user!.id,
      brandId: parsed.data.brandId,
      titleHint: parsed.data.titleHint,
      keyword: parsed.data.keyword,
      language: parsed.data.language,
      archetype: parsed.data.archetype,
    });
    return NextResponse.json({ topic }, { status: 201 });
  }

  const res = await runNextAutopilotJob({
    baseUrl,
    userId: user?.id,
    skipExternalBlast: parsed.data.skipExternalBlast,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json(res);
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可删除队列选题" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  return NextResponse.json({ ok: deleteGrowthTopic(id) });
}
