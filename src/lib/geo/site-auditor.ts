import { assertSafeExternalUrl } from "@/lib/ssrf";

export interface BotPermissionStatus {
  bot: string;
  engine: string;
  allowed: boolean;
  rule: string;
}

export interface SiteGeoAuditResult {
  targetUrl: string;
  origin: string;
  auditedAt: string;
  overallScore: number;
  grade: "S" | "A" | "B" | "C" | "D";
  httpStatus: number;
  ttfbMs: number;
  checks: {
    hasRobotsTxt: boolean;
    hasLlmsTxt: boolean;
    hasLlmsFullTxt: boolean;
    hasSitemapXml: boolean;
    hasTitle: boolean;
    hasMetaDescription: boolean;
    hasCanonical: boolean;
    hasJsonLd: boolean;
    jsonLdTypes: string[];
    isSsrRich: boolean;
    wordCount: number;
    h1Count: number;
    h2Count: number;
    tableCount: number;
  };
  botPermissions: BotPermissionStatus[];
  extractedMeta: {
    title: string;
    description: string;
    h1: string;
    llmsPreview: string;
  };
  recommendations: Array<{
    severity: "critical" | "warning" | "tip";
    title: string;
    detail: string;
    snippet?: string;
  }>;
}

const TARGET_BOTS: Array<{ bot: string; engine: string }> = [
  { bot: "GPTBot", engine: "ChatGPT / OpenAI" },
  { bot: "OAI-SearchBot", engine: "ChatGPT Search" },
  { bot: "PerplexityBot", engine: "Perplexity AI" },
  { bot: "ClaudeBot", engine: "Claude / Anthropic" },
  { bot: "Google-Extended", engine: "Google Gemini / AIO" },
  { bot: "Bytespider", engine: "豆包 / 字节生态" },
];

export function parseRobotsForBot(robotsTxt: string, botName: string): { allowed: boolean; rule: string } {
  if (!robotsTxt.trim()) {
    return { allowed: true, rule: "未配置 robots.txt（默认放行）" };
  }

  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  let currentAgents: string[] = [];
  const specificRules: Array<{ type: "allow" | "disallow"; path: string }> = [];
  const wildcardRules: Array<{ type: "allow" | "disallow"; path: string }> = [];

  for (const line of lines) {
    if (!line) {
      currentAgents = [];
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      currentAgents.push(val.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      const matchesBot = currentAgents.includes(botName.toLowerCase());
      const matchesWildcard = currentAgents.includes("*");
      if (matchesBot) specificRules.push({ type: key, path: val });
      else if (matchesWildcard) wildcardRules.push({ type: key, path: val });
    }
  }

  const activeRules = specificRules.length > 0 ? specificRules : wildcardRules;
  if (activeRules.length === 0) {
    return { allowed: true, rule: "未命中禁止规则（放行）" };
  }

  const blockedRoot = activeRules.some((r) => r.type === "disallow" && (r.path === "/" || r.path === "/*"));
  const allowedRoot = activeRules.some((r) => r.type === "allow" && (r.path === "/" || r.path === "/p/"));

  if (blockedRoot && !allowedRoot) {
    return {
      allowed: false,
      rule: specificRules.length > 0 ? `显式禁止 ${botName} (Disallow: /)` : "全局 Disallow: / 拦截",
    };
  }
  return {
    allowed: true,
    rule: specificRules.length > 0 ? `显式放行 ${botName}` : "通用规则放行",
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstMatch(html: string, regex: RegExp): string {
  const m = html.match(regex);
  return m && m[1] ? stripTags(m[1]).trim() : "";
}

export function extractJsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const collect = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(collect);
          return;
        }
        const obj = node as Record<string, unknown>;
        if (typeof obj["@type"] === "string") types.add(obj["@type"]);
        if (Array.isArray(obj["@type"])) {
          obj["@type"].forEach((t) => typeof t === "string" && types.add(t));
        }
        if (obj["@graph"]) collect(obj["@graph"]);
      };
      collect(parsed);
    } catch {
      // Ignore invalid json-ld blocks
    }
  }
  return Array.from(types);
}

async function safeFetchText(url: string, timeoutMs = 10000): Promise<{ ok: boolean; status: number; text: string; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GeoPulse-AuditBot/2.0 (+https://geopulse.studio)",
        Accept: "text/html,text/plain,application/xml,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: text.slice(0, 250_000), ms: Date.now() - start };
  } catch {
    return { ok: false, status: 0, text: "", ms: Date.now() - start };
  }
}

