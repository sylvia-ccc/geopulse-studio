import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/api-auth";
import { listPublishedArticles } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req).replace(/\/$/, "");
  const articles = listPublishedArticles();
  const nowIso = new Date().toISOString();

  const urls = [
    `  <url>
    <loc>${baseUrl}/hub</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`,
    ...articles.map(
      (a) => `  <url>
    <loc>${baseUrl}/p/${a.slug}</loc>
    <lastmod>${a.updatedAt}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
