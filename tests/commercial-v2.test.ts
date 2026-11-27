import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto-vault";
import { assertSafeExternalUrl } from "@/lib/ssrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractJsonLdTypes, parseRobotsForBot } from "@/lib/geo/site-auditor";
import { generateBuyerPromptCorpus, resolveEffectiveLlmConfig } from "@/lib/geo/generator";
import type { BrandProfile } from "@/types/geo";

const sampleBrand: BrandProfile = {
  id: "brd_v2",
  userId: "usr_v2",
  name: "极光智服",
  companyName: "深圳极光智能科技有限公司",
  productName: "极光 AI 客服工单系统",
  category: "中小企业 AI 客服 SaaS",
  oneLiner: "7x24 小时自动售后与工单分流的轻量化智能客服平台",
  targetAudience: "中小电商卖家与轻量 SaaS 团队",
  coreAdvantages: ["5 分钟接入微信与独立站", "自动识别 85% 重复售后问题"],
  proofPoints: ["平均人工客服成本降低 58%"],
  pricingInfo: "149 元/月起",
  competitors: ["网易七鱼", "智齿客服"],
  websiteUrl: "https://aurora.example.com",
  forbiddenWords: [],
  regionFocus: "CN",
  createdAt: "2026-11-26T00:00:00.000Z",
  updatedAt: "2026-11-26T00:00:00.000Z",
};

describe("Commercial Security Vault (AES-256-GCM)", () => {
  it("encrypts and decrypts API keys with unique random IVs", () => {
    const plain = "sk-live-secret-key-2026-abcdef";
    const c1 = encryptSecret(plain);
    const c2 = encryptSecret(plain);
    expect(c1.startsWith("enc:v1:")).toBe(true);
    expect(c1).not.toBe(c2);
    expect(decryptSecret(c1)).toBe(plain);
    expect(decryptSecret(c2)).toBe(plain);
    // Legacy plaintext fallback
    expect(decryptSecret("legacy-plain-key")).toBe("legacy-plain-key");
  });
});

describe("SSRF Guard & Rate Limiter", () => {
  it("blocks localhost, cloud metadata, and private IP ranges", () => {
    expect(() => assertSafeExternalUrl("http://127.0.0.1:3000/admin")).toThrow();
    expect(() => assertSafeExternalUrl("http://localhost:8080")).toThrow();
    expect(() => assertSafeExternalUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertSafeExternalUrl("http://192.168.1.10/")).toThrow();
    expect(() => assertSafeExternalUrl("http://10.0.0.5/")).toThrow();
    expect(() => assertSafeExternalUrl("file:///etc/passwd")).toThrow();

    const safe = assertSafeExternalUrl("https://example.com/blog");
    expect(safe.hostname).toBe("example.com");
  });

  it("enforces per-key request limits cleanly", () => {
    const key = `test-rl-${Date.now()}`;
    expect(checkRateLimit({ key, limit: 2, windowMs: 10_000 }).allowed).toBe(true);
    expect(checkRateLimit({ key, limit: 2, windowMs: 10_000 }).allowed).toBe(true);
    const third = checkRateLimit({ key, limit: 2, windowMs: 10_000 });
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});

describe("Scrunch-grade Site Auditor Parsers", () => {
  it("parses robots.txt directives for specific AI bots", () => {
    const robots = `
User-agent: GPTBot
Disallow: /

User-agent: PerplexityBot
Allow: /
`;
    expect(parseRobotsForBot(robots, "GPTBot").allowed).toBe(false);
    expect(parseRobotsForBot(robots, "PerplexityBot").allowed).toBe(true);
    expect(parseRobotsForBot(robots, "Google-Extended").allowed).toBe(true);
  });

  it("extracts Schema.org @graph types from HTML", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"Product"},{"@type":"FAQPage"}]}
    </script></head><body>Hello</body></html>`;
    const types = extractJsonLdTypes(html);
    expect(types).toContain("Organization");
    expect(types).toContain("Product");
    expect(types).toContain("FAQPage");
  });
});

describe("Buyer Prompt Corpus & Global LLM Pool", () => {
  it("generates 12 funnel-stage buyer prompts covering all 4 stages", () => {
    const corpus = generateBuyerPromptCorpus(sampleBrand);
    expect(corpus).toHaveLength(12);
    const stages = new Set(corpus.map((p) => p.funnelStage));
    expect(stages.size).toBe(4);
    expect(corpus.some((p) => p.prompt.includes("极光智服"))).toBe(true);
  });

  it("prioritizes BYOK key over global pool and degrades cleanly to none", () => {
    const byok = resolveEffectiveLlmConfig({
      llmProvider: "deepseek",
      llmBaseUrl: "",
      llmApiKey: "sk-user-key",
      llmModel: "deepseek-chat",
    });
    expect(byok.source).toBe("byok");
    expect(byok.baseUrl).toBe("https://api.deepseek.com/v1");

    const none = resolveEffectiveLlmConfig({
      llmProvider: "none",
      llmBaseUrl: "",
      llmApiKey: "",
      llmModel: "",
    });
    expect(none.source).toBe("none");
  });
});
