import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PlatformAccountWithSecret } from "@/lib/marketplace";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-autopilot-safety-"));
process.env.GEOPULSE_DB_PATH = path.join(testDir, "safety.sqlite");

vi.mock("@/lib/marketplace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketplace")>();
  return {
    ...actual,
    listPlatformAccounts: vi.fn(() => []),
    getPlatformAccountWithSecret: vi.fn(),
    submitGlobalBlastOrder: vi.fn(),
  };
});

const db = await import("@/lib/db");
const ap = await import("@/lib/autopilot");
const market = await import("@/lib/marketplace");
const payments = await import("@/lib/payment-webhooks");
const baseUrl = "https://geopulse.example";
const demo = db.findUserByEmail("demo@geopulse.ai")!;
const brandId = db.listBrandsByUser(demo.id)[0].id;

beforeEach(() => {
  db.getDb().prepare("DELETE FROM growth_topics").run();
  vi.mocked(market.listPlatformAccounts).mockReset().mockReturnValue([]);
  vi.mocked(market.getPlatformAccountWithSecret).mockReset();
  vi.mocked(market.submitGlobalBlastOrder).mockReset();
});

function addTopic() {
  return ap.addGrowthTopic({
    userId: demo.id, brandId,
    titleHint: "Pricing comparison requiring verified research",
    keyword: "pricing", targetAccountIds: ["account_a", "account_b"],
  });
}

async function reviewedTopic() {
  const topic = addTopic();
  const generated = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
  if (!generated.ok || !generated.topic) throw new Error("Expected editorial draft");
  const article = db.getArticleById(generated.topic.articleId)!;
  db.updateArticle(article.id, demo.id, {
    markdownContent: "## Verified observation\nA dated test and primary source were checked by the editor.",
    status: "published",
  });
  return { topic, article };
}

function mockAccounts() {
  vi.mocked(market.getPlatformAccountWithSecret).mockImplementation((id) => ({
    id, enabled: true, deliveryMode: "auto_api", name: id, platformType: "devto",
  }) as PlatformAccountWithSecret);
}

function channel(accountId: string, status: "published" | "failed", publishedUrl = "") {
  return {
    orderId: `order_${accountId}`, accountId, platformName: accountId,
    platformType: "devto" as const, region: "Global", status, publishedUrl,
    message: status, creditsNet: 0,
  };
}

function blast(results: ReturnType<typeof channel>[]) {
  return {
    ok: true as const, originalCost: 0, discountPercent: 0, netCharged: 0,
    totalRefunded: 0, balanceAfter: 0, results, proofMarkdown: "",
  };
}

