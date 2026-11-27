import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { extractBrandDraftFromUrl } from "@/lib/geo/site-auditor";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  url: z.string().url("请输入完整的官网链接（含 http:// 或 https://）"),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const rl = checkRateLimit({ key: `ingest:${user.id}`, limit: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${rl.retryAfterSec} 秒后重试` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "URL 参数无效" },
        { status: 400 }
      );
    }

    const draft = await extractBrandDraftFromUrl(parsed.data.url);
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "网页抓取解析失败" },
      { status: 400 }
    );
  }
}
