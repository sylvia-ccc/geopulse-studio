"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Globe2,
  Loader2,
  Mail,
  Plus,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type { OutreachEmailConfig, OutreachLead, OutreachSegment } from "@/types/geo";

interface Props {
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const SEGMENT_LABELS: Record<OutreachSegment, string> = {
  agency_white_label: "SEO/GEO 机构白标（高客单）",
  saas_growth: "出海 SaaS / 品牌增长",
  strategic_acquirer: "腰部工具战略收购/授权方",
};

const STATUS_BADGE: Record<OutreachLead["status"], { label: string; cls: string }> = {
  new: { label: "待体检", cls: "bg-slate-100 text-slate-600" },
  audited: { label: "已出定制稿", cls: "bg-indigo-50 text-indigo-700" },
  emailed: { label: "已触达", cls: "bg-emerald-50 text-emerald-700" },
  replied: { label: "已回复", cls: "bg-amber-50 text-amber-800" },
  converted: { label: "已成交", cls: "bg-emerald-600 text-white" },
  unsubscribed: { label: "已退订拦截", cls: "bg-rose-50 text-rose-700" },
};

export function OutreachView({ onNotify }: Props) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [cfg, setCfg] = useState<OutreachEmailConfig | null>(null);
  const [showCfg, setShowCfg] = useState(false);

  // Email API config form
  const [provider, setProvider] = useState<OutreachEmailConfig["provider"]>("resend");
  const [fromName, setFromName] = useState("GeoPulse Research");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [apiKey, setApiKey] = useState("");
  const [savingCfg, setSavingCfg] = useState(false);

