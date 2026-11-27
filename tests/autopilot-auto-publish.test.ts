import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PlatformAccountWithSecret } from "@/lib/marketplace";

process.env.GEOPULSE_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-auto-publish-")), "auto.sqlite");

vi.mock("@/lib/marketplace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketplace")>();
  return {
    ...actual, listPlatformAccounts: vi.fn(() => []),
    getPlatformAccountWithSecret: vi.fn(), submitGlobalBlastOrder: vi.fn(),
  };
});

const db = await import("@/lib/db");
const ap = await import("@/lib/autopilot");
const content = await import("@/lib/autopilot-content");
const market = await import("@/lib/marketplace");
const baseUrl = "https://geopulse.example";
let ownerId: string;
let brandId: string;
let fixtureCount = 0;

beforeEach(() => {
  process.env.ADMIN_EMAIL = `auto-owner-${++fixtureCount}@example.test`;
  ownerId = db.provisionConfiguredOwner({
    email: process.env.ADMIN_EMAIL, password: "test-owner-password-long-enough",
    name: "Automatic publishing test owner", migrateDemoWorkspace: false,
  }).user.id;
  brandId = db.createBrand(ownerId, {
    name: "Test content workspace", companyName: "Test", productName: "Test content workspace",
    category: "Content workflow", oneLiner: "A test workspace", targetAudience: "Content teams",
    coreAdvantages: [], proofPoints: [], pricingInfo: "", competitors: [], websiteUrl: baseUrl,
    forbiddenWords: [], regionFocus: "Both",
  }).id;
  vi.mocked(market.listPlatformAccounts).mockReset().mockReturnValue([]);
  vi.mocked(market.getPlatformAccountWithSecret).mockReset();
  vi.mocked(market.submitGlobalBlastOrder).mockReset();
});

function addTopic(title = "How to Evaluate a White-Label GEO Workflow for Agency Clients", external = false) {
  return ap.addGrowthTopic({
    userId: ownerId, brandId, titleHint: title, keyword: "white label agency report evidence workflow",
    language: "en", archetype: "howto_playbook", targetAccountIds: external ? ["account_auto"] : [],
  });
}

function mockDeferredDelivery() {
  vi.mocked(market.getPlatformAccountWithSecret).mockReturnValue({
    id: "account_auto", name: "Test automatic channel", enabled: true,
    deliveryMode: "auto_api", platformType: "devto",
  } as PlatformAccountWithSecret);
  let finish!: (result: {
    ok: true; originalCost: number; discountPercent: number; netCharged: number; totalRefunded: number;
    balanceAfter: number; proofMarkdown: string;
    results: Array<{ orderId: string; accountId: string; platformName: string; platformType: "devto";
      region: string; status: "published"; publishedUrl: string; message: string; creditsNet: number }>;
  }) => void;
  vi.mocked(market.submitGlobalBlastOrder).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  return () => finish({
    ok: true, originalCost: 0, discountPercent: 0, netCharged: 0, totalRefunded: 0,
    balanceAfter: 0, proofMarkdown: "", results: [{
      orderId: "order_auto", accountId: "account_auto", platformName: "Test automatic channel",
      platformType: "devto", region: "Global", status: "published", publishedUrl: "https://publisher.example/approved",
      message: "published", creditsNet: 0,
    }],
  });
}

describe("Approved automatic tutorial publishing", () => {
  it("publishes an approved source-backed tutorial without a human review marker", async () => {
    const topic = addTopic();
    const verified = content.buildVerifiedAutopilotContent(topic, baseUrl)!;
    expect(verified).not.toBeNull();
    const result = await ap.runNextAutopilotJob({ userId: ownerId, baseUrl, skipExternalBlast: true });
    expect(result).toMatchObject({ ok: true, ran: true, topic: { id: topic.id, status: "published" } });
    if (!result.ok || !result.topic) throw new Error("Expected automatic publication");
    const article = db.getArticleById(result.topic.articleId)!;
    expect(article.title).toBe(verified.title);
    expect(article.status).toBe("published");
    expect(article.publishedAt).not.toBeNull();
    expect(article.markdownContent).toContain("## Sources and scope");
    expect(article.markdownContent).toContain(`<!-- autopilot-template:${verified.key} -->`);
    for (const url of verified.sourceUrls) expect(article.markdownContent).toContain(url);
    expect(article.markdownContent).not.toContain(ap.AUTOPILOT_REVIEW_MARKER);
    expect(result.publishedUrls).toEqual([`${baseUrl}/p/${article.slug}`]);
    expect(market.submitGlobalBlastOrder).not.toHaveBeenCalled();
  });

  it("does not publish the same approved template for a second queued topic", async () => {
    addTopic();
    const first = await ap.runNextAutopilotJob({ userId: ownerId, baseUrl, skipExternalBlast: true });
    expect(first).toMatchObject({ ok: true, topic: { status: "published" } });
    if (!first.ok || !first.topic) throw new Error("Expected first publication");
    addTopic("How to review an agency report with traceable evidence");
    const duplicate = await ap.runNextAutopilotJob({ userId: ownerId, baseUrl, skipExternalBlast: true });
    expect(duplicate).toMatchObject({ ok: true, topic: { status: "published", articleId: first.topic.articleId } });
    expect(db.listArticlesByUser(ownerId).filter((article) => article.status === "published")).toHaveLength(1);
    expect(market.submitGlobalBlastOrder).not.toHaveBeenCalled();
  });

  it("prevents a second worker from claiming the same automatically published topic during external delivery", async () => {
    const topic = addTopic(undefined, true);
    const finish = mockDeferredDelivery();
    const first = ap.runNextAutopilotJob({ userId: ownerId, baseUrl });
    expect(ap.listGrowthTopics(ownerId).find((item) => item.id === topic.id)?.status).toBe("processing");
    const second = await ap.runNextAutopilotJob({ userId: ownerId, baseUrl });
    expect(second).toMatchObject({ ok: true, ran: false });
    expect(market.submitGlobalBlastOrder).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toMatchObject({ ok: true, topic: { id: topic.id, status: "published" } });
    expect(db.listArticlesByUser(ownerId).filter((article) => article.status === "published")).toHaveLength(1);
  });

  it("prevents overlapping topics from dispatching the same approved template twice", async () => {
    addTopic(undefined, true);
    const finish = mockDeferredDelivery();
    const first = ap.runNextAutopilotJob({ userId: ownerId, baseUrl });
    addTopic("How to review an agency report with traceable evidence", true);
    const second = await ap.runNextAutopilotJob({ userId: ownerId, baseUrl });
    expect(second).toMatchObject({ ok: true, topic: { status: "published" } });
    expect(market.submitGlobalBlastOrder).toHaveBeenCalledTimes(1);
    finish();
    const completed = await first;
    expect(completed).toMatchObject({ ok: true, topic: { status: "published" } });
    if (!completed.ok || !completed.topic) throw new Error("Expected first publication");
    expect(second).toMatchObject({ ok: true, topic: { articleId: completed.topic.articleId } });
    expect(db.listArticlesByUser(ownerId).filter((article) => article.status === "published")).toHaveLength(1);
  });
});
