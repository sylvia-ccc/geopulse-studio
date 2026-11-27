"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Globe2,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { BrandProfile } from "@/types/geo";
import type { SiteGeoAuditResult } from "@/lib/geo/site-auditor";

interface Props {
  brands: BrandProfile[];
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export function SiteAuditView({ brands, onNotify }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SiteGeoAuditResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const runAudit = async (targetUrl?: string) => {
    const finalUrl = (targetUrl ?? url).trim();
    if (!finalUrl) {
      onNotify("请输入需要体检的官网网址", "error");
      return;
    }
    if (targetUrl) setUrl(targetUrl);
    setLoading(true);
    try {
      const res = await fetch("/api/site-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "体检失败");
      setReport(data.report);
      onNotify(`官网 AI 技术体检完成：综合得分 ${data.report.overallScore}/100`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "官网体检失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const copySnippet = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    onNotify("修复代码已复制到剪贴板");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
          <Bot className="h-3.5 w-3.5" />
          对标 Scrunch AI 技术体检引擎
        </div>
        <h1 className="mt-1.5 text-xl font-bold text-slate-900">
          官网 AI 爬虫与收录技术体检
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          实时检测目标站点（自有官网或竞品官网）是否放行 6 大 AI 爬虫、是否具备 /llms.txt、SSR 可读性与 Schema JSON-LD，并直接给出可复制修复代码。
        </p>
      </div>

      {/* URL Input Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAudit();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="输入任意公网域名或文章链接，例如 https://example.com"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            开始 AI 技术体检
          </button>
        </form>

        {/* Quick Brand Website Shortcuts */}
        {brands.some((b) => b.websiteUrl) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">快捷检测品牌官网：</span>
            {brands
              .filter((b) => b.websiteUrl)
              .map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => void runAudit(b.websiteUrl)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {b.name} ({b.websiteUrl.replace(/^https?:\/\//, "")})
                </button>
              ))}
          </div>
        )}
      </div>

      {!report && !loading && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "1. AI 爬虫放行检测",
              desc: "逐项解析 robots.txt，核验 GPTBot、OAI-SearchBot、PerplexityBot、ClaudeBot、Google-Extended 与 Bytespider 抓取权限。",
            },
            {
              title: "2. 机器索引资产核查",
              desc: "检测站点根目录 /llms.txt、/llms-full.txt、/sitemap.xml 与 Schema.org JSON-LD 实体完整度。",
            },
            {
              title: "3. SSR 可读性与修复代码",
              desc: "识别纯前端空白 SPA 渲染瓶颈与 TTFB 耗时，自动生成可一键复制粘贴的修复片段，也可作为代运营售前签单工具。",
            },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* Audit Result */}
      {report && (
        <div className="space-y-6">
          {/* Score Overview */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-4">
              <div>
                <div className="text-xs font-semibold text-slate-500">站点 AI 技术友好分</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">
                    {report.overallScore}
                  </span>
                  <span className="text-sm text-slate-400">/ 100</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  HTTP {report.httpStatus} · TTFB {report.ttfbMs}ms · 正文 {report.checks.wordCount} 字
                </div>
              </div>
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-black ${
                  report.grade === "S" || report.grade === "A"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : report.grade === "B"
                      ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                }`}
              >
                {report.grade}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:grid-cols-4 lg:col-span-8">
              {[
                { label: "/llms.txt 索引", ok: report.checks.hasLlmsTxt },
                { label: "JSON-LD Schema", ok: report.checks.hasJsonLd },
                { label: "SSR 正文直出", ok: report.checks.isSsrRich },
                { label: "/sitemap.xml", ok: report.checks.hasSitemapXml },
                { label: "robots.txt", ok: report.checks.hasRobotsTxt },
                { label: "Meta Description", ok: report.checks.hasMetaDescription },
                { label: "Canonical 规范链", ok: report.checks.hasCanonical },
                { label: "/llms-full.txt", ok: report.checks.hasLlmsFullTxt },
              ].map((chk, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                    chk.ok
                      ? "border-emerald-200 bg-emerald-50/50 text-emerald-800"
                      : "border-rose-200 bg-rose-50/40 text-rose-800"
                  }`}
                >
                  {chk.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  )}
                  <span className="truncate">{chk.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 6 AI Bot Permissions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900">
              6 大主流 AI 搜索引擎爬虫放行状态（{report.origin}/robots.txt）
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {report.botPermissions.map((b) => (
                <div
                  key={b.bot}
                  className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                >
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">{b.bot}</div>
                    <div className="text-[11px] text-slate-500">{b.engine}</div>
                    <div className="mt-1 text-[11px] text-slate-600">{b.rule}</div>
                  </div>
                  {b.allowed ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      放行
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      拦截
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actionable Fix Recommendations */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900">
              可执行修复建议与代码片段（{report.recommendations.length}）
            </h2>
            {report.recommendations.length === 0 ? (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
                太棒了！目标站点的 AI 爬虫放行、/llms.txt 与结构化数据全部达标。
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {report.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-4 text-xs ${
                      rec.severity === "critical"
                        ? "border-rose-200 bg-rose-50/40"
                        : "border-amber-200 bg-amber-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          rec.severity === "critical" ? "text-rose-600" : "text-amber-600"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">{rec.title}</div>
                        <p className="mt-1 text-slate-600">{rec.detail}</p>
                        {rec.snippet && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between rounded-t-lg bg-slate-800 px-3 py-1.5 text-[11px] text-slate-300">
                              <span>推荐修复配置</span>
                              <button
                                type="button"
                                onClick={() => void copySnippet(rec.snippet!, idx)}
                                className="inline-flex items-center gap-1 font-semibold text-emerald-300 hover:text-emerald-200"
                              >
                                {copiedIdx === idx ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                {copiedIdx === idx ? "已复制" : "复制代码"}
                              </button>
                            </div>
                            <pre className="overflow-x-auto rounded-b-lg bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
                              {rec.snippet}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
