import crypto from "crypto";
import type { OutreachEmailConfig, OutreachLead, OutreachSegment } from "@/types/geo";
import { decryptSecret, encryptSecret } from "./crypto-vault";
import { findUserByEmail, getCommercialSiteSettings, getDb, newId } from "./db";
import { runLiveSiteGeoAudit } from "./geo/site-auditor";
import { assertSafeExternalUrl } from "./ssrf";
import { recordTelemetryEvent } from "./telemetry";
import { getSessionSecret } from "./auth";
import { findUserById } from "./db";

function getUnsubSecret(): string {
  return getSessionSecret();
}

export function signLeadClickToken(leadId: string): string {
  return crypto
    .createHmac("sha256", getUnsubSecret())
    .update(`click:${leadId}`)
    .digest("base64url")
    .slice(0, 20);
}

export function verifyLeadClickToken(leadId: string, sig: string): boolean {
  if (!leadId || !sig) return false;
  const expected = signLeadClickToken(leadId);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(sig.trim(), "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function computeLeadPriorityTier(score: number | null, missing: string[]): "A" | "B" | "C" {
  if (score == null) return "B";
  const blocksBots = missing.some((m) => /blocks/i.test(m));
  if (score < 65 || blocksBots) return "A";
  if (score < 85) return "B";
  return "C";
}

export function recordLeadAuditClick(leadId: string, sig: string): boolean {
  if (!verifyLeadClickToken(leadId, sig)) return false;
  const existing = getOutreachLeadById(leadId);
  if (!existing) return false;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE outreach_leads
       SET click_count = COALESCE(click_count, 0) + 1, last_clicked_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(now, now, leadId);
  recordTelemetryEvent({
    eventType: "outreach_click",
    path: "/audit",
    meta: "Signed audit link requested; human identity not verified",
  });
  return true;
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
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const sql = "SELECT COUNT(*) AS cnt FROM email_send_attempts WHERE created_at >= ?";
  const row = userId ? getDb().prepare(`${sql} AND user_id = ?`).get(dayStart, userId) : getDb().prepare(sql).get(dayStart);
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
    source: String(row.source || "manual") === "inbound_audit" ? "inbound_audit" : "manual",
    priorityTier: (["A", "B", "C"].includes(String(row.priority_tier || ""))
      ? String(row.priority_tier)
      : "") as OutreachLead["priorityTier"],
    auditScore: row.audit_score != null ? Number(row.audit_score) : null,
    auditGrade: String(row.audit_grade || ""),
    auditMissing,
    emailSubject: String(row.email_subject || ""),
    emailBody: String(row.email_body || ""),
    status: String(row.status || "new") as OutreachLead["status"],
    clickCount: Number(row.click_count || 0),
    lastClickedAt: row.last_clicked_at ? String(row.last_clicked_at) : null,
    followupCount: Number(row.followup_count || 0),
    lastSentAt: row.last_sent_at ? String(row.last_sent_at) : null,
    consentStatus: row.consent_status === "opted_in" ? "opted_in" : "unknown",
    consentEvidence: String(row.consent_evidence || ""),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    approvalHash: String(row.approval_hash || ""),
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
    .prepare(
      `SELECT * FROM outreach_leads
       WHERE user_id = ?
       ORDER BY
         CASE WHEN click_count > 0 THEN 0 ELSE 1 END,
         CASE priority_tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT 200`
    )
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
    consentStatus: OutreachLead["consentStatus"];
    consentEvidence: string;
  }>
): OutreachLead | null {
  const existing = getOutreachLeadById(id);
  if (!existing || existing.userId !== userId) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE outreach_leads SET
        company_name = ?, contact_name = ?, website_url = ?, segment = ?,
        email_subject = ?, email_body = ?, status = ?, consent_status = ?, consent_evidence = ?,
        approved_at = NULL, approval_hash = '', updated_at = ?
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
      updates.consentStatus ?? existing.consentStatus,
      (updates.consentEvidence ?? existing.consentEvidence).slice(0, 1000),
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
  leadId?: string;
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
  const trackParams = params.leadId
    ? `&lid=${encodeURIComponent(params.leadId)}&lsig=${encodeURIComponent(signLeadClickToken(params.leadId))}`
    : "";
  const liveAuditLink = params.websiteUrl
    ? `${cleanBase}/audit?url=${encodeURIComponent(params.websiteUrl)}&auto=1${trackParams}`
    : `${cleanBase}/audit`;

  const gapsList =
    params.auditMissing.length > 0
      ? params.auditMissing.map((m) => `- ${m}`).join("\n")
      : "- No missing checks identified in this limited technical audit";

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

I ran a live AI Search crawl check on ${domain} to inspect publicly served crawl settings and structured content. This does not measure actual AI citations. Current score: ${params.auditScore}/100 (Grade ${params.auditGrade}).

Technical findings to review:
${gapsList}

You can inspect the full live report and copy-paste the robots.txt / llms.txt fixes free here (no login required):
${liveAuditLink}

If you'd like to automate structured comparison pages and 1-click canonical syndication across DEV.to, GitHub Pages, Bluesky & Telegraph, our self-serve workspace is live at ${cleanBase}.

Best,
${params.senderBrand} Team`,
    };
  }

  // Default: agency_white_label; willingness to pay remains to be validated.
  return {
    subject: `AI Search Audit for ${domain} (${params.auditScore}/100) — turnkey white-label GEO for agencies`,
    body: `${greeting}

I ran a technical site audit on ${domain} — it scored ${params.auditScore}/100 (Grade ${params.auditGrade}), with a few quick wins for ChatGPT Search & Perplexity visibility:
${gapsList}

View the interactive audit & copy-ready fix snippets free:
${liveAuditLink}

We built ${params.senderBrand} to help agencies inspect crawl settings, share branded client reports, and publish through supported official APIs. Audit scores describe technical checks; they do not guarantee indexing, AI mentions, or revenue.

Open to testing a free white-label workspace for one of your clients?
Demo: ${cleanBase}/audit

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
      missing.push("No missing technical checks identified; review content accuracy and customer needs next");
    }

    const siteCfg = getCommercialSiteSettings();
    const priorityTier = computeLeadPriorityTier(report.overallScore, missing);
    const draft = buildPersonalizedAuditEmail({
      leadId: lead.id,
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
          website_url = ?, priority_tier = ?, audit_score = ?, audit_grade = ?, audit_missing_json = ?,
          email_subject = ?, email_body = ?, approved_at = NULL, approval_hash = '',
          status = CASE WHEN status = 'new' THEN 'audited' ELSE status END,
          updated_at = ?
         WHERE id = ?`
      )
      .run(
        normalizedUrl,
        priorityTier,
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

export function draftFollowupForLead(
  leadId: string,
  userId: string,
  baseUrl: string
): { ok: true; lead: OutreachLead } | { ok: false; error: string } {
  const lead = getOutreachLeadById(leadId);
  if (!lead || lead.userId !== userId) return { ok: false, error: "线索不存在" };

  const cleanBase = baseUrl.replace(/\/$/, "");
  const siteCfg = getCommercialSiteSettings();
  const brand = siteCfg.brandTitle || "GeoPulse Studio";
  const domain = lead.websiteUrl.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || lead.companyName;
  const greeting = lead.contactName ? `Hi ${lead.contactName},` : `Hi ${lead.companyName} team,`;
  const clicked = lead.clickCount > 0;
  const auditUrl = lead.websiteUrl
    ? `${cleanBase}/audit?url=${encodeURIComponent(lead.websiteUrl)}&auto=1&lid=${encodeURIComponent(lead.id)}&lsig=${encodeURIComponent(signLeadClickToken(lead.id))}`
    : `${cleanBase}/audit`;

  const subject = clicked
    ? `Re: ${domain} AI Search Audit (${lead.auditScore ?? "--"}/100) — copy-paste fix kit`
    : `Quick follow-up: ${domain} AI visibility score (${lead.auditScore ?? "--"}/100)`;

  const body = clicked
    ? `${greeting}

Following up with the technical audit for ${domain} (${lead.auditScore ?? "--"}/100). This score covers crawl settings and structured content; it does not measure actual AI mentions.

If helpful, I can send over the ready-to-deploy robots.txt + /llms.txt + JSON-LD fix kit for ${domain} or spin up a free white-label sample report you can test with a client.

Link again: ${auditUrl}

Best,
${brand} Team`
    : `${greeting}

Quick bump on the free AI Search audit I ran for ${domain} (${lead.auditScore ?? "--"}/100). The first finding to review is: ${lead.auditMissing[0] || "crawl settings and structured content"}. Any change should be checked against your crawler and content policies; citation improvements are not guaranteed.

Full live report (no login): ${auditUrl}

Happy to share a 2-minute walkthrough if AI search visibility is on your 2026 roadmap.

Best,
${brand} Team`;

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE outreach_leads SET email_subject = ?, email_body = ?, approved_at = NULL, approval_hash = '', followup_count = COALESCE(followup_count, 0) + 1, updated_at = ? WHERE id = ?`
    )
    .run(subject, body, now, lead.id);

  return { ok: true, lead: getOutreachLeadById(lead.id)! };
}

