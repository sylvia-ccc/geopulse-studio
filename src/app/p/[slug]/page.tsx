import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Bot, Building2, CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { getBrandById, getPublishedArticleBySlug, incrementArticleViews } from "@/lib/db";
import { markdownToCleanHtml } from "@/lib/geo/generator";
import { AI_ENGINES } from "@/lib/geo/weights";

export const dynamic = "force-dynamic";

export async function generateMetadata(context: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await context.params;
  const article = getPublishedArticleBySlug(slug);
  if (!article) {
    return { title: "文章未找到 — GeoPulse Studio" };
  }
  return {
    title: `${article.title} — GeoPulse GEO Hub`,
    description: article.summary || article.directAnswerCapsule,
    keywords: article.targetKeyword,
    openGraph: {
      title: article.title,
      description: article.summary || article.directAnswerCapsule,
      type: "article",
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

  incrementArticleViews(article.id);
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
