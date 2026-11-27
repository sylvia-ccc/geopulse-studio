import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getArticleById } from "@/lib/db";
import {
  getPlatformAccountWithSecret,
  listCreditTransactions,
  listDistributionOrdersByUser,
  listPlatformAccounts,
  submitDistributionOrder,
} from "@/lib/marketplace";

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  return NextResponse.json({
    creditsBalance: user.creditsBalance ?? 0,
    accounts: listPlatformAccounts(false),
    orders: listDistributionOrdersByUser(user.id),
    transactions: listCreditTransactions(user.id, 20),
  });
}

const orderSchema = z.object({
  articleId: z.string().min(1, "请选择要代发的文章"),
  platformAccountId: z.string().min(1, "请选择目标平台渠道"),
  customerNote: z.string().max(300).optional().default(""),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "下单参数无效" },
        { status: 400 }
      );
    }

    const article = getArticleById(parsed.data.articleId);
    if (!article || article.userId !== user.id) {
      return NextResponse.json({ error: "未找到对应文章" }, { status: 404 });
    }

    const account = getPlatformAccountWithSecret(parsed.data.platformAccountId);
    if (!account || !account.enabled) {
      return NextResponse.json({ error: "该代发渠道暂不可用" }, { status: 404 });
    }

    const result = await submitDistributionOrder({
      userId: user.id,
      article,
      account,
      customerNote: parsed.data.customerNote,
      baseUrl: getBaseUrl(req),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        order: result.order,
        creditsBalance: result.balanceAfter,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "提交代发订单失败" },
      { status: 500 }
    );
  }
}
