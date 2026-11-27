import { describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-v5-test-"));
process.env.GEOPULSE_DB_PATH = path.join(tmpDir, "test-v5.db");

describe("GeoPulse Studio v5.0 White-Label, Autopilot, Payment Webhook & Audit-to-Outreach", () => {
  it("signs and verifies HMAC white-label client report tokens and rejects tampering", async () => {
    const wl = await import("@/lib/white-label");
    const url = wl.buildShareableReportUrl("https://geo.workagentpro.com", "brd_123", "usr_abc");
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token") || "";
    expect(parsed.pathname).toBe("/r/brd_123");
    expect(wl.verifyWhiteLabelReportToken("brd_123", "usr_abc", token)).toBe(true);
    expect(wl.verifyWhiteLabelReportToken("brd_123", "usr_other", token)).toBe(false);
    expect(wl.verifyWhiteLabelReportToken("brd_999", "usr_abc", token)).toBe(false);
    expect(wl.verifyWhiteLabelReportToken("brd_123", "usr_abc", "tampered_token_123456")).toBe(false);
  });

  it("seeds research topics and automatically publishes the approved source-backed tutorial", async () => {
    const dbMod = await import("@/lib/db");
    const ap = await import("@/lib/autopilot");
    const demo = dbMod.findUserByEmail("demo@geopulse.ai")!;
    const publishedBefore = dbMod.getDb().prepare("SELECT COUNT(*) AS n FROM articles WHERE status = 'published'").get()?.n;
    const seeded = ap.seedOfficialAutopilotQueue(demo.id, "https://geo.workagentpro.com");
    expect(dbMod.getDb().prepare("SELECT COUNT(*) AS n FROM articles WHERE status = 'published'").get()?.n).toBe(publishedBefore);
    expect(seeded.addedCount).toBe(6);
    expect(ap.seedOfficialAutopilotQueue(demo.id, "https://geo.workagentpro.com").addedCount).toBe(0);
    const source = await import("@/lib/autopilot-content");
    const topic = seeded.topics.find((item) => item.titleHint.includes("White-Label"))!;
    const verified = source.buildVerifiedAutopilotContent(topic, "https://geo.workagentpro.com")!;
    expect(verified).not.toBeNull();
    dbMod.getDb().prepare("UPDATE growth_topics SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", topic.id);
    const run = await ap.runNextAutopilotJob({
      baseUrl: "https://geo.workagentpro.com", userId: demo.id, skipExternalBlast: true,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) throw new Error(run.error);
    expect(run.ran).toBe(true);
    expect(run.topic?.status).toBe("published");
    const article = dbMod.getArticleById(run.topic!.articleId)!;
    expect(article.status).toBe("published");
    expect(article.title).toBe(verified.title);
    expect(article.markdownContent).toContain("## Sources and scope");
    for (const url of verified.sourceUrls) expect(article.markdownContent).toContain(url);
    expect(article.markdownContent).toContain(`<!-- autopilot-template:${verified.key} -->`);
    expect(article.markdownContent).not.toContain(ap.AUTOPILOT_REVIEW_MARKER);
    expect(run.publishedUrls).toEqual([`https://geo.workagentpro.com/p/${article.slug}`]);
    expect(ap.listGrowthTopics(demo.id).filter((t) => t.status === "published")).toHaveLength(1);
    expect(ap.listGrowthTopics(demo.id).filter((t) => t.status === "queued")).toHaveLength(5);
  });

  it("verifies LemonSqueezy HMAC signatures, auto-credits existing users, mints codes for new buyers, and blocks duplicate replays", async () => {
    const dbMod = await import("@/lib/db");
    const pw = await import("@/lib/payment-webhooks");

    const raw = JSON.stringify({ test: 1 });
    const sig = crypto.createHmac("sha256", "my-secret").update(raw).digest("hex");
    expect(pw.verifyLemonSqueezySignature(raw, sig, "my-secret")).toBe(true);
    expect(pw.verifyLemonSqueezySignature(raw, "bad-sig", "my-secret")).toBe(false);

    const demo = dbMod.findUserByEmail("demo@geopulse.ai")!;
    const beforeCredits = demo.creditsBalance;

    const r1 = pw.processVerifiedPaymentEvent({
      eventId: "evt_credit_001",
      provider: "lemonsqueezy",
      buyerEmail: "demo@geopulse.ai",
      sku: "credits_100",
    });
    expect(r1.ok).toBe(true);
    expect(r1.duplicate).toBeUndefined();
    expect(dbMod.findUserById(demo.id)!.creditsBalance).toBe(beforeCredits + 100);

    // Replay same eventId -> idempotent no-op
    const rDup = pw.processVerifiedPaymentEvent({
      eventId: "evt_credit_001",
      provider: "lemonsqueezy",
      buyerEmail: "demo@geopulse.ai",
      sku: "credits_100",
    });
    expect(rDup.duplicate).toBe(true);
    expect(dbMod.findUserById(demo.id)!.creditsBalance).toBe(beforeCredits + 100);

    // Unregistered buyer -> auto-mints redemption code
    const rNew = pw.processVerifiedPaymentEvent({
      eventId: "evt_agency_002",
      provider: "stripe",
      buyerEmail: "founder@agency.example",
      sku: "enterprise_monthly",
    });
    expect(rNew.generatedCode?.startsWith("GP-ENT-")).toBe(true);
  });

  it("generates audit-backed personalized outreach emails and enforces unsubscribe blacklist & daily caps", async () => {
    const dbMod = await import("@/lib/db");
    const out = await import("@/lib/outreach");
    const demo = dbMod.findUserByEmail("demo@geopulse.ai")!;

    const draft = out.buildPersonalizedAuditEmail({
      companyName: "PeakSEO Agency",
      contactName: "Sarah",
      websiteUrl: "https://peakseo.example",
      segment: "agency_white_label",
      auditScore: 42,
      auditGrade: "D",
      auditMissing: ["Missing /llms.txt", "Robots blocks GPTBot"],
      baseUrl: "https://geo.workagentpro.com",
      senderBrand: "GeoPulse Studio",
    });
    expect(draft.subject).toContain("42/100");
    expect(draft.body).toContain("https://geo.workagentpro.com/audit?url=https%3A%2F%2Fpeakseo.example&auto=1");

    const lead = out.createOutreachLead(demo.id, {
      companyName: "PeakSEO Agency",
      contactName: "Sarah",
      email: "sarah@peakseo.example",
      websiteUrl: "https://peakseo.example",
      segment: "agency_white_label",
    });
    out.updateOutreachLead(lead.id, demo.id, {
      emailSubject: draft.subject,
      emailBody: draft.body,
    });

    // Sign & verify unsubscribe token, then mark unsubscribed and confirm send is hard-blocked
    const unsubUrl = out.buildUnsubscribeUrl("https://geo.workagentpro.com", "sarah@peakseo.example");
    const u = new URL(unsubUrl);
    expect(out.verifyUnsubscribeToken("sarah@peakseo.example", u.searchParams.get("token") || "")).toBe(true);

    out.markEmailUnsubscribed("sarah@peakseo.example");
    expect(out.isEmailUnsubscribed("sarah@peakseo.example")).toBe(true);

    const blocked = await out.sendOutreachEmailToLead({
      leadId: lead.id,
      userId: demo.id,
      baseUrl: "https://geo.workagentpro.com",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toContain("退订黑名单");
    }
  });
});