export function captureInboundAuditLead(params: {
  email: string;
  websiteUrl: string;
  auditScore?: number | null;
  auditGrade?: string;
  auditMissing?: string[];
  baseUrl: string;
  consent: true;
  consentEvidence?: string;
  telemetryHeaders?: Pick<Headers, "get">;
}): OutreachLead | null {
  if (params.consent !== true) return null;
  const ownerEmail = process.env.ADMIN_EMAIL || (process.env.NODE_ENV !== "production" ? "demo@geopulse.ai" : "");
  const admin = ownerEmail ? findUserByEmail(ownerEmail) : null;
  if (!admin) return null;
  const cleanEmail = params.email.toLowerCase().trim();
  // Never overwrite a previously approved draft or remove an unsubscribe suppression.
  const existing = getDb().prepare("SELECT id FROM outreach_leads WHERE user_id = ? AND LOWER(email) = ? LIMIT 1").get(admin.id, cleanEmail);
  if (existing) return getOutreachLeadById(String(existing.id));
  const domain = new URL(params.websiteUrl).hostname;
  const lead = createOutreachLead(admin.id, {companyName: domain, email: cleanEmail, websiteUrl: params.websiteUrl, segment: "saas_growth"});
  const now = new Date().toISOString();
  getDb().prepare(`UPDATE outreach_leads SET source='inbound_audit', consent_status='opted_in', consent_evidence=?, audit_score=?, audit_grade=?, audit_missing_json=?, priority_tier=?, updated_at=? WHERE id=?`)
    .run(params.consentEvidence || `Requested audit follow-up via website form at ${now}`, params.auditScore ?? null, params.auditGrade || "", JSON.stringify(params.auditMissing || []), computeLeadPriorityTier(params.auditScore ?? null, params.auditMissing || []), now, lead.id);
  recordTelemetryEvent({eventType:"inbound_lead", path:"/audit", headers:params.telemetryHeaders, meta:"Consented audit follow-up request"});
  return getOutreachLeadById(lead.id);
}

