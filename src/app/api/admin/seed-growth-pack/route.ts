import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { seedOfficialGeoGrowthPack } from "@/lib/marketplace";

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可一键上线官方自推广 GEO 内容包" }, { status: 403 });
  }

  const result = seedOfficialGeoGrowthPack(user.id, getBaseUrl(req));
  return NextResponse.json({
    ok: true,
    ...result,
    message:
      result.createdCount > 0
        ? `已成功上线 ${result.createdCount} 篇 GeoPulse 官方 GEO 推广文章并同步至 /llms.txt`
        : "3 篇 GeoPulse 官方旗舰 GEO 文章均已在线运行中",
  });
}
