import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getBrandById } from "@/lib/db";
import { generateBuyerPromptCorpus } from "@/lib/geo/generator";

export async function POST(
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

  const prompts = generateBuyerPromptCorpus(brand);
  return NextResponse.json({ prompts });
}
