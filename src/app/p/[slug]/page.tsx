import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Bot, Building2, CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { getBrandById, getPublishedArticleBySlug, incrementArticleViews } from "@/lib/db";
import { markdownToCleanHtml } from "@/lib/geo/generator";
import { AI_ENGINES } from "@/lib/geo/weights";
import { shouldExcludeTelemetry, recordTelemetryEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export async function generateMetadata(context: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await context.params;
  const article = getPublishedArticleBySlug(slug);
  if (!article) {
    return { title: "文章未找到 — GeoPulse Studio" };
  }
  const canonical = `/p/${encodeURIComponent(article.slug)}`;
  const image = `/api/og?title=${encodeURIComponent(article.title)}`;
  return {
    alternates: { canonical },
    title: `${article.title} — GeoPulse GEO Hub`,
    description: article.summary || article.directAnswerCapsule,
    keywords: article.targetKeyword,
    openGraph: {
      title: article.title,
      description: article.summary || article.directAnswerCapsule,
      type: "article",
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.summary || article.directAnswerCapsule,
      images: [image],
    },
  };
}

export default async function PublicGeoArticlePage(context: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await context.params;
  const article = getPublishedArticleBySlug(slug);
  if (!article) {
    notFound();
  }

  const hdrs = await headers();
  if (!shouldExcludeTelemetry(hdrs)) incrementArticleViews(article.id);
  recordTelemetryEvent({
    headers: hdrs,
    eventType: "article_view",
    path: `/p/${article.slug}`,
    userAgent: hdrs.get("user-agent") || "",
    referer: hdrs.get("referer") || "",
    meta: `GEO ${article.geoScore}/100`,
  });
  const brand = getBrandById(article.brandId);
  const bodyHtml = markdownToCleanHtml(article.markdownContent);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Real Schema.org JSON-LD for AI & Search Crawlers */}
      {article.jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: article.jsonLd }}
        />
      )}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/hub"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 GEO 专栏目录
          </Link>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
            <a href="/llms.txt" target="_blank" className="hover:text-indigo-600">
              /llms.txt
            </a>
            <Link
              href="/app"
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              GeoPulse 工作台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_290px]">
        <article className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs sm:p-10">
          <header className="border-b border-slate-100 pb-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {brand && (
                <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 font-semibold text-indigo-700">
                  {brand.category}
                </span>
              )}
              <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                GEO 结构评分 {article.geoScore}/100
              </span>
              <span className="text-slate-400">
                更新日期：{new Date(article.updatedAt).toLocaleDateString("zh-CN")}
              </span>
            </div>

            <h1 className="mt-4 text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl">
              {article.title}
            </h1>

            {/* Direct Answer Citation Capsule */}
            <section
              aria-label="Direct Answer Summary"
              className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
                <Bot className="h-4 w-4" />
                核心直答摘要（AI 引用胶囊）
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">
                {article.directAnswerCapsule}
              </p>
            </section>
          </header>

          {/* Main Semantic Body */}
          <div
            className="geo-prose mt-6"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {/* Structured FAQ Schema Visible Block */}
          {article.faqs.length > 0 && (
            <section className="mt-10 border-t border-slate-200 pt-8">
              <h2 className="text-lg font-bold text-slate-900">
                结构化问答索引（FAQPage Schema）
              </h2>
              <dl className="mt-4 space-y-4">
                {article.faqs.map((faq, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <dt className="text-sm font-bold text-slate-900">
                      Q{idx + 1}：{faq.question}
                    </dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-slate-700">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {/* Bilingual PLG Conversion CTA (GEO-to-GEO Acquisition Flywheel) */}
          <section className="mt-10 rounded-2xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Powered by GeoPulse Studio · Open-Source Commercial GEO Engine
            </div>
            <h2 className="mt-1.5 text-lg font-extrabold">
              想让 ChatGPT Search、Perplexity、DeepSeek 与豆包主动推荐你的产品？
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Want AI search engines to cite your brand like this page? Run a free 3-second AI crawler audit (robots.txt + /llms.txt + JSON-LD) or syndicate your brand across 6 global official APIs in 1 click.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/audit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                🔍 免费 3 秒官网 GEO 体检 / Free AI Audit →
              </Link>
              <Link
                href="/login?demo=1"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
              >
                <Sparkles className="h-3.5 w-3.5" />
                体验一键 6 平台全自动代发 / Live Demo
              </Link>
            </div>
          </section>
        </article>

        {/* Right Sidebar: Brand Entity Fact Card & AI Readiness */}
        <aside className="space-y-5">
          {brand && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
                <Building2 className="h-4 w-4" />
                品牌实体知识卡片
              </div>
              <h2 className="mt-2 text-base font-bold text-slate-900">{brand.name}</h2>
              <p className="text-xs text-slate-500">
                {brand.companyName || brand.name} · {brand.productName}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-slate-700">{brand.oneLiner}</p>

              <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <dt className="font-semibold text-slate-500">适用对象</dt>
                  <dd className="mt-0.5 text-slate-800">{brand.targetAudience}</dd>
                </div>
                {brand.pricingInfo && (
                  <div>
                    <dt className="font-semibold text-slate-500">参考定价</dt>
                    <dd className="mt-0.5 text-slate-800">{brand.pricingInfo}</dd>
                  </div>
                )}
                {brand.websiteUrl && (
                  <div>
                    <dt className="font-semibold text-slate-500">官方链接</dt>
                    <dd className="mt-0.5">
                      <a
                        href={brand.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
                      >
                        访问官网 <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              多 AI 引擎收录就绪度
            </div>
            <div className="mt-3 space-y-2.5">
              {(Object.keys(AI_ENGINES) as Array<keyof typeof AI_ENGINES>).map((id) => {
                const score = article.engineScores[id] ?? article.geoScore;
                return (
                  <div key={id}>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">{AI_ENGINES[id].shortName}</span>
                      <span className="font-semibold text-slate-900">{score}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              本页已嵌入 Schema.org JSON-LD（Article + FAQPage + Product），支持 AI 搜索引擎无障碍解析。
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
