"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Globe2,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AI_ENGINE_LIST } from "@/lib/geo/weights";

interface SitePublicReport {
  targetUrl: string;
  origin: string;
  overallScore: number;
  grade: string;
  ttfbMs: number;
  checks: {
    hasRobotsTxt: boolean;
    hasLlmsTxt: boolean;
    hasSitemapXml: boolean;
    hasJsonLd: boolean;
    isSsrRich: boolean;
    wordCount: number;
  };
  botPermissions: Array<{ bot: string; engine: string; allowed: boolean }>;
  topRecommendations: Array<{ severity: string; title: string; detail: string }>;
  totalRecommendations: number;
}

interface ContentPublicAudit {
  overallScore: number;
  grade: string;
  engineScores: Record<string, number>;
  topIssues: Array<{ id: string; severity: string; title: string; detail: string }>;
  totalIssues: number;
  strengths: string[];
}

const SAMPLE_COPY = `我们公司推出了一款超好用的小微企业记账软件轻舟云账，全网第一、绝对最强、100%有效！操作简单，欢迎老板们联系购买。`;

export function PublicAuditWidget() {
  const [mode, setMode] = useState<"content" | "site">("content");
  const [url, setUrl] = useState("https://geo.workagentpro.com");
  const [brandName, setBrandName] = useState("轻舟云账");
  const [category, setCategory] = useState("小微企业财税 SaaS");
  const [content, setContent] = useState(SAMPLE_COPY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [siteReport, setSiteReport] = useState<SitePublicReport | null>(null);
  const [contentAudit, setContentAudit] = useState<ContentPublicAudit | null>(null);
  const [auditToken, setAuditToken] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureMessage, setCaptureMessage] = useState("");
  const [captureError, setCaptureError] = useState("");
  const autoRanRef = useRef(false);

  const runSiteAuditDirect = useCallback(async (targetUrl: string) => {
    setError("");
    setLoading(true);
    setAuditToken("");
    setCaptureMessage("");
    setCaptureError("");
    setConsent(false);
    try {
      const res = await fetch("/api/public/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "site", url: targetUrl,
          lid: new URLSearchParams(window.location.search).get("lid") || undefined,
          lsig: new URLSearchParams(window.location.search).get("lsig") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "诊断失败");
      setAuditToken(data.auditToken || "");
      setSiteReport(data.report);
      setContentAudit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRanRef.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qUrl = params.get("url")?.trim();
    if (qUrl) {
      autoRanRef.current = true;
      setMode("site");
      setUrl(qUrl);
      if (params.get("auto") === "1") {
        void runSiteAuditDirect(qUrl);
      }
    }
  }, [runSiteAuditDirect]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setAuditToken("");
    setCaptureMessage("");
    setCaptureError("");
    setConsent(false);
    try {
      const payload =
        mode === "site"
          ? { mode: "site", url,
              lid: new URLSearchParams(window.location.search).get("lid") || undefined,
              lsig: new URLSearchParams(window.location.search).get("lsig") || undefined,
            }
          : { mode: "content", brandName, category, content };
      const res = await fetch("/api/public/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "诊断失败");
      setAuditToken(data.auditToken || "");
      if (mode === "site") {
        setSiteReport(data.report);
        setContentAudit(null);
      } else {
        setContentAudit(data.audit);
        setSiteReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async (event: React.FormEvent) => {
    event.preventDefault();
    setCaptureBusy(true);
    setCaptureError("");
    try {
      const response = await fetch("/api/public/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, auditToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败，请稍后重试");
      setCaptureMessage(data.message);
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "保存失败，请稍后重试");
    } finally { setCaptureBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-indigo-950/5 sm:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            免登录 · 3 秒实时体验
          </span>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900">
            免费测一测：你的文章 / 官网容易被 AI 推荐吗？
          </h2>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode("content");
              setError("");
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
              mode === "content" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            文案 5 引擎秒测
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("site");
              setError("");
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
              mode === "site" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            官网 AI 爬虫体检
          </button>
        </div>
      </div>

      <form onSubmit={handleRun} className="mt-5 space-y-4">
        {mode === "content" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="你的品牌或产品名（如：轻舟云账）"
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="所属品类（如：小微企业财税软件）"
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <textarea
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴你的产品介绍、公众号推文或知乎文章草稿（至少 20 字）..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3.5 text-sm leading-relaxed outline-none focus:border-indigo-500"
            />
          </>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="输入任意公网官网网址，例如 https://geo.workagentpro.com"
                className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {mode === "content"
              ? "实时模拟豆包、DeepSeek、ChatGPT、Perplexity 与 Gemini 五大权重打分"
              : "实时检测 6 大 AI 爬虫放行状态、/llms.txt、SSR 正文与 JSON-LD"}
          </span>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {mode === "content" ? "立即测算 GEO 得分" : "立即体检官网"}
          </button>
        </div>
      </form>

      {/* Content Audit Result */}
      {contentAudit && (
        <div className="mt-6 space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-indigo-700">综合 AI 收录就绪评分</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">
                  {contentAudit.overallScore}
                </span>
                <span className="text-sm text-slate-400">/ 100 · 等级 {contentAudit.grade}</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {AI_ENGINE_LIST.map((e) => (
                <div key={e.id} className="rounded-xl bg-white px-2.5 py-2 shadow-2xs">
                  <div className="text-[10px] font-medium text-slate-500">
                    {e.shortName.split("·")[0]}
                  </div>
                  <div className="text-sm font-extrabold text-indigo-700">
                    {contentAudit.engineScores[e.id] ?? contentAudit.overallScore}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {contentAudit.topIssues.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                发现 {contentAudit.totalIssues} 项扣分短板（免费展示前 3 项）：
              </div>
              {contentAudit.topIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs shadow-2xs"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <div>
                    <div className="font-bold text-slate-900">{issue.title}</div>
                    <div className="mt-0.5 text-slate-500">{issue.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Lock className="h-3.5 w-3.5 text-emerald-400" />
              登录工作台可编辑优化文案，并生成带 JSON-LD 的发布专栏
            </span>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3.5 py-1.5 font-bold text-slate-950 hover:bg-emerald-400"
            >
              登录编辑优化
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Site Audit Result */}
      {siteReport && (
        <div className="mt-6 space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-indigo-700">
                {siteReport.origin} AI 技术友好度
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">
                  {siteReport.overallScore}
                </span>
                <span className="text-sm text-slate-400">
                  / 100 · 等级 {siteReport.grade} · TTFB {siteReport.ttfbMs}ms
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "/llms.txt", ok: siteReport.checks.hasLlmsTxt },
                { label: "JSON-LD", ok: siteReport.checks.hasJsonLd },
                { label: "SSR 正文", ok: siteReport.checks.isSsrRich },
                { label: "Sitemap", ok: siteReport.checks.hasSitemapXml },
              ].map((c) => (
                <span
                  key={c.label}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
                    c.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {c.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {siteReport.botPermissions.map((b) => (
              <div
                key={b.bot}
                className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold shadow-2xs"
              >
                <span className="truncate font-mono text-slate-700">{b.bot}</span>
                {b.allowed ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                )}
              </div>
            ))}
          </div>

          {siteReport.topRecommendations.length > 0 && (
            <div className="space-y-2">
              {siteReport.topRecommendations.map((r, i) => (
                <div key={i} className="rounded-xl bg-white p-3 text-xs shadow-2xs">
                  <div className="font-bold text-slate-900">{r.title}</div>
                  <div className="mt-0.5 text-slate-500">{r.detail}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white">
            <span className="font-semibold">
              共检测到 {siteReport.totalRecommendations} 项可优化建议，登录工作台查看完整修复代码并一键托管合规 GEO 专栏
            </span>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3.5 py-1.5 font-bold text-slate-950 hover:bg-emerald-400"
            >
              解锁完整报告
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
      {auditToken && (siteReport || contentAudit) && (
        <form onSubmit={handleCapture} className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-bold text-slate-900">需要团队联系你提供修复建议？</h3>
          <p className="text-xs text-slate-600">可选：留下邮箱与本次体检结果。提交后不会自动发送邮件，也不会自动订阅营销邮件。</p>
          {captureMessage ? <p role="status" className="text-sm text-emerald-700">{captureMessage}</p> : <>
            <label className="block text-xs font-semibold text-slate-700">
              联系邮箱
              <input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="you@company.com" />
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              我同意保存我的邮箱和本次体检结果，并由团队就修复建议联系我。
            </label>
            <button type="submit" disabled={!consent || captureBusy || loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {captureBusy ? "正在保存…" : "请求联系"}
            </button>
          </>}
          {captureError && <p role="alert" className="text-xs text-rose-700">{captureError}</p>}
        </form>
      )}
    </div>
  );
}
