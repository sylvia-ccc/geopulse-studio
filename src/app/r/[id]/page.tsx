import { notFound } from "next/navigation";
import {
  getBrandById,
  getCommercialSiteSettings,
  listArticlesByUser,
  listCitationChecks,
  listPublishLogs,
} from "@/lib/db";
import { AI_ENGINE_LIST, AI_ENGINES } from "@/lib/geo/weights";
import { verifyWhiteLabelReportToken } from "@/lib/white-label";
import { PrintReportButton } from "./PrintReportButton";

export const dynamic = "force-dynamic";

export default async function ShareableWhiteLabelReportPage(context: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await context.params;
  const { token } = await context.searchParams;

  const brand = getBrandById(id);
  if (!brand || !token || !verifyWhiteLabelReportToken(brand.id, brand.userId, token)) {
    notFound();
  }

  const siteCfg = getCommercialSiteSettings();
  const articles = listArticlesByUser(brand.userId, brand.id);
  const checks = listCitationChecks(brand.userId, brand.id);
  const allLogs = listPublishLogs(brand.userId);
  const articleIds = new Set(articles.map((a) => a.id));
  const brandLogs = allLogs.filter((l) => articleIds.has(l.articleId) && l.status === "success");

  const publishedCount = articles.filter((a) => a.status === "published").length;
  const avgScore =
    articles.length > 0
      ? Math.round(articles.reduce((acc, a) => acc + a.geoScore, 0) / articles.length)
      : 0;
  const hitCount = checks.filter((c) => c.mentioned).length;
  const hitRate = checks.length > 0 ? Math.round((hitCount / checks.length) * 100) : 0;

  const sovMap = new Map<string, number>();
  sovMap.set(brand.name, hitCount);
  for (const comp of brand.competitors) sovMap.set(comp, 0);
  for (const c of checks) {
    for (const comp of c.competitorsMentioned || []) {
      sovMap.set(comp, (sovMap.get(comp) || 0) + 1);
    }
  }
  const totalMentions = Array.from(sovMap.values()).reduce((a, b) => a + b, 0) || 1;
  const sovRows = Array.from(sovMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([entity, count]) => ({
      entity,
      count,
      share: Math.round((count / totalMentions) * 100),
      isSelf: entity === brand.name,
    }));

  const accent = /^#[0-9a-fA-F]{6}$/.test(siteCfg.agencyAccentColor || "")
    ? siteCfg.agencyAccentColor
    : "#4f46e5";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            {siteCfg.agencyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={siteCfg.agencyLogoUrl}
                alt={siteCfg.brandTitle}
                className="h-8 w-auto rounded-lg object-contain"
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white"
                style={{ backgroundColor: accent }}
              >
                {(siteCfg.brandTitle || "G").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-sm font-extrabold text-slate-900">{siteCfg.brandTitle}</div>
              <div className="text-[11px] text-slate-500">White-Label AI Search & GEO Client Report</div>
            </div>
          </div>
          <PrintReportButton accent={accent} />
        </div>

        {/* Main White-Label Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="border-b border-slate-100 pb-6">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              AI Search Visibility & GEO Performance Report
            </span>
            <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">
              {brand.name}
              {brand.productName && brand.productName !== brand.name ? ` · ${brand.productName}` : ""}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">{brand.oneLiner}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
              <span>Category: {brand.category}</span>
              <span>·</span>
              <span>Audience: {brand.targetAudience}</span>
              <span>·</span>
              <span>Generated: {new Date().toLocaleDateString("zh-CN")}</span>
            </div>
          </div>

          {/* 4 KPIs */}
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            {[
              { label: "Avg GEO Score", val: `${avgScore}/100` },
              { label: "Published Assets", val: `${publishedCount}/${articles.length}` },
              { label: "AI Citation Hit Rate", val: `${hitRate}%` },
              { label: "Live Syndicated URLs", val: `${brandLogs.length}` },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {k.label}
                </div>
                <div className="mt-1.5 text-2xl font-black text-slate-900">{k.val}</div>
              </div>
            ))}
          </div>

          {/* 5 AI Engine Matrix */}
          <section className="mt-8">
            <h2 className="text-base font-extrabold text-slate-900">
              1. Multi-Engine AI Citation Readiness (5 Ecosystems)
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="p-2.5">AI Search Engine</th>
                    <th className="p-2.5">Content Readiness</th>
                    <th className="p-2.5">Tracked Prompts</th>
                    <th className="p-2.5">Mention Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {AI_ENGINE_LIST.map((engine) => {
                    const score =
                      articles.length > 0
                        ? Math.round(
                            articles.reduce(
                              (acc, a) => acc + (a.engineScores[engine.id] ?? a.geoScore),
                              0
                            ) / articles.length
                          )
                        : 0;
                    const engChecks = checks.filter((c) => c.engineId === engine.id);
                    const engHits = engChecks.filter((c) => c.mentioned).length;
                    return (
                      <tr key={engine.id}>
                        <td className="p-2.5 font-bold text-slate-800">{engine.name}</td>
                        <td className="p-2.5 font-semibold text-emerald-700">{score} / 100</td>
                        <td className="p-2.5">{engChecks.length}</td>
                        <td className="p-2.5">
                          {engChecks.length > 0
                            ? `${Math.round((engHits / engChecks.length) * 100)}%`
                            : "Pending"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Competitor SOV */}
          <section className="mt-8">
            <h2 className="text-base font-extrabold text-slate-900">
              2. Competitor Share of Voice (SOV)
            </h2>
            <div className="mt-3 space-y-2.5">
              {sovRows.map((r) => (
                <div key={r.entity} className="flex items-center gap-3 text-xs">
                  <div className="w-40 truncate font-bold text-slate-800">
                    {r.entity} {r.isSelf ? "(Client)" : ""}
                  </div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, r.share)}%`,
                        backgroundColor: r.isSelf ? "#10b981" : accent,
                      }}
                    />
                  </div>
                  <div className="w-16 text-right font-mono font-bold text-slate-700">
                    {r.share}% ({r.count})
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Syndicated External Proof URLs */}
          {brandLogs.length > 0 && (
            <section className="mt-8">
              <h2 className="text-base font-extrabold text-slate-900">
                3. Verified Live Syndication Proof ({brandLogs.length})
              </h2>
              <div className="mt-3 space-y-2">
                {brandLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs"
                  >
                    <span className="font-bold text-slate-800">{log.channelName}</span>
                    <a
                      href={log.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-mono text-[11px] font-semibold underline"
                      style={{ color: accent }}
                    >
                      {log.externalUrl}
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent AI Citations */}
          {checks.length > 0 && (
            <section className="mt-8">
              <h2 className="text-base font-extrabold text-slate-900">
                4. Recent AI Engine Citation Evidence
              </h2>
              <div className="mt-3 space-y-2.5">
                {checks.slice(0, 6).map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">
                        [{AI_ENGINES[c.engineId]?.shortName || c.engineId}]
                      </span>
                      <span className={c.mentioned ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>
                        {c.mentioned ? "✅ Brand Cited" : "⚠️ Gap Detected"}
                      </span>
                      <span className="text-slate-700">“{c.promptQuery}”</span>
                    </div>
                    {c.snippet && <p className="mt-1 text-slate-500">{c.snippet}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* White-Label Footer */}
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-400">
            <span>Prepared by {siteCfg.brandTitle}</span>
            {!siteCfg.hidePoweredBy && <span>Powered by GeoPulse Studio · Open-Source GEO Engine</span>}
          </footer>
        </div>
      </div>
    </div>
  );
}
