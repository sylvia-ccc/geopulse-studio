import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/api-auth";
import { listAllPublicBrands, listPublishedArticles } from "@/lib/db";
import { buildLlmsFullTxt } from "@/lib/geo/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brands = listAllPublicBrands();
  const articles = listPublishedArticles();
  const content = buildLlmsFullTxt({
    brands,
    articles,
    baseUrl: getBaseUrl(req),
  });

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
