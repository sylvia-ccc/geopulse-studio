import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getArticleById } from "@/lib/db";
import {
  getPlatformAccountWithSecret,
  submitGlobalBlastOrder,
  type PlatformAccountWithSecret,
} from "@/lib/marketplace";

const blastSchema = z.object({
  articleId: z.string().min(1, "请选择要发布的 GEO 文章"),
  platformAccountIds: z.array(z.string().min(1)).min(1, "请至少勾选 1 个官方 API 发布渠道").max(12),
  customerNote: z.string().max(300).optional().default(""),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = blastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "联发包参数无效" },
      { status: 400 }
    );
  }

  const article = getArticleById(parsed.data.articleId);
  if (!article || article.userId !== user.id) {
    return NextResponse.json({ error: "文章不存在或无权操作" }, { status: 404 });
  }

  const uniqueIds = Array.from(new Set(parsed.data.platformAccountIds));
  const accounts: PlatformAccountWithSecret[] = [];
  for (const id of uniqueIds) {
    const acc = getPlatformAccountWithSecret(id);
    if (acc && acc.enabled && acc.deliveryMode === "auto_api") {
      accounts.push(acc);
    }
  }

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "所选渠道中没有可用的官方 API 自动直发通道" },
      { status: 400 }
    );
  }

  const baseUrl = getBaseUrl(req);
  const res = await submitGlobalBlastOrder({
    userId: user.id,
    article,
    accounts,
    customerNote: parsed.data.customerNote,
    baseUrl,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  return NextResponse.json(res, { status: 201 });
}
