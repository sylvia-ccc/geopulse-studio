import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { PLAN_QUOTAS, sanitizeUser } from "@/lib/auth";
import { updateUserSettings } from "@/lib/db";

const settingsSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  company: z.string().max(100).optional(),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
  llmProvider: z.enum(["none", "openai", "deepseek", "gemini", "custom"]).optional(),
  llmBaseUrl: z.string().max(260).optional(),
  llmApiKey: z.string().max(260).optional(),
  llmModel: z.string().max(100).optional(),
  rotateApiKey: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({
    user: sanitizeUser(user),
    plans: Object.values(PLAN_QUOTAS),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "设置参数格式有误" }, { status: 400 });
  }

  const updates = { ...parsed.data };
  if (
    updates.plan &&
    updates.plan !== user.plan &&
    process.env.COMMERCIAL_STRICT_BILLING === "true" &&
    user.role !== "admin"
  ) {
    return NextResponse.json(
      { error: "生产商用模式下请使用激活码兑换升级套餐" },
      { status: 403 }
    );
  }

  const updated = updateUserSettings(user.id, updates);
  if (!updated) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  return NextResponse.json({
    user: sanitizeUser(updated),
    quota: PLAN_QUOTAS[updated.plan],
  });
}
