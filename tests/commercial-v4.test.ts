import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point DB to an isolated temp SQLite file before loading db/marketplace
const tmpDb = path.join(os.tmpdir(), `geopulse-v4-test-${Date.now()}.sqlite`);
process.env.GEOPULSE_DB_PATH = tmpDb;

describe("v4.0 Managed Distribution Marketplace, Credits & Growth Pack", () => {
  it("runs complete credit wallet, credit-code redemption, auto-API publish, managed order refund/fulfill, and growth pack", async () => {
    const dbMod = await import("@/lib/db");
    const mkt = await import("@/lib/marketplace");

    // 1. Seeded demo admin & 5 default platform accounts
    const demo = dbMod.findUserByEmail("demo@geopulse.ai");
    expect(demo).not.toBeNull();
    expect(demo!.role).toBe("admin");
    expect(demo!.creditsBalance).toBe(200);

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

    const redeemed = dbMod.redeemActivationCode(demo!.id, crdCode.code);
    expect(redeemed.ok).toBe(true);
    if (redeemed.ok) {
      expect(redeemed.creditsAdded).toBe(100);
      expect(redeemed.creditsBalance).toBe(300);
    }

    // 3. Official GeoPulse Self-Promotion GEO Growth Pack (idempotent: 3 ZH + 2 EN = 5 flagship articles)
    const growth = mkt.seedOfficialGeoGrowthPack(demo!.id, "https://geo.workagentpro.com");
    expect(growth.createdCount).toBe(5);
    expect(growth.articles).toHaveLength(5);
    for (const a of growth.articles) {
      expect(a.geoScore).toBeGreaterThanOrEqual(85);
    }
    // Second run is idempotent
    const growth2 = mkt.seedOfficialGeoGrowthPack(demo!.id, "https://geo.workagentpro.com");
    expect(growth2.createdCount).toBe(0);

    // 4. Submit Auto-API geo_network order -> publishes immediately & deducts 10 credits
    const articles = dbMod.listArticlesByUser(demo!.id);
    const geoAcc = mkt.getPlatformAccountWithSecret("pac_geo_hub_official")!;
    const autoOrder = await mkt.submitDistributionOrder({
      userId: demo!.id,
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
      userId: demo!.id,
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
      expect(dbMod.findUserById(demo!.id)!.creditsBalance).toBe(290);
    }

    // 6. Submit another Managed order & fulfill with external URL
    const managedOrder2 = await mkt.submitDistributionOrder({
      userId: demo!.id,
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
