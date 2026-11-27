import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(() => ({ id: "lead_saved" })),
  click: vi.fn(),
  user: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/outreach", () => ({ captureInboundAuditLead: mocks.capture, recordLeadAuditClick: mocks.click }));
vi.mock("@/lib/api-auth", () => ({
  getBaseUrl: () => "https://geopulse.example",
  requireAuthUser: mocks.user,
  unauthorizedResponse: () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/geo/site-auditor", () => ({ runLiveSiteGeoAudit: mocks.audit }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }), getClientIp: () => "test",
}));

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-telemetry-test-"));
process.env.GEOPULSE_DB_PATH = path.join(testDir, "telemetry.db");
const telemetry = await import("@/lib/telemetry");
const db = await import("@/lib/db");
const receipt = {
  websiteUrl: "https://audited.example", auditScore: 42, auditGrade: "D",
  auditMissing: ["Missing llms.txt"],
};
function post(url: string, body: object) {
  return new NextRequest(`https://geopulse.example${url}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("v5.1 telemetry and consent capture", () => {
  it("keeps claimed bot identities distinct and does not classify arbitrary product names", () => {
    expect(telemetry.detectAiBotFromUserAgent("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe("GPTBot");
    expect(telemetry.detectAiBotFromUserAgent("ChatGPT-User/1.0")).toBe("ChatGPT-User");
    expect(telemetry.detectAiBotFromUserAgent("GoogleOther/1.0")).toBe("GoogleOther");
    expect(telemetry.detectAiBotFromUserAgent("MyDeepSeekClient/1.0")).toBe("");
    expect(telemetry.detectAiBotFromUserAgent("FakeGPTBot/1.0")).toBe("");
  });

  it("excludes marked prefetch requests and strips token-bearing query strings", () => {
    db.getDb().exec("DELETE FROM telemetry_events");
    for (const headers of [new Headers({ purpose: "prefetch" }), new Headers({ "sec-purpose": "prefetch;prerender" }), new Headers({ "next-router-prefetch": "1" })]) {
      telemetry.recordTelemetryEvent({ eventType: "article_view", path: "/p/example", headers, userAgent: "GPTBot/1.0" });
    }
    telemetry.recordTelemetryEvent({ eventType: "article_view", path: "/p/example?token=secret", userAgent: "GPTBot/1.0", referer: "https://geopulse.example/r/client?token=secret" });
    telemetry.recordTelemetryEvent({ eventType: "public_audit", path: "/audit", userAgent: "GPTBot/1.0" });
    const summary = telemetry.getTelemetrySummary();
    expect(summary.totalEvents7d).toBe(2);
    expect(summary.aiCrawlerHits7d).toBe(1);
    expect(summary.publicAudits7d).toBe(1);
    expect(summary.botBreakdown).toHaveLength(1);
    expect(summary.recentEvents[0].path).not.toContain("?");
    const row = db.getDb().prepare("SELECT referer FROM telemetry_events WHERE event_type = 'ai_crawler_hit'").get();
    expect(row?.referer).toBe("/r/client");
  });

  it("keeps recent events inside the selected window and handles invalid day values", () => {
    db.getDb().exec("DELETE FROM telemetry_events");
    telemetry.recordTelemetryEvent({ eventType: "report_view", path: "/r/old" });
    db.getDb().prepare("UPDATE telemetry_events SET created_at = ?").run(new Date(Date.now() - 10 * 86400_000).toISOString());
    expect(telemetry.getTelemetrySummary(Number.NaN).recentEvents).toHaveLength(0);
    expect(telemetry.getTelemetrySummary(30).recentEvents).toHaveLength(1);
    expect(telemetry.getTelemetrySummary(1).totalEvents7d).toBe(0);
  });

  it("authenticates audit results, detects tampering, and expires receipts", () => {
    vi.useFakeTimers();
    const token = telemetry.signAuditReceipt(receipt);
    expect(telemetry.verifyAuditReceipt(token)).toEqual(receipt);
    const [payload, signature] = token.split(".");
    const altered = JSON.parse(Buffer.from(payload, "base64url").toString());
    altered.auditScore = 100;
    expect(telemetry.verifyAuditReceipt(`${Buffer.from(JSON.stringify(altered)).toString("base64url")}.${signature}`)).toBeNull();
    expect(telemetry.verifyAuditReceipt(`${token}.extra`)).toBeNull();
    vi.advanceTimersByTime(60 * 60_000 + 1);
    expect(telemetry.verifyAuditReceipt(token)).toBeNull();
  });

  it("requires explicit consent and a valid server receipt before saving a contact request", async () => {
    const { POST } = await import("@/app/api/public/capture-lead/route");
    const auditToken = telemetry.signAuditReceipt(receipt);
    const noConsent = await POST(post("/api/public/capture-lead", { email: "owner@example.com", auditToken }));
    expect(noConsent.status).toBe(400);
    const invalidToken = await POST(post("/api/public/capture-lead", { email: "owner@example.com", consent: true, auditToken: "fake" }));
    expect(invalidToken.status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
    const response = await POST(post("/api/public/capture-lead", {
      email: "owner@example.com", consent: true, auditToken,
      websiteUrl: "https://forged.example", auditScore: 100, auditGrade: "A", auditMissing: [],
    }));
    expect(response.status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledWith({
      ...receipt, email: "owner@example.com", consent: true,
      consentEvidence: "public-audit-contact-v1", baseUrl: "https://geopulse.example",
      telemetryHeaders: expect.any(Headers),
    });
    expect((await response.json()).message).toContain("不会自动发送邮件");
  });

  it("issues receipts for completed site and content audits and records both modes", async () => {
    db.getDb().exec("DELETE FROM telemetry_events");
    mocks.audit.mockResolvedValue({
      targetUrl: receipt.websiteUrl, origin: receipt.websiteUrl, overallScore: receipt.auditScore,
      grade: receipt.auditGrade, ttfbMs: 100, checks: {}, botPermissions: [],
      recommendations: [{ severity: "warning", title: receipt.auditMissing[0], detail: "Add the file" }],
    });
    const { POST } = await import("@/app/api/public/audit/route");
    const site = await POST(post("/api/public/audit", { mode: "site", url: receipt.websiteUrl, lid: "lead1", lsig: "signed" }));
    expect(site.status).toBe(200);
    expect(telemetry.verifyAuditReceipt((await site.json()).auditToken)).toEqual(receipt);
    expect(mocks.click).toHaveBeenCalledWith("lead1", "signed");
    const content = await POST(post("/api/public/audit", { mode: "content", content: "A descriptive product page with a clear answer about a useful accounting product." }));
    expect(content.status).toBe(200);
    const contentData = await content.json();
    expect(telemetry.verifyAuditReceipt(contentData.auditToken)?.auditScore).toBe(contentData.audit.overallScore);
    expect(telemetry.getTelemetrySummary().publicAudits7d).toBe(2);
  });

  it("restricts telemetry to admins and returns an explicit bounded period without caching", async () => {
    const { GET } = await import("@/app/api/admin/telemetry/route");
    const request = new NextRequest("https://geopulse.example/api/admin/telemetry?days=oops");
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET(request)).status).toBe(401);
    mocks.user.mockResolvedValueOnce({ role: "user" });
    expect((await GET(request)).status).toBe(403);
    mocks.user.mockResolvedValueOnce({ role: "admin" });
    const response = await GET(request);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ days: 7, identityBasis: "user-agent-claim" });
  });

  it("serves PNG social cards with the advertised dimensions", async () => {
    const { GET } = await import("@/app/api/og/route");
    const response = await GET(new NextRequest("https://geopulse.example/api/og?title=Example"));
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  });

  it("gives articles their own canonical/social URLs and marks token reports noindex", async () => {
    const getArticle = vi.spyOn(db, "getPublishedArticleBySlug").mockReturnValue({
      slug: "sample-article", title: "Sample article", summary: "Useful summary", directAnswerCapsule: "Answer", targetKeyword: "GEO",
    } as ReturnType<typeof db.getPublishedArticleBySlug>);
    try {
      const articlePage = await import("@/app/p/[slug]/page");
      const metadata = await articlePage.generateMetadata({ params: Promise.resolve({ slug: "sample-article" }) });
      expect(metadata.alternates?.canonical).toBe("/p/sample-article");
      expect(metadata.openGraph).toMatchObject({ url: "/p/sample-article", type: "article", images: [{ url: "/api/og?title=Sample%20article", width: 1200, height: 630 }] });
      const reportPage = await import("@/app/r/[id]/page");
      expect(reportPage.metadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
      expect(reportPage.metadata.referrer).toBe("no-referrer");
    } finally { getArticle.mockRestore(); }
  });


  it("sets separate canonical URLs for public entry pages and noindex for the workspace", async () => {
    const home = await import("@/app/page");
    const audit = await import("@/app/audit/page");
    const hub = await import("@/app/hub/page");
    const workspace = await import("@/app/app/page");
    expect(home.metadata.alternates?.canonical).toBe("/");
    expect(audit.metadata.alternates?.canonical).toBe("/audit");
    expect(hub.metadata.alternates?.canonical).toBe("/hub");
    expect(workspace.metadata.robots).toMatchObject({ index: false, follow: false });
  });


  it("excludes RSC and marked validation requests while preserving normal document telemetry", () => {
    db.getDb().exec("DELETE FROM telemetry_events");
    for (const headers of [
      new Headers({ rsc: "1" }), new Headers({ "x-geopulse-test": "1" }),
      new Headers({ "user-agent": "Mozilla/5.0 GeoPulse-Test/5.1 GPTBot/1.0" }),
      new Headers({ "user-agent": "GeoPulse-AuditBot/2.0 (+https://geopulse.studio)" }),
    ]) {
      expect(telemetry.shouldExcludeTelemetry(headers)).toBe(true);
      telemetry.recordTelemetryEvent({ eventType: "article_view", path: "/p/validation", headers });
    }
    telemetry.recordTelemetryEvent({ eventType: "article_view", path: "/p/validation", userAgent: "GeoPulse-Test/5.1" });
    telemetry.recordTelemetryEvent({ eventType: "article_view", path: "/p/document", headers: new Headers({ rsc: "0", "x-geopulse-test": "0", "user-agent": "GPTBot/1.0" }) });
    expect(telemetry.getTelemetrySummary()).toMatchObject({ totalEvents7d: 1, aiCrawlerHits7d: 1 });
    expect(telemetry.getTelemetrySummary().topPaths).toEqual([{ path: "/p/document", count: 1 }]);
  });

  it("prunes events older than 90 days on writes and summary reads, preserving the boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T10:00:00.000Z"));
    db.getDb().exec("DELETE FROM telemetry_events");
    const insert = (id: string, age: number) => db.getDb().prepare(
      "INSERT INTO telemetry_events (id, event_type, path, created_at) VALUES (?, 'article_view', '/p/history', ?)"
    ).run(id, new Date(Date.now() - age).toISOString());
    const retention = 90 * 86400_000;
    insert("expired-write", retention + 1);
    insert("boundary", retention);
    telemetry.recordTelemetryEvent({ eventType: "article_view", path: "/p/current" });
    expect(db.getDb().prepare("SELECT id FROM telemetry_events WHERE id = 'expired-write'").get()).toBeUndefined();
    expect(db.getDb().prepare("SELECT id FROM telemetry_events WHERE id = 'boundary'").get()?.id).toBe("boundary");
    insert("expired-read", retention + 1);
    expect(telemetry.getTelemetrySummary().totalEvents7d).toBe(1);
    expect(db.getDb().prepare("SELECT id FROM telemetry_events WHERE id = 'expired-read'").get()).toBeUndefined();
  });

  it("fails closed for missing, short or default production receipt secrets", () => {
    const token = telemetry.signAuditReceipt(receipt);
    vi.stubEnv("NODE_ENV", "production");
    for (const secret of ["", "short", "geopulse-commercial-dev-secret-change-in-prod-2026"]) {
      vi.stubEnv("SESSION_SECRET", secret);
      expect(() => telemetry.signAuditReceipt(receipt)).toThrow("SESSION_SECRET");
      expect(telemetry.verifyAuditReceipt(token)).toBeNull();
    }
    vi.stubEnv("SESSION_SECRET", "test-fixture-production-secret-of-at-least-32-characters");
    expect(telemetry.verifyAuditReceipt(telemetry.signAuditReceipt(receipt))).toEqual(receipt);
  });

  it("does not attribute marked validation audits as outreach clicks or organic audits", async () => {
    db.getDb().exec("DELETE FROM telemetry_events");
    mocks.audit.mockResolvedValue({
      targetUrl: receipt.websiteUrl, origin: receipt.websiteUrl, overallScore: receipt.auditScore,
      grade: receipt.auditGrade, ttfbMs: 100, checks: {}, botPermissions: [], recommendations: [],
    });
    const { POST } = await import("@/app/api/public/audit/route");
    const request = post("/api/public/audit", { mode: "site", url: receipt.websiteUrl, lid: "lead1", lsig: "signed" });
    request.headers.set("x-geopulse-test", "1");
    expect((await POST(request)).status).toBe(200);
    expect(mocks.click).not.toHaveBeenCalled();
    expect(telemetry.getTelemetrySummary().totalEvents7d).toBe(0);
  });

});
