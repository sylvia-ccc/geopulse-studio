"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  Rocket,
  Save,
  Shield,
  Store,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import type {
  CommercialSiteSettings,
  DistributionOrder,
  PlanTier,
  PlatformAccount,
  PlatformAccountType,
  RedemptionCode,
  UserRole,
} from "@/types/geo";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  company: string;
  role: UserRole;
  plan: PlanTier;
  planExpiresAt: string | null;
  brandsCount: number;
  articlesCount: number;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  paidUsers: number;
  totalBrands: number;
  totalArticles: number;
  publishedArticles: number;
  activeCodes: number;
  redeemedCodes: number;
}

interface Props {
  onRefreshGlobal?: () => Promise<void>;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export function AdminView({ onRefreshGlobal, onNotify }: Props) {
  const [subTab, setSubTab] = useState<"billing" | "accounts" | "orders">("billing");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [codes, setCodes] = useState<RedemptionCode[]>([]);
  const [siteCfg, setSiteCfg] = useState<CommercialSiteSettings | null>(null);
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [orders, setOrders] = useState<DistributionOrder[]>([]);

  // Code generator state
  const [codeType, setCodeType] = useState<"plan" | "credits">("plan");
  const [genPlan, setGenPlan] = useState<"pro" | "enterprise">("pro");
  const [genDays, setGenDays] = useState(30);
  const [genCredits, setGenCredits] = useState(100);
  const [genCount, setGenCount] = useState(5);
  const [genNote, setGenNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [savingSite, setSavingSite] = useState(false);
  const [seedingGrowth, setSeedingGrowth] = useState(false);

  // New platform account state (Global Official Auto-API First)
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<PlatformAccountType>("devto");
  const [accMode, setAccMode] = useState<"auto_api" | "managed_review">("auto_api");
  const [accRegion, setAccRegion] = useState("US / EU");
  const [accHandle, setAccHandle] = useState("");
  const [accBadge, setAccBadge] = useState("");
  const [accDesc, setAccDesc] = useState("");
  const [accCost, setAccCost] = useState(25);
  const [accUrl, setAccUrl] = useState("https://dev.to/api/articles");
  const [accHeader, setAccHeader] = useState("api-key");
  const [accCred, setAccCred] = useState("");
  const [savingAcc, setSavingAcc] = useState(false);

  // Order fulfillment URLs map
  const [orderUrls, setOrderUrls] = useState<Record<string, string>>({});
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, cfgRes, accRes, ordRes] = await Promise.all([
        fetch("/api/admin/overview"),
        fetch("/api/site-config"),
        fetch("/api/admin/platform-accounts"),
        fetch("/api/admin/orders"),
      ]);
      const ov = await ovRes.json();
      if (!ovRes.ok) throw new Error(ov.error || "加载运营数据失败");
      setStats(ov.stats);
      setUsers(ov.users || []);
      setCodes(ov.codes || []);
      if (cfgRes.ok) {
        const cfgJson = await cfgRes.json();
        setSiteCfg(cfgJson.config || null);
      }
      if (accRes.ok) {
        const accJson = await accRes.json();
        setPlatformAccounts(accJson.accounts || []);
      }
      if (ordRes.ok) {
        const ordJson = await ordRes.json();
        setOrders(ordJson.orders || []);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleGenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codeType,
          plan: genPlan,
          durationDays: codeType === "credits" ? 0 : genDays,
          creditsAmount: codeType === "credits" ? genCredits : undefined,
          count: genCount,
          note: genNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setGenNote("");
      await loadData();
      onNotify(`已成功批量生成 ${data.codes.length} 个${codeType === "credits" ? "积分充值码" : "套餐激活码"}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "生成失败", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const res = await fetch(`/api/admin/overview?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onNotify("激活码已作废");
      await loadData();
    }
  };

  const handleSaveSiteConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteCfg) return;
    setSavingSite(true);
    try {
      const res = await fetch("/api/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandTitle: siteCfg.brandTitle,
          announcement: siteCfg.announcement,
          checkoutProUrl: siteCfg.checkoutProUrl,
          checkoutEnterpriseUrl: siteCfg.checkoutEnterpriseUrl,
          contactWechatOrEmail: siteCfg.contactWechatOrEmail,
          acquisitionNote: siteCfg.acquisitionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setSiteCfg(data.config);
      onNotify("站点品牌与商业收款配置已生效");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSavingSite(false);
    }
  };

