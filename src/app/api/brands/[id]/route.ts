import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { deleteBrand, getBrandById, updateBrand } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  companyName: z.string().max(120).optional(),
  productName: z.string().max(120).optional(),
  category: z.string().min(1).max(80).optional(),
  oneLiner: z.string().min(4).max(300).optional(),
  targetAudience: z.string().min(2).max(200).optional(),
  coreAdvantages: z.array(z.string()).optional(),
  proofPoints: z.array(z.string()).optional(),
  pricingInfo: z.string().max(240).optional(),
  competitors: z.array(z.string()).optional(),
  websiteUrl: z.string().max(240).optional(),
  forbiddenWords: z.array(z.string()).optional(),
  regionFocus: z.enum(["CN", "Global", "Both"]).optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;
  const brand = getBrandById(id);
  if (!brand || brand.userId !== user.id) {
    return NextResponse.json({ error: "品牌不存在" }, { status: 404 });
  }
  return NextResponse.json({ brand });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "更新参数有误" }, { status: 400 });
  }

  const brand = updateBrand(id, user.id, parsed.data);
  if (!brand) {
    return NextResponse.json({ error: "品牌不存在或无权操作" }, { status: 404 });
  }
  return NextResponse.json({ brand });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;

  const ok = deleteBrand(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "品牌不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
