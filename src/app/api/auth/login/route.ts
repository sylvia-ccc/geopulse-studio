import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/db";
import { sanitizeUser, SESSION_COOKIE_NAME, signSessionToken, verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().optional(),
  demo: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit({ key: `login:${ip}`, limit: 25, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `登录请求过于频繁，请 ${rl.retryAfterSec} 秒后再试` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "登录参数无效" }, { status: 400 });
    }

    let user = null;
    if (parsed.data.demo) {
      user = findUserByEmail("demo@geopulse.ai");
    } else {
      if (!parsed.data.email || !parsed.data.password) {
        return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
      }
      const found = findUserByEmail(parsed.data.email);
      if (!found || !verifyPassword(parsed.data.password, found.passwordHash)) {
        return NextResponse.json({ error: "邮箱或密码不正确" }, { status: 401 });
      }
      user = found;
    }

    if (!user) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 });
    }

    const token = signSessionToken(user.id);
    const res = NextResponse.json({ user: sanitizeUser(user) });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "登录失败" },
      { status: 500 }
    );
  }
}
