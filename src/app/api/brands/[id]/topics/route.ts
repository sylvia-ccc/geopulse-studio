import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getBrandById } from "@/lib/db";
import { generateTopicBlueprints } from "@/lib/geo/generator";
import type { AIEngineId } from "@/types/geo";

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

  const body = (await req.json().catch(() => ({}))) as { targetEngines?: AIEngineId[] };
  const targetEngines: AIEngineId[] =
    Array.isArray(body.targetEngines) && body.targetEngines.length > 0
      ? body.targetEngines
      : ["doubao", "deepseek", "chatgpt"];

  const blueprints = generateTopicBlueprints(brand, targetEngines);
  return NextResponse.json({ blueprints });
}
