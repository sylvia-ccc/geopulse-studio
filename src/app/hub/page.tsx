import Link from "next/link";
import { ArrowRight, Bot, Building2, FileText, Sparkles } from "lucide-react";
import { listAllPublicBrands, listPublishedArticles } from "@/lib/db";
import { AI_ENGINES } from "@/lib/geo/weights";

export const dynamic = "force-dynamic";

export default function PublicHubPage() {
  const brands = listAllPublicBrands();
  const articles = listPublishedArticles();
  const brandMap = new Map(brands.map((b) => [b.id, b]));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-bold text-slate-900">GeoPulse 公开 GEO 专栏</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            <a href="/llms.txt" target="_blank" className="hover:text-indigo-600">
              /llms.txt
            </a>
            <a href="/llms-full.txt" target="_blank" className="hover:text-indigo-600">
              /llms-full.txt
            </a>
            <a href="/sitemap.xml" target="_blank" className="hover:text-indigo-600">
              /sitemap.xml
            </a>
            <Link
              href="/app"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              管理后台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            <Bot className="h-4 w-4" />
            AI Search & Generative Engine Citation Hub
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            结构化品牌知识库与高权重 GEO 文章目录
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            本专栏所有页面均采用 SSR 直出、语义化 HTML5 与 Schema.org JSON-LD（Article + FAQPage + Product），全面放行 GPTBot、PerplexityBot、Google-Extended 与国内 AI 搜索引擎抓取。
          </p>
        </div>

        {/* Brand Entities */}
        {brands.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Building2 className="h-5 w-5 text-indigo-600" />
              已收录品牌实体（{brands.length}）
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {brands.map((brand) => (
                <div
                  key={brand.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">
                      {brand.name} · {brand.productName}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {brand.category}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{brand.oneLiner}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>适用：{brand.targetAudience}</span>
                    {brand.pricingInfo && <span>· 价格：{brand.pricingInfo}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Published Articles */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileText className="h-5 w-5 text-indigo-600" />
            已发布 GEO 结构化文章（{articles.length}）
          </h2>

          {articles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              暂无公开文章，请前往工作台生成并发布。
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((art) => {
                const b = brandMap.get(art.brandId);
                return (
                  <Link
                    key={art.id}
                    href={`/p/${art.slug}`}
                    className="group block rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {b && (
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                          {b.name}
                        </span>
                      )}
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                        GEO 评分 {art.geoScore}/100
                      </span>
                      {art.targetEngines.map((e) => (
                        <span
                          key={e}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600"
                        >
                          {AI_ENGINES[e]?.shortName || e}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-slate-900 group-hover:text-indigo-600">
                      {art.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {art.directAnswerCapsule}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                      <span>更新于 {new Date(art.updatedAt).toLocaleDateString("zh-CN")}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
                        阅读完整结构化文档 <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
