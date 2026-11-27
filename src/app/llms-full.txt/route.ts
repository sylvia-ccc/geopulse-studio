import { NextRequest, NextResponse } from "next/server";
import { recordTelemetryEvent } from "@/lib/telemetry";
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

  recordTelemetryEvent({
    eventType: "llms_fetch",
    path: "/llms-full.txt",
    headers: req.headers,
    userAgent: req.headers.get("user-agent") || "",
    referer: req.headers.get("referer") || "",
  });
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
