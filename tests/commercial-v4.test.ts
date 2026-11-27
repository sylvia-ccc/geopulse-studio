import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point DB to an isolated temp SQLite file before loading db/marketplace
const tmpDb = path.join(os.tmpdir(), `geopulse-v4-test-${Date.now()}.sqlite`);
vi.stubEnv("GEOPULSE_DB_PATH", tmpDb);
afterAll(() => vi.unstubAllEnvs());

describe("v4.0 Managed Distribution Marketplace, Credits & Growth Pack", () => {
  it("runs complete credit wallet, credit-code redemption, auto-API publish, managed order refund/fulfill, and growth pack", async () => {
    const dbMod = await import("@/lib/db");
    const mkt = await import("@/lib/marketplace");

    // 1. Public demo remains unprivileged; explicit owner provisioning preserves its workspace.
    const demo = dbMod.findUserByEmail("demo@geopulse.ai");
    expect(demo).not.toBeNull();
    expect(demo!.role).toBe("user");
    expect(demo!.creditsBalance).toBe(20);
    vi.stubEnv("ADMIN_EMAIL", "marketplace-owner@example.test");
    const { user: owner } = dbMod.provisionConfiguredOwner({
      email: "marketplace-owner@example.test",
      password: "test-only-owner-password-longer-than-20-characters",
      name: "Marketplace Owner",
      migrateDemoWorkspace: true,
    });
    expect(owner.role).toBe("admin");
    expect(dbMod.findUserById(demo!.id)!.role).toBe("user");
    expect(owner.creditsBalance).toBe(demo!.creditsBalance);
    mkt.adjustUserCredits({ userId: owner.id, delta: 180, reason: "Marketplace test starting wallet" });
    expect(dbMod.findUserById(owner.id)!.creditsBalance).toBe(200);


    const accounts = mkt.listPlatformAccounts(false);
    expect(accounts.length).toBeGreaterThanOrEqual(5);

    // 2. Mint & redeem a 100-credit top-up code
    const [crdCode] = dbMod.createRedemptionCodes({
      codeType: "credits",
      creditsAmount: 100,
      count: 1,
      note: "test-credits",
    });
    expect(crdCode.code.startsWith("GP-CRD-")).toBe(true);

    const redeemed = dbMod.redeemActivationCode(owner.id, crdCode.code);
    expect(redeemed.ok).toBe(true);
    if (redeemed.ok) {
      expect(redeemed.creditsAdded).toBe(100);
      expect(redeemed.creditsBalance).toBe(300);
    }

    // 3. Research growth pack is idempotent and produces five private editorial drafts.
    const growth = mkt.seedOfficialGeoGrowthPack(owner.id, "https://geo.workagentpro.com");
    expect(growth.createdCount).toBe(5);
    expect(growth.articles).toHaveLength(5);
    for (const a of growth.articles) {
      const draft = dbMod.listArticlesByUser(owner.id).find((article) => article.slug === a.slug)!;
      expect(draft.status).toBe("draft");
      expect(draft.publishedAt).toBeNull();
    }
    // Second run is idempotent
    const growth2 = mkt.seedOfficialGeoGrowthPack(owner.id, "https://geo.workagentpro.com");
    expect(growth2.createdCount).toBe(0);

    // 4. Submit Auto-API geo_network order -> publishes immediately & deducts 10 credits
    const articles = dbMod.listArticlesByUser(owner.id).filter((article) => article.status === "published");
    const geoAcc = mkt.getPlatformAccountWithSecret("pac_geo_hub_official")!;
    const autoOrder = await mkt.submitDistributionOrder({
      userId: owner.id,
      article: articles[0],
      account: geoAcc,
      baseUrl: "https://geo.workagentpro.com",
    });
    expect(autoOrder.ok).toBe(true);
    if (autoOrder.ok) {
      expect(autoOrder.order.status).toBe("published");
      expect(autoOrder.order.publishedUrl).toContain("https://geo.workagentpro.com/p/");
      expect(autoOrder.balanceAfter).toBe(290);
    }

    // 5. Submit Managed Zhihu order -> deducts 39 credits -> reject refunds full 39 credits
    const zhihuAcc = mkt.getPlatformAccountWithSecret("pac_zhihu_eval")!;
    const managedOrder = await mkt.submitDistributionOrder({
      userId: owner.id,
      article: articles[0],
      account: zhihuAcc,
      customerNote: "希望带官网链接",
      baseUrl: "https://geo.workagentpro.com",
    });
    expect(managedOrder.ok).toBe(true);
    if (managedOrder.ok) {
      expect(managedOrder.order.status).toBe("pending_review");
      expect(managedOrder.balanceAfter).toBe(251);

      const rejected = mkt.rejectDistributionOrderAndRefund({
        orderId: managedOrder.order.id,
        adminNote: "测试驳回退款",
      });
      expect(rejected?.status).toBe("rejected");
      expect(dbMod.findUserById(owner.id)!.creditsBalance).toBe(290);
    }

    // 6. Submit another Managed order & fulfill with external URL
    const managedOrder2 = await mkt.submitDistributionOrder({
      userId: owner.id,
      article: articles[0],
      account: zhihuAcc,
      baseUrl: "https://geo.workagentpro.com",
    });
    expect(managedOrder2.ok).toBe(true);
    if (managedOrder2.ok) {
      const fulfilled = mkt.fulfillDistributionOrder({
        orderId: managedOrder2.order.id,
        publishedUrl: "https://zhuanlan.zhihu.com/p/123456789",
      });
      expect(fulfilled?.status).toBe("published");
      expect(fulfilled?.publishedUrl).toBe("https://zhuanlan.zhihu.com/p/123456789");
    }

    // Cleanup temp DB files
    for (const suffix of ["", "-wal", "-shm"]) {
      if (fs.existsSync(`${tmpDb}${suffix}`)) {
        fs.unlinkSync(`${tmpDb}${suffix}`);
      }
    }
  });
});
