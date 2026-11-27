import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { PLAN_QUOTAS, sanitizeUser } from "@/lib/auth";
import {
  countUserArticlesThisMonth,
  listArticlesByUser,
  listBrandsByUser,
  listCitationChecks,
  listPublishChannels,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const brands = listBrandsByUser(user.id);
  const articles = listArticlesByUser(user.id);
  const channels = listPublishChannels(user.id);
  const citations = listCitationChecks(user.id);
  const articlesThisMonth = countUserArticlesThisMonth(user.id);
  const quota = PLAN_QUOTAS[user.plan];

  const publishedCount = articles.filter((a) => a.status === "published").length;
  const avgGeoScore =
    articles.length > 0
      ? Math.round(articles.reduce((acc, a) => acc + a.geoScore, 0) / articles.length)
      : 0;
  const citationHitRate =
    citations.length > 0
      ? Math.round((citations.filter((c) => c.mentioned).length / citations.length) * 100)
      : 0;

  return NextResponse.json({
    user: sanitizeUser(user),
    quota,
    usage: {
      brandsCount: brands.length,
      articlesTotal: articles.length,
      articlesThisMonth,
      publishedCount,
      channelsCount: channels.length,
      avgGeoScore,
      citationHitRate,
      citationsCount: citations.length,
    },
  });
}
