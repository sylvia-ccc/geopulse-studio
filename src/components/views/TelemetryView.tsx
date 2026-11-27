"use client";

import { useCallback, useEffect, useState } from "react";
import type { TelemetrySummary } from "@/types/geo";

const eventLabels: Record<string, string> = {
  ai_crawler_hit: "UA 声称的爬虫请求", article_view: "文章请求", report_view: "报告请求",
  llms_fetch: "LLM 文本请求", public_audit: "完成公开体检", inbound_lead: "联系请求", outreach_click: "签名链接归因",
};

export function TelemetryView() {
  const [days, setDays] = useState(7);
  const [refresh, setRefresh] = useState(0);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch(`/api/admin/telemetry?days=${days}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "遥测数据加载失败");
      if (!signal?.aborted) setSummary(data.telemetry);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "遥测数据加载失败");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [days]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-900">公开页面与体检遥测</h2>
        <div className="flex items-center gap-2">
          <select aria-label="遥测时间范围" value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
            <option value={1}>最近 1 天</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option>
          </select>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{loading ? "加载中…" : "刷新"}</button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">爬虫名称仅来自 User-Agent 自述，未验证运营方身份。请求数包含重复访问，已排除带预取、RSC 或测试标记的请求，明细保留 90 天；不代表独立访客、搜索收录或 AI 引用。签名链接归因也不等于已验证的真人点击。</p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {loading && <p role="status" className="text-sm text-slate-500">正在读取最近 {days} 天的数据…</p>}
      {summary && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["记录事件", summary.totalEvents7d], ["UA 声称的爬虫请求", summary.aiCrawlerHits7d],
            ["完成公开体检", summary.publicAudits7d], ["保存联系请求", summary.inboundLeads7d],
            ["签名链接归因", summary.outreachClicks7d], ["文章请求（未识别为爬虫）", summary.articleViews7d],
            ["报告请求", summary.reportViews7d],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-extrabold text-slate-900">{value}</div></div>)}
        </div>
        {summary.totalEvents7d === 0 && <p className="text-sm text-slate-500">此时间范围还没有记录。公开文章、LLM 文本、报告请求和完成体检后将显示数据。</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="mb-2 text-sm font-bold">UA 声称的爬虫</h3>{summary.botBreakdown.length ? <ul className="space-y-1 text-xs">{summary.botBreakdown.map((bot) => <li key={bot.botName} className="flex justify-between gap-3 rounded-lg bg-slate-50 p-2"><span>{bot.botName}</span><span>{bot.count} 次 · {new Date(bot.lastSeen).toLocaleString()}</span></li>)}</ul> : <p className="text-xs text-slate-500">暂无匹配的 User-Agent。</p>}</div>
          <div><h3 className="mb-2 text-sm font-bold">事件路径</h3>{summary.topPaths.length ? <ul className="space-y-1 text-xs">{summary.topPaths.map((item) => <li key={item.path} className="flex justify-between gap-3 rounded-lg bg-slate-50 p-2"><span className="break-all font-mono">{item.path}</span><span>{item.count}</span></li>)}</ul> : <p className="text-xs text-slate-500">暂无路径数据。</p>}</div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-sm font-bold">此时间范围最近 20 条事件</caption><thead><tr className="border-b border-slate-200 text-slate-500"><th className="p-2">时间</th><th className="p-2">事件</th><th className="p-2">路径</th><th className="p-2">UA 名称</th></tr></thead><tbody>{summary.recentEvents.map((event) => <tr key={event.id} className="border-b border-slate-100"><td className="whitespace-nowrap p-2">{new Date(event.createdAt).toLocaleString()}</td><td className="p-2">{eventLabels[event.eventType] || event.eventType}</td><td className="break-all p-2 font-mono">{event.path}</td><td className="p-2">{event.botName || "—"}</td></tr>)}</tbody></table></div>
      </>}
    </section>
  );
}
