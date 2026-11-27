"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  BrandProfile,
  CreditTransaction,
  DistributionOrder,
  GeoArticle,
  PlatformAccount,
} from "@/types/geo";

interface Props {
  brands: BrandProfile[];
  articles: GeoArticle[];
  onRefreshGlobal: () => Promise<void>;
  onGoStudio: (articleId?: string) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export function MarketplaceView({
  brands,
  articles,
  onRefreshGlobal,
  onGoStudio,
  onNotify,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [orders, setOrders] = useState<DistributionOrder[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id || "");
  const [customerNote, setCustomerNote] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [historyTab, setHistoryTab] = useState<"orders" | "ledger">("orders");
  const [showCnManaged, setShowCnManaged] = useState(false);
  const [blastIds, setBlastIds] = useState<string[]>([]);
  const [blasting, setBlasting] = useState(false);
  const [blastReport, setBlastReport] = useState<{
    netCharged: number;
    totalRefunded: number;
    results: Array<{
      orderId: string;
      platformName: string;
      region: string;
      status: "published" | "failed";
      publishedUrl: string;
      message: string;
    }>;
    proofMarkdown: string;
  } | null>(null);
  const [copiedProof, setCopiedProof] = useState(false);

  const loadMarketplace = useCallback(async () => {
    const res = await fetch("/api/marketplace");
    if (!res.ok) return;
    const data = await res.json();
    const fetchedAccounts: PlatformAccount[] = data.accounts || [];
    setCredits(data.creditsBalance ?? 0);
    setAccounts(fetchedAccounts);
    setBlastIds((prev) =>
      prev.length > 0
        ? prev.filter((id) => fetchedAccounts.some((a) => a.id === id && a.deliveryMode === "auto_api"))
        : fetchedAccounts.filter((a) => a.deliveryMode === "auto_api").map((a) => a.id)
    );
    setOrders(data.orders || []);
    setTransactions(data.transactions || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMarketplace();
  }, [loadMarketplace]);

  useEffect(() => {
    if (!selectedArticleId && articles[0]?.id) {
      setSelectedArticleId(articles[0].id);
    }
  }, [articles, selectedArticleId]);

  const selectedArticle = articles.find((a) => a.id === selectedArticleId) || articles[0];

  const handleOrder = async (account: PlatformAccount) => {
    if (!selectedArticle) {
      onNotify("请先在「GEO 创作工坊」生成至少一篇文章", "error");
      return;
    }
    if (credits < account.creditCost) {
      onNotify(
        `积分不足（当前 ${credits} 积分，需要 ${account.creditCost} 积分），请先在右上角兑换充值码`,
        "error"
      );
      return;
    }
    setSubmittingId(account.id);
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: selectedArticle.id,
          platformAccountId: account.id,
          customerNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "下单失败");

      setCustomerNote("");
      await Promise.all([loadMarketplace(), onRefreshGlobal()]);
      onNotify(
        data.order.status === "published"
          ? `发布成功！已即时上线至「${account.name}」`
          : `代发工单已提交（扣除 ${account.creditCost} 积分），审核发布后将自动回传链接`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "提交失败", "error");
    } finally {
      setSubmittingId(null);
    }
  };

  const handleGlobalBlast = async () => {
    if (!selectedArticle) {
      onNotify("请先在「GEO 创作工坊」生成至少一篇文章", "error");
      return;
    }
    if (blastIds.length === 0) {
      onNotify("请至少勾选 1 个全球官方 API 渠道", "error");
      return;
    }
    setBlasting(true);
    try {
      const res = await fetch("/api/marketplace/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: selectedArticle.id,
          platformAccountIds: blastIds,
          customerNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "全网联发失败");
      setBlastReport({
        netCharged: data.netCharged,
        totalRefunded: data.totalRefunded,
        results: data.results || [],
        proofMarkdown: data.proofMarkdown || "",
      });
      await Promise.all([loadMarketplace(), onRefreshGlobal()]);
      const okCount = (data.results || []).filter(
        (r: { status: string }) => r.status === "published"
      ).length;
      onNotify(
        `全网联发完成！成功上线 ${okCount}/${(data.results || []).length} 个全球官方渠道（实扣 ${data.netCharged} 积分）`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "全网联发失败", "error");
    } finally {
      setBlasting(false);
    }
  };

  const handleCopyProof = async () => {
    if (!blastReport?.proofMarkdown) return;
    await navigator.clipboard.writeText(blastReport.proofMarkdown);
    setCopiedProof(true);
    onNotify("已复制 Markdown 客户交付外链证明报告！");
    setTimeout(() => setCopiedProof(false), 2000);
  };

  const handleRedeemCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "充值失败");
      setRedeemCode("");
      await Promise.all([loadMarketplace(), onRefreshGlobal()]);
      onNotify(
        data.codeType === "credits"
          ? `积分充值成功！到账 +${data.creditsAdded} 积分，当前余额 ${data.creditsBalance}`
          : `套餐激活成功（赠送 +${data.creditsAdded} 发布积分）`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "兑换失败", "error");
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
        加载托管代发市场...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Credits Wallet */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-sm lg:flex-row lg:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
            <Rocket className="h-3.5 w-3.5" />
            Global Official Auto-API First · 欧美/日本/全球高权重官方接口秒级直发
          </div>
          <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight">
            全球官方 API 托管发布市场（Global GEO Auto-Distribution）
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            优先接入 DEV.to（欧美）、Qiita（日本）、GitHub Pages（DA 96）、Telegraph、Bluesky、Ghost 与 WordPress 等官方全自动 API：下单即秒发、自动写入 Canonical URL 与 JSON-LD；发布失败自动全额退还积分。
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
                <Wallet className="h-3.5 w-3.5" />
                我的发布积分余额
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white">{credits}</span>
                <span className="text-xs text-slate-300">积分</span>
              </div>
            </div>
            <Coins className="h-8 w-8 text-amber-300" />
          </div>

