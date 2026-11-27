import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCommercialSiteSettings, updateCommercialSiteSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ config: getCommercialSiteSettings() });
}

const configSchema = z.object({
  brandTitle: z.string().min(1).max(60).optional(),
  contactWechatOrEmail: z.string().max(240).optional(),
  checkoutProUrl: z.string().max(300).optional(),
  checkoutEnterpriseUrl: z.string().max(300).optional(),
  acquisitionNote: z.string().max(300).optional(),
  announcement: z.string().max(300).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可修改站点商业配置" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "站点配置参数无效" }, { status: 400 });
  }

  const config = updateCommercialSiteSettings(parsed.data);
  return NextResponse.json({ config });
}