  const handleSeedGrowthPack = async () => {
    setSeedingGrowth(true);
    try {
      const res = await fetch("/api/admin/seed-growth-pack", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发布失败");
      await loadData();
      if (onRefreshGlobal) await onRefreshGlobal();
      onNotify(data.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "发布失败", "error");
    } finally {
      setSeedingGrowth(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAcc(true);
    try {
      const res = await fetch("/api/admin/platform-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accName,
          platformType: accType,
          deliveryMode: accMode,
          region: accRegion,
          handleOrDomain: accHandle,
          authorityBadge: accBadge,
          description: accDesc,
          creditCost: accCost,
          endpointUrl: accUrl,
          authHeader: accHeader,
          credential: accCred,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "添加失败");
      setAccName("");
      setAccHandle("");
      setAccBadge("");
      setAccDesc("");
      setAccUrl("");
      setAccCred("");
      await loadData();
      onNotify("平台矩阵账号已上架到「托管代发市场」");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "添加失败", "error");
    } finally {
      setSavingAcc(false);
    }
  };

  const handleToggleAccount = async (acc: PlatformAccount) => {
    const res = await fetch("/api/admin/platform-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: acc.id, enabled: !acc.enabled }),
    });
    if (res.ok) {
      onNotify(acc.enabled ? "已下架该代发渠道" : "已重新上架该代发渠道");
      await loadData();
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("确定删除该平台矩阵账号吗？")) return;
    const res = await fetch(`/api/admin/platform-accounts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onNotify("已删除矩阵账号");
      await loadData();
    }
  };

  const handleCopyOrderContent = async (orderId: string) => {
    const res = await fetch(`/api/admin/orders?exportOrderId=${encodeURIComponent(orderId)}`);
    const data = await res.json();
    if (!res.ok) {
      onNotify(data.error || "获取稿件失败", "error");
      return;
    }
    await navigator.clipboard.writeText(data.adapted.output);
    onNotify(`已复制「${data.adapted.channelLabel}」排版全文，直接粘贴发到你的矩阵号即可`);
  };

  const handleOrderAction = async (orderId: string, action: "fulfill" | "reject") => {
    const url = (orderUrls[orderId] || "").trim();
    if (action === "fulfill" && !url) {
      onNotify("请先填入已发布文章的真实外链 URL", "error");
      return;
    }
    setOrderBusyId(orderId);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          action,
          publishedUrl: url,
          adminNote: action === "fulfill" ? "已通过平台高权重矩阵号发布完成" : "内容暂不符合渠道规范，积分已全额退还",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "处理失败");
      await loadData();
      if (onRefreshGlobal) await onRefreshGlobal();
      onNotify(action === "fulfill" ? "工单已回填外链并通知客户！" : "已驳回并自动全额退还客户积分");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "处理失败", "error");
    } finally {
      setOrderBusyId(null);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    onNotify(`已复制激活码：${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
        加载商用运营后台...
      </div>
    );
  }

  const pendingOrdersCount = orders.filter((o) => o.status === "pending_review").length;

  return (
    <div className="space-y-6">
      {/* Header + Sub-tabs */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
            <Shield className="h-3.5 w-3.5" />
            平台管理员专属 · SaaS + 矩阵代发商业中台
          </div>
          <h1 className="mt-1.5 text-xl font-bold text-slate-900">商用运营与矩阵代发后台</h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-2xs">
          <button
            type="button"
            onClick={() => setSubTab("billing")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ${
              subTab === "billing" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            发码与收款配置
          </button>
          <button
            type="button"
            onClick={() => setSubTab("accounts")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ${
              subTab === "accounts" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            平台多账号池（{platformAccounts.length}）
          </button>
          <button
            type="button"
            onClick={() => setSubTab("orders")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ${
              subTab === "orders" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            客户代发工单
            {pendingOrdersCount > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                {pendingOrdersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Platform KPIs + Official Growth Pack CTA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "全站注册租户", val: stats.totalUsers, sub: `付费会员 ${stats.paidUsers}` },
          { label: "全站品牌实体", val: stats.totalBrands, sub: "已建档品牌" },
          { label: "累计生成文章", val: stats.totalArticles, sub: `上线 ${stats.publishedArticles}` },
          { label: "待发代发工单", val: pendingOrdersCount, sub: `总工单 ${orders.length}` },
          { label: "可用卡密库存", val: stats.activeCodes, sub: `已核销 ${stats.redeemedCodes}` },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500">{k.label}</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">{k.val}</div>
            <div className="mt-1 text-[11px] text-slate-400">{k.sub}</div>
          </div>
        ))}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="text-xs font-bold text-emerald-900">以 GEO 推 GEO 自推广</div>
          <p className="mt-1 text-[11px] text-emerald-800/90">
            一键为本站上线 3 篇高权重对比/教程文进 /llms.txt
          </p>
          <button
            type="button"
            disabled={seedingGrowth}
            onClick={() => void handleSeedGrowthPack()}
            className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {seedingGrowth ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            一键上线推广包
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: BILLING, CODES & SITE CONFIG */}
      {subTab === "billing" && (
        <>
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleGenerateCodes}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-4"
            >
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <KeyRound className="h-4 w-4 text-indigo-600" />
                批量生成商用卡密（会员 / 积分）
              </h2>

              <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setCodeType("plan")}
                  className={`rounded-md py-1.5 ${
                    codeType === "plan" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500"
                  }`}
                >
                  套餐会员激活码
                </button>
                <button
                  type="button"
                  onClick={() => setCodeType("credits")}
                  className={`rounded-md py-1.5 ${
                    codeType === "credits" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-500"
                  }`}
                >
                  代发积分充值码
                </button>
              </div>

              {codeType === "plan" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">目标套餐</label>
                    <select
                      value={genPlan}
                      onChange={(e) => setGenPlan(e.target.value as "pro" | "enterprise")}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    >
                      <option value="pro">Pro 专业版（附赠 50 代发积分）</option>
                      <option value="enterprise">Enterprise 旗舰版（附赠 300 代发积分）</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">有效天数</label>
                      <select
                        value={genDays}
                        onChange={(e) => setGenDays(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      >
                        <option value={30}>30 天（月卡）</option>
                        <option value={90}>90 天（季卡）</option>
                        <option value={365}>365 天（年卡）</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">生成数量</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={genCount}
                        onChange={(e) => setGenCount(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">每码积分面值</label>
                    <select
                      value={genCredits}
                      onChange={(e) => setGenCredits(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    >
                      <option value={50}>50 积分（约 ¥49）</option>
                      <option value={100}>100 积分（约 ¥99）</option>
                      <option value={300}>300 积分（约 ¥269）</option>
                      <option value={1000}>1000 积分（约 ¥799）</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">生成数量</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={genCount}
                      onChange={(e) => setGenCount(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">批次备注</label>
                <input
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  placeholder="例如：小报童发卡批次 / 客户充值"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                批量生成{codeType === "credits" ? "积分充值码" : "套餐激活码"}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
              <h2 className="text-sm font-bold text-slate-900">卡密库存与核销明细（{codes.length}）</h2>
              <div className="mt-3 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-2">卡密代码</th>
                      <th className="py-2 pr-2">面值 / 权益</th>
                      <th className="py-2 pr-2">状态</th>
                      <th className="py-2 pr-2">备注 / 核销人</th>
                      <th className="py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {codes.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 pr-2 font-mono font-bold text-slate-900">{c.code}</td>
                        <td className="py-2.5 pr-2">
                          {c.codeType === "credits" ? (
                            <span className="font-bold text-emerald-700">+{c.creditsAmount} 积分</span>
                          ) : (
                            <span>
                              <span className="font-bold uppercase text-indigo-700">{c.plan}</span> ·{" "}
                              {c.durationDays}天
                              {c.creditsAmount > 0 ? ` (+${c.creditsAmount}分)` : ""}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              c.status === "active"
                                ? "bg-emerald-50 text-emerald-700"
                                : c.status === "redeemed"
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {c.status === "active"
                              ? "待使用"
                              : c.status === "redeemed"
                                ? "已核销"
                                : "已作废"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-slate-500">
                          {c.redeemedByEmail || c.note || "-"}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void copyCode(c.code)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                            >
                              {copiedCode === c.code ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {c.status === "active" && (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(c.id)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Commercial Site Config */}
          {siteCfg && (
            <form
              onSubmit={handleSaveSiteConfig}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Store className="h-4 w-4 text-indigo-600" />
                    商用站点品牌与收款链接配置（零代码实时生效）
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    填入你的小报童 / 发卡网 / Stripe 收款链接与客服微信，首页定价区与升级按钮立即接入真实变现闭环
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={savingSite}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {savingSite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存站点商业配置
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">站点品牌名称</label>
                  <input
                    value={siteCfg.brandTitle}
                    onChange={(e) => setSiteCfg({ ...siteCfg, brandTitle: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">商务 / 客服联系方式</label>
                  <input
                    value={siteCfg.contactWechatOrEmail}
                    onChange={(e) => setSiteCfg({ ...siteCfg, contactWechatOrEmail: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Pro 版购买收款链接</label>
                  <input
                    value={siteCfg.checkoutProUrl}
                    onChange={(e) => setSiteCfg({ ...siteCfg, checkoutProUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Enterprise 版购买收款链接</label>
                  <input
                    value={siteCfg.checkoutEnterpriseUrl}
                    onChange={(e) => setSiteCfg({ ...siteCfg, checkoutEnterpriseUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">首页顶部公告条</label>
                  <input
                    value={siteCfg.announcement}
                    onChange={(e) => setSiteCfg({ ...siteCfg, announcement: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">开源 / 私有化 / 收购合作说明</label>
                  <input
                    value={siteCfg.acquisitionNote}
                    onChange={(e) => setSiteCfg({ ...siteCfg, acquisitionNote: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </form>
          )}

          {/* Tenant Users Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Users className="h-4 w-4 text-indigo-600" />
              租户用户列表（{users.length}）
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">用户 / 公司</th>
                    <th className="py-2 pr-3">邮箱</th>
                    <th className="py-2 pr-3">套餐 / 到期日</th>
                    <th className="py-2 pr-3">品牌</th>
                    <th className="py-2 pr-3">文章</th>
                    <th className="py-2">注册时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 pr-3 font-bold text-slate-900">
                        {u.name}
                        {u.role === "admin" && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                            ADMIN
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">{u.email}</td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold uppercase text-indigo-700">
                          {u.plan}
                        </span>
                        {u.planExpiresAt && (
                          <span className="ml-2 text-[11px] text-slate-400">
                            至 {new Date(u.planExpiresAt).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold">{u.brandsCount}</td>
                      <td className="py-2.5 pr-3 font-semibold">{u.articlesCount}</td>
                      <td className="py-2.5 text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 2: PLATFORM MULTI-ACCOUNT POOL */}
      {subTab === "accounts" && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleAddAccount}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5"
          >
            <h2 className="text-sm font-bold text-slate-900">
              绑定全球官方 API 账号（客户付费即秒发）
            </h2>
            <p className="text-xs text-slate-500">
              优先接入海外高付费区官方 API：DEV.to、Qiita（日本）、Bluesky、GitHub Pages、Telegraph、Hashnode、Ghost JWT 与 WordPress（密钥 AES-256-GCM 加密存储）。
            </p>

            <input
              required
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="渠道名称，如：DEV.to · GeoPulse Research (欧美开发者社区)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={accType}
                onChange={(e) => {
                  const t = e.target.value as PlatformAccountType;
                  setAccType(t);
                  const autoTypes: PlatformAccountType[] = [
                    "geo_network",
                    "devto",
                    "qiita",
                    "bluesky",
                    "telegraph",
                    "github_pages",
                    "hashnode",
                    "ghost",
                    "wordpress",
                    "webhook",
                  ];
                  const isAuto = autoTypes.includes(t);
                  setAccMode(isAuto ? "auto_api" : "managed_review");
                  if (t === "devto") {
                    setAccRegion("US / EU");
                    setAccUrl("https://dev.to/api/articles");
                    setAccHeader("api-key");
                  } else if (t === "qiita") {
                    setAccRegion("Japan");
                    setAccUrl("https://qiita.com/api/v2/items");
                    setAccHeader("Authorization");
                  } else if (t === "bluesky") {
                    setAccRegion("US / EU");
                    setAccUrl("https://bsky.social");
                    setAccHeader("AppPassword");
                  } else if (t === "telegraph") {
                    setAccRegion("Global");
                    setAccUrl("https://api.telegra.ph/createPage");
                    setAccHeader("access_token");
                  } else if (t === "github_pages") {
                    setAccRegion("Global");
                    setAccUrl("sylvia-ccc/geopulse-geo-hub");
                    setAccHeader("Authorization");
                  } else if (t === "hashnode") {
                    setAccRegion("US / EU");
                    setAccUrl("");
                    setAccHeader("Authorization");
                  } else if (t === "ghost") {
                    setAccRegion("US / EU");
                    setAccUrl("https://blog.example.com");
                    setAccHeader("Ghost JWT");
                  } else if (t === "wordpress" || t === "webhook") {
                    setAccRegion("Global");
                    setAccUrl("");
                    setAccHeader("Authorization");
                  } else {
                    setAccRegion("CN (Optional)");
                  }
                }}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              >
                <option value="devto">⚡ DEV.to 官方 API（欧美免费）</option>
                <option value="qiita">⚡ Qiita 官方 API v2（日本免费）</option>
                <option value="bluesky">⚡ Bluesky ATProto API（欧美免费）</option>
                <option value="github_pages">⚡ GitHub Pages API（全球 DA96）</option>
                <option value="telegraph">⚡ Telegraph 官方 API（全球秒发）</option>
                <option value="ghost">⚡ Ghost CMS Admin JWT（欧美专栏）</option>
                <option value="hashnode">⚡ Hashnode GraphQL API（欧美 Pro）</option>
                <option value="wordpress">⚡ WordPress REST API（全球独立站）</option>
                <option value="webhook">⚡ 自定义 Webhook（自动）</option>
                <option value="zhihu_managed">🛡️ 知乎矩阵（国内人工可选）</option>
                <option value="wechat_managed">🛡️ 公众号矩阵（国内人工可选）</option>
                <option value="xiaohongshu_managed">🛡️ 小红书矩阵（国内人工可选）</option>
                <option value="bundle_managed">🛡️ 国内组合包（人工可选）</option>
              </select>
              <input
                type="number"
                min={0}
                value={accCost}
                onChange={(e) => setAccCost(Number(e.target.value))}
                placeholder="定价（积分/篇）"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                value={accRegion}
                onChange={(e) => setAccRegion(e.target.value)}
                placeholder="目标区域（US / EU / Japan）"
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              />
              <input
                value={accHandle}
                onChange={(e) => setAccHandle(e.target.value)}
                placeholder="账号名 / 域名"
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              />
              <input
                value={accBadge}
                onChange={(e) => setAccBadge(e.target.value)}
                placeholder="权重标签，如 DA 85+"
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              />
            </div>

            <textarea
              rows={2}
              value={accDesc}
              onChange={(e) => setAccDesc(e.target.value)}
              placeholder="向客户展示的渠道简介与收录优势..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            {accMode === "auto_api" && (
              <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="text-[11px] font-bold text-indigo-800">
                  自动 API 连接凭证（仅服务端加密保存）
                </div>
                <input
                  value={accUrl}
                  onChange={(e) => setAccUrl(e.target.value)}
                  placeholder="API Endpoint（如 https://blog.xxx.com/wp-json/wp/v2/posts）"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={accHeader}
                    onChange={(e) => setAccHeader(e.target.value)}
                    placeholder="Auth Header"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="password"
                    value={accCred}
                    onChange={(e) => setAccCred(e.target.value)}
                    placeholder="API Key / user:app_pass"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={savingAcc}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              {savingAcc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              添加到平台发布市场
            </button>
          </form>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
            <h2 className="text-sm font-bold text-slate-900">
              已配置平台矩阵渠道（{platformAccounts.length}）
            </h2>
            <div className="space-y-2.5">
              {platformAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-bold ${
                          acc.enabled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {acc.enabled ? "已上架" : "已下架"}
                      </span>
                      <span className="font-bold text-slate-900">{acc.name}</span>
                      <span className="font-mono font-bold text-indigo-700">
                        {acc.creditCost} 积分/篇
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {acc.deliveryMode === "auto_api" ? "⚡ 官方 API 自动发" : "🛡️ 人工审核代发"} ·{" "}
                      {acc.handleOrDomain}
                      {acc.hasCredential ? " · 🔐 已绑定加密密钥" : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleAccount(acc)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {acc.enabled ? "下架" : "上架"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAccount(acc.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CUSTOMER DISTRIBUTION ORDER DESK */}
      {subTab === "orders" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900">
            客户托管代发工单审核台（待处理 {pendingOrdersCount} / 共 {orders.length}）
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            对于知乎、公众号、小红书等矩阵号工单：先一键复制对应平台排版稿件发至你的矩阵号，再粘贴真实外链点击「回传完成」；如内容违规点击「驳回退款」将自动退还客户全部积分。
          </p>

          {orders.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">暂无客户代发工单</p>
          ) : (
            <div className="mt-4 space-y-3">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 font-bold ${
                          ord.status === "published"
                            ? "bg-emerald-50 text-emerald-700"
                            : ord.status === "pending_review"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {ord.status === "published"
                          ? "已完成"
                          : ord.status === "pending_review"
                            ? "待审核发布"
                            : "已驳回退款"}
                      </span>
                      <span className="font-bold text-indigo-700">{ord.platformName}</span>
                      <span className="text-slate-500">
                        客户：{ord.userName} ({ord.userEmail})
                      </span>
                      <span className="font-bold text-slate-700">
                        已扣 {ord.creditsCharged} 积分
                      </span>
                      {ord.articleGeoScore != null && (
                        <span className="rounded bg-white px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-slate-200">
                          GEO {ord.articleGeoScore}分
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(ord.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-900">
                    {ord.articleTitle || ord.articleId}
                  </div>
                  {ord.customerNote && (
                    <div className="mt-1 text-xs text-slate-600">客户备注：{ord.customerNote}</div>
                  )}

                  {ord.status === "pending_review" ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => void handleCopyOrderContent(ord.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        复制平台排版稿件
                      </button>
                      <input
                        value={orderUrls[ord.id] || ""}
                        onChange={(e) =>
                          setOrderUrls({ ...orderUrls, [ord.id]: e.target.value })
                        }
                        placeholder="粘贴发布后的真实外链 URL（如 https://zhuanlan.zhihu.com/p/...）"
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={orderBusyId === ord.id}
                        onClick={() => void handleOrderAction(ord.id, "fulfill")}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        回传完成
                      </button>
                      <button
                        type="button"
                        disabled={orderBusyId === ord.id}
                        onClick={() => void handleOrderAction(ord.id, "reject")}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        驳回退积分
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {ord.publishedUrl && (
                        <a
                          href={ord.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-semibold text-indigo-600 underline"
                        >
                          {ord.publishedUrl}
                        </a>
                      )}
                      {ord.adminNote && <span>{ord.adminNote}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
