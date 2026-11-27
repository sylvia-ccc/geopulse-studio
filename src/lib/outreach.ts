import crypto from "crypto";
import type { OutreachEmailConfig, OutreachLead, OutreachSegment } from "@/types/geo";
import { decryptSecret, encryptSecret } from "./crypto-vault";
import { getCommercialSiteSettings, getDb, newId } from "./db";
import { runLiveSiteGeoAudit } from "./geo/site-auditor";
import { assertSafeExternalUrl } from "./ssrf";

function getUnsubSecret(): string {
  return process.env.SESSION_SECRET || "geopulse-dev-session-secret-change-in-prod";
}

export function signUnsubscribeToken(email: string): string {
  return crypto
    .createHmac("sha256", getUnsubSecret())
    .update(`unsub:${email.toLowerCase().trim()}`)
    .digest("base64url")
    .slice(0, 28);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = signUnsubscribeToken(email);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(token.trim(), "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildUnsubscribeUrl(baseUrl: string, email: string): string {
  const clean = email.toLowerCase().trim();
  const token = signUnsubscribeToken(clean);
  return `${baseUrl.replace(/\/$/, "")}/api/outreach/unsubscribe?email=${encodeURIComponent(clean)}&token=${encodeURIComponent(token)}`;
}

// ---------------- Encrypted Email Provider Config ----------------

function getSiteVal(key: string): string {
  const row = getDb().prepare("SELECT value FROM site_settings WHERE key = ?").get(key);
  return row ? String(row.value) : "";
}

function setSiteVal(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

export function countOutreachSentToday(userId?: string): number {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const db = getDb();
  const row = userId
    ? db
        .prepare("SELECT COUNT(*) AS cnt FROM outreach_leads WHERE user_id = ? AND last_sent_at LIKE ?")
        .get(userId, `${todayPrefix}%`)
    : db
        .prepare("SELECT COUNT(*) AS cnt FROM outreach_leads WHERE last_sent_at LIKE ?")
        .get(`${todayPrefix}%`);
  return Number(row?.cnt || 0);
}

export function getOutreachEmailConfig(userId?: string): OutreachEmailConfig & { apiKeySecret: string } {
  const rawProvider = getSiteVal("outreach_provider") || "none";
  const provider = (["none", "resend", "brevo", "webhook"].includes(rawProvider)
    ? rawProvider
    : "none") as OutreachEmailConfig["provider"];
  const encKey = getSiteVal("outreach_apiKey_enc");
  const apiKeySecret = encKey ? decryptSecret(encKey) : "";
  const rawLimit = Number(getSiteVal("outreach_dailyLimit") || 20);
  const dailyLimit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 20));

  return {
    provider,
    fromName: getSiteVal("outreach_fromName") || "GeoPulse Research",
    fromEmail: getSiteVal("outreach_fromEmail") || "",
    replyTo: getSiteVal("outreach_replyTo") || "",
    webhookUrl: getSiteVal("outreach_webhookUrl") || "",
    dailyLimit,
    hasApiKey: Boolean(apiKeySecret),
    sentToday: countOutreachSentToday(userId),
    apiKeySecret,
  };
}

export function sanitizeOutreachConfig(
  cfg: OutreachEmailConfig & { apiKeySecret: string }
): OutreachEmailConfig {
  const { apiKeySecret: _s, ...pub } = cfg;
  void _s;
  return pub;
}

export function updateOutreachEmailConfig(updates: {
  provider?: "none" | "resend" | "brevo" | "webhook";
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  webhookUrl?: string;
  dailyLimit?: number;
  apiKey?: string;
}): OutreachEmailConfig {
  if (updates.provider !== undefined) setSiteVal("outreach_provider", updates.provider);
  if (updates.fromName !== undefined) setSiteVal("outreach_fromName", updates.fromName.trim());
  if (updates.fromEmail !== undefined) setSiteVal("outreach_fromEmail", updates.fromEmail.trim());
  if (updates.replyTo !== undefined) setSiteVal("outreach_replyTo", updates.replyTo.trim());
  if (updates.webhookUrl !== undefined) setSiteVal("outreach_webhookUrl", updates.webhookUrl.trim());
  if (updates.dailyLimit !== undefined) {
    const clamped = Math.max(1, Math.min(50, Math.round(updates.dailyLimit)));
    setSiteVal("outreach_dailyLimit", String(clamped));
  }
  if (updates.apiKey !== undefined && updates.apiKey.trim()) {
    setSiteVal("outreach_apiKey_enc", encryptSecret(updates.apiKey.trim()));
  }
  return sanitizeOutreachConfig(getOutreachEmailConfig());
}

