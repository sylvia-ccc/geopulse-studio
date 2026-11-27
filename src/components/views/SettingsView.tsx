"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { CommercialSiteSettings, PlanQuota, PlanTier } from "@/types/geo";
import { LLM_PROVIDER_PRESETS, type LlmProviderPreset } from "@/lib/geo/llm-presets";

interface SanitizedUser {
  id: string;
  email: string;
  name: string;
  company: string;
  role?: "user" | "admin";
  plan: PlanTier;
  planExpiresAt?: string | null;
  apiKey: string;
  llmProvider: "none" | "openai" | "deepseek" | "gemini" | "custom";
  llmBaseUrl: string;
  llmApiKeyMasked: string;
  hasLlmApiKey: boolean;
  serverLlmEnabled?: boolean;
  llmModel: string;
}

interface Props {
  user: SanitizedUser;
  plans: PlanQuota[];
  siteConfig?: CommercialSiteSettings | null;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export function SettingsView({ user, plans, siteConfig, onRefresh, onNotify }: Props) {
  const [name, setName] = useState(user.name);
  const [company, setCompany] = useState(user.company);
  const [llmProvider, setLlmProvider] = useState(user.llmProvider);
  const [llmBaseUrl, setLlmBaseUrl] = useState(user.llmBaseUrl);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState(user.llmModel);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<LlmProviderPreset | null>(null);

  const applyLlmPreset = (preset: LlmProviderPreset) => {
    setSelectedPreset(preset);
    setLlmProvider(preset.providerKey);
    setLlmBaseUrl(preset.baseUrl);
    setLlmModel(preset.defaultModel);
    onNotify(`已自动填入「${preset.name}」接口与推荐模型 ${preset.defaultModel}，粘贴 API Key 保存即可`);
  };

  const handleRedeem = async (e: React.FormEvent) => {
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
      if (!res.ok) throw new Error(data.error || "兑换失败");
      setRedeemCode("");
      await onRefresh();
      onNotify(
        data.codeType === "credits"
          ? `积分充值成功！已到账 +${data.creditsAdded} 发布积分（当前余额 ${data.creditsBalance}）`
          : `激活成功！已升级为 ${String(data.plan).toUpperCase()}（有效期 +${data.durationDays} 天${data.creditsAdded ? `，赠送 +${data.creditsAdded} 积分` : ""}）`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "兑换失败", "error");
    } finally {
      setRedeeming(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        company,
        llmProvider,
        llmBaseUrl,
        llmModel,
      };
      if (llmApiKey.trim()) {
        payload.llmApiKey = llmApiKey.trim();
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setLlmApiKey("");
      await onRefresh();
      onNotify("系统与大模型配置已保存");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTestLlm = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider,
          llmBaseUrl,
          llmApiKey: llmApiKey.trim() || undefined,
          llmModel,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "连接失败");
      onNotify(data.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "连接测试失败", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleSwitchPlan = async (plan: PlanTier) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.ok) {
      await onRefresh();
      onNotify(`已切换至 ${plan.toUpperCase()} 商用套餐配额`);
    }
  };

  const handleRotateApiKey = async () => {
    if (!confirm("重置后旧的 API Key 将立即失效，确认重置吗？")) return;
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotateApiKey: true }),
    });
    if (res.ok) {
      await onRefresh();
      onNotify("商用 REST API Key 已重新生成");
    }
  };

  const copyApiKey = async () => {
    await navigator.clipboard.writeText(user.apiKey);
    setCopiedKey(true);
    onNotify("API Key 已复制");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">系统设置、LLM 接入与商用配额</h1>
        <p className="mt-1 text-sm text-slate-500">
          支持自带 DeepSeek / OpenAI / Gemini / 兼容中转密钥以启用实时大模型生成，同时提供开放 API 与 AI 爬虫设施状态。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* LLM & Account Config */}
        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Cpu className="h-4 w-4 text-indigo-600" />
              大模型引擎接入（支持 9 大国内外平台一键预设）
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                (user.hasLlmApiKey && user.llmProvider !== "none") || user.serverLlmEnabled
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {user.hasLlmApiKey && user.llmProvider !== "none"
                ? `BYOK 已加密接入 (${user.llmProvider})`
                : user.serverLlmEnabled
                  ? "服务端全局算力池已就绪"
                  : "当前使用内置零配置引擎"}
            </span>
          </div>

          {/* 9-Provider 1-Click Presets */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              快捷一键预设（点击自动填好接口地址与推荐模型，密钥采用 AES-256-GCM 加密存储）：
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {LLM_PROVIDER_PRESETS.map((preset) => {
                const active = selectedPreset?.id === preset.id || (llmBaseUrl === preset.baseUrl && Boolean(llmBaseUrl));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyLlmPreset(preset)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-200"
                        : "border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-bold text-slate-900">
                        {preset.name}
                      </span>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-slate-200">
                        {preset.badge}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
                      {preset.defaultModel}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedPreset && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2 text-xs text-emerald-900">
                <span>
                  <strong>{selectedPreset.name}</strong>：{selectedPreset.costNote}
                </span>
                <a
                  href={selectedPreset.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-indigo-700 underline"
                >
                  前往领取 API Key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">账号姓名</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">公司 / 团队</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                LLM 服务商
              </label>
              <select
                value={llmProvider}
                onChange={(e) =>
                  setLlmProvider(
                    e.target.value as "none" | "openai" | "deepseek" | "gemini" | "custom"
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="none">不配置（使用内置零配置 GEO 结构化引擎）</option>
                <option value="deepseek">DeepSeek (deepseek-chat)</option>
                <option value="openai">OpenAI (gpt-4o-mini / gpt-4o)</option>
                <option value="gemini">Google Gemini (OpenAI 兼容端点)</option>
                <option value="custom">自定义 OpenAI 兼容中转 / 私有模型</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                模型名称（留空用默认）
              </label>
              <input
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="例如：deepseek-chat / gpt-4o-mini / gemini-2.5-flash"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              API Base URL（自定义端点时填写）
            </label>
            <input
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              placeholder="例如：https://api.deepseek.com/v1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              LLM API Key {user.llmApiKeyMasked ? `（当前已保存：${user.llmApiKeyMasked}）` : ""}
            </label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="输入新密钥覆盖，留空则保持原密钥不变"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestLlm}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              )}
              测试模型连通性
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              保存配置
            </button>
          </div>
        </form>

        {/* Right: Commercial API Key + AI Crawler Health */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <KeyRound className="h-4 w-4 text-indigo-600" />
                商用开放 REST API Key
              </h2>
              <button
                type="button"
                onClick={handleRotateApiKey}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-600"
              >
                <RefreshCw className="h-3 w-3" />
                重置密钥
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              可通过 <code className="rounded bg-slate-100 px-1">x-api-key</code> 请求头自动化调用生成、评分与发布接口。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300">
                {user.apiKey}
              </code>
              <button
                type="button"
                onClick={copyApiKey}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                {copiedKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Globe2 className="h-4 w-4 text-emerald-600" />
              AI 搜索引擎爬虫基础设施（实时运行中）
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              每次发布文章都会自动更新以下全部标准 AI 索引入口：
            </p>
            <div className="mt-3 space-y-2 text-xs">
              {[
                { path: "/llms.txt", desc: "AI 引擎品牌与文章知识目录（标准规范）" },
                { path: "/llms-full.txt", desc: "全量 Markdown 语料索引（供 LLM 直接抓取）" },
                { path: "/sitemap.xml", desc: "动态 XML 站点地图" },
                { path: "/robots.txt", desc: "AI 爬虫放行声明（GPTBot / PerplexityBot / Bytespider）" },
                { path: "/hub", desc: "SSR 公开 GEO 托管专栏" },
              ].map((item) => (
                <a
                  key={item.path}
                  href={item.path}
                  target="_blank"
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <div>
                    <div className="font-mono font-bold text-indigo-700">{item.path}</div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Commercial License Redemption & Plans */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center">
          <div>
            <h2 className="text-base font-bold text-slate-900">商用 SaaS 套餐与卡密激活</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              当前套餐：<strong className="uppercase text-indigo-700">{user.plan}</strong>
              {user.planExpiresAt
                ? ` · 有效期至 ${new Date(user.planExpiresAt).toLocaleDateString("zh-CN")}`
                : " · 支持管理员后台批量发码激活变现"}
            </p>
          </div>
          <form onSubmit={handleRedeem} className="flex items-center gap-2">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="输入激活码，如 GP-PRO-2026-DEMO"
              className="w-56 rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs uppercase outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={redeeming}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {redeeming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              兑换激活
            </button>
          </form>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = user.plan === p.tier;
            return (
              <div
                key={p.tier}
                className={`rounded-2xl border p-5 ${
                  isCurrent
                    ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-100"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{p.label}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                      当前套餐
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-slate-900">
                    ¥{p.priceMonthlyCny}
                  </span>
                  <span className="text-xs text-slate-500">/ 月</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    最多 {p.maxBrands} 个品牌实体档案
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    每月 {p.maxArticlesPerMonth} 篇 GEO 文章生成额度
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {p.maxWebhooks} 个 Webhook / CMS 自动推送渠道
                  </li>
                </ul>
                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="mt-5 w-full rounded-xl bg-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    正在使用
                  </button>
                ) : siteConfig?.strictBilling && user.role !== "admin" ? (
                  (() => {
                    const url =
                      p.tier === "pro"
                        ? siteConfig.checkoutProUrl
                        : p.tier === "enterprise"
                          ? siteConfig.checkoutEnterpriseUrl
                          : "";
                    return url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 block w-full rounded-xl bg-indigo-600 py-2 text-center text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        购买 {p.tier.toUpperCase()} 激活码 →
                      </a>
                    ) : (
                      <div className="mt-5 rounded-xl bg-slate-100 px-3 py-2 text-center text-[11px] font-medium text-slate-600">
                        请在上方输入激活码升级 · {siteConfig.contactWechatOrEmail}
                      </div>
                    );
                  })()
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSwitchPlan(p.tier)}
                    className="mt-5 w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                  >
                    切换体验此档位
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
