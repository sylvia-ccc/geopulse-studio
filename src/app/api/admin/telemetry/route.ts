import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTelemetrySummary } from "@/lib/telemetry";

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可查看实时 AI 爬虫与漏斗遥测" }, { status: 403 });
  }
  const requested = Number(req.nextUrl.searchParams.get("days") || 7);
  const days = Number.isFinite(requested) ? Math.max(1, Math.min(30, Math.floor(requested))) : 7;
  return NextResponse.json({ days, telemetry: getTelemetrySummary(days), identityBasis: "user-agent-claim" }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
