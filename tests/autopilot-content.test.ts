import { describe, expect, it } from "vitest";
import { buildVerifiedAutopilotContent } from "@/lib/autopilot-content";

const baseUrl = "https://geopulse.example";
const briefs = [
  { titleHint: "How to Verify AI Crawler Access: GPTBot, PerplexityBot & ClaudeBot", keyword: "free AI crawler audit tool GPTBot PerplexityBot llms.txt checker 2026" },
  { titleHint: "How to publish llms.txt for documentation", keyword: "llms.txt optional proposal" },
  { titleHint: "How to validate Organization JSON-LD", keyword: "structured data" },
  { titleHint: "How to Evaluate a White-Label GEO Workflow for Agency Clients", keyword: "white label GEO agency software 2026 open source AI SEO retainers" },
  { titleHint: "Official API Content Syndication for GEO: DEV.to vs GitHub Pages vs Bluesky vs WordPress", keyword: "canonical content syndication API GEO AI search authority 2026" },
  { titleHint: "How to Measure B2B SaaS Mentions in AI Search Results", keyword: "get B2B SaaS cited by ChatGPT Search Perplexity GEO guide 2026" },
] as const;

function build(index: number) {
  return buildVerifiedAutopilotContent({ ...briefs[index], language: "en" }, baseUrl);
}

describe("verified autopilot tutorials", () => {
  it("provides distinct substantive tutorials for each supported practical intent", () => {
    const outputs = briefs.map((_, index) => build(index));
    for (const output of outputs) {
      expect(output).not.toBeNull();
      if (!output) throw new Error("Missing supported tutorial");
      expect(output.markdown.split(/\s+/).length).toBeGreaterThanOrEqual(500);
      expect(output.markdown.split(/\s+/).length).toBeLessThanOrEqual(1400);
      expect(output.sourceUrls.length).toBeGreaterThanOrEqual(2);
      expect(output.faqs.length).toBeGreaterThanOrEqual(2);
      expect(output.markdown).toContain(`${baseUrl}/audit`);
      expect(output.markdown).not.toMatch(/TODO|TBD|REQUIRES_EDITORIAL_REVIEW|\[insert|\[citation needed\]/i);
      for (const source of output.sourceUrls) {
        expect(new URL(source).protocol).toBe("https:");
        expect(output.markdown).toContain(source);
      }
    }
    expect(new Set(outputs.map((output) => output?.key)).size).toBe(6);
    expect(new Set(outputs.map((output) => output?.title)).size).toBe(6);
    expect(new Set(outputs.map((output) => output?.markdown)).size).toBe(6);
  });

  it("keeps crawler identity, permissions and citation observations distinct", () => {
    const content = build(0)!;
    expect(content.key).toBe("crawler-permissions-evidence-v1");
    expect(content.markdown).toContain("A user-agent string can be copied");
    expect(content.markdown).toContain("robots.txt is public and is not an access control system");
    expect(content.sourceUrls).toContain("https://platform.openai.com/docs/bots");
  });

  it("describes llms.txt as a proposal and structured data as separate from display guarantees", () => {
    expect(build(1)!.capsule).toContain("optional proposal");
    expect(build(1)!.markdown).toContain("does not establish a standardized ranking signal");
    expect(build(2)!.markdown).toContain("does not guarantee display");
    expect(build(2)!.sourceUrls).toContain("https://schema.org/Organization");
  });

  it("explains report provenance and actual platform capability differences", () => {
    expect(build(3)!.markdown).toContain("These populations differ");
    expect(build(3)!.markdown).toContain("not an independent evaluation");
    expect(build(4)!.markdown).toContain("not equivalent to a canonical declaration");
    expect(build(4)!.markdown).toContain("originalArticleURL");
    expect(build(4)!.markdown).toContain("submission accepted, public page verified, and canonical verified");
  });

  it("requires observable citation evidence rather than equating a diagnostic score with results", () => {
    const content = build(5)!;
    expect(content.markdown).toContain("exact wording");
    expect(content.markdown).toContain("model identifiers");
    expect(content.markdown).toContain("date and timezone");
    expect(content.markdown).toContain("denominator");
    expect(content.markdown).toContain("A name mention and a citation are distinct labels");
  });

  it.each([
    { titleHint: "Self-Hosted GEO Stack vs Enterprise AI Visibility Tools: Total Cost of Ownership (2026)", keyword: "Profound Scrunch alternative pricing" },
    { titleHint: "How to acquire agency clients using crawler access", keyword: "customer acquisition" },
    { titleHint: "Guaranteed ranking results with llms.txt", keyword: "llms.txt" },
    { titleHint: "The best JSON-LD tool comparison", keyword: "schema" },
    { titleHint: "Robots.txt pricing and ROI", keyword: "crawler" },
    { titleHint: "A sourdough recipe", keyword: "bread" },
  ])("declines unsupported brief: $titleHint", (brief) => {
    expect(buildVerifiedAutopilotContent({ ...brief, language: "en" }, baseUrl)).toBeNull();
  });

  it("declines untranslated content and invalid publication origins", () => {
    expect(buildVerifiedAutopilotContent({ ...briefs[0], language: "zh" }, baseUrl)).toBeNull();
    for (const origin of ["invalid", "javascript:alert(1)", "ftp://example.com", "https://secret:password@example.com"]) {
      expect(buildVerifiedAutopilotContent({ ...briefs[0], language: "en" }, origin)).toBeNull();
    }
  });

  it("uses a fixed supported title and does not reflect arbitrary requested claims", () => {
    const first = buildVerifiedAutopilotContent({ titleHint: "How to inspect robots.txt", keyword: "crawler", language: "en" }, baseUrl)!;
    const second = buildVerifiedAutopilotContent({ titleHint: "Check GPTBot crawler access today", keyword: "crawler", language: "en" }, baseUrl)!;
    expect(first).toEqual(second);
    expect(first.title).not.toBe("How to inspect robots.txt");
  });

  it("returns independent values so callers cannot corrupt future publications", () => {
    const first = build(0)!;
    first.sourceUrls.length = 0;
    first.faqs[0].answer = "Changed by a caller";
    expect(build(0)!.sourceUrls.length).toBeGreaterThanOrEqual(2);
    expect(build(0)!.faqs[0].answer).not.toBe("Changed by a caller");
  });
});
