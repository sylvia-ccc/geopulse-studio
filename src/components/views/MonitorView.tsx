"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Globe,
  Lightbulb,
  Loader2,
  Plus,
  Radar,
  Share2,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type { AIEngineId, BrandProfile, CitationCheck, FunnelStage } from "@/types/geo";
import { AI_ENGINE_LIST, AI_ENGINES } from "@/lib/geo/weights";
import type { BuyerPromptItem } from "@/lib/geo/generator";

interface Props {
  brands: BrandProfile[];
  checks: CitationCheck[];
  hasLlmKey: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const STAGE_LABELS: Record<FunnelStage, string> = {
  awareness: "认知探索",
  comparison: "竞品对比",
  decision: "采购决策",
  trust: "口碑背书",
};

export function MonitorView({
  brands,
  checks,
  hasLlmKey,
  onRefresh,
  onNotify,
}: Props) {
  const [filterBrandId, setFilterBrandId] = useState<string>("all");
  const [brandId, setBrandId] = useState(brands[0]?.id || "");
  const [promptQuery, setPromptQuery] = useState("");
  const [engineId, setEngineId] = useState<AIEngineId>("deepseek");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("comparison");
  const [mode, setMode] = useState<"manual" | "live_llm">("manual");
  const [mentioned, setMentioned] = useState(true);
  const [positionRank, setPositionRank] = useState(1);
  const [citedUrl, setCitedUrl] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");
  const [hasHallucination, setHasHallucination] = useState(false);
  const [sentiment, setSentiment] = useState<"positive" | "neutral" | "negative">("positive");
  const [snippet, setSnippet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [promptCorpus, setPromptCorpus] = useState<BuyerPromptItem[]>([]);
  const [loadingCorpus, setLoadingCorpus] = useState(false);

  const visibleChecks =
    filterBrandId === "all" ? checks : checks.filter((c) => c.brandId === filterBrandId);

  const totalChecks = visibleChecks.length;
  const hitChecks = visibleChecks.filter((c) => c.mentioned).length;
  const overallHitRate = totalChecks > 0 ? Math.round((hitChecks / totalChecks) * 100) : 0;

  const engineStats = AI_ENGINE_LIST.map((engine) => {
    const list = visibleChecks.filter((c) => c.engineId === engine.id);
    const hits = list.filter((c) => c.mentioned).length;
    return {
      engine,
      total: list.length,
      hitRate: list.length > 0 ? Math.round((hits / list.length) * 100) : 0,
    };
  });

  // Compute Competitor Share of Voice (SOV)
  const sovCounts = new Map<string, { count: number; isSelf: boolean }>();
  for (const c of visibleChecks) {
    const selfName = c.brandName || brands.find((b) => b.id === c.brandId)?.name || "本品牌";
    if (c.mentioned) {
      const prev = sovCounts.get(selfName) || { count: 0, isSelf: true };
      sovCounts.set(selfName, { count: prev.count + 1, isSelf: true });
    }
    for (const comp of c.competitorsMentioned || []) {
      const prev = sovCounts.get(comp) || { count: 0, isSelf: false };
      sovCounts.set(comp, { count: prev.count + 1, isSelf: prev.isSelf });
    }
  }
  const totalSovMentions = Array.from(sovCounts.values()).reduce((a, b) => a + b.count, 0) || 1;
  const sovList = Array.from(sovCounts.entries())
    .map(([name, info]) => ({
      name,
      count: info.count,
      isSelf: info.isSelf,
      share: Math.round((info.count / totalSovMentions) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Compute Cited Source Domains
  const domainCounts = new Map<string, number>();
  for (const c of visibleChecks) {
    if (c.sourceDomain) {
      domainCounts.set(c.sourceDomain, (domainCounts.get(c.sourceDomain) || 0) + 1);
    }
  }
  const domainList = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const handleLoadCorpus = async () => {
    const targetBrandId = brandId || brands[0]?.id;
    if (!targetBrandId) return;
    setLoadingCorpus(true);
    try {
      const res = await fetch(`/api/brands/${targetBrandId}/prompts`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成词库失败");
      setPromptCorpus(data.prompts || []);
      onNotify("已生成 12 条买方全漏斗高意向提问词库，点击任意词条即可一键监测");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "生成失败", "error");
    } finally {
      setLoadingCorpus(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBrandId = brandId || brands[0]?.id;
    if (!targetBrandId) {
      onNotify("请先创建品牌档案", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: targetBrandId,
          promptQuery,
          engineId,
          funnelStage,
          mode,
          mentioned,
          positionRank: mentioned ? positionRank : null,
          citedUrl,
          competitorsMentioned: competitorsText
            .split(/[,，、]/)
            .map((s) => s.trim())
            .filter(Boolean),
          hasHallucination,
          sentiment,
          snippet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "记录失败");

      setPromptQuery("");
      setSnippet("");
      setCitedUrl("");
      setCompetitorsText("");
      setHasHallucination(false);
      await onRefresh();
      onNotify(
        mode === "live_llm"
          ? `实时探测完成：${data.check.mentioned ? "已提及品牌" : "暂未提及品牌"}`
          : "AI 收录与 SOV 监测记录已保存"
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "提交失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/citations?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onNotify("记录已删除");
      await onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI 收录监测与竞品声量份额（SOV）</h1>
          <p className="mt-1 text-sm text-slate-500">
            对标 Profound / Peec AI：追踪各引擎品牌提及率、竞品声量占比、AI 引用来源域名分布与全漏斗提问词库。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const targetId =
                filterBrandId !== "all" ? filterBrandId : brandId || brands[0]?.id;
              if (!targetId) {
                onNotify("请先创建至少一个品牌档案", "error");
                return;
              }
              const res = await fetch(`/api/reports/brand/${encodeURIComponent(targetId)}/share`);
              const data = await res.json();
              if (!res.ok || !data.shareUrl) {
                onNotify(data.error || "生成分享链接失败", "error");
                return;
              }
              await navigator.clipboard.writeText(data.shareUrl);
              onNotify("已复制免登录白标客户报告链接！可直接发给客户浏览或打印 PDF");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700"
          >
            <Share2 className="h-3.5 w-3.5" />
            复制客户白标报告链接
          </button>
          <select
            value={filterBrandId}
            onChange={(e) => setFilterBrandId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs"
          >
            <option value="all">全部品牌汇总</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                仅看：{b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Engine Visibility Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
          <div className="text-xs font-semibold text-indigo-700">综合品牌提及率</div>
          <div className="mt-2 text-3xl font-extrabold text-indigo-900">
            {overallHitRate}%
          </div>
          <div className="mt-1 text-[11px] text-indigo-600">
            命中 {hitChecks} / {totalChecks} 次监测
          </div>
        </div>
        {engineStats.map(({ engine, total, hitRate }) => (
          <div
            key={engine.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="truncate text-xs font-semibold text-slate-600">
              {engine.shortName}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {total > 0 ? `${hitRate}%` : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{total} 条记录</div>
          </div>
        ))}
      </div>

      {/* SOV & Source Domain Attribution Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            AI 回答竞品声量份额（Share of Voice）
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            统计相同业务提问中，本品牌与竞品被 AI 提及推荐的相对占比
          </p>
          {sovList.length === 0 ? (
            <p className="mt-4 text-xs text-slate-400">暂无竞品声量对比数据</p>
          ) : (
            <div className="mt-4 space-y-3">
              {sovList.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {item.name}
                      {item.isSelf && (
                        <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          本品牌
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-slate-700">
                      {item.share}% ({item.count}次)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        item.isSelf ? "bg-emerald-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${item.share}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Globe className="h-4 w-4 text-emerald-600" />
            AI 高频引用来源域名（Citation Attribution）
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            定位 AI 引擎最信任的外部信源站点，精准指导下一步渠道发稿重心
          </p>
          {domainList.length === 0 ? (
            <p className="mt-4 text-xs text-slate-400">暂无来源域名统计</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {domainList.map(([domain, count]) => (
                <div
                  key={domain}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs"
                >
                  <span className="font-mono font-semibold text-slate-800">{domain}</span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-bold text-indigo-700">
                    被引用 {count} 次
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Buyer Prompt Corpus Generator */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-amber-950">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              买方全漏斗提问词库（Conversation Explorer）
            </h2>
            <p className="mt-0.5 text-xs text-amber-800/80">
              自动围绕品牌生成「认知探索 / 竞品对比 / 采购决策 / 口碑背书」12 条高转化提问词
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLoadCorpus()}
            disabled={loadingCorpus || brands.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loadingCorpus ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            生成 12 条监测词库
          </button>
        </div>

        {promptCorpus.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {promptCorpus.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPromptQuery(p.prompt);
                  setEngineId(p.recommendedEngine);
                  setFunnelStage(p.funnelStage);
                  onNotify("已回填至下方监测表单");
                }}
                className="rounded-xl border border-amber-200/80 bg-white p-3 text-left transition hover:border-indigo-400"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                    {p.stageLabel}
                  </span>
                  <span className="text-slate-400">
                    推荐：{AI_ENGINES[p.recommendedEngine].shortName}
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-semibold text-slate-800">{p.prompt}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Form & History */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Radar className="h-4 w-4 text-indigo-600" />
              新增 AI 引用监测
            </h2>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`rounded-md px-2.5 py-1 ${
                  mode === "manual" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
                }`}
              >
                手工登记
              </button>
              <button
                type="button"
                onClick={() => setMode("live_llm")}
                className={`rounded-md px-2.5 py-1 ${
                  mode === "live_llm" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500"
                }`}
              >
                实时 LLM 探测
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">品牌</label>
              <select
                value={brandId || brands[0]?.id || ""}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">AI 引擎</label>
              <select
                value={engineId}
                onChange={(e) => setEngineId(e.target.value as AIEngineId)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              >
                {AI_ENGINE_LIST.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">漏斗阶段</label>
              <select
                value={funnelStage}
                onChange={(e) => setFunnelStage(e.target.value as FunnelStage)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              >
                <option value="awareness">认知探索</option>
                <option value="comparison">竞品对比</option>
                <option value="decision">采购决策</option>
                <option value="trust">口碑背书</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              用户真实提问词（Prompt）*
            </label>
            <input
              required
              value={promptQuery}
              onChange={(e) => setPromptQuery(e.target.value)}
              placeholder="例如：2026年适合小微企业的财税软件哪个性价比高？"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
          </div>

          {mode === "live_llm" ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs text-indigo-900">
              {hasLlmKey ? (
                <span>将自动向已接入大模型发起真实提问，并自动识别本品牌与竞品提及情况。</span>
              ) : (
                <span>
                  提示：请在「设置与配额」配置 LLM API Key（或由管理员配置服务端全局模型池）以启用实时探测。
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={mentioned}
                    onChange={(e) => setMentioned(e.target.checked)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  是否提及本品牌
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  disabled={!mentioned}
                  value={positionRank}
                  onChange={(e) => setPositionRank(Number(e.target.value))}
                  placeholder="推荐排位"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:bg-slate-100"
                />
                <select
                  value={sentiment}
                  onChange={(e) =>
                    setSentiment(e.target.value as "positive" | "neutral" | "negative")
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="positive">正向推荐</option>
                  <option value="neutral">中立提及</option>
                  <option value="negative">负向/未上榜</option>
                </select>
              </div>
              <input
                value={competitorsText}
                onChange={(e) => setCompetitorsText(e.target.value)}
                placeholder="同期回答中出现的竞品（顿号分隔，如：金蝶精斗云、用友畅捷通）"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                value={citedUrl}
                onChange={(e) => setCitedUrl(e.target.value)}
                placeholder="被引用的来源链接（自动提取域名统计，如 https://zhihu.com/...）"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <label className="flex items-center gap-2 text-xs font-medium text-rose-700">
                <input
                  type="checkbox"
                  checked={hasHallucination}
                  onChange={(e) => setHasHallucination(e.target.checked)}
                  className="h-3.5 w-3.5 accent-rose-600"
                />
                标记 AI 存在错误信息或幻觉（如价格/定位描述过时，需发布纠偏文）
              </label>
              <textarea
                rows={3}
                value={snippet}
                onChange={(e) => setSnippet(e.target.value)}
                placeholder="摘录 AI 回答关键片段..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "live_llm" ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {mode === "live_llm" ? "发起实时模型探测" : "保存监测记录"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
          <h2 className="text-sm font-bold text-slate-900">
            历史监测流水（{visibleChecks.length}）
          </h2>
          {visibleChecks.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-500">暂无监测数据</p>
          ) : (
            <div className="mt-4 space-y-3">
              {visibleChecks.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                          c.mentioned
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {c.mentioned ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {c.mentioned
                          ? `已提及${c.positionRank ? ` · 第 ${c.positionRank} 位` : ""}`
                          : "未提及"}
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
                        {AI_ENGINES[c.engineId]?.shortName || c.engineId}
                      </span>
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {STAGE_LABELS[c.funnelStage] || "对比"}
                      </span>
                      {c.brandName && (
                        <span className="font-semibold text-indigo-600">{c.brandName}</span>
                      )}
                      {c.hasHallucination && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          <AlertCircle className="h-3 w-3" />
                          幻觉预警
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-900">
                    “{c.promptQuery}”
                  </div>
                  {c.snippet && (
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{c.snippet}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.sourceDomain && (
                        <span className="font-mono text-indigo-600">来源：{c.sourceDomain}</span>
                      )}
                      {c.competitorsMentioned?.length > 0 && (
                        <span>同场竞品：{c.competitorsMentioned.join("、")}</span>
                      )}
                    </div>
                    <span>{new Date(c.checkedAt).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
