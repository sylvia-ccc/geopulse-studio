import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  createPublishLog,
  getArticleById,
  getBrandById,
  listPublishChannels,
  updateArticle,
} from "@/lib/db";
import { convertForChannel } from "@/lib/geo/generator";
import { buildGeoJsonLd } from "@/lib/geo/schema";
import { assertSafeExternalUrl } from "@/lib/ssrf";
import type { PublishChannelType } from "@/types/geo";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;

  const article = getArticleById(id);
  if (!article || article.userId !== user.id) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  const brand = getBrandById(article.brandId);
  const baseUrl = getBaseUrl(req);
  const body = (await req.json().catch(() => ({}))) as {
    action?: "publish_hub" | "unpublish_hub" | "adapt" | "push_webhook";
    channel?: PublishChannelType;
    channelConfigId?: string;
  };

  const action = body.action || "publish_hub";

  if (action === "unpublish_hub") {
    const updated = updateArticle(article.id, user.id, { status: "draft" });
    return NextResponse.json({ article: updated });
  }

  if (action === "publish_hub") {
    const freshJsonLd = buildGeoJsonLd({
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      directAnswerCapsule: article.directAnswerCapsule,
      targetKeyword: article.targetKeyword,
      faqs: article.faqs,
      publishedAt: article.publishedAt || new Date().toISOString(),
      brand,
      baseUrl,
    });
    const updated = updateArticle(article.id, user.id, {
      status: "published",
      jsonLd: freshJsonLd,
    });
    const publicUrl = `${baseUrl}/p/${updated!.slug}`;
    const log = createPublishLog(user.id, {
      articleId: article.id,
      channelType: "geo_hub",
      channelName: "GeoPulse 公开 GEO 专栏",
      status: "success",
      httpStatus: 200,
      externalUrl: `/p/${updated!.slug}`,
      message: "已上线至公开 SSR 专栏，并实时同步 /llms.txt 与 /sitemap.xml",
    });
    return NextResponse.json({ article: updated, publicUrl, log });
  }

  if (action === "adapt") {
    const channel: PublishChannelType = body.channel || "zhihu";
    const adapted = convertForChannel({ article, brand, channel, baseUrl });
    return NextResponse.json({ adapted });
  }

  if (action === "push_webhook") {
    const channels = listPublishChannels(user.id);
    const target = channels.find((c) => c.id === body.channelConfigId);
    if (!target) {
      return NextResponse.json({ error: "未找到指定的 Webhook/CMS 发布连接器" }, { status: 404 });
    }

    const payload = {
      event: "geo.article.publish",
      timestamp: new Date().toISOString(),
      canonicalUrl: `${baseUrl}/p/${article.slug}`,
      brand: brand
        ? {
            name: brand.name,
            companyName: brand.companyName,
            productName: brand.productName,
            category: brand.category,
          }
        : null,
      article: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        directAnswerCapsule: article.directAnswerCapsule,
        markdownContent: article.markdownContent,
        faqs: article.faqs,
        jsonLd: article.jsonLd,
        geoScore: article.geoScore,
        engineScores: article.engineScores,
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "GeoPulse-Studio/1.0",
    };
    if (target.authHeader && target.secretToken) {
      headers[target.authHeader] = target.secretToken;
    } else if (target.secretToken) {
      headers["Authorization"] = `Bearer ${target.secretToken}`;
    }

    try {
      const safeUrl = assertSafeExternalUrl(target.endpointUrl);
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text().catch(() => "");
      const ok = res.ok;
      const log = createPublishLog(user.id, {
        articleId: article.id,
        channelType: target.type,
        channelName: target.name,
        status: ok ? "success" : "failed",
        httpStatus: res.status,
        externalUrl: target.endpointUrl,
        message: ok
          ? `推送成功（HTTP ${res.status}）${text ? `: ${text.slice(0, 80)}` : ""}`
          : `远端返回异常（HTTP ${res.status}）: ${text.slice(0, 120)}`,
      });
      return NextResponse.json({ ok, log }, { status: ok ? 200 : 502 });
    } catch (err) {
      const log = createPublishLog(user.id, {
        articleId: article.id,
        channelType: target.type,
        channelName: target.name,
        status: "failed",
        httpStatus: null,
        externalUrl: target.endpointUrl,
        message: `网络推送失败：${err instanceof Error ? err.message : "连接超时"}`,
      });
      return NextResponse.json({ ok: false, log, error: log.message }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "不支持的操作类型" }, { status: 400 });
}