export function computeOutreachApprovalHash(lead: OutreachLead): string {
  return crypto.createHash("sha256").update(JSON.stringify([lead.id, lead.email, lead.emailSubject, lead.emailBody, lead.consentStatus, lead.consentEvidence])).digest("hex");
}

export function approveOutreachLead(leadId: string, userId: string, expectedSnapshot?: Pick<OutreachLead, "email" | "emailSubject" | "emailBody" | "consentStatus" | "consentEvidence">): {ok:true;lead:OutreachLead} | {ok:false;error:string} {
  const lead = getOutreachLeadById(leadId);
  if (!lead || lead.userId !== userId) return {ok:false,error:"线索不存在"};
  if (expectedSnapshot && (Object.keys(expectedSnapshot) as Array<keyof typeof expectedSnapshot>).some(key => expectedSnapshot[key] !== lead[key])) return {ok:false,error:"草稿已被其他窗口修改，请刷新后重新审核"};
  if (lead.unsubscribed || isEmailUnsubscribed(lead.email)) return {ok:false,error:"已退订，禁止发送"};
  if (lead.consentStatus !== "opted_in" || !lead.consentEvidence.trim()) return {ok:false,error:"请记录收件人的许可依据；公开邮箱不代表同意营销"};
  if (!lead.emailSubject.trim() || !lead.emailBody.trim()) return {ok:false,error:"请先保存完整主题和正文"};
  const hash = computeOutreachApprovalHash(lead);
  getDb().prepare("UPDATE outreach_leads SET approved_at=?, approval_hash=? WHERE id=? AND user_id=?").run(new Date().toISOString(), hash, leadId, userId);
  return {ok:true,lead:getOutreachLeadById(leadId)!};
}

