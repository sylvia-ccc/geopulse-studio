import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { PLAN_QUOTAS } from "@/lib/auth";
import { createPublishChannel, deletePublishChannel, listPublishChannels } from "@/lib/db";

const channelSchema = z.object({
  name: z.string().min(1, "请填写连接器名称").max(80),
  type: z.enum(["webhook", "wordpress", "custom_cms"]).default("webhook"),
  endpointUrl: z.string().url("请输入合法的 https:// 或 http:// 接收地址"),
  authHeader: z.string().max(60).optional().default("Authorization"),
  secretToken: z.string().max(240).optional().default(""),
  enabled: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ channels: listPublishChannels(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const existing = listPublishChannels(user.id);
  const quota = PLAN_QUOTAS[user.plan];
  if (existing.length >= quota.maxWebhooks) {
    return NextResponse.json(
      { error: `当前套餐最多配置 ${quota.maxWebhooks} 个自动发布连接器` },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = channelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "连接器参数无效" },
      { status: 400 }
    );
  }

  const channel = createPublishChannel(user.id, parsed.data);
  return NextResponse.json({ channel }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = deletePublishChannel(id, user.id);
  return NextResponse.json({ ok });
}