export async function runLiveSiteGeoAudit(rawUrl: string): Promise<SiteGeoAuditResult> {
  const parsed = assertSafeExternalUrl(rawUrl);
  const origin = parsed.origin;

  const [pageRes, robotsRes, llmsRes, llmsFullRes, sitemapRes] = await Promise.all([
    safeFetchText(parsed.toString(), 12000),
    safeFetchText(`${origin}/robots.txt`, 8000),
    safeFetchText(`${origin}/llms.txt`, 8000),
    safeFetchText(`${origin}/llms-full.txt`, 8000),
    safeFetchText(`${origin}/sitemap.xml`, 8000),
  ]);

  if (pageRes.status === 0) {
    throw new Error(`无法连接到目标站点 ${parsed.toString()}，请确认域名可公网访问`);
  }

  const html = pageRes.text;
  const title = extractFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    extractFirstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    extractFirstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);
  const h1 = extractFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
  const tableCount = (html.match(/<table[\s>]/gi) || []).length;
  const jsonLdTypes = extractJsonLdTypes(html);

  const plainText = stripTags(html);
  const wordCount = plainText.replace(/\s+/g, "").length;
  const isSsrRich = wordCount >= 220;

  const hasRobotsTxt = robotsRes.ok && robotsRes.text.trim().length > 10;
  const hasLlmsTxt =
    llmsRes.ok &&
    llmsRes.text.trim().length > 30 &&
    !llmsRes.text.trim().toLowerCase().startsWith("<!doctype html");
  const hasLlmsFullTxt =
    llmsFullRes.ok &&
    llmsFullRes.text.trim().length > 60 &&
    !llmsFullRes.text.trim().toLowerCase().startsWith("<!doctype html");
  const hasSitemapXml =
    sitemapRes.ok && /<(urlset|sitemapindex)\b/i.test(sitemapRes.text);

  const botPermissions: BotPermissionStatus[] = TARGET_BOTS.map(({ bot, engine }) => {
    const parsedBot = parseRobotsForBot(hasRobotsTxt ? robotsRes.text : "", bot);
    return {
      bot,
      engine,
      allowed: parsedBot.allowed,
      rule: parsedBot.rule,
    };
  });

  // Compute Technical GEO Readiness Score (0-100)
  let score = 0;
  const allowedBotsRatio = botPermissions.filter((b) => b.allowed).length / botPermissions.length;
  score += Math.round(allowedBotsRatio * 20);
  if (hasLlmsTxt) score += 18;
  if (hasLlmsFullTxt) score += 6;
  if (hasSitemapXml) score += 8;
  if (isSsrRich) score += 14;
  if (title.length >= 6) score += 6;
  if (description.length >= 20) score += 6;
  if (hasCanonical) score += 4;
  if (jsonLdTypes.length > 0) score += 10;
  if (jsonLdTypes.some((t) => ["FAQPage", "Product", "Organization", "Article"].includes(t))) {
    score += 5;
  }
  if (h2Count >= 2) score += 3;
  score = Math.max(0, Math.min(100, score));

  const grade: SiteGeoAuditResult["grade"] =
    score >= 88 ? "S" : score >= 75 ? "A" : score >= 60 ? "B" : score >= 45 ? "C" : "D";

  const recommendations: SiteGeoAuditResult["recommendations"] = [];

  const blockedBots = botPermissions.filter((b) => !b.allowed);
  if (blockedBots.length > 0) {
    recommendations.push({
      severity: "critical",
      title: `robots.txt 拦截了 ${blockedBots.length} 个主流 AI 爬虫（${blockedBots.map((b) => b.bot).join("、")}）`,
      detail: "AI 搜索引擎无法抓取您的页面内容，品牌几乎不可能在回答中被引用。",
      snippet: `User-agent: GPTBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: Bytespider\nAllow: /`,
    });
  }

  if (!hasLlmsTxt) {
    recommendations.push({
      severity: "critical",
      title: "站点根目录缺少 /llms.txt 标准索引文件",
      detail: "2026 年主流 AI 爬虫与智能体优先读取 /llms.txt 理解品牌核心定位、定价与高价值页面入口。",
      snippet: `# 您的品牌名\n> 一句话清晰描述产品定位、目标受众与核心优势。\n\n## 核心页面\n- [产品介绍](${origin}/): 核心能力与透明价格\n- [深度对比与FAQ](${origin}/hub): 结构化选型文档`,
    });
  }

  if (jsonLdTypes.length === 0) {
    recommendations.push({
      severity: "critical",
      title: "页面未检测到 Schema.org JSON-LD 结构化数据",
      detail: "建议挂载 Organization + Product + FAQPage JSON-LD，显著提升 Google AI Overviews 与 ChatGPT 实体识别准确率。",
    });
  }

  if (!isSsrRich) {
    recommendations.push({
      severity: "warning",
      title: `HTML 直出正文偏少（仅检测到 ${wordCount} 字符，疑似纯前端 SPA 渲染）`,
      detail: "部分 AI 爬虫不执行复杂客户端 JS，建议关键落地页与 GEO 专栏采用 SSR/SSG 服务端直出。",
    });
  }

  if (!hasSitemapXml) {
    recommendations.push({
      severity: "warning",
      title: "未发现有效的 /sitemap.xml 站点地图",
      detail: "配置动态 XML Sitemap 并在 robots.txt 中声明，可加快新发布 GEO 文章的收录速度。",
    });
  }

  if (!description || !hasCanonical) {
    recommendations.push({
      severity: "tip",
      title: "建议补全 Meta Description 与 Canonical 规范链接",
      detail: "清晰的元描述与规范链接可避免多渠道分发时 AI 混淆权威主源。",
    });
  }

  return {
    targetUrl: parsed.toString(),
    origin,
    auditedAt: new Date().toISOString(),
    overallScore: score,
    grade,
    httpStatus: pageRes.status,
    ttfbMs: pageRes.ms,
    checks: {
      hasRobotsTxt,
      hasLlmsTxt,
      hasLlmsFullTxt,
      hasSitemapXml,
      hasTitle: title.length > 0,
      hasMetaDescription: description.length > 0,
      hasCanonical,
      hasJsonLd: jsonLdTypes.length > 0,
      jsonLdTypes,
      isSsrRich,
      wordCount,
      h1Count,
      h2Count,
      tableCount,
    },
    botPermissions,
    extractedMeta: {
      title,
      description,
      h1,
      llmsPreview: hasLlmsTxt ? llmsRes.text.slice(0, 600) : "",
    },
    recommendations,
  };
}