          <form onSubmit={handleRedeemCredits} className="mt-3 flex items-center gap-2">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="积分码，如 GP-CRD-2026-100C"
              className="w-48 rounded-lg border border-white/20 bg-slate-900/70 px-2.5 py-1.5 font-mono text-[11px] uppercase text-white placeholder:text-slate-400 outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={redeeming}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {redeeming ? "..." : "充值"}
            </button>
          </form>
        </div>
      </div>

      {/* Step 1: Select Article */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">第一步：选择要托管代发的 GEO 文章</h2>
          {selectedArticle && selectedArticle.geoScore < 75 && (
            <button
              type="button"
              onClick={() => onGoStudio(selectedArticle.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              当前评分 {selectedArticle.geoScore}，建议先一键优化至 80+ 提高过审率 →
            </button>
          )}
        </div>

        {articles.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
            还没有可发布的文章，
            <button
              type="button"
              onClick={() => onGoStudio()}
              className="font-bold text-indigo-600 underline"
            >
              前往 GEO 创作工坊生成一篇 →
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-12">
            <select
              value={selectedArticle?.id || ""}
              onChange={(e) => setSelectedArticleId(e.target.value)}
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 md:col-span-7"
            >
              {articles.map((a) => {
                const b = brands.find((x) => x.id === a.brandId);
                return (
                  <option key={a.id} value={a.id}>
                    [GEO {a.geoScore}分] {b ? `【${b.name}】` : ""}
                    {a.title}
                  </option>
                );
              })}
            </select>
            <input
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="代发备注（选填，例如：希望重点带官网链接 / 指定话题标签）"
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs outline-none focus:border-indigo-500 md:col-span-5"
            />
          </div>
        )}
      </div>

      {/* Step 2: Global Official Auto-API Channels (Primary) */}
      {(() => {
        const autoApiAccounts = accounts.filter((a) => a.deliveryMode === "auto_api");
        const managedAccounts = accounts.filter((a) => a.deliveryMode !== "auto_api");
        const renderCard = (acc: PlatformAccount) => {
          const isAuto = acc.deliveryMode === "auto_api";
          const busy = submittingId === acc.id;
          return (
            <div
              key={acc.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isAuto
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {isAuto ? "⚡ 官方 API 秒发" : "🛡️ 人工审核代发"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {acc.region || "Global"}
                    </span>
                  </div>
                  <span className="text-base font-black text-indigo-700">
                    {acc.creditCost} <span className="text-xs font-semibold text-slate-400">积分</span>
                  </span>
                </div>

                <h3 className="mt-3 text-base font-bold text-slate-900">{acc.name}</h3>
                <div className="mt-1 font-mono text-[11px] font-medium text-slate-500">
                  {acc.handleOrDomain}
                </div>
                {acc.authorityBadge && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <ShieldCheck className="h-3 w-3" />
                    {acc.authorityBadge}
                  </div>
                )}
                <p className="mt-2.5 text-xs leading-relaxed text-slate-600">{acc.description}</p>
              </div>

              <button
                type="button"
                disabled={busy || !selectedArticle}
                onClick={() => void handleOrder(acc)}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-600 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                支付 {acc.creditCost} 积分 · {isAuto ? "立即 API 自动发布" : "提交平台代发"}
              </button>
            </div>
          );
        };

        const selectedAuto = autoApiAccounts.filter((a) => blastIds.includes(a.id));
        const rawSum = selectedAuto.reduce((s, a) => s + a.creditCost, 0);
        const hasBundleDiscount = selectedAuto.length >= 2;
        const discountedSum = hasBundleDiscount
          ? selectedAuto.reduce((s, a) => s + Math.round(a.creditCost * 0.8), 0)
          : rawSum;

        return (
          <div className="space-y-5">
            {/* One-Click Global Multi-Channel Blast Pack */}
            {autoApiAccounts.length >= 2 && (
              <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-emerald-50/70 p-5 shadow-xs">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      <Zap className="h-3 w-3" />
                      机构与出海团队爆款 · 立省 20% 积分
                    </div>
                    <h2 className="mt-2 flex items-center gap-2 text-base font-extrabold text-slate-900">
                      <Layers className="h-4 w-4 text-indigo-600" />
                      一键全网官方 API 同步联发包（Global Multi-Channel Auto-Blast）
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      1 次点击并行铺发至所选海外高权重官方 API，秒级生成多平台信源共现并输出可发给客户的 Markdown 外链交付报告；任一单渠道失败自动按比例原路退款。
                    </p>
                  </div>
                  <div className="shrink-0 text-left lg:text-right">
                    <div className="flex items-baseline gap-2 lg:justify-end">
                      {hasBundleDiscount && (
                        <span className="text-xs font-semibold text-slate-400 line-through">
                          原价 {rawSum} 积分
                        </span>
                      )}
                      <span className="text-2xl font-black text-indigo-700">{discountedSum}</span>
                      <span className="text-xs font-bold text-slate-500">积分</span>
                    </div>
                    <button
                      type="button"
                      disabled={blasting || !selectedArticle || selectedAuto.length === 0}
                      onClick={() => void handleGlobalBlast()}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {blasting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Rocket className="h-3.5 w-3.5" />
                      )}
                      {blasting
                        ? "正在并行推送至全球官方 API..."
                        : `一键联发至 ${selectedAuto.length} 个官方平台（${discountedSum} 积分）`}
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {autoApiAccounts.map((acc) => {
                    const checked = blastIds.includes(acc.id);
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() =>
                          setBlastIds((prev) =>
                            prev.includes(acc.id)
                              ? prev.filter((x) => x !== acc.id)
                              : [...prev, acc.id]
                          )
                        }
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                          checked
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                        }`}
                      >
                        <span>{checked ? "✓" : "+"}</span>
                        <span>{acc.name.split("·")[0].trim()}</span>
                        <span className={checked ? "text-indigo-200" : "text-slate-400"}>
                          ({acc.region || "Global"})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {blastReport && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-emerald-800">
                        本次全网联发交付矩阵（实扣 {blastReport.netCharged} 积分
                        {blastReport.totalRefunded > 0
                          ? `，失败渠道已自动退还 ${blastReport.totalRefunded} 积分`
                          : ""}
                        ）
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyProof()}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-600"
                      >
                        {copiedProof ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        复制客户交付外链报告（Markdown）
                      </button>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {blastReport.results.map((r) => (
                        <div
                          key={r.orderId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold ${
                                r.status === "published" ? "text-emerald-700" : "text-rose-600"
                              }`}
                            >
                              {r.status === "published" ? "✅ 已上线" : "❌ 失败已退分"}
                            </span>
                            <span className="font-semibold text-slate-800">{r.platformName}</span>
                          </div>
                          {r.publishedUrl ? (
                            <a
                              href={r.publishedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-indigo-600 underline"
                            >
                              {r.publishedUrl}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-rose-600">{r.message}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  第二步：单渠道按需直发（{autoApiAccounts.length} 个全球官方 API 已就绪 · 秒级上线返链接）
                </h2>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  支持 ChatGPT Search / Perplexity / Google AIO / DeepSeek
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {autoApiAccounts.map(renderCard)}
              </div>
            </div>

            {managedAccounts.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <button
                  type="button"
                  onClick={() => setShowCnManaged((v) => !v)}
                  className="flex w-full items-center justify-between text-left text-xs font-bold text-slate-700 hover:text-indigo-700"
                >
                  <span>
                    国内人工审单代发通道（可选 · 知乎 / 公众号 / 小红书，共 {managedAccounts.length} 个）
                  </span>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {showCnManaged ? "收起 ▲" : "展开查看 ▼"}
                  </span>
                </button>
                {showCnManaged && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {managedAccounts.map(renderCard)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Step 3: Orders & Credit Ledger */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setHistoryTab("orders")}
              className={`rounded-lg px-3 py-1.5 ${
                historyTab === "orders"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              我的代发订单（{orders.length}）
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab("ledger")}
              className={`rounded-lg px-3 py-1.5 ${
                historyTab === "ledger"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              积分变动流水（{transactions.length}）
            </button>
          </div>
        </div>

        {historyTab === "orders" ? (
          orders.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              暂无代发订单，选择上方任意渠道即可发起首单托管发布。
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {ord.status === "published" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          已发布上线
                        </span>
                      )}
                      {ord.status === "pending_review" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-800">
                          <Clock className="h-3 w-3" />
                          审核代发中
                        </span>
                      )}
                      {(ord.status === "rejected" || ord.status === "failed") && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">
                          <XCircle className="h-3 w-3" />
                          已驳回/退款
                        </span>
                      )}
                      <span className="font-bold text-slate-800">{ord.platformName}</span>
                      <span className="text-slate-400">-{ord.creditsCharged} 积分</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-900">
                      {ord.articleTitle || ord.articleId}
                    </div>
                    {ord.adminNote && (
                      <div className="mt-0.5 text-xs text-slate-500">进度说明：{ord.adminNote}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {ord.publishedUrl && (
                      <a
                        href={ord.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        查看已发布页面
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {new Date(ord.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : transactions.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">暂无积分变动记录</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <div className="font-semibold text-slate-800">{tx.reason}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(tx.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono font-bold ${
                      tx.delta >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {tx.delta >= 0 ? `+${tx.delta}` : tx.delta} 积分
                  </div>
                  <div className="text-[11px] text-slate-400">余额 {tx.balanceAfter}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
