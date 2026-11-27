import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { runLiveSiteGeoAudit } from "@/lib/geo/site-auditor";
import { checkRateLimit } from "@/lib/rate-limit";

const auditSchema = z.object({
  url: z.string().min(4, "请输入需要体检的站点网址"),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const rl = checkRateLimit({ key: `site-audit:${user.id}`, limit: 12, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `体检请求过于频繁，请 ${rl.retryAfterSec} 秒后再试` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const parsed = auditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请输入合法网址" },
        { status: 400 }
      );
    }

    const raw = parsed.data.url.trim();
    const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const report = await runLiveSiteGeoAudit(normalizedUrl);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "官网 GEO 体检失败" },
      { status: 400 }
    );
  }
}