export async function extractBrandDraftFromUrl(rawUrl: string): Promise<{
  name: string;
  companyName: string;
  productName: string;
  category: string;
  oneLiner: string;
  targetAudience: string;
  coreAdvantages: string[];
  proofPoints: string[];
  pricingInfo: string;
  websiteUrl: string;
  rawSummary: string;
}> {
  const parsed = assertSafeExternalUrl(rawUrl);
  const res = await safeFetchText(parsed.toString(), 12000);
  if (!res.ok && res.status === 0) {
    throw new Error(`无法读取网页 ${parsed.toString()}，请确认链接可访问`);
  }

  const html = res.text;
  const title = extractFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc =
    extractFirstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    extractFirstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogSiteName = extractFirstMatch(
    html,
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
  );
  const h1 = extractFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h2Matches = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((m) => stripTags(m[1]).trim())
    .filter((t) => t.length >= 4 && t.length <= 60)
    .slice(0, 5);

  const plainText = stripTags(html).slice(0, 4000);
  const priceMatch = plainText.match(
    /(?:¥|￥|\$|USD|CNY)?\s*\d+(?:\.\d+)?\s*(?:元|\/月|\/年|起|万|USD|per month)/i
  );
  const statMatches = Array.from(
    new Set(
      (
        plainText.match(
          /[^。！？\n]{4,35}(?:\d+(?:\.\d+)?%|\d+\+?\s*(?:家|万|小时|分钟|倍|客户|企业))[^。！？\n]{0,25}/g
        ) || []
      ).map((s) => s.trim())
    )
  ).slice(0, 3);

  const cleanBrandName =
    ogSiteName ||
    title.split(/[-—|_·:：]/)[0]?.trim() ||
    parsed.hostname.replace(/^www\./, "").split(".")[0] ||
    "未命名品牌";

  return {
    name: cleanBrandName.slice(0, 40),
    companyName: cleanBrandName.slice(0, 60),
    productName: (h1 || cleanBrandName).slice(0, 60),
    category: title.split(/[-—|_·]/)[1]?.trim().slice(0, 40) || "企业数字化产品 / 服务",
    oneLiner: (desc || h1 || title || `${cleanBrandName}核心产品解决方案`).slice(0, 220),
    targetAudience: "中小企业、成长型团队及个人专业用户",
    coreAdvantages:
      h2Matches.length > 0
        ? h2Matches.slice(0, 3)
        : ["聚焦核心业务场景，开箱即用", "透明定价与快速落地支持"],
    proofPoints: statMatches,
    pricingInfo: priceMatch ? priceMatch[0].trim() : "",
    websiteUrl: parsed.toString(),
    rawSummary: plainText.slice(0, 500),
  };
}