  // Add lead / Bulk import
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [segment, setSegment] = useState<OutreachSegment>("agency_white_label");
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);

  // Per-lead active state
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [leadsRes, cfgRes] = await Promise.all([
      fetch("/api/outreach/leads"),
      fetch("/api/outreach/send"),
    ]);
    if (leadsRes.ok) {
      const lJson = await leadsRes.json();
      setLeads(lJson.leads || []);
    }
    if (cfgRes.ok) {
      const cJson = await cfgRes.json();
      const c: OutreachEmailConfig = cJson.config;
      setCfg(c);
      setProvider(c.provider === "none" ? "resend" : c.provider);
      setFromName(c.fromName || "GeoPulse Research");
      setFromEmail(c.fromEmail || "");
      setReplyTo(c.replyTo || "");
      setWebhookUrl(c.webhookUrl || "");
      setDailyLimit(c.dailyLimit || 20);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          fromName,
          fromEmail,
          replyTo,
          webhookUrl,
          dailyLimit,
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setApiKey("");
      setCfg(data.config);
      setShowCfg(false);
      onNotify("官方邮件 API 配置已加密保存（内置每日限额与一键退订合规保护）");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSavingCfg(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const payload =
        addMode === "bulk"
          ? { bulkText, segment }
          : { companyName, contactName, email, websiteUrl, segment };
      const res = await fetch("/api/outreach/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "添加失败");
      setCompanyName("");
      setContactName("");
      setEmail("");
      setWebsiteUrl("");
      setBulkText("");
      await loadAll();
      onNotify(
        addMode === "bulk"
          ? `已成功批量导入 ${data.createdCount} 条意向线索`
          : "意向线索已加入体检获客池"
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "添加失败", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleAuditAndDraft = async (lead: OutreachLead) => {
    setBusyLeadId(lead.id);
    try {
      const res = await fetch("/api/outreach/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, action: "audit_and_draft" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "体检失败");
      await loadAll();
      setExpandedLeadId(lead.id);
      setDraftEdits((prev) => ({
        ...prev,
        [lead.id]: { subject: data.lead.emailSubject, body: data.lead.emailBody },
      }));
      onNotify(
        `已完成 ${lead.companyName} 实时 AI 爬虫体检（${data.lead.auditScore}/100 · ${data.lead.auditGrade}级）并生成定制触达邮件！`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "体检失败", "error");
    } finally {
      setBusyLeadId(null);
    }
  };

  const handleSaveDraft = async (leadId: string) => {
    const edit = draftEdits[leadId];
    if (!edit) return;
    const res = await fetch("/api/outreach/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: leadId,
        emailSubject: edit.subject,
        emailBody: edit.body,
      }),
    });
    if (res.ok) {
      await loadAll();
      onNotify("定制邮件草稿已保存");
    }
  };

  const handleSendEmail = async (lead: OutreachLead) => {
    if (draftEdits[lead.id]) {
      await handleSaveDraft(lead.id);
    }
    setBusyLeadId(lead.id);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送失败");
      await loadAll();
      onNotify(`已通过官方邮件 API 成功发送至 ${lead.email}（自动附带一键退订合规链接）`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "发送失败", "error");
    } finally {
      setBusyLeadId(null);
    }
  };

  const handleCopyDraft = async (lead: OutreachLead) => {
    const edit = draftEdits[lead.id];
    const subj = edit?.subject ?? lead.emailSubject;
    const body = edit?.body ?? lead.emailBody;
    await navigator.clipboard.writeText(`Subject: ${subj}\n\n${body}`);
    setCopiedId(lead.id);
    onNotify("已复制定制邮件主题与正文，可直接粘贴到 Gmail / Outlook 发送");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStatusChange = async (leadId: string, status: OutreachLead["status"]) => {
    const res = await fetch("/api/outreach/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId, status }),
    });
    if (res.ok) await loadAll();
  };

  const handleDelete = async (leadId: string) => {
    const res = await fetch(`/api/outreach/leads?id=${encodeURIComponent(leadId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadAll();
      onNotify("已删除该线索");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
        加载 AI 体检获客与邮件触达工作台...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white lg:flex-row lg:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
            <Mail className="h-3.5 w-3.5" />
            Audit-to-Outreach · 白标机构拓客 & 潜在收购方精准触达引擎
          </div>
          <h1 className="mt-2 text-2xl font-extrabold">AI 体检线索与官方 API 邮件触达</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            输入意向机构、出海 SaaS 或战略买方官网 → 自动实跑真实 AI 爬虫体检 → 生成附带对方真实得分与互动体检链接（`/audit?url=...&auto=1`）的价值型邮件 → 审核后经 Resend / Brevo 官方 API 合规直发（强制每日限额 + 一键退订黑名单）。
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-white/15 bg-white/10 p-4 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-indigo-200">官方发信通道</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold uppercase text-emerald-300">
              {cfg?.provider && cfg.provider !== "none" ? cfg.provider : "未绑定(可复制手发)"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span className="text-slate-300">今日安全发信配额</span>
            <span className="font-mono font-bold text-white">
              {cfg?.sentToday ?? 0} / {cfg?.dailyLimit ?? 20} 封
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowCfg((v) => !v)}
            className="mt-3 w-full rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-indigo-50"
          >
            {showCfg ? "收起邮件 API 配置 ▲" : "配置 Resend / Brevo 官方邮件 API ⚙"}
          </button>
        </div>
      </div>

      {/* Collapsible Email API Config */}
      {showCfg && (
        <form
          onSubmit={handleSaveConfig}
          className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                绑定官方邮件 API（Resend 月免 3,000 封 / Brevo 日免 300 封）
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                域名信誉安全建议：请使用独立发信子域名（如 mail.workagentpro.com），并保持每日安全限额 ≤ 50 封。
              </p>
            </div>
            <button
              type="submit"
              disabled={savingCfg}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              {savingCfg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              加密保存发信配置
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">官方发信服务商</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as OutreachEmailConfig["provider"])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="resend">Resend Official API（推荐 · 月免 3,000 封）</option>
                <option value="brevo">Brevo Official API（日免 300 封）</option>
                <option value="webhook">自定义发信 Webhook（Zapier / Make / n8n）</option>
                <option value="none">暂不直发（仅生成草稿复制手发）</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">发件人名称</label>
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="GeoPulse Research"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                发件人邮箱（From Email）
              </label>
              <input
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="hello@mail.workagentpro.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">回复接收邮箱（Reply-To）</label>
              <input
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="sylviacccyu@gmail.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                每日安全上限（1–50 封）
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                API Key {cfg?.hasApiKey ? "（🔐 已绑定，留空保持不变）" : ""}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === "resend" ? "re_xxxxxxxxx" : "xkeysib-xxxxxxxxx"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
            {provider === "webhook" && (
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Webhook 接收地址</label>
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
            )}
          </div>
        </form>
      )}

      {/* Pipeline KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "全部线索", val: leads.length },
          { label: "已 AI 体检出稿", val: leads.filter((l) => l.auditScore != null).length },
          { label: "已发送触达", val: leads.filter((l) => l.status === "emailed").length },
          {
            label: "已回复 / 成交",
            val: leads.filter((l) => l.status === "replied" || l.status === "converted").length,
          },
          { label: "退订黑名单", val: leads.filter((l) => l.unsubscribed).length },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500">{k.label}</div>
            <div className="mt-1.5 text-2xl font-black text-slate-900">{k.val}</div>
          </div>
        ))}
      </div>

      {/* Add Lead / Bulk Import */}
      <form
        onSubmit={handleAddLead}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">导入意向客户 / 收购方线索</h2>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setAddMode("single")}
              className={`rounded-md px-3 py-1 ${addMode === "single" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500"}`}
            >
              单条添加
            </button>
            <button
              type="button"
              onClick={() => setAddMode("bulk")}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1 ${addMode === "bulk" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500"}`}
            >
              <Upload className="h-3 w-3" />
              批量 CSV 导入
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-12">
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value as OutreachSegment)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold md:col-span-4"
          >
            {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                模板画像：{v}
              </option>
            ))}
          </select>

          {addMode === "single" ? (
            <>
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="公司 / 机构名（如 GrowthLab SEO）"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs md:col-span-2"
              />
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="联系人名（选填）"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs md:col-span-2"
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="收件邮箱"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs md:col-span-2"
              />
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="官网 URL（用于实时体检）"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs md:col-span-2"
              />
            </>
          ) : (
            <textarea
              rows={3}
              required
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"每行一条，格式：公司名, 联系人, 邮箱, 官网URL\nAcme Agency, Alex, alex@acme.io, https://acme.io"}
              className="rounded-xl border border-slate-300 p-3 font-mono text-xs md:col-span-8"
            />
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {addMode === "bulk" ? "批量导入线索" : "加入线索池"}
          </button>
        </div>
      </form>

      {/* Leads List */}
      <div className="space-y-3">
        {leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-400">
            暂无线索。输入任意目标机构或 SaaS 官网，点击「AI 体检并生成定制邮件」即可体验高转化体检破冰！
          </div>
        ) : (
          leads.map((lead) => {
            const badge = STATUS_BADGE[lead.status] || STATUS_BADGE.new;
            const busy = busyLeadId === lead.id;
            const expanded = expandedLeadId === lead.id;
            const edit = draftEdits[lead.id] || {
              subject: lead.emailSubject,
              body: lead.emailBody,
            };

            return (
              <div
                key={lead.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2.5 py-0.5 font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="font-extrabold text-slate-900">{lead.companyName}</span>
                      {lead.contactName && <span className="text-slate-500">({lead.contactName})</span>}
                      <span className="font-mono text-slate-500">{lead.email}</span>
                      {lead.auditScore != null && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                          AI 体检 {lead.auditScore}/100 ({lead.auditGrade})
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">
                        {SEGMENT_LABELS[lead.segment]}
                      </span>
                      {lead.websiteUrl && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Globe2 className="h-3 w-3" />
                          {lead.websiteUrl}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || !lead.websiteUrl}
                      onClick={() => void handleAuditAndDraft(lead)}
                      className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      AI 体检并生成邮件
                    </button>

                    {lead.emailBody && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedLeadId(expanded ? null : lead.id);
                            if (!draftEdits[lead.id]) {
                              setDraftEdits((p) => ({
                                ...p,
                                [lead.id]: { subject: lead.emailSubject, body: lead.emailBody },
                              }));
                            }
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {expanded ? "收起草稿" : "审核/编辑草稿"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyDraft(lead)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {copiedId === lead.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          复制邮件
                        </button>
                        <button
                          type="button"
                          disabled={busy || lead.unsubscribed}
                          onClick={() => void handleSendEmail(lead)}
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                        >
                          <Send className="h-3.5 w-3.5" />
                          API 发送
                        </button>
                      </>
                    )}

                    <select
                      value={lead.status}
                      onChange={(e) =>
                        void handleStatusChange(lead.id, e.target.value as OutreachLead["status"])
                      }
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600"
                    >
                      <option value="new">待体检</option>
                      <option value="audited">已出稿</option>
                      <option value="emailed">已触达</option>
                      <option value="replied">已回复</option>
                      <option value="converted">已成交</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => void handleDelete(lead.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
                    <input
                      value={edit.subject}
                      onChange={(e) =>
                        setDraftEdits((p) => ({
                          ...p,
                          [lead.id]: { ...edit, subject: e.target.value },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
                      placeholder="邮件主题"
                    />
                    <textarea
                      rows={9}
                      value={edit.body}
                      onChange={(e) =>
                        setDraftEdits((p) => ({
                          ...p,
                          [lead.id]: { ...edit, body: e.target.value },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs leading-relaxed"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>发送时系统将自动在底部附加合规一键退订链接（CAN-SPAM / GDPR）</span>
                      <button
                        type="button"
                        onClick={() => void handleSaveDraft(lead.id)}
                        className="rounded-lg bg-indigo-50 px-3 py-1.5 font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        保存草稿修改
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