// ---------------- Leads CRUD & Unsubscribe Blacklist ----------------

function mapLead(row: Record<string, unknown>): OutreachLead {
  let auditMissing: string[] = [];
  try {
    auditMissing = JSON.parse(String(row.audit_missing_json || "[]"));
  } catch {
    auditMissing = [];
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyName: String(row.company_name),
    contactName: String(row.contact_name || ""),
    email: String(row.email),
    websiteUrl: String(row.website_url || ""),
    segment: String(row.segment || "agency_white_label") as OutreachSegment,
    auditScore: row.audit_score != null ? Number(row.audit_score) : null,
    auditGrade: String(row.audit_grade || ""),
    auditMissing,
    emailSubject: String(row.email_subject || ""),
    emailBody: String(row.email_body || ""),
    status: String(row.status || "new") as OutreachLead["status"],
    lastSentAt: row.last_sent_at ? String(row.last_sent_at) : null,
    unsubscribed: Boolean(row.unsubscribed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function isEmailUnsubscribed(email: string): boolean {
  const clean = email.toLowerCase().trim();
  const row = getDb()
    .prepare("SELECT id FROM outreach_leads WHERE LOWER(email) = ? AND unsubscribed = 1 LIMIT 1")
    .get(clean);
  if (row) return true;
  const globalOpt = getDb()
    .prepare("SELECT value FROM site_settings WHERE key = ?")
    .get(`unsub_blacklist:${clean}`);
  return Boolean(globalOpt);
}

export function markEmailUnsubscribed(email: string): number {
  const clean = email.toLowerCase().trim();
  const now = new Date().toISOString();
  setSiteVal(`unsub_blacklist:${clean}`, now);
  const res = getDb()
    .prepare(
      `UPDATE outreach_leads SET unsubscribed = 1, status = 'unsubscribed', updated_at = ?
       WHERE LOWER(email) = ?`
    )
    .run(now, clean);
  return Number(res.changes || 0);
}

export function listOutreachLeads(userId: string): OutreachLead[] {
  const rows = getDb()
    .prepare("SELECT * FROM outreach_leads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200")
    .all(userId);
  return rows.map(mapLead);
}

export function getOutreachLeadById(id: string): OutreachLead | null {
  const row = getDb().prepare("SELECT * FROM outreach_leads WHERE id = ?").get(id);
  return row ? mapLead(row) : null;
}

export function createOutreachLead(
  userId: string,
  data: {
    companyName: string;
    contactName?: string;
    email: string;
    websiteUrl?: string;
    segment?: OutreachSegment;
  }
): OutreachLead {
  const id = newId("lead");
  const now = new Date().toISOString();
  const cleanEmail = data.email.toLowerCase().trim();
  const unsub = isEmailUnsubscribed(cleanEmail) ? 1 : 0;
  getDb()
    .prepare(
      `INSERT INTO outreach_leads (
        id, user_id, company_name, contact_name, email, website_url, segment,
        audit_score, audit_grade, audit_missing_json, email_subject, email_body,
        status, unsubscribed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '', '[]', '', '', ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      data.companyName.trim(),
      (data.contactName || "").trim(),
      cleanEmail,
      (data.websiteUrl || "").trim(),
      data.segment || "agency_white_label",
      unsub ? "unsubscribed" : "new",
      unsub,
      now,
      now
    );
  return getOutreachLeadById(id)!;
}

export function updateOutreachLead(
  id: string,
  userId: string,
  updates: Partial<{
    companyName: string;
    contactName: string;
    websiteUrl: string;
    segment: OutreachSegment;
    emailSubject: string;
    emailBody: string;
    status: OutreachLead["status"];
  }>
): OutreachLead | null {
  const existing = getOutreachLeadById(id);
  if (!existing || existing.userId !== userId) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE outreach_leads SET
        company_name = ?, contact_name = ?, website_url = ?, segment = ?,
        email_subject = ?, email_body = ?, status = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      updates.companyName ?? existing.companyName,
      updates.contactName ?? existing.contactName,
      updates.websiteUrl ?? existing.websiteUrl,
      updates.segment ?? existing.segment,
      updates.emailSubject ?? existing.emailSubject,
      updates.emailBody ?? existing.emailBody,
      updates.status ?? existing.status,
      now,
      id
    );
  return getOutreachLeadById(id);
}

export function deleteOutreachLead(id: string, userId: string): boolean {
  const res = getDb()
    .prepare("DELETE FROM outreach_leads WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return res.changes > 0;
}

// ---------------- Value-First Personalized Audit Email Generator ----------------

export function buildPersonalizedAuditEmail(params: {
  companyName: string;
  contactName: string;
  websiteUrl: string;
  segment: OutreachSegment;
  auditScore: number;
  auditGrade: string;
  auditMissing: string[];
  baseUrl: string;
  senderBrand: string;
}): { subject: string; body: string } {
  const cleanBase = params.baseUrl.replace(/\/$/, "");
  const greeting = params.contactName ? `Hi ${params.contactName},` : `Hi ${params.companyName} team,`;
  const domain = params.websiteUrl.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || params.companyName;
  const liveAuditLink = params.websiteUrl
    ? `${cleanBase}/audit?url=${encodeURIComponent(params.websiteUrl)}&auto=1`
    : `${cleanBase}/audit`;

  const gapsList =
    params.auditMissing.length > 0
      ? params.auditMissing.map((m) => `- ${m}`).join("\n")
      : "- Missing /llms.txt structured AI directory & 4-in-1 Schema.org JSON-LD";

  if (params.segment === "strategic_acquirer") {
    return {
      subject: `Quick AI Search audit for ${domain} (${params.auditScore}/100) + open-source GEO engine`,
      body: `${greeting}

I ran a quick technical AI crawler audit on ${domain} using ${params.senderBrand} — it currently scores ${params.auditScore}/100 (Grade ${params.auditGrade}):
${gapsList}

Live interactive audit (free, no login): ${liveAuditLink}

Context: I built ${params.senderBrand} (MIT open-source, Next.js 15 + TypeScript) as a full-stack GEO (Generative Engine Optimization) engine that goes beyond monitoring dashboards — combining 6-bot AI crawler auditing, /llms.txt + JSON-LD hosting, white-label client reports, and 1-click official-API syndication (DEV.to, Bluesky, GitHub Pages, Qiita, Ghost, WordPress).

If your roadmap includes adding native AI Search Visibility / GEO capabilities (via white-label licensing or strategic IP acquisition), happy to share our technical overview or a 5-minute walkthrough.

Best regards,
${params.senderBrand} Team
Live Demo: ${cleanBase}
GitHub: https://github.com/sylvia-ccc/geopulse-studio`,
    };
  }

  if (params.segment === "saas_growth") {
    return {
      subject: `${domain} scored ${params.auditScore}/100 on AI Search readiness (ChatGPT & Perplexity)`,
      body: `${greeting}

I ran a live AI Search crawl check on ${domain} to see how ChatGPT Search, Perplexity, and Google AI Overviews read your site. Current score: ${params.auditScore}/100 (Grade ${params.auditGrade}).

Key gaps holding back AI brand citations:
${gapsList}

You can inspect the full live report and copy-paste the robots.txt / llms.txt fixes free here (no login required):
${liveAuditLink}

If you'd like to automate structured comparison pages and 1-click canonical syndication across DEV.to, GitHub Pages, Bluesky & Telegraph, our self-serve workspace is live at ${cleanBase}.

Best,
${params.senderBrand} Team`,
    };
  }

  // Default: agency_white_label (highest WTP segment: SEO/GEO agencies selling $2k-$12k/mo retainers)
  return {
    subject: `AI Search Audit for ${domain} (${params.auditScore}/100) — turnkey white-label GEO for agencies`,
    body: `${greeting}

I ran a 3-second AI Search crawler audit on ${domain} — it scored ${params.auditScore}/100 (Grade ${params.auditGrade}), with a few quick wins for ChatGPT Search & Perplexity visibility:
${gapsList}

View the interactive audit & copy-ready fix snippets free:
${liveAuditLink}

I'm reaching out because many SEO agencies are packaging AI Search / GEO audits into \$2k–\$10k/mo retainers right now. We built ${params.senderBrand} so agencies can run unlimited AI crawler audits, share zero-login white-label client reports under their own logo, and syndicate client articles via 1-click official APIs — without paying \$500+/mo for read-only dashboards.

Open to testing a free white-label workspace for one of your clients?
Demo: ${cleanBase}/login?demo=1

Best regards,
${params.senderBrand} Team`,
  };
}

export async function auditLeadAndGenerateDraft(
  leadId: string,
  userId: string,
  baseUrl: string
): Promise<{ ok: true; lead: OutreachLead } | { ok: false; error: string }> {
  const lead = getOutreachLeadById(leadId);
  if (!lead || lead.userId !== userId) {
    return { ok: false, error: "线索不存在或无权操作" };
  }
  if (!lead.websiteUrl.trim()) {
    return { ok: false, error: "该线索未填写官网 URL，无法执行 AI 爬虫体检" };
  }

  const normalizedUrl = /^https?:\/\//i.test(lead.websiteUrl.trim())
    ? lead.websiteUrl.trim()
    : `https://${lead.websiteUrl.trim()}`;

  try {
    const report = await runLiveSiteGeoAudit(normalizedUrl);
    const missing: string[] = [];
    if (!report.checks.hasLlmsTxt) missing.push("Missing /llms.txt LLM knowledge index");
    if (!report.checks.hasJsonLd) missing.push("Missing Schema.org JSON-LD (Organization/Product/FAQPage)");
    if (!report.checks.hasRobotsTxt) missing.push("Missing explicit /robots.txt AI crawler allow rules");
    if (!report.checks.isSsrRich) missing.push(`Low SSR readable copy (${report.checks.wordCount} chars)`);
    for (const bot of report.botPermissions) {
      if (!bot.allowed) missing.push(`Robots policy blocks ${bot.bot} (${bot.engine})`);
    }
    if (missing.length === 0) {
      missing.push("Strong crawler fundamentals — opportunity to scale multi-domain canonical syndication");
    }

    const siteCfg = getCommercialSiteSettings();
    const draft = buildPersonalizedAuditEmail({
      companyName: lead.companyName,
      contactName: lead.contactName,
      websiteUrl: normalizedUrl,
      segment: lead.segment,
      auditScore: report.overallScore,
      auditGrade: report.grade,
      auditMissing: missing.slice(0, 4),
      baseUrl,
      senderBrand: siteCfg.brandTitle || "GeoPulse Studio",
    });

    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE outreach_leads SET
          website_url = ?, audit_score = ?, audit_grade = ?, audit_missing_json = ?,
          email_subject = ?, email_body = ?,
          status = CASE WHEN status = 'new' THEN 'audited' ELSE status END,
          updated_at = ?
         WHERE id = ?`
      )
      .run(
        normalizedUrl,
        report.overallScore,
        report.grade,
        JSON.stringify(missing.slice(0, 5)),
        draft.subject,
        draft.body,
        now,
        lead.id
      );

    return { ok: true, lead: getOutreachLeadById(lead.id)! };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "目标网站体检请求失败",
    };
  }
}

// ---------------- Compliant Official Email API Sender (Resend / Brevo / Webhook) ----------------

export async function sendOutreachEmailToLead(params: {
  leadId: string;
  userId: string;
  baseUrl: string;
}): Promise<{ ok: true; lead: OutreachLead; messageId: string } | { ok: false; error: string }> {
  const lead = getOutreachLeadById(params.leadId);
  if (!lead || lead.userId !== params.userId) {
    return { ok: false, error: "线索不存在或无权操作" };
  }
  if (lead.unsubscribed || isEmailUnsubscribed(lead.email)) {
    return { ok: false, error: `邮箱 ${lead.email} 已在退订黑名单中，系统已强制拦截发送` };
  }
  if (!lead.emailSubject.trim() || !lead.emailBody.trim()) {
    return { ok: false, error: "请先执行「AI 体检并生成邮件草稿」或填写邮件主题与正文" };
  }

  const cfg = getOutreachEmailConfig(params.userId);
  if (cfg.provider === "none") {
    return {
      ok: false,
      error: "尚未配置官方邮件发送 API（支持 Resend / Brevo / Webhook），请先在上方填写 API Key 或点击复制草稿手动发送",
    };
  }
  if (cfg.sentToday >= cfg.dailyLimit) {
    return {
      ok: false,
      error: `已达到今日安全发信上限（${cfg.sentToday}/${cfg.dailyLimit} 封），为保护发信域名信誉已暂停今日发送`,
    };
  }
  if (!cfg.fromEmail.trim() && cfg.provider !== "webhook") {
    return { ok: false, error: "请先填写发件人邮箱（From Email）" };
  }

  const unsubUrl = buildUnsubscribeUrl(params.baseUrl, lead.email);
  const fullText = `${lead.emailBody.trim()}\n\n---\nDon't want AI visibility reports from us? Unsubscribe instantly: ${unsubUrl}`;
  const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;font-size:14px;line-height:1.65;color:#1e293b;max-width:640px;">${lead.emailBody
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#4f46e5;">$1</a>')
    .replace(/\n/g, "<br/>")}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px;"/><p style="font-size:11px;color:#64748b;">Sent via ${cfg.fromName}. <a href="${unsubUrl}" style="color:#64748b;">Unsubscribe in 1 click</a>.</p></div>`;

  try {
    let messageId = "";

    if (cfg.provider === "resend") {
      if (!cfg.apiKeySecret) return { ok: false, error: "请先绑定 Resend API Key" };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKeySecret}`,
        },
        body: JSON.stringify({
          from: `${cfg.fromName} <${cfg.fromEmail}>`,
          to: [lead.email],
          reply_to: cfg.replyTo || cfg.fromEmail,
          subject: lead.emailSubject,
          text: fullText,
          html: htmlBody,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        return { ok: false, error: `Resend API HTTP ${res.status}: ${json.message || "发送失败"}` };
      }
      messageId = json.id || "resend_ok";
    } else if (cfg.provider === "brevo") {
      if (!cfg.apiKeySecret) return { ok: false, error: "请先绑定 Brevo API Key" };
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": cfg.apiKeySecret,
        },
        body: JSON.stringify({
          sender: { name: cfg.fromName, email: cfg.fromEmail },
          to: [{ email: lead.email, name: lead.contactName || lead.companyName }],
          replyTo: { email: cfg.replyTo || cfg.fromEmail },
          subject: lead.emailSubject,
          textContent: fullText,
          htmlContent: htmlBody,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
      if (!res.ok) {
        return { ok: false, error: `Brevo API HTTP ${res.status}: ${json.message || "发送失败"}` };
      }
      messageId = json.messageId || "brevo_ok";
    } else if (cfg.provider === "webhook") {
      if (!cfg.webhookUrl) return { ok: false, error: "请先填写自定义发信 Webhook URL" };
      const safeUrl = assertSafeExternalUrl(cfg.webhookUrl);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.apiKeySecret) headers["Authorization"] = `Bearer ${cfg.apiKeySecret}`;
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          event: "geopulse.outreach.email",
          fromName: cfg.fromName,
          fromEmail: cfg.fromEmail,
          to: lead.email,
          subject: lead.emailSubject,
          text: fullText,
          html: htmlBody,
          unsubscribeUrl: unsubUrl,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { ok: false, error: `发信 Webhook HTTP ${res.status}` };
      }
      messageId = `wh_${Date.now()}`;
    }

    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE outreach_leads SET status = 'emailed', last_sent_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(now, now, lead.id);

    return { ok: true, lead: getOutreachLeadById(lead.id)!, messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "邮件发送网络异常",
    };
  }
}
