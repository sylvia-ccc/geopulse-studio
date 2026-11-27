import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getBrandById } from "@/lib/db";
import { buildShareableReportUrl } from "@/lib/white-label";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;

  const brand = getBrandById(id);
  if (!brand || brand.userId !== user.id) {
    return NextResponse.json({ error: "品牌不存在或无权操作" }, { status: 404 });
  }

  const shareUrl = buildShareableReportUrl(getBaseUrl(req), brand.id, user.id);
  return NextResponse.json({ shareUrl });
}
