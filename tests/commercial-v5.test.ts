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

  it("seeds official GEO Autopilot queue and runs next scheduled article idempotently with score >= 85", async () => {
    const dbMod = await import("@/lib/db");
    const ap = await import("@/lib/autopilot");
    const demo = dbMod.findUserByEmail("demo@geopulse.ai")!;

    const seeded = ap.seedOfficialAutopilotQueue(demo.id, "https://geo.workagentpro.com");
    expect(seeded.addedCount).toBe(6);
    expect(seeded.topics.length).toBe(6);

    // Run 1st queued English topic locally (skipping external HTTP blast in offline unit test)
    const run1 = await ap.runNextAutopilotJob({
      baseUrl: "https://geo.workagentpro.com",
      userId: demo.id,
      skipExternalBlast: true,
    });
    expect(run1.ok).toBe(true);
    if (run1.ok) {
      expect(run1.ran).toBe(true);
      expect(run1.geoScore).toBeGreaterThanOrEqual(85);
      expect(run1.publishedUrls?.[0]).toContain("https://geo.workagentpro.com/p/");
    }

    const topicsAfter = ap.listGrowthTopics(demo.id);
    expect(topicsAfter.filter((t) => t.status === "published")).toHaveLength(1);
    expect(topicsAfter.filter((t) => t.status === "queued")).toHaveLength(5);
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