describe("Autopilot claims, editorial review, and delivery outcomes", () => {
  it("requires a provisioned non-demo owner for scheduler calls without a user", async () => {
    vi.stubEnv("ADMIN_EMAIL", "not-provisioned@example.test");
    try {
      expect(await ap.runNextAutopilotJob({ baseUrl })).toMatchObject({ ok: false });
      vi.stubEnv("ADMIN_EMAIL", "demo@geopulse.ai");
      expect(await ap.runNextAutopilotJob({ baseUrl })).toMatchObject({ ok: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not distribute drafts or articles with the review marker still present", async () => {
    addTopic();
    const generated = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(generated.ok).toBe(true);
    if (!generated.ok || !generated.topic) throw new Error("Expected draft");
    const article = db.getArticleById(generated.topic.articleId)!;
    expect(article.status).toBe("draft");
    expect(article.publishedAt).toBeNull();
    expect(generated.publishedUrls).toEqual([]);
    db.updateArticle(article.id, demo.id, { status: "published" });
    const blocked = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(blocked).toMatchObject({ ok: true, ran: false });
    expect(market.submitGlobalBlastOrder).not.toHaveBeenCalled();
    expect(ap.listGrowthTopics(demo.id)[0].status).toBe("review_pending");
  });

  it("claims an approved topic once while another worker is awaiting external delivery", async () => {
    const { topic, article } = await reviewedTopic();
    mockAccounts();
    let finish!: (value: ReturnType<typeof blast>) => void;
    vi.mocked(market.submitGlobalBlastOrder).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(ap.listGrowthTopics(demo.id)[0].status).toBe("processing");
    expect(ap.deleteGrowthTopic(topic.id)).toBe(false);
    const second = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(second).toMatchObject({ ok: true, ran: false });
    expect(market.submitGlobalBlastOrder).toHaveBeenCalledTimes(1);
    finish(blast([
      channel("account_a", "published", "https://publisher.example/a"),
      channel("account_b", "published", "https://publisher.example/b"),
    ]));
    const completed = await first;
    expect(completed).toMatchObject({ ok: true, topic: { id: topic.id, articleId: article.id, status: "published" } });
    expect(db.getDb().prepare("SELECT COUNT(*) AS n FROM articles WHERE id = ?").get(article.id)?.n).toBe(1);
  });

  it("keeps partial delivery proof and reports failure instead of completion", async () => {
    const { topic, article } = await reviewedTopic();
    mockAccounts();
    vi.mocked(market.submitGlobalBlastOrder).mockResolvedValue(blast([
      channel("account_a", "published", "https://publisher.example/partial"),
      channel("account_b", "failed"),
    ]));
    const result = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(result.ok).toBe(false);
    const stored = ap.listGrowthTopics(demo.id)[0];
    expect(stored).toMatchObject({ id: topic.id, articleId: article.id, status: "failed" });
    expect(stored.publishedUrls).toContain("https://publisher.example/partial");
    expect(stored.publishedUrls).toContain(`${baseUrl}/p/${article.slug}`);
    expect(stored.errorMsg).toContain("account_b");
    const retry = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(retry).toMatchObject({ ok: true, ran: false });
    expect(market.submitGlobalBlastOrder).toHaveBeenCalledTimes(1);
  });

  it("records top-level and thrown delivery failures without creating another article", async () => {
    const { article } = await reviewedTopic();
    mockAccounts();
    vi.mocked(market.submitGlobalBlastOrder).mockRejectedValue(new Error("provider timeout"));
    const result = await ap.runNextAutopilotJob({ userId: demo.id, baseUrl });
    expect(result).toEqual({ ok: false, error: "provider timeout" });
    expect(ap.listGrowthTopics(demo.id)[0]).toMatchObject({ articleId: article.id, status: "failed" });
    db.getDb().prepare("UPDATE growth_topics SET status = 'review_pending'").run();
    vi.mocked(market.submitGlobalBlastOrder).mockResolvedValue({ ok: false, error: "insufficient credits" });
    expect(await ap.runNextAutopilotJob({ userId: demo.id, baseUrl })).toMatchObject({ ok: false });
    expect(ap.listGrowthTopics(demo.id)[0].errorMsg).toContain("insufficient credits");
  });
});

describe("Payment fulfillment atomicity", () => {
  it("rolls back account changes and the receipt on failure, allowing one successful retry", () => {
    const event = { eventId: "rollback_credit", provider: "generic" as const, buyerEmail: demo.email, sku: "credits_100" as const };
    const balance = db.findUserById(demo.id)!.creditsBalance;
    db.getDb().exec(`CREATE TRIGGER reject_payment_completion BEFORE UPDATE ON payment_webhook_events
      BEGIN SELECT RAISE(ABORT, 'injected receipt write failure'); END`);
    try {
      expect(() => payments.processVerifiedPaymentEvent(event)).toThrow("injected receipt write failure");
      expect(db.findUserById(demo.id)!.creditsBalance).toBe(balance);
      expect(db.getDb().prepare("SELECT * FROM payment_webhook_events WHERE event_id = ?").get(event.eventId)).toBeUndefined();
      expect(db.getDb().prepare("SELECT COUNT(*) AS n FROM credit_transactions WHERE ref_id = ?").get(event.eventId)?.n).toBe(0);
    } finally {
      db.getDb().exec("DROP TRIGGER reject_payment_completion");
    }
    expect(payments.processVerifiedPaymentEvent(event).duplicate).toBeUndefined();
    expect(payments.processVerifiedPaymentEvent(event).duplicate).toBe(true);
    expect(db.findUserById(demo.id)!.creditsBalance).toBe(balance + 100);
    expect(() => payments.processVerifiedPaymentEvent({ ...event, sku: "credits_300" })).toThrow("conflicts");
    expect(db.findUserById(demo.id)!.creditsBalance).toBe(balance + 100);
  });

  it("rolls back minted redemption codes when receipt finalization fails", () => {
    const count = db.getDb().prepare("SELECT COUNT(*) AS n FROM redemption_codes").get()?.n;
    db.getDb().exec(`CREATE TRIGGER reject_payment_code BEFORE UPDATE ON payment_webhook_events
      BEGIN SELECT RAISE(ABORT, 'receipt unavailable'); END`);
    try {
      expect(() => payments.processVerifiedPaymentEvent({
        eventId: "rollback_code", provider: "generic", buyerEmail: "new-buyer@example.test", sku: "enterprise_monthly",
      })).toThrow("receipt unavailable");
      expect(db.getDb().prepare("SELECT COUNT(*) AS n FROM redemption_codes").get()?.n).toBe(count);
      expect(db.getDb().prepare("SELECT * FROM payment_webhook_events WHERE event_id = 'rollback_code'").get()).toBeUndefined();
    } finally {
      db.getDb().exec("DROP TRIGGER reject_payment_code");
    }
  });
});

it("reports the 5.1.0 health version", async () => {
  const route = await import("@/app/api/health/route");
  const response = await route.GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ version: "5.1.0", database: "connected" });
});
