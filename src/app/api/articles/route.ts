import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { listArticlesByUser } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const brandId = req.nextUrl.searchParams.get("brandId") || undefined;
  const articles = listArticlesByUser(user.id, brandId);
  return NextResponse.json({ articles });
}
