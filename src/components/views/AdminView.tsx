"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import type { PlanTier, RedemptionCode, UserRole } from "@/types/geo";

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
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export function AdminView({ onNotify }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [codes, setCodes] = useState<RedemptionCode[]>([]);

  const [genPlan, setGenPlan] = useState<"pro" | "enterprise">("pro");
  const [genDays, setGenDays] = useState(30);
  const [genCount, setGenCount] = useState(5);
  const [genNote, setGenNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/overview");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载运营数据失败");
      setStats(data.stats);
      setUsers(data.users || []);
      setCodes(data.codes || []);
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
          plan: genPlan,
          durationDays: genDays,
          count: genCount,
          note: genNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setGenNote("");
      await loadData();
      onNotify(`已成功批量生成 ${data.codes.length} 个商用激活码`);
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

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
          <Shield className="h-3.5 w-3.5" />
          平台管理员专属 · 商用变现中心
        </div>
        <h1 className="mt-1.5 text-xl font-bold text-slate-900">商用 SaaS 运营与发码后台</h1>
        <p className="mt-1 text-sm text-slate-500">
          批量生成 Pro / Enterprise 会员激活码（可直接通过微信、支付宝、小报童或闲鱼售卖发货），实时查看全站租户与内容资产规模。
        </p>
      </div>

      {/* Platform KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "全站注册租户", val: stats.totalUsers, sub: `付费会员 ${stats.paidUsers}` },
          { label: "全站品牌实体", val: stats.totalBrands, sub: "已建档客户品牌" },
          { label: "累计生成文章", val: stats.totalArticles, sub: `公开上线 ${stats.publishedArticles}` },
          { label: "待发货激活码", val: stats.activeCodes, sub: "可用库存" },
          { label: "已核销激活码", val: stats.redeemedCodes, sub: "已成交兑换" },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500">{k.label}</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">{k.val}</div>
            <div className="mt-1 text-[11px] text-slate-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Redemption Code Generator + List */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleGenerateCodes}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-4"
        >
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            批量生成会员激活码
          </h2>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">目标套餐</label>
            <select
              value={genPlan}
              onChange={(e) => setGenPlan(e.target.value as "pro" | "enterprise")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="pro">中小企业专业版 (Pro · ¥299/月)</option>
              <option value="enterprise">机构多品牌旗舰版 (Enterprise · ¥1299/月)</option>
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

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">批次备注（选填）</label>
            <input
              value={genNote}
              onChange={(e) => setGenNote(e.target.value)}
              placeholder="例如：微信群首发批次 / 代运营客户A"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={generating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            批量生成激活码
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          <h2 className="text-sm font-bold text-slate-900">激活码库存与核销明细（{codes.length}）</h2>
          <div className="mt-3 max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-2">激活码</th>
                  <th className="py-2 pr-2">套餐 / 天数</th>
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
                      <span className="uppercase font-semibold text-indigo-700">{c.plan}</span> ·{" "}
                      {c.durationDays}天
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
                          title="复制激活码"
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
                            title="作废"
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
                <th className="py-2 pr-3">品牌数</th>
                <th className="py-2 pr-3">文章数</th>
                <th className="py-2">注册时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3">
                    <span className="font-bold text-slate-900">{u.name}</span>
                    {u.role === "admin" && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        ADMIN
                      </span>
                    )}
                    {u.company && <div className="text-[11px] text-slate-400">{u.company}</div>}
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
    </div>
  );
}
