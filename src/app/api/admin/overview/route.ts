import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  createRedemptionCodes,
  getAdminPlatformStats,
  listAllUsersForAdmin,
  listRedemptionCodes,
  revokeRedemptionCode,
} from "@/lib/db";

function forbiddenAdmin() {
  return NextResponse.json({ error: "仅平台管理员可访问运营后台" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  return NextResponse.json({
    stats: getAdminPlatformStats(),
    users: listAllUsersForAdmin(),
    codes: listRedemptionCodes(),
  });
}

const createCodeSchema = z.object({
  codeType: z.enum(["plan", "credits"]).default("plan"),
  plan: z.enum(["pro", "enterprise"]).default("pro"),
  durationDays: z.number().int().min(0).max(3650).default(30),
  creditsAmount: z.number().int().min(0).max(100000).optional(),
  count: z.number().int().min(1).max(50).default(5),
  note: z.string().max(120).optional().default(""),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const body = await req.json();
  const parsed = createCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "激活码生成参数有误" }, { status: 400 });
  }

  const codes = createRedemptionCodes(parsed.data);
  return NextResponse.json({ codes }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = revokeRedemptionCode(id);
  return NextResponse.json({ ok });
}
