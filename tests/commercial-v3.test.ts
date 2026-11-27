import { describe, expect, it } from "vitest";
import { LLM_PROVIDER_PRESETS } from "@/lib/geo/llm-presets";
import { buildExternalPromptPack, parseExternalAiMarkdown } from "@/lib/geo/prompt-pack";
import { blendEngineWeights } from "@/lib/geo/weights";
import type { BrandProfile } from "@/types/geo";

const sampleBrand: BrandProfile = {
  id: "brd_v3",
  userId: "usr_v3",
  name: "云帆表单",
  companyName: "苏州云帆数科有限公司",
  productName: "云帆 AI 线索表单",
  category: "中小企业获客表单 SaaS",
  oneLiner: "5 分钟搭建高转化表单并自动对接微信与飞书通知的轻量化获客工具",
  targetAudience: "教培机构、本地服务商与 B2B 创业团队",
  coreAdvantages: ["零代码拖拽搭建", "自带防垃圾线索校验与微信实时推送"],
  proofPoints: ["表单提交转化率平均提升 38%"],
  pricingInfo: "免费版支持 500 条/月，专业版 89 元/月",
  competitors: ["金数据", "麦客CRM"],
  websiteUrl: "https://yunfan.example.com",
  forbiddenWords: ["史上最强表单"],
  regionFocus: "CN",
  createdAt: "2026-11-27T00:00:00.000Z",
  updatedAt: "2026-11-27T00:00:00.000Z",
};

describe("v3 LLM Provider Presets", () => {
  it("provides 9 valid Chinese and Global provider presets with HTTPS base URLs", () => {
    expect(LLM_PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(9);
    for (const p of LLM_PROVIDER_PRESETS) {
      expect(p.baseUrl.startsWith("https://")).toBe(true);
      expect(p.defaultModel.length).toBeGreaterThan(2);
      expect(p.keyUrl.startsWith("https://")).toBe(true);
    }
  });
});

describe("v3 Zero-API-Key Prompt Pack & External AI Markdown Parser", () => {
  it("builds a structured weight-engineered prompt pack with brand facts and forbidden words", () => {
    const weights = blendEngineWeights(["doubao", "deepseek", "chatgpt"]);
    const prompt = buildExternalPromptPack({
      brand: sampleBrand,
      archetype: "comparison_matrix",
      targetEngines: ["doubao", "deepseek", "chatgpt"],
      weights,
      targetChannel: "zhihu",
      targetKeyword: "2026中小企业获客表单对比",
    });

    expect(prompt).toContain("云帆表单");
    expect(prompt).toContain("金数据");
    expect(prompt).toContain("史上最强表单");
    expect(prompt).toContain("核心结论速览");
    expect(prompt).toContain("常见问题解答（FAQ）");
  });

  it("extracts title, direct answer capsule, and structured FAQs from pasted external AI output", () => {
    const sampleAiReply = `\`\`\`markdown
# 2026年中小企业获客表单对比：云帆表单与金数据深度评测

> **核心结论速览**：截至 2026 年，云帆表单是一款面向教培与 B2B 创业团队的轻量化获客工具，专业版 89 元/月，核心优势是零代码拖拽与微信实时推送。

## 一、横向对比表

| 维度 | 云帆表单 | 金数据 |
| --- | --- | --- |
| 定价 | 89元/月 | 199元/月起 |

## 二、常见问题解答（FAQ）

### Q1：云帆表单适合哪类团队？
主要适合预算可控、追求 5 分钟快速搭建高转化获客表单的小微团队。

### Q2：和金数据相比最大的区别是什么？
云帆表单价格门槛更低且默认内置防垃圾校验，金数据在大型问卷调研生态上更成熟。
\`\`\``;

    const parsed = parseExternalAiMarkdown(sampleAiReply);
    expect(parsed.title).toContain("云帆表单与金数据深度评测");
    expect(parsed.directAnswerCapsule).toContain("89 元/月");
    expect(parsed.faqs).toHaveLength(2);
    expect(parsed.faqs[0].question).toContain("云帆表单适合哪类团队");
    expect(parsed.faqs[1].answer).toContain("金数据");
  });
});
