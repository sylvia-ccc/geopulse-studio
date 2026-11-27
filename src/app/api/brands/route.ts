import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { PLAN_QUOTAS } from "@/lib/auth";
import { createBrand, listBrandsByUser } from "@/lib/db";

const brandSchema = z.object({
  name: z.string().min(1, "请填写品牌名称").max(80),
  companyName: z.string().max(120).optional().default(""),
  productName: z.string().max(120).optional().default(""),
  category: z.string().min(1, "请填写所属品类").max(80),
  oneLiner: z.string().min(4, "请用一句话清晰描述产品核心价值").max(300),
  targetAudience: z.string().min(2, "请填写目标受众").max(200),
  coreAdvantages: z.array(z.string().trim().min(1)).optional().default([]),
  proofPoints: z.array(z.string().trim().min(1)).optional().default([]),
  pricingInfo: z.string().max(240).optional().default(""),
  competitors: z.array(z.string().trim().min(1)).optional().default([]),
  websiteUrl: z.string().max(240).optional().default(""),
  forbiddenWords: z.array(z.string().trim().min(1)).optional().default([]),
  regionFocus: z.enum(["CN", "Global", "Both"]).optional().default("CN"),
});

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ brands: listBrandsByUser(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const existing = listBrandsByUser(user.id);
    const quota = PLAN_QUOTAS[user.plan];
    if (existing.length >= quota.maxBrands) {
      return NextResponse.json(
        { error: `当前套餐最多支持 ${quota.maxBrands} 个品牌档案，请在「系统设置」升级套餐` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = brandSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "品牌信息格式有误" },
        { status: 400 }
      );
    }

    const brand = createBrand(user.id, parsed.data);
    return NextResponse.json({ brand }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建品牌失败" },
      { status: 500 }
    );
  }
}