export function listOutreachSendAttempts(userId: string) {
  return getDb().prepare("SELECT id, lead_id AS leadId, recipient, provider, status, message_id AS messageId, error, created_at AS createdAt FROM email_send_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(userId);
}

// ---------------- Compliant Official Email API Sender (Resend / Brevo / Webhook) ----------------

export async function sendOutreachEmailToLead(params: {
  leadId: string;
  userId: string;
  baseUrl: string;
  approvalHash?: string;
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

  const actor = findUserById(params.userId);
  if (!actor || actor.role !== "admin" || actor.email === "demo@geopulse.ai") return {ok:false,error:"共享发信服务仅限站点管理员使用"};
  if (lead.consentStatus !== "opted_in" || !lead.consentEvidence.trim()) return {ok:false,error:"缺少收件人许可依据，不能发送营销邮件"};
  if (!params.approvalHash || !lead.approvedAt || params.approvalHash !== lead.approvalHash || params.approvalHash !== computeOutreachApprovalHash(lead)) return {ok:false,error:"草稿尚未审核或审核后已修改，请重新审核"};
  const cfg = getOutreachEmailConfig();
  if (cfg.provider === "none") return {ok:false,error:"尚未配置官方邮件发送 API"};
  if (!cfg.fromEmail.trim() && cfg.provider !== "webhook") return {ok:false,error:"请填写发件人邮箱"};
  if ((cfg.provider === "resend" || cfg.provider === "brevo") && !cfg.apiKeySecret) return {ok:false,error:"请先绑定邮件服务 API Key"};
  if (cfg.provider === "webhook") {
    if (!cfg.webhookUrl) return {ok:false,error:"请填写发信 Webhook URL"};
    assertSafeExternalUrl(cfg.webhookUrl);
  }
  const db = getDb();
  const attemptId = newId("mail");
  const nowReserved = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const prior = db.prepare("SELECT status, message_id FROM email_send_attempts WHERE user_id=? AND lead_id=? AND approval_hash=?").get(params.userId, lead.id, params.approvalHash);
    if (prior) {
      db.exec("ROLLBACK");
      if (prior.status === "accepted") return {ok:true,lead,messageId:String(prior.message_id)};
      return {ok:false,error:"该审核版本已尝试发送，请检查发送记录；系统不会自动重发结果不明的邮件"};
    }
    if (countOutreachSentToday() >= cfg.dailyLimit) {
      db.exec("ROLLBACK");
      return {ok:false,error:`已达到今日安全发信上限（UTC 日限额 ${cfg.dailyLimit} 次），失败和结果不明的尝试也计入`};
    }
    const recent = db.prepare("SELECT created_at FROM email_send_attempts ORDER BY created_at DESC LIMIT 1").get();
    if (recent && Date.now() - Date.parse(String(recent.created_at)) < 1100) {
      db.exec("ROLLBACK");
      return {ok:false,error:"发送过快，请稍后再试（至少间隔 1.1 秒）"};
    }
    db.prepare("INSERT INTO email_send_attempts(id,user_id,lead_id,recipient,approval_hash,provider,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'reserved',?,?)").run(attemptId,params.userId,lead.id,lead.email,params.approvalHash,cfg.provider,nowReserved,nowReserved);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const failAttempt = (error: string, status = "failed") => {
    db.prepare("UPDATE email_send_attempts SET status=?, error=?, updated_at=? WHERE id=?").run(status,error.slice(0,500),new Date().toISOString(),attemptId);
    return {ok:false as const,error};
  };
  const unsubUrl = buildUnsubscribeUrl(params.baseUrl, lead.email);
  const fullText = `${lead.emailBody.trim()}\n\n---\nDon't want AI visibility reports from us? Open email preferences to unsubscribe: ${unsubUrl}`;
  const escape = (text:string) => text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const linkedBody = lead.emailBody.trim().split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => index % 2 === 1 ? `<a href="${escape(part)}">${escape(part)}</a>` : escape(part)).join("");
  const htmlBody = `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${linkedBody}<hr><p>Sent via ${escape(cfg.fromName)}. <a href="${escape(unsubUrl)}">Unsubscribe</a>.</p></div>`;

  try {
    let messageId = "";

    if (cfg.provider === "resend") {
      if (!cfg.apiKeySecret) return { ok: false, error: "请先绑定 Resend API Key" };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKeySecret}`,
          "Idempotency-Key": attemptId,
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
        return failAttempt(`Resend API HTTP ${res.status}: ${json.message || "发送失败"}`);
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
        return failAttempt(`Brevo API HTTP ${res.status}: ${json.message || "发送失败"}`);
      }
      messageId = json.messageId || "brevo_ok";
    } else if (cfg.provider === "webhook") {
      if (!cfg.webhookUrl) return { ok: false, error: "请先填写自定义发信 Webhook URL" };
      const safeUrl = assertSafeExternalUrl(cfg.webhookUrl);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.apiKeySecret) headers["Authorization"] = `Bearer ${cfg.apiKeySecret}`;
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        redirect: "error",
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
        return failAttempt(`发信 Webhook HTTP ${res.status}`);
      }
      messageId = `wh_${Date.now()}`;
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE email_send_attempts SET status='accepted', message_id=?, updated_at=? WHERE id=?").run(messageId,now,attemptId);
    getDb()
      .prepare(
        `UPDATE outreach_leads SET status = 'emailed', last_sent_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(now, now, lead.id);

    return { ok: true, lead: getOutreachLeadById(lead.id)!, messageId };
  } catch (err) {
    return failAttempt(err instanceof Error ? err.message : "邮件发送网络异常", "unknown");
  }
}
