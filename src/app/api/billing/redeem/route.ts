import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { PLAN_QUOTAS, sanitizeUser } from "@/lib/auth";
import { findUserById, redeemActivationCode } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const redeemSchema = z.object({
  code: z.string().min(6, "请输入完整的商用激活码").max(64),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const rl = checkRateLimit({ key: `redeem:${user.id}`, limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `尝试过于频繁，请 ${rl.retryAfterSec} 秒后再试` },
      { status: 429 }
    );
  }

  const body = await req.json();
  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "激活码格式有误" },
      { status: 400 }
    );
  }

  const result = redeemActivationCode(user.id, parsed.data.code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const updated = findUserById(user.id)!;
  return NextResponse.json({
    ok: true,
    plan: result.plan,
    durationDays: result.durationDays,
    expiresAt: result.expiresAt,
    user: sanitizeUser(updated),
    quota: PLAN_QUOTAS[updated.plan],
  });
}
