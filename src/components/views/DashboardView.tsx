"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Radar,
  Send,
  Sparkles,
} from "lucide-react";
import type { BrandProfile, GeoArticle, PlanQuota, PublishLog } from "@/types/geo";
import { AI_ENGINE_LIST } from "@/lib/geo/weights";

interface Props {
  brands: BrandProfile[];
  articles: GeoArticle[];
  logs: PublishLog[];
  quota: PlanQuota;
  usage: {
    brandsCount: number;
    articlesTotal: number;
    articlesThisMonth: number;
    publishedCount: number;
    channelsCount: number;
    avgGeoScore: number;
    citationHitRate: number;
    citationsCount: number;
  };
  onNavigate: (tab: string, articleId?: string, brandId?: string) => void;
}

export function DashboardView({
  brands,
  articles,
  logs,
  quota,
  usage,
  onNavigate,
}: Props) {
  const avgByEngine = AI_ENGINE_LIST.map((engine) => {
    const score =
      articles.length > 0
        ? Math.round(
            articles.reduce((acc, a) => acc + (a.engineScores[engine.id] ?? a.geoScore), 0) /
              articles.length
          )
        : 0;
    return { engine, score };
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white shadow-sm md:flex-row md:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            {quota.label}
          </div>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight">
            GEO 品牌内容权重总览
          </h1>
          <p className="mt-1 text-sm text-indigo-100">
            只需维护品牌档案，系统即按 5 大 AI 引擎收录权重自动生成、评分并发布高引用文章。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate("brands")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
          >
            <Building2 className="h-4 w-4" />
            新增品牌档案
          </button>
          <button
            type="button"
            onClick={() => onNavigate("studio")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-xs transition hover:bg-indigo-50"
          >
            <Sparkles className="h-4 w-4" />
            立即设计 GEO 文章
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>平均 GEO 权重评分</span>
            <BarChart3 className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {usage.avgGeoScore}
            </span>
            <span className="text-xs font-medium text-slate-400">/ 100</span>
          </div>
          <p className="mt-1.5 text-xs text-emerald-600">
            {usage.avgGeoScore >= 85
              ? "优秀 · 具备高 AI 摘录就绪度"
              : usage.avgGeoScore >= 70
                ? "良好 · 建议进入工坊一键补全"
                : "待生成首篇高权重内容"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>已发布收录文章</span>
            <Globe2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {usage.publishedCount}
            </span>
            <span className="text-xs font-medium text-slate-400">
              / 共 {usage.articlesTotal} 篇
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <Link href="/hub" target="_blank" className="font-medium text-indigo-600 hover:underline">
              查看公开专栏 ↗
            </Link>
            <a href="/llms.txt" target="_blank" className="text-slate-500 hover:text-indigo-600">
              /llms.txt
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>AI 回答品牌提及率</span>
            <Radar className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {usage.citationHitRate}%
            </span>
            <span className="text-xs font-medium text-slate-400">
              ({usage.citationsCount} 次监测)
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("monitor")}
            className="mt-1.5 text-xs font-medium text-indigo-600 hover:underline"
          >
            前往 AI 收录监测台 →
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>本月套餐配额</span>
            <FileText className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {usage.articlesThisMonth}
            </span>
            <span className="text-xs font-medium text-slate-400">
              / {quota.maxArticlesPerMonth} 篇
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            品牌槽位：{usage.brandsCount} / {quota.maxBrands} 个
          </p>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 5 AI Engines Readiness */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">5 大 AI 引擎平均收录就绪度</h2>
          <p className="mt-1 text-xs text-slate-500">
            基于您当前所有内容按各引擎独立权重矩阵测算
          </p>
          <div className="mt-5 space-y-4">
            {avgByEngine.map(({ engine, score }) => (
              <div key={engine.id}>
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{engine.name}</span>
                    <span className="ml-2 text-[11px] text-slate-400">
                      {engine.region === "CN" ? "国内" : "海外"}
                    </span>
                  </div>
                  <span
                    className={`font-bold ${
                      score >= 85
                        ? "text-emerald-600"
                        : score >= 70
                          ? "text-indigo-600"
                          : "text-amber-600"
                    }`}
                  >
                    {score} 分
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      score >= 85
                        ? "bg-emerald-500"
                        : score >= 70
                          ? "bg-indigo-600"
                          : "bg-amber-500"
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Articles */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">近期 GEO 文章资产</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                点击任意文章进入双栏实时诊断编辑，或直接打开公开托管页面
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("publish")}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              全部文章与发布 →
            </button>
          </div>

          {articles.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-medium text-slate-700">还没有生成 GEO 文章</p>
              <button
                type="button"
                onClick={() => onNavigate("studio")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Sparkles className="h-3.5 w-3.5" />
                立即生成第一篇
              </button>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {articles.slice(0, 5).map((art) => {
                const b = brands.find((x) => x.id === art.brandId);
                return (
                  <div
                    key={art.id}
                    className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            art.status === "published"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {art.status === "published" ? "已上线" : "草稿"}
                        </span>
                        {b && (
                          <span className="font-medium text-indigo-600">{b.name}</span>
                        )}
                        <span className="font-semibold text-slate-700">
                          GEO {art.geoScore} 分
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate("studio", art.id)}
                        className="mt-1 block w-full max-w-full truncate text-left text-sm font-bold text-slate-900 hover:text-indigo-600"
                        title={art.title}
                      >
                        {art.title}
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigate("studio", art.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        诊断编辑
                      </button>
                      {art.status === "published" && (
                        <a
                          href={`/p/${art.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          公开页
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Publish Logs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Send className="h-4 w-4 text-indigo-600" />
            最近发布与 AI 索引同步记录
          </h2>
          <button
            type="button"
            onClick={() => onNavigate("publish")}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            管理分发渠道 →
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">暂无发布记录</p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {logs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2
                    className={`h-4 w-4 ${
                      log.status === "success" ? "text-emerald-600" : "text-rose-500"
                    }`}
                  />
                  <div>
                    <span className="font-semibold text-slate-800">{log.channelName}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="text-slate-600">{log.articleTitle || log.articleId}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <span>{log.message}</span>
                  <span className="text-slate-400">
                    {new Date(log.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
