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
  isAdmin?: boolean;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

interface SendAttempt {
  id: string;
  recipient: string;
  provider: string;
  status: string;
  messageId: string;
  error: string;
  createdAt: string;
}

const ATTEMPT_LABELS: Record<string, string> = {
  reserved: "已预留，等待服务商结果",
  accepted: "服务商已接受（不代表送达）",
  unknown: "结果未知，请先核查服务商记录",
  failed: "请求失败",
};

interface DraftEdit {
  subject: string;
  body: string;
  consentStatus: "unknown" | "opted_in";
  consentEvidence: string;
}

const draftFor = (lead: OutreachLead): DraftEdit => ({
  subject: lead.emailSubject,
  body: lead.emailBody,
  consentStatus: lead.consentStatus || "unknown",
  consentEvidence: lead.consentEvidence || "",
});
const sameDraft = (a: DraftEdit, b: DraftEdit) =>
  a.subject === b.subject && a.body === b.body &&
  a.consentStatus === b.consentStatus && a.consentEvidence === b.consentEvidence;
const REVIEW_LABELS = ["已核对实际收件邮箱", "已核对主题与体检结论", "已阅读完整正文与链接", "已核实收件许可与证据"];

const SEGMENT_LABELS: Record<OutreachSegment, string> = {
  agency_white_label: "SEO/GEO 机构白标（高客单）",
  saas_growth: "出海 SaaS / 品牌增长",
  strategic_acquirer: "腰部工具战略收购/授权方",
};

const STATUS_BADGE: Record<OutreachLead["status"], { label: string; cls: string }> = {
  new: { label: "待体检", cls: "bg-slate-100 text-slate-600" },
  audited: { label: "已出定制稿", cls: "bg-indigo-50 text-indigo-700" },
  emailed: { label: "服务商已接受", cls: "bg-emerald-50 text-emerald-700" },
  replied: { label: "已回复", cls: "bg-amber-50 text-amber-800" },
  converted: { label: "已成交", cls: "bg-emerald-600 text-white" },
  unsubscribed: { label: "已退订拦截", cls: "bg-rose-50 text-rose-700" },
};

