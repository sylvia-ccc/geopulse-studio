import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUser, findUserByEmail } from "@/lib/db";
import { sanitizeUser, SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth";

const registerSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少需要 6 位字符"),
  name: z.string().min(1, "请输入姓名或昵称").max(50),
  company: z.string().max(80).optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "参数格式有误" },
        { status: 400 }
      );
    }

    const existing = findUserByEmail(parsed.data.email);
    if (existing) {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }

    const user = createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
      company: parsed.data.company,
      plan: "free",
    });

    const token = signSessionToken(user.id);
    const res = NextResponse.json({ user: sanitizeUser(user) }, { status: 201 });
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
      { error: err instanceof Error ? err.message : "注册失败" },
      { status: 500 }
    );
  }
}
