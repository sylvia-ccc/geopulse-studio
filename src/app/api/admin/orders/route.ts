import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getArticleById, getBrandById } from "@/lib/db";
import { convertForChannel } from "@/lib/geo/generator";
import {
  fulfillDistributionOrder,
  getDistributionOrderById,
  listAllDistributionOrdersForAdmin,
  rejectDistributionOrderAndRefund,
} from "@/lib/marketplace";
import type { PublishChannelType } from "@/types/geo";

function forbiddenAdmin() {
  return NextResponse.json({ error: "仅管理员可审核代发工单" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const exportOrderId = req.nextUrl.searchParams.get("exportOrderId");
  if (exportOrderId) {
    const order = getDistributionOrderById(exportOrderId);
    if (!order) return NextResponse.json({ error: "工单不存在" }, { status: 404 });
    const article = getArticleById(order.articleId);
    if (!article) return NextResponse.json({ error: "关联文章不存在" }, { status: 404 });
    const brand = getBrandById(article.brandId);
    const channelMap: Record<string, PublishChannelType> = {
      zhihu_managed: "zhihu",
      wechat_managed: "wechat",
      xiaohongshu_managed: "xiaohongshu",
      bundle_managed: "zhihu",
      wordpress: "wordpress",
      devto: "csdn",
    };
    const adapted = convertForChannel({
      article,
      brand,
      channel: channelMap[order.platformType] || "zhihu",
      baseUrl: getBaseUrl(req),
    });
    return NextResponse.json({ adapted });
  }

  return NextResponse.json({ orders: listAllDistributionOrdersForAdmin() });
}

const actionSchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(["fulfill", "reject"]),
  publishedUrl: z.string().max(300).optional().default(""),
  adminNote: z.string().max(300).optional().default(""),
});

export async function PATCH(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "工单操作参数有误" }, { status: 400 });
  }

  if (parsed.data.action === "fulfill") {
    if (!parsed.data.publishedUrl.trim()) {
      return NextResponse.json({ error: "请填写发布后的真实文章链接" }, { status: 400 });
    }
    const updated = fulfillDistributionOrder({
      orderId: parsed.data.orderId,
      publishedUrl: parsed.data.publishedUrl,
      adminNote: parsed.data.adminNote,
    });
    if (!updated) return NextResponse.json({ error: "工单不存在" }, { status: 404 });
    return NextResponse.json({ order: updated });
  }

  const rejected = rejectDistributionOrderAndRefund({
    orderId: parsed.data.orderId,
    adminNote: parsed.data.adminNote,
  });
  if (!rejected) {
    return NextResponse.json({ error: "仅待审核工单可驳回退款" }, { status: 400 });
  }
  return NextResponse.json({ order: rejected });
}
