"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Loader2,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
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

  const loadMarketplace = useCallback(async () => {
    const res = await fetch("/api/marketplace");
    if (!res.ok) return;
    const data = await res.json();
    setCredits(data.creditsBalance ?? 0);
    setAccounts(data.accounts || []);
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
            免养号 · 免排版 · 合规高权重矩阵代发
          </div>
          <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight">
            平台托管代发市场（Managed GEO Distribution）
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            不想自己注册和维护知乎、公众号、小红书或独立站？选好高分 GEO 文章，直接通过平台自营垂直评测矩阵与高权重专栏发布，未通过审核自动全额退还积分。
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

      {/* Step 2: Choose Managed Platform Channels */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-900">
          第二步：选择目标高权重发布渠道（自动 API 渠道秒级上线，矩阵评测号 24h 内人工合规代发）
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => {
            const isAuto = acc.deliveryMode === "auto_api";
            const busy = submittingId === acc.id;
            return (
              <div
                key={acc.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isAuto
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {isAuto ? "⚡ 官方协议秒发" : "🛡️ 平台矩阵审核代发"}
                    </span>
                    <span className="text-base font-black text-indigo-700">
                      {acc.creditCost} <span className="text-xs font-semibold text-slate-400">积分</span>
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-slate-900">{acc.name}</h3>
                  <div className="mt-1 text-xs font-medium text-slate-500">
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
                  支付 {acc.creditCost} 积分 · {isAuto ? "立即自动发布" : "提交平台代发"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

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