export function OutreachView({ onNotify, isAdmin = false }: Props) {
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
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftEdit>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean[]>>({});
  const [sendNotice, setSendNotice] = useState("");
  const [sendAttempts, setSendAttempts] = useState<SendAttempt[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [leadsRes, cfgRes] = await Promise.all([
        fetch("/api/outreach/leads"),
        isAdmin ? fetch("/api/outreach/send") : Promise.resolve(null),
      ]);
      const lJson = await leadsRes.json();
      if (!leadsRes.ok) throw new Error(lJson.error || "加载线索失败");
      setLeads(lJson.leads || []);
      setSelectedIds((ids) => ids.filter((id) => lJson.leads?.some((lead: OutreachLead) => lead.id === id)));
      if (cfgRes?.ok) {
        const payload = await cfgRes.json();
        const c: OutreachEmailConfig = payload.config;
        setSendAttempts(payload.attempts || []);
        setCfg(c);
        setProvider(c.provider === "none" ? "resend" : c.provider);
        setFromName(c.fromName || "GeoPulse Research");
        setFromEmail(c.fromEmail || "");
        setReplyTo(c.replyTo || "");
        setWebhookUrl(c.webhookUrl || "");
        setDailyLimit(c.dailyLimit || 20);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, onNotify]);

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
      onNotify("邮件服务配置已保存；退订链接不能代替收件许可");
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
        [lead.id]: draftFor(data.lead),
      }));
      setReviewChecks((prev) => ({ ...prev, [lead.id]: [] }));
      onNotify(
        `已完成 ${lead.companyName} 实时 AI 爬虫体检（${data.lead.auditScore}/100 · ${data.lead.auditGrade}级）并生成定制触达邮件！`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "体检失败", "error");
    } finally {
      setBusyLeadId(null);
    }
  };

  const updateDraft = (lead: OutreachLead, patch: Partial<DraftEdit>) => {
    setDraftEdits((prev) => ({ ...prev, [lead.id]: { ...(prev[lead.id] || draftFor(lead)), ...patch } }));
    setReviewChecks((prev) => ({ ...prev, [lead.id]: [] }));
  };

  const handleSaveDraft = async (leadId: string) => {
    const edit = draftEdits[leadId];
    if (!edit) return;
    setBusyLeadId(leadId);
    try {
      const res = await fetch("/api/outreach/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, action: "update", emailSubject: edit.subject, emailBody: edit.body, consentStatus: edit.consentStatus, consentEvidence: edit.consentEvidence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setLeads((prev) => prev.map((lead) => lead.id === leadId ? data.lead : lead));
      setDraftEdits((prev) => ({ ...prev, [leadId]: draftFor(data.lead) }));
      setReviewChecks((prev) => ({ ...prev, [leadId]: [] }));
      onNotify("草稿与许可证据已保存，请重新逐项审核并批准");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败", "error");
    } finally { setBusyLeadId(null); }
  };

  const handleApprove = async (lead: OutreachLead) => {
    const edit = draftEdits[lead.id] || draftFor(lead);
    if (!sameDraft(edit, draftFor(lead)) || !REVIEW_LABELS.every((_, i) => reviewChecks[lead.id]?.[i])) return;
    setBusyLeadId(lead.id);
    try {
      const res = await fetch("/api/outreach/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, action: "approve", expectedSnapshot: { email: lead.email, emailSubject: edit.subject, emailBody: edit.body, consentStatus: edit.consentStatus, consentEvidence: edit.consentEvidence } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批准失败");
      setLeads((prev) => prev.map((item) => item.id === lead.id ? data.lead : item));
      onNotify("已批准此收件人及当前草稿版本；点击发送后才会提交服务商");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "批准失败", "error");
    } finally { setBusyLeadId(null); }
  };

  const canSend = (lead: OutreachLead) => Boolean(
    lead.approvedAt && lead.approvalHash && !lead.unsubscribed &&
    lead.consentStatus === "opted_in" && lead.consentEvidence?.trim() &&
    sameDraft(draftEdits[lead.id] || draftFor(lead), draftFor(lead))
  );

  const handleSendEmail = async (targets: OutreachLead[]) => {
    if (!isAdmin || !targets.length || targets.length > 20 || targets.some((lead) => !canSend(lead))) return;
    setBatchBusy(true);
    setSendNotice("");
    try {
      const items = targets.map((lead) => ({ leadId: lead.id, approvalHash: lead.approvalHash }));
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items.length === 1 ? items[0] : { items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送请求失败");
      const results = data.results as Array<{ ok: boolean; error?: string }> | undefined;
      const accepted = results ? results.filter((item) => item.ok).length : data.sentCount ?? 1;
      const failed = results ? results.filter((item) => !item.ok).length : data.failedCount ?? 0;
      const details = results?.filter((item) => !item.ok).map((item) => item.error).filter(Boolean).join("；");
      const message = `服务商已接受 ${accepted} 封，失败或结果未知 ${failed} 封。服务商接受不代表送达。${details ? ` ${details}` : ""}`;
      setSendNotice(message);
      onNotify(message, failed ? "error" : "success");
      setSelectedIds((prev) => prev.filter((id) => !targets.some((lead) => lead.id === id)));
    } catch (err) {
      const message = `${err instanceof Error ? err.message : "发送失败"}；结果未知时先核查发送记录，避免重复提交。`;
      setSendNotice(message);
      onNotify(message, "error");
    } finally {
      await loadAll();
      setBatchBusy(false);
    }
  };

  const handleBatchAudit = async () => {
    if (!selectedIds.length || selectedIds.length > 8) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/outreach/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch_audit", ids: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量体检失败");
      setDraftEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !selectedIds.includes(id))));
      setReviewChecks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !selectedIds.includes(id))));
      await loadAll();
      onNotify(`所选线索体检完成 ${data.auditedCount} 条，失败 ${data.failedCount} 条；草稿需要逐封审核`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "体检失败", "error");
    } finally { setBatchBusy(false); }
  };

  const handleFollowup = async (lead: OutreachLead) => {
    setBusyLeadId(lead.id);
    try {
      const res = await fetch("/api/outreach/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, action: "draft_followup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成跟进稿失败");
      setDraftEdits((prev) => ({ ...prev, [lead.id]: draftFor(data.lead) }));
      setReviewChecks((prev) => ({ ...prev, [lead.id]: [] }));
      setExpandedLeadId(lead.id);
      await loadAll();
      onNotify("跟进草稿已生成，尚未发送；需要重新逐项审核、批准");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "生成失败", "error");
    } finally { setBusyLeadId(null); }
  };

  const handleCopyDraft = async (lead: OutreachLead) => {
    const edit = draftEdits[lead.id];
    const subj = edit?.subject ?? lead.emailSubject;
    const body = edit?.body ?? lead.emailBody;
    await navigator.clipboard.writeText(`Subject: ${subj}\n\n${body}`);
    setCopiedId(lead.id);
    onNotify("已复制当前邮件主题与正文，请在实际发送前核对收件人、许可与内容");
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

  const selectedLeads = leads.filter((lead) => selectedIds.includes(lead.id));
  const selectedApproved = selectedLeads.filter(canSend);
  const operationBusy = batchBusy || busyLeadId !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white lg:flex-row lg:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
            <Mail className="h-3.5 w-3.5" />
            Mode A · 逐封审核批准后发送
          </div>
          <h1 className="mt-2 text-2xl font-extrabold">AI 体检线索与官方 API 邮件触达</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            选择目标线索 → 体检并生成草稿 → 保存收件许可证据 → 核对收件人、主题与全文 → 逐封批准 → 提交已批准版本。不会自动发送新稿或跟进稿。
          </p>
        </div>

        {isAdmin && <div className="shrink-0 rounded-2xl border border-white/15 bg-white/10 p-4 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-indigo-200">官方发信通道</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold uppercase text-emerald-300">
              {cfg?.provider && cfg.provider !== "none" ? cfg.provider : "未绑定"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span className="text-slate-300">今日已占用发送额度</span>
            <span className="font-mono font-bold text-white">
              {cfg ? `${cfg.sentToday} / ${cfg.dailyLimit} 封` : "未加载"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowCfg((v) => !v)}
            className="mt-3 w-full rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-indigo-50"
          >
            {showCfg ? "收起邮件 API 配置 ▲" : "配置 Resend / Brevo 官方邮件 API ⚙"}
          </button>
          <p className="mt-2 max-w-64 text-[11px] text-slate-300">额度保守计入预留、结果未知与服务商已接受的请求；接受不等于送达。</p>
        </div>}
      </div>

      {/* Collapsible Email API Config */}
      {isAdmin && showCfg && (
        <form
          onSubmit={handleSaveConfig}
          className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                管理员全局发信服务配置
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
              保存发信配置
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

      {!isAdmin && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">你可以体检、编辑及审核自己的线索。全局邮件服务与真实发送由管理员操作；当前账号的发送按钮不可用。</p>}

      {/* Pipeline KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "全部线索", val: leads.length },
          { label: "已 AI 体检出稿", val: leads.filter((l) => l.auditScore != null).length },
          { label: "服务商已接受", val: leads.filter((l) => l.status === "emailed").length },
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

      <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-slate-900">定向批量操作 · 已选 {selectedLeads.length} 条</h2><p className="mt-1 text-xs text-slate-600">规则优先级仅辅助排序，不代表购买倾向或成交保证。每封草稿必须单独审核批准；请先保存修改再重新体检。</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={operationBusy || !selectedLeads.length} onClick={() => setSelectedIds([])} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs disabled:opacity-40">清空选择</button>
            <button type="button" disabled={operationBusy || !selectedLeads.length || selectedLeads.length > 8 || selectedLeads.some((lead) => !lead.websiteUrl || !sameDraft(draftEdits[lead.id] || draftFor(lead), draftFor(lead)))} onClick={() => void handleBatchAudit()} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">体检所选并出稿（最多 8 条）</button>
            <button type="button" disabled={!isAdmin || operationBusy || !selectedApproved.length || selectedLeads.length > 20 || selectedApproved.length !== selectedLeads.length} onClick={() => void handleSendEmail(selectedApproved)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">发送所选已批准版本（{selectedApproved.length}，最多 20 封）</button>
          </div>
        </div>
        {!!selectedLeads.length && <ul className="space-y-1 text-xs text-slate-600">{selectedLeads.map((lead) => <li key={lead.id}><strong>{lead.email}</strong> · {draftEdits[lead.id]?.subject ?? lead.emailSubject ?? "未出稿"} · {canSend(lead) ? "已批准，可提交" : "不可发送：请保存并逐封审核批准"}</li>)}</ul>}
        <p className="text-[11px] text-slate-500">链接请求可能来自安全扫描器或机器人，不证明真人点击。跟进操作只生成草稿。服务商接受请求不等于已送达或已阅读。</p>
        {sendNotice && <p role="status" className="rounded-xl bg-white p-3 text-xs text-slate-700">{sendNotice}</p>}
      </section>

      {isAdmin && <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">最近 50 条发送请求记录</h2>
        <p className="mt-1 text-xs text-slate-500">预留、结果未知及服务商已接受的请求均保守占用额度。结果未知时请核查服务商记录再处理。</p>
        {!sendAttempts.length ? <p className="mt-3 text-xs text-slate-400">暂无发送请求记录。</p> : <div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-2">时间</th><th className="p-2">实际收件人</th><th className="p-2">服务商</th><th className="p-2">请求结果</th></tr></thead>
          <tbody>{sendAttempts.map((attempt) => <tr key={attempt.id} className="border-b border-slate-100"><td className="p-2 whitespace-nowrap">{new Date(attempt.createdAt).toLocaleString("zh-CN")}</td><td className="p-2 font-mono">{attempt.recipient}</td><td className="p-2">{attempt.provider}</td><td className="p-2"><span className={attempt.status === "accepted" ? "text-emerald-700" : "text-amber-700"}>{ATTEMPT_LABELS[attempt.status] || attempt.status}</span>{attempt.error && <p className="mt-1 max-w-lg text-[11px] text-slate-500">{attempt.error}</p>}</td></tr>)}</tbody>
        </table></div>}
      </section>}

      {/* Leads List */}
      <div className="space-y-3">
        {leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-400">
            暂无线索。导入目标后可生成体检草稿；导入邮箱不代表已获收件许可。
          </div>
        ) : (
          leads.map((lead) => {
            const badge = STATUS_BADGE[lead.status] || STATUS_BADGE.new;
            const busy = operationBusy;
            const expanded = expandedLeadId === lead.id;
            const edit = draftEdits[lead.id] || draftFor(lead);
            const dirty = !sameDraft(edit, draftFor(lead));
            const allReviewed = REVIEW_LABELS.every((_, i) => reviewChecks[lead.id]?.[i]);

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
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" aria-label={`选择 ${lead.companyName}`} checked={selectedIds.includes(lead.id)} disabled={operationBusy} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, lead.id] : prev.filter((id) => id !== lead.id))} />
                        <span className="font-extrabold text-slate-900">{lead.companyName}</span>
                      </label>
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
                      <span>来源：{lead.source === "inbound_audit" ? "用户主动提交体检" : "手动导入"}</span>
                      <span>规则优先级：{lead.priorityTier || "待评估"}</span>
                      <span>链接请求：{lead.clickCount || 0} 次（不证明真人点击）</span>
                      <span>跟进稿：{lead.followupCount || 0} 次</span>
                      <span className={canSend(lead) ? "text-emerald-700" : "text-amber-700"}>{canSend(lead) ? "当前版本已批准" : "待审核批准"}</span>
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
                      disabled={busy || !lead.websiteUrl || dirty}
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
                                [lead.id]: draftFor(lead),
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
                          disabled={!isAdmin || busy || !canSend(lead)}
                          onClick={() => void handleSendEmail([lead])}
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                        >
                          <Send className="h-3.5 w-3.5" />
                          发送已批准版本
                        </button>
                        {lead.lastSentAt && <button type="button" disabled={busy || lead.unsubscribed || dirty} onClick={() => void handleFollowup(lead)} className="rounded-xl border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">仅生成跟进草稿</button>}
                      </>
                    )}

                    <select
                      aria-label="更新线索状态"
                      disabled={busy}
                      value={lead.status}
                      onChange={(e) =>
                        void handleStatusChange(lead.id, e.target.value as OutreachLead["status"])
                      }
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600"
                    >
                      <option value="new">待体检</option>
                      <option value="audited">已出稿</option>
                      <option value="emailed" disabled>服务商已接受</option>
                      <option value="replied">已回复</option>
                      <option value="converted">已成交</option>
                    </select>

                    <button
                      type="button"
                      aria-label={`删除 ${lead.companyName}`}
                      disabled={busy}
                      onClick={() => void handleDelete(lead.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">实际收件人：<strong>{lead.contactName || lead.companyName} &lt;{lead.email}&gt;</strong></p>
                    <label className="block text-xs font-semibold text-slate-700">邮件主题
                      <input disabled={busy} value={edit.subject} onChange={(e) => updateDraft(lead, { subject: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold" />
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">完整邮件正文
                      <textarea disabled={busy} rows={9} value={edit.body} onChange={(e) => updateDraft(lead, { body: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs leading-relaxed" />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-xs font-semibold text-slate-700">收件许可
                        <select disabled={busy} value={edit.consentStatus} onChange={(e) => updateDraft(lead, { consentStatus: e.target.value as DraftEdit["consentStatus"] })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs">
                          <option value="unknown">未确认（禁止发送）</option>
                          <option value="opted_in">已获得明确收件许可</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold text-slate-700">许可证据（来源、日期、范围或记录链接）
                        <textarea disabled={busy} rows={3} value={edit.consentEvidence} onChange={(e) => updateDraft(lead, { consentEvidence: e.target.value })} placeholder="例如：2026-11-27 表单中主动同意接收本次报告邮件，记录编号…" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs" />
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500">导入邮箱、公开联系方式或体检提交均不自动构成许可。发送时会附加退订链接；请确认收件许可及内容适用性。</p>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-amber-700">{dirty ? "存在未保存修改，当前批准不可用于发送" : lead.approvedAt ? `批准时间：${new Date(lead.approvedAt).toLocaleString("zh-CN")}` : "当前版本尚未批准"}</span>
                      <button type="button" disabled={busy || !dirty} onClick={() => void handleSaveDraft(lead.id)} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40">保存修改（需重新批准）</button>
                    </div>
                    <fieldset disabled={busy || dirty} className="rounded-xl border border-slate-200 p-3">
                      <legend className="px-1 text-xs font-bold text-slate-700">逐封审核清单</legend>
                      <div className="grid gap-2 sm:grid-cols-2">{REVIEW_LABELS.map((label, i) => (
                        <label key={label} className="flex items-center gap-2 text-xs text-slate-600">
                          <input type="checkbox" checked={reviewChecks[lead.id]?.[i] || false} onChange={(e) => setReviewChecks((prev) => ({ ...prev, [lead.id]: REVIEW_LABELS.map((_, index) => index === i ? e.target.checked : prev[lead.id]?.[index] || false) }))} />{label}
                        </label>
                      ))}</div>
                    </fieldset>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button type="button" disabled={busy || dirty || !allReviewed || edit.consentStatus !== "opted_in" || !edit.consentEvidence.trim() || !edit.subject.trim() || !edit.body.trim() || lead.unsubscribed} onClick={() => void handleApprove(lead)} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">批准此收件人和当前草稿</button>
                      <button type="button" disabled={!isAdmin || busy || !canSend(lead)} onClick={() => void handleSendEmail([lead])} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">发送已批准版本</button>
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
