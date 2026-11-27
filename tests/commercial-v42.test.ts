import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildBlueskyPostPayload, extractCleanTags } from "../src/lib/global-publishers";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-v42-test-"));
process.env.GEOPULSE_DB_PATH = path.join(tmpDir, "test-v42.db");

describe("GeoPulse Studio v4.2 Global Blast & Publisher Quality Polish", () => {
  it("never truncates long canonical URLs in Bluesky ATProto posts and keeps exact UTF-8 facet offsets", () => {
    const longUrl =
      "https://geo.workagentpro.com/p/2026-best-open-source-geo-tools-profound-otterly-alternative-complete-benchmark";
    const record = buildBlueskyPostPayload({
      title:
        "2026 Best Open-Source GEO Tools Compared: GeoPulse Studio vs Profound vs Scrunch AI vs Peec AI vs Otterly.ai",
      capsule:
        "As of 2026, Generative Engine Optimization platforms split into expensive monitoring dashboards ($499-$1500/mo) and full-stack open-source publishing engines.",
      canonicalUrl: longUrl,
    });
    expect(record.text.length).toBeLessThanOrEqual(300);
    expect(record.text.endsWith(longUrl)).toBe(true);
    expect(record.facets.length).toBe(1);
    const { byteStart, byteEnd } = record.facets[0].index;
    const extracted = Buffer.from(record.text, "utf-8").subarray(byteStart, byteEnd).toString("utf-8");
    expect(extracted).toBe(longUrl);
  });

  it("extracts high-discovery non-stopword tags for DEV.to and Qiita", () => {
    const tags = extractCleanTags(
      "open source GEO tool 2026 Profound Otterly alternative AI search",
      4
    );
    expect(tags).toHaveLength(4);
    expect(tags).not.toContain("open");
    expect(tags).not.toContain("tool");
    expect(tags).toContain("opensource");
    expect(tags).toContain("ai");
  });

  it("executes One-Click Global Auto-Blast with 20% bundle discount, proportional refund on failure, and proof report", async () => {
    const dbMod = await import("@/lib/db");
    const mkt = await import("@/lib/marketplace");

    process.env.ADMIN_EMAIL = "blast-owner@example.test";
    const { user: owner } = dbMod.provisionConfiguredOwner({
      email: process.env.ADMIN_EMAIL, password: "test-owner-password-long-enough",
      name: "Blast test owner", migrateDemoWorkspace: true,
    });
    mkt.adjustUserCredits({ userId: owner.id, delta: 100, reason: "Test wallet funding" });
    const startCredits = dbMod.findUserById(owner.id)!.creditsBalance;
    const articles = dbMod.listArticlesByUser(owner.id);
    const geoAcc = mkt.getPlatformAccountWithSecret("pac_geo_hub_official")!; // 10 credits, auto_api

    // Create a second auto_api channel with intentionally missing credential to verify proportional auto-refund
    const failingAccPub = mkt.createPlatformAccount({
      name: "Test Failing DEV.to Channel",
      platformType: "devto",
      deliveryMode: "auto_api",
      region: "US / EU",
      handleOrDomain: "dev.to/test",
      authorityBadge: "Test",
      description: "Test failure refund",
      creditCost: 25,
      endpointUrl: "https://dev.to/api/articles",
      credential: "",
    });
    const failingAcc = mkt.getPlatformAccountWithSecret(failingAccPub.id)!;

    const blast = await mkt.submitGlobalBlastOrder({
      userId: owner.id,
      article: articles[0],
      accounts: [geoAcc, failingAcc],
      baseUrl: "https://geo.workagentpro.com",
    });

    expect(blast.ok).toBe(true);
    if (blast.ok) {
      // Original: 10 + 25 = 35; 20% off per channel -> 8 + 20 = 28; failing channel refunds 20 -> net 8
      expect(blast.originalCost).toBe(35);
      expect(blast.discountPercent).toBe(20);
      expect(blast.totalRefunded).toBe(20);
      expect(blast.netCharged).toBe(8);
      expect(blast.balanceAfter).toBe(startCredits - 8);
      expect(blast.results.find((r) => r.accountId === geoAcc.id)?.status).toBe("published");
      expect(blast.results.find((r) => r.accountId === failingAcc.id)?.status).toBe("failed");
      expect(blast.proofMarkdown).toContain("# Global GEO Syndication Proof Report");
      expect(blast.proofMarkdown).toContain("https://geo.workagentpro.com/p/");
    }
  });
});
