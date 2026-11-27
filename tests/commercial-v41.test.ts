import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildBlueskyPostPayload,
  buildGhostAdminJwt,
  buildGitHubPagesArticleHtml,
  extractCleanTags,
  markdownToTelegraphNodes,
} from "../src/lib/global-publishers";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-v41-test-"));
process.env.GEOPULSE_DB_PATH = path.join(tmpDir, "test-v41.db");

describe("GeoPulse Studio v4.1 Global Official-API Auto-Distribution Engine", () => {
  it("converts Markdown + direct capsule into valid Telegraph Node DOM with canonical link", () => {
    const nodes = markdownToTelegraphNodes(
      "## Comparison\n\n| Tool | Price |\n| --- | --- |\n| GeoPulse | $0 |\n\n- Fast SSR\n- Native JSON-LD",
      "GeoPulse Studio is an open-source GEO engine.",
      "https://geo.workagentpro.com/p/test-post"
    );
    expect(nodes.some((n) => n.tag === "blockquote")).toBe(true);
    expect(nodes.some((n) => n.tag === "h3")).toBe(true);
    expect(nodes.some((n) => n.tag === "pre")).toBe(true);
    expect(JSON.stringify(nodes)).toContain("https://geo.workagentpro.com/p/test-post");
  });

  it("signs a spec-compliant HS256 JWT for Ghost CMS Official Admin API", () => {
    const jwt = buildGhostAdminJwt(
      "65f01a2b3c4d5e6f7a8b9c0d:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      1700000000
    );
    const parts = jwt.split(".");
    expect(parts.length).toBe(3);
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    expect(header.alg).toBe("HS256");
    expect(header.kid).toBe("65f01a2b3c4d5e6f7a8b9c0d");
    expect(payload.aud).toBe("/admin/");
    expect(payload.exp - payload.iat).toBe(300);
  });

  it("builds byte-accurate Bluesky ATProto post record with external link card & facet", () => {
    const url = "https://geo.workagentpro.com/p/2026-best-open-source-geo-tools";
    const record = buildBlueskyPostPayload({
      title: "2026 开源 GEO 工具对比：GeoPulse vs Profound",
      capsule: "Compare GeoPulse Studio, Profound, and Otterly.ai with verifiable pricing.",
      canonicalUrl: url,
    });
    expect(record.$type).toBe("app.bsky.feed.post");
    expect(record.facets.length).toBe(1);
    const { byteStart, byteEnd } = record.facets[0].index;
    const sliced = Buffer.from(record.text, "utf-8").subarray(byteStart, byteEnd).toString("utf-8");
    expect(sliced).toBe(url);
    expect(record.embed.external.uri).toBe(url);
  });

  it("builds standalone GitHub Pages SSR HTML with canonical URL & JSON-LD", () => {
    const html = buildGitHubPagesArticleHtml({
      article: {
        id: "art_1",
        userId: "u1",
        brandId: "b1",
        title: "2026 GEO Tools Compared",
        slug: "2026-geo-tools",
        summary: "Summary text",
        archetype: "comparison_matrix",
        targetEngines: ["chatgpt"],
        customWeights: {
          directAnswer: 20,
          entityClarity: 15,
          structuredBlocks: 15,
          verifiableFacts: 15,
          faqCoverage: 10,
          neutralAuthority: 10,
          machineSchema: 10,
          channelFit: 5,
        },
        targetChannel: "geo_hub",
        targetKeyword: "open source geo tool 2026",
        directAnswerCapsule: "GeoPulse Studio is open source.",
        markdownContent: "## Overview\n\nStructured content.",
        faqs: [{ question: "Is it free?", answer: "Yes, MIT licensed." }],
        comparisonTable: null,
        jsonLd: '{"@context":"https://schema.org","@type":"Article"}',
        geoScore: 92,
        engineScores: { doubao: 90, deepseek: 91, chatgpt: 93, perplexity: 92, gemini: 92 },
        dimensionScores: {
          directAnswer: 90,
          entityClarity: 90,
          structuredBlocks: 90,
          verifiableFacts: 90,
          faqCoverage: 90,
          neutralAuthority: 90,
          machineSchema: 95,
          channelFit: 90,
        },
        status: "published",
        generationMode: "builtin",
        views: 0,
        publishedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      brand: null,
      canonicalUrl: "https://geo.workagentpro.com/p/2026-geo-tools",
      hubUrl: "https://sylvia-ccc.github.io/geopulse-geo-hub/",
    });
    expect(html).toContain('rel="canonical" href="https://geo.workagentpro.com/p/2026-geo-tools"');
    expect(html).toContain("application/ld+json");
    expect(html).toContain("GEO Score 92/100");
    expect(extractCleanTags("2026 Open Source GEO Tool!", 4)).toHaveLength(4);
  });

  it("seeds 5 bilingual official GeoPulse growth pack articles (3 ZH + 2 EN) all scoring >= 80", async () => {
    const { findUserByEmail } = await import("../src/lib/db");
    const { seedOfficialGeoGrowthPack } = await import("../src/lib/marketplace");

    const demo = findUserByEmail("demo@geopulse.ai")!;
    const pack = seedOfficialGeoGrowthPack(demo.id, "https://geo.workagentpro.com");
    expect(pack.articles.length).toBe(5);
    expect(
      pack.articles.some((a) => a.slug === "2026-best-open-source-geo-tools-profound-otterly-alternative")
    ).toBe(true);
    expect(
      pack.articles.some((a) => a.slug === "llms-txt-json-ld-ai-search-visibility-checklist-2026")
    ).toBe(true);
    for (const a of pack.articles) {
      expect(a.geoScore).toBeGreaterThanOrEqual(85);
    }
  });
});
