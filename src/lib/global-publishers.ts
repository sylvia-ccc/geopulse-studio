import crypto from "crypto";
import type { BrandProfile, GeoArticle } from "@/types/geo";
import { markdownToCleanHtml } from "./geo/generator";
import { assertSafeExternalUrl } from "./ssrf";

export interface GlobalPublishResult {
  ok: true;
  publishedUrl: string;
  message: string;
}

export interface GlobalPublishError {
  ok: false;
  error: string;
}

export type GlobalPublishOutcome = GlobalPublishResult | GlobalPublishError;

export function extractCleanTags(keyword: string, max = 4): string[] {
  const asciiWords = keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 2 && w.length <= 20);

  const defaults = ["ai", "geo", "saas", "seo"];
  const merged = Array.from(new Set([...asciiWords, ...defaults]));
  return merged.slice(0, max);
}

// ---------------- 1. Telegraph Official API (Zero-CAPTCHA Global Instant Mirror) ----------------

export interface TelegraphNode {
  tag: string;
  attrs?: Record<string, string>;
  children?: Array<string | TelegraphNode>;
}

export function markdownToTelegraphNodes(
  markdown: string,
  capsule: string,
  canonicalUrl: string
): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];

  if (capsule.trim()) {
    nodes.push({
      tag: "blockquote",
      children: [`Key Takeaway: ${capsule.trim()}`],
    });
  }

  const lines = markdown.split(/\r?\n/);
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    nodes.push({
      tag: "pre",
      children: [tableBuffer.join("\n")],
    });
    tableBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushTable();
      continue;
    }

    if (line.startsWith("|")) {
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    const cleanText = line
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");

    if (line.startsWith("### ")) {
      nodes.push({ tag: "h4", children: [cleanText.replace(/^###\s+/, "")] });
    } else if (line.startsWith("## ") || line.startsWith("# ")) {
      nodes.push({ tag: "h3", children: [cleanText.replace(/^#{1,2}\s+/, "")] });
    } else if (line.startsWith(">")) {
      const q = cleanText.replace(/^>\s*/, "").trim();
      if (q) nodes.push({ tag: "blockquote", children: [q] });
    } else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      nodes.push({ tag: "p", children: [`• ${cleanText.replace(/^([-*]|\d+\.)\s+/, "")}`] });
    } else {
      nodes.push({ tag: "p", children: [cleanText] });
    }
  }
  flushTable();

  nodes.push({ tag: "hr" });
  nodes.push({
    tag: "p",
    children: [
      "Canonical Source & Full Structured Schema (JSON-LD + /llms.txt): ",
      { tag: "a", attrs: { href: canonicalUrl }, children: [canonicalUrl] },
    ],
  });

  return nodes;
}

export async function publishToTelegraph(params: {
  article: GeoArticle;
  accessToken: string;
  authorName?: string;
  canonicalUrl: string;
  authorUrl: string;
}): Promise<GlobalPublishOutcome> {
  if (!params.accessToken.trim()) {
    return { ok: false, error: "Telegraph 通道尚未配置 access_token" };
  }

  const contentNodes = markdownToTelegraphNodes(
    params.article.markdownContent,
    params.article.directAnswerCapsule,
    params.canonicalUrl
  );

  const res = await fetch("https://api.telegra.ph/createPage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: params.accessToken.trim(),
      title: params.article.title.slice(0, 250),
      author_name: (params.authorName || "GeoPulse Research").slice(0, 120),
      author_url: params.authorUrl,
      content: contentNodes,
      return_content: false,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: { url?: string };
    error?: string;
  };
  if (!res.ok || !json.ok || !json.result?.url) {
    return {
      ok: false,
      error: `Telegraph API 异常: ${json.error || `HTTP ${res.status}`}`,
    };
  }

  return {
    ok: true,
    publishedUrl: json.result.url,
    message: "已通过 Telegraph 官方 API 全球秒级发布并附带 Canonical 原文溯源",
  };
}

// ---------------- 2. GitHub Pages Official Contents REST API (DA 96+ Global Hub) ----------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildGitHubPagesArticleHtml(params: {
  article: GeoArticle;
  brand: BrandProfile | null;
  canonicalUrl: string;
  hubUrl: string;
}): string {
  const { article, brand, canonicalUrl, hubUrl } = params;
  const bodyHtml = markdownToCleanHtml(article.markdownContent);
  const faqHtml = article.faqs
    .map(
      (f) =>
        `<div class="faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`
    )
    .join("\n");

  const safeJsonLd = (article.jsonLd || "").replace(/<\/script/gi, "<\\/script");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(article.title)} | GeoPulse Research</title>
  <meta name="description" content="${escapeHtml((article.summary || article.directAnswerCapsule).slice(0, 180))}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  ${safeJsonLd ? `<script type="application/ld+json">\n${safeJsonLd}\n</script>` : ""}
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px 64px; color: #0f172a; line-height: 1.75; background: #f8fafc; }
    article { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 36px; box-shadow: 0 6px 24px rgba(15,23,42,.04); }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; font-size: 12px; font-weight: 700; }
    .pill { background: #eef2ff; color: #3730a3; padding: 3px 10px; border-radius: 99px; }
    .score { background: #ecfdf5; color: #047857; padding: 3px 10px; border-radius: 99px; }
    h1 { margin: 8px 0 18px; font-size: 28px; line-height: 1.3; }
    .capsule { background: #eef2ff; border-left: 4px solid #4f46e5; border-radius: 10px; padding: 16px 18px; margin: 18px 0 24px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 9px 12px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .faq-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-top: 12px; background: #f8fafc; }
    .faq-item h3 { margin: 0 0 6px; font-size: 15px; }
    .faq-item p { margin: 0; font-size: 14px; color: #334155; }
    footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; }
    a { color: #4f46e5; }
  </style>
</head>
<body>
  <article>
    <div class="meta">
      <span class="pill">${escapeHtml(brand?.category || "Global GEO Research")}</span>
      <span class="score">GEO Score ${article.geoScore}/100</span>
    </div>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="capsule">
      <strong>Direct Answer Capsule:</strong> ${escapeHtml(article.directAnswerCapsule)}
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    ${faqHtml ? `<section><h2>Frequently Asked Questions</h2>${faqHtml}</section>` : ""}
    <footer>
      Canonical GEO Record: <a href="${escapeHtml(canonicalUrl)}">${escapeHtml(canonicalUrl)}</a> ·
      Syndication Index: <a href="${escapeHtml(hubUrl)}">GeoPulse Global GEO Hub</a>
    </footer>
  </article>
</body>
</html>`;
}

export async function publishToGitHubPages(params: {
  article: GeoArticle;
  brand: BrandProfile | null;
  repoSlugOrEndpoint: string;
  token: string;
  canonicalUrl: string;
}): Promise<GlobalPublishOutcome> {
  if (!params.token.trim()) {
    return { ok: false, error: "GitHub Pages 渠道尚未配置 Personal Access Token" };
  }

  // Accept either "owner/repo" or "https://api.github.com/repos/owner/repo"
  const raw = params.repoSlugOrEndpoint.trim().replace(/\/$/, "");
  const match = raw.match(/(?:github\.com\/repos\/|github\.com\/|^)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
  if (!match) {
    return {
      ok: false,
      error: "GitHub 仓库格式无效，请填写 owner/repo（例如 sylvia-ccc/geopulse-geo-hub）",
    };
  }
  const repoFull = match[1].replace(/\.git$/, "");
  const [owner, repo] = repoFull.split("/");
  const safeSlug = params.article.slug.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 90) || params.article.id;
  const filePath = `articles/${safeSlug}.html`;
  const hubUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
  const pageUrl = `${hubUrl}${filePath}`;

  const html = buildGitHubPagesArticleHtml({
    article: params.article,
    brand: params.brand,
    canonicalUrl: params.canonicalUrl,
    hubUrl,
  });

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${params.token.trim()}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "GeoPulse-Studio/4.1",
    "Content-Type": "application/json",
  };

  // Check if file already exists to get sha for idempotent upsert
  let existingSha: string | undefined;
  const checkRes = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10000) });
  if (checkRes.ok) {
    const existing = (await checkRes.json().catch(() => ({}))) as { sha?: string };
    existingSha = existing.sha;
  }

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `geo: publish ${safeSlug}`,
      content: Buffer.from(html, "utf-8").toString("base64"),
      ...(existingSha ? { sha: existingSha } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });

  const putJson = (await putRes.json().catch(() => ({}))) as { message?: string };
  if (!putRes.ok) {
    return {
      ok: false,
      error: `GitHub API HTTP ${putRes.status}: ${putJson.message || "提交失败"}`,
    };
  }

  return {
    ok: true,
    publishedUrl: pageUrl,
    message: `已通过 GitHub Official REST API 推送至 ${repoFull}，GitHub Pages 自动构建发布`,
  };
}

// ---------------- 3. Qiita Official REST API v2 (Japan High-WTP Tech Market, Free) ----------------

export async function publishToQiita(params: {
  article: GeoArticle;
  token: string;
  canonicalUrl: string;
}): Promise<GlobalPublishOutcome> {
  if (!params.token.trim()) {
    return { ok: false, error: "Qiita 渠道尚未配置 Personal Access Token" };
  }

  const tags = extractCleanTags(params.article.targetKeyword, 5).map((name) => ({ name }));
  const body = `> **Summary**: ${params.article.directAnswerCapsule}\n\n${params.article.markdownContent}\n\n---\nCanonical GEO Source: ${params.canonicalUrl}`;

  const res = await fetch("https://qiita.com/api/v2/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token.trim()}`,
    },
    body: JSON.stringify({
      title: params.article.title.slice(0, 250),
      body,
      private: false,
      tags,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !json.url) {
    return {
      ok: false,
      error: `Qiita API HTTP ${res.status}: ${json.message || "发布失败"}`,
    };
  }

  return {
    ok: true,
    publishedUrl: json.url,
    message: "已通过 Qiita 官方 REST API v2 自动发布至日本区高权重技术社区",
  };
}

// ---------------- 4. Bluesky ATProto Official API (US/EU Tech & AI Syndication, Free) ----------------

export function buildBlueskyPostPayload(params: {
  title: string;
  capsule: string;
  canonicalUrl: string;
}) {
  const headline = params.title.slice(0, 110).trim();
  const excerpt = params.capsule.slice(0, 110).trim();
  const urlText = params.canonicalUrl;
  const text = `${headline}\n\n${excerpt}...\n${urlText}`.slice(0, 298);

  const byteStart = Buffer.byteLength(text.slice(0, text.lastIndexOf(urlText)), "utf-8");
  const byteEnd = byteStart + Buffer.byteLength(urlText, "utf-8");

  return {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    facets:
      text.includes(urlText)
        ? [
            {
              index: { byteStart, byteEnd },
              features: [{ $type: "app.bsky.richtext.facet#link", uri: urlText }],
            },
          ]
        : [],
    embed: {
      $type: "app.bsky.embed.external",
      external: {
        uri: urlText,
        title: params.title.slice(0, 160),
        description: params.capsule.slice(0, 240),
      },
    },
  };
}

export async function publishToBluesky(params: {
  article: GeoArticle;
  identifierAndAppPassword: string;
  handleFallback?: string;
  canonicalUrl: string;
}): Promise<GlobalPublishOutcome> {
  // Credential format: "handle.bsky.social:xxxx-xxxx-xxxx-xxxx" OR just app password when handleOrDomain is set
  const rawCred = params.identifierAndAppPassword.trim();
  let identifier = (params.handleFallback || "").replace(/^@/, "").trim();
  let password = rawCred;

  if (rawCred.includes(":")) {
    const idx = rawCred.indexOf(":");
    identifier = rawCred.slice(0, idx).replace(/^@/, "").trim();
    password = rawCred.slice(idx + 1).trim();
  }

  if (!identifier || !password) {
    return {
      ok: false,
      error: "Bluesky 凭证格式请填写 handle.bsky.social:app-password",
    };
  }

  const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    signal: AbortSignal.timeout(12000),
  });
  const sessionJson = (await sessionRes.json().catch(() => ({}))) as {
    accessJwt?: string;
    did?: string;
    handle?: string;
    message?: string;
  };
  if (!sessionRes.ok || !sessionJson.accessJwt || !sessionJson.did) {
    return {
      ok: false,
      error: `Bluesky 鉴权失败 (HTTP ${sessionRes.status}): ${sessionJson.message || "请检查 App Password"}`,
    };
  }

  const record = buildBlueskyPostPayload({
    title: params.article.title,
    capsule: params.article.directAnswerCapsule,
    canonicalUrl: params.canonicalUrl,
  });

  const postRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionJson.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sessionJson.did,
      collection: "app.bsky.feed.post",
      record,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const postJson = (await postRes.json().catch(() => ({}))) as { uri?: string; message?: string };
  if (!postRes.ok || !postJson.uri) {
    return {
      ok: false,
      error: `Bluesky 发帖失败 (HTTP ${postRes.status}): ${postJson.message || "未知错误"}`,
    };
  }

  const rkey = postJson.uri.split("/").pop() || "";
  const handle = sessionJson.handle || identifier;
  const webUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;

  return {
    ok: true,
    publishedUrl: webUrl,
    message: "已通过 Bluesky ATProto 官方 API 发布带链接卡片的推广动态",
  };
}

// ---------------- 5. Hashnode Official GraphQL API (US/EU SaaS & Indie Makers) ----------------

export async function publishToHashnode(params: {
  article: GeoArticle;
  publicationIdOrEndpoint: string;
  token: string;
  canonicalUrl: string;
}): Promise<GlobalPublishOutcome> {
  if (!params.token.trim()) {
    return { ok: false, error: "Hashnode 渠道尚未配置 Personal Access Token" };
  }
  const publicationId = params.publicationIdOrEndpoint.trim();
  if (!publicationId) {
    return { ok: false, error: "请在 Endpoint/标识栏填入 Hashnode Publication ID" };
  }

  const query = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          url
        }
      }
    }
  `;

  const res = await fetch("https://gql.hashnode.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: params.token.trim(),
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          title: params.article.title,
          publicationId,
          contentMarkdown: `> ${params.article.directAnswerCapsule}\n\n${params.article.markdownContent}`,
          originalArticleURL: params.canonicalUrl,
          tags: extractCleanTags(params.article.targetKeyword, 4).map((slug) => ({
            slug,
            name: slug,
          })),
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: { publishPost?: { post?: { url?: string } } };
    errors?: Array<{ message?: string }>;
  };

  const url = json.data?.publishPost?.post?.url;
  if (!res.ok || !url) {
    return {
      ok: false,
      error: `Hashnode GraphQL 失败: ${json.errors?.[0]?.message || `HTTP ${res.status}`}`,
    };
  }

  return {
    ok: true,
    publishedUrl: url,
    message: "已通过 Hashnode 官方 GraphQL API 自动发布并设置 Canonical URL",
  };
}

// ---------------- 6. Ghost CMS Official Admin API (HS256 JWT, US/EU B2B Newsletters) ----------------

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildGhostAdminJwt(adminApiKey: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const parts = adminApiKey.trim().split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Ghost Admin API Key 格式应为 {id}:{hex_secret}");
  }
  const [id, secretHex] = parts;
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: nowSec,
      exp: nowSec + 300,
      aud: "/admin/",
    })
  );
  const signingInput = `${header}.${payload}`;
  const sig = crypto
    .createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export async function publishToGhost(params: {
  article: GeoArticle;
  siteUrl: string;
  adminApiKey: string;
  canonicalUrl: string;
}): Promise<GlobalPublishOutcome> {
  if (!params.siteUrl.trim() || !params.adminApiKey.trim()) {
    return { ok: false, error: "Ghost CMS 渠道需要站点地址与 Admin API Key (id:secret)" };
  }

  const safeBase = assertSafeExternalUrl(params.siteUrl.trim()).toString().replace(/\/$/, "");
  const endpoint = safeBase.includes("/ghost/api/admin/posts")
    ? `${safeBase}${safeBase.includes("?") ? "&" : "?"}source=html`
    : `${safeBase}/ghost/api/admin/posts/?source=html`;

  const jwt = buildGhostAdminJwt(params.adminApiKey);
  const html = `<blockquote><strong>Key Takeaway:</strong> ${escapeHtml(params.article.directAnswerCapsule)}</blockquote>${markdownToCleanHtml(params.article.markdownContent)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Ghost ${jwt}`,
    },
    body: JSON.stringify({
      posts: [
        {
          title: params.article.title,
          slug: params.article.slug,
          html,
          status: "published",
          canonical_url: params.canonicalUrl,
          custom_excerpt: (params.article.summary || params.article.directAnswerCapsule).slice(0, 290),
        },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await res.json().catch(() => ({}))) as {
    posts?: Array<{ url?: string }>;
    errors?: Array<{ message?: string }>;
  };
  const url = json.posts?.[0]?.url;
  if (!res.ok || !url) {
    return {
      ok: false,
      error: `Ghost Admin API 失败 (HTTP ${res.status}): ${json.errors?.[0]?.message || "发布失败"}`,
    };
  }

  return {
    ok: true,
    publishedUrl: url,
    message: "已通过 Ghost Official Admin API (JWT) 自动发布",
  };
}
