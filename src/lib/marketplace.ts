import type {
  BrandProfile,
  CreditTransaction,
  DistributionOrder,
  GeoArticle,
  PlatformAccount,
  PlatformAccountType,
} from "@/types/geo";
import {
  createArticle,
  createBrand,
  createPublishLog,
  findUserById,
  getBrandById,
  getDb,
  newId,
  updateArticle,
} from "./db";
import { decryptSecret, encryptSecret } from "./crypto-vault";
import { assertSafeExternalUrl } from "./ssrf";
import { buildGeoJsonLd } from "./geo/schema";
import { auditGeoContent } from "./geo/scorer";
import { blendEngineWeights } from "./geo/weights";
import { markdownToCleanHtml } from "./geo/generator";
import {
  extractCleanTags,
  publishToBluesky,
  publishToGhost,
  publishToGitHubPages,
  publishToHashnode,
  publishToQiita,
  publishToTelegraph,
} from "./global-publishers";

export interface PlatformAccountWithSecret extends PlatformAccount {
  credential: string;
}

function mapPlatformAccount(row: Record<string, unknown>): PlatformAccountWithSecret {
  const decrypted = decryptSecret(String(row.credential_enc || ""));
  return {
    id: String(row.id),
    name: String(row.name),
    platformType: String(row.platform_type) as PlatformAccountType,
    deliveryMode: String(row.delivery_mode) as PlatformAccount["deliveryMode"],
    region: String(row.region || "Global"),
    handleOrDomain: String(row.handle_or_domain || ""),
    authorityBadge: String(row.authority_badge || ""),
    description: String(row.description || ""),
    creditCost: Number(row.credit_cost || 0),
    endpointUrl: String(row.endpoint_url || ""),
    authHeader: String(row.auth_header || ""),
    credential: decrypted,
    hasCredential: Boolean(decrypted),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    createdAt: String(row.created_at),
  };
}

export function sanitizePlatformAccount(acc: PlatformAccountWithSecret): PlatformAccount {
  const { credential: _secret, ...pub } = acc;
  void _secret;
  return pub;
}

function mapOrder(row: Record<string, unknown>): DistributionOrder {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userEmail: row.user_email ? String(row.user_email) : undefined,
    userName: row.user_name ? String(row.user_name) : undefined,
    articleId: String(row.article_id),
    articleTitle: row.article_title ? String(row.article_title) : undefined,
    articleSlug: row.article_slug ? String(row.article_slug) : undefined,
    articleGeoScore: row.article_geo_score != null ? Number(row.article_geo_score) : undefined,
    platformAccountId: String(row.platform_account_id),
    platformName: String(row.platform_name),
    platformType: String(row.platform_type) as PlatformAccountType,
    deliveryMode: String(row.delivery_mode) as DistributionOrder["deliveryMode"],
    creditsCharged: Number(row.credits_charged || 0),
    status: String(row.status) as DistributionOrder["status"],
    publishedUrl: String(row.published_url || ""),
    customerNote: String(row.customer_note || ""),
    adminNote: String(row.admin_note || ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTransaction(row: Record<string, unknown>): CreditTransaction {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    delta: Number(row.delta || 0),
    balanceAfter: Number(row.balance_after || 0),
    reason: String(row.reason || ""),
    refId: String(row.ref_id || ""),
    createdAt: String(row.created_at),
  };
}

// ---------------- Credits Wallet ----------------

export function adjustUserCredits(params: {
  userId: string;
  delta: number;
  reason: string;
  refId?: string;
}): { ok: true; balanceAfter: number; tx: CreditTransaction } | { ok: false; error: string } {
  const user = findUserById(params.userId);
  if (!user) return { ok: false, error: "用户不存在" };

  const current = user.creditsBalance ?? 0;
  const next = current + params.delta;
  if (next < 0) {
    return {
      ok: false,
      error: `发布积分不足（当前余额 ${current} 积分，需要 ${Math.abs(params.delta)} 积分），请先兑换积分充值卡密`,
    };
  }

  const now = new Date().toISOString();
  const txId = newId("ctx");
  const db = getDb();
  db.prepare("UPDATE users SET credits_balance = ? WHERE id = ?").run(next, params.userId);
  db.prepare(
    `INSERT INTO credit_transactions (id, user_id, delta, balance_after, reason, ref_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(txId, params.userId, params.delta, next, params.reason, params.refId || "", now);

  const row = db.prepare("SELECT * FROM credit_transactions WHERE id = ?").get(txId)!;
  return { ok: true, balanceAfter: next, tx: mapTransaction(row) };
}

export function listCreditTransactions(userId: string, limit = 30): CreditTransaction[] {
  const rows = getDb()
    .prepare("SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit);
  return rows.map(mapTransaction);
}

// ---------------- Platform Account Pool ----------------

export function listPlatformAccounts(includeDisabled = false): PlatformAccount[] {
  const sql = includeDisabled
    ? "SELECT * FROM platform_accounts ORDER BY sort_order ASC, created_at DESC"
    : "SELECT * FROM platform_accounts WHERE enabled = 1 ORDER BY sort_order ASC, created_at DESC";
  const rows = getDb().prepare(sql).all();
  return rows.map((r) => sanitizePlatformAccount(mapPlatformAccount(r)));
}

export function getPlatformAccountWithSecret(id: string): PlatformAccountWithSecret | null {
  const row = getDb().prepare("SELECT * FROM platform_accounts WHERE id = ?").get(id);
  return row ? mapPlatformAccount(row) : null;
}

export function createPlatformAccount(data: {
  name: string;
  platformType: PlatformAccountType;
  deliveryMode: "auto_api" | "managed_review";
  region?: string;
  handleOrDomain: string;
  authorityBadge: string;
  description: string;
  creditCost: number;
  endpointUrl?: string;
  authHeader?: string;
  credential?: string;
  enabled?: boolean;
}): PlatformAccount {
  const id = newId("pac");
  const now = new Date().toISOString();
  const enc = data.credential?.trim() ? encryptSecret(data.credential.trim()) : "";
  const defaultRegion =
    data.region?.trim() || (data.deliveryMode === "auto_api" ? "Global" : "CN (Optional)");
  const sortOrder = data.deliveryMode === "auto_api" ? 5 : 60;

  getDb()
    .prepare(
      `INSERT INTO platform_accounts (
        id, name, platform_type, delivery_mode, region, handle_or_domain, authority_badge,
        description, credit_cost, endpoint_url, auth_header, credential_enc, enabled, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.name.trim(),
      data.platformType,
      data.deliveryMode,
      defaultRegion,
      data.handleOrDomain.trim(),
      data.authorityBadge.trim(),
      data.description.trim(),
      Math.max(0, Math.round(data.creditCost)),
      (data.endpointUrl || "").trim(),
      (data.authHeader || "").trim(),
      enc,
      data.enabled === false ? 0 : 1,
      sortOrder,
      now
    );

  return sanitizePlatformAccount(getPlatformAccountWithSecret(id)!);
}

export function updatePlatformAccount(
  id: string,
  updates: Partial<{
    name: string;
    region: string;
    handleOrDomain: string;
    authorityBadge: string;
    description: string;
    creditCost: number;
    endpointUrl: string;
    authHeader: string;
    credential: string;
    enabled: boolean;
  }>
): PlatformAccount | null {
  const current = getPlatformAccountWithSecret(id);
  if (!current) return null;

  const nextCred =
    updates.credential !== undefined ? updates.credential.trim() : current.credential;
  const enc = nextCred ? encryptSecret(nextCred) : "";

  getDb()
    .prepare(
      `UPDATE platform_accounts SET
        name = ?, region = ?, handle_or_domain = ?, authority_badge = ?, description = ?,
        credit_cost = ?, endpoint_url = ?, auth_header = ?, credential_enc = ?, enabled = ?
       WHERE id = ?`
    )
    .run(
      updates.name ?? current.name,
      updates.region ?? current.region,
      updates.handleOrDomain ?? current.handleOrDomain,
      updates.authorityBadge ?? current.authorityBadge,
      updates.description ?? current.description,
      updates.creditCost !== undefined ? Math.max(0, Math.round(updates.creditCost)) : current.creditCost,
      updates.endpointUrl ?? current.endpointUrl,
      updates.authHeader ?? current.authHeader,
      enc,
      updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : current.enabled ? 1 : 0,
      id
    );

  return sanitizePlatformAccount(getPlatformAccountWithSecret(id)!);
}

export function deletePlatformAccount(id: string): boolean {
  const res = getDb().prepare("DELETE FROM platform_accounts WHERE id = ?").run(id);
  return res.changes > 0;
}

// ---------------- Distribution Orders ----------------

export function getDistributionOrderById(id: string): DistributionOrder | null {
  const row = getDb()
    .prepare(
      `SELECT o.*, a.title AS article_title, a.slug AS article_slug, a.geo_score AS article_geo_score,
              u.email AS user_email, u.name AS user_name
       FROM distribution_orders o
       LEFT JOIN articles a ON a.id = o.article_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`
    )
    .get(id);
  return row ? mapOrder(row) : null;
}

export function listDistributionOrdersByUser(userId: string): DistributionOrder[] {
  const rows = getDb()
    .prepare(
      `SELECT o.*, a.title AS article_title, a.slug AS article_slug, a.geo_score AS article_geo_score
       FROM distribution_orders o
       LEFT JOIN articles a ON a.id = o.article_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 60`
    )
    .all(userId);
  return rows.map(mapOrder);
}

export function listAllDistributionOrdersForAdmin(): DistributionOrder[] {
  const rows = getDb()
    .prepare(
      `SELECT o.*, a.title AS article_title, a.slug AS article_slug, a.geo_score AS article_geo_score,
              u.email AS user_email, u.name AS user_name
       FROM distribution_orders o
       LEFT JOIN articles a ON a.id = o.article_id
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY CASE WHEN o.status = 'pending_review' THEN 0 ELSE 1 END, o.created_at DESC
       LIMIT 100`
    )
    .all();
  return rows.map(mapOrder);
}

export async function submitDistributionOrder(params: {
  userId: string;
  article: GeoArticle;
  account: PlatformAccountWithSecret;
  customerNote?: string;
  baseUrl: string;
}): Promise<
  | { ok: true; order: DistributionOrder; balanceAfter: number }
  | { ok: false; error: string }
> {
  const orderId = newId("ord");
  const now = new Date().toISOString();

  // 1. Charge credits atomically
  const charge = adjustUserCredits({
    userId: params.userId,
    delta: -params.account.creditCost,
    reason: `托管代发：${params.account.name}（${params.article.title.slice(0, 24)}）`,
    refId: orderId,
  });
  if (!charge.ok) {
    return { ok: false, error: charge.error };
  }

  getDb()
    .prepare(
      `INSERT INTO distribution_orders (
        id, user_id, article_id, platform_account_id, platform_name, platform_type,
        delivery_mode, credits_charged, status, published_url, customer_note, admin_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', '', ?, '', ?, ?)`
    )
    .run(
      orderId,
      params.userId,
      params.article.id,
      params.account.id,
      params.account.name,
      params.account.platformType,
      params.account.deliveryMode,
      params.account.creditCost,
      (params.customerNote || "").trim(),
      now,
      now
    );

  // 2. If auto_api, dispatch immediately!
  if (params.account.deliveryMode === "auto_api") {
    const brand = getBrandById(params.article.brandId);
    const dispatch = await dispatchAutoApiOrder({
      article: params.article,
      brand,
      account: params.account,
      baseUrl: params.baseUrl,
    });

    if (dispatch.ok) {
      getDb()
        .prepare(
          `UPDATE distribution_orders SET status = 'published', published_url = ?, admin_note = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(dispatch.publishedUrl, dispatch.message, new Date().toISOString(), orderId);

      createPublishLog(params.userId, {
        articleId: params.article.id,
        channelType: params.account.platformType,
        channelName: params.account.name,
        status: "success",
        httpStatus: 200,
        externalUrl: dispatch.publishedUrl,
        message: dispatch.message,
      });

      return {
        ok: true,
        order: getDistributionOrderById(orderId)!,
        balanceAfter: charge.balanceAfter,
      };
    }

    // Auto dispatch failed -> refund credits automatically so customer never loses money!
    const refund = adjustUserCredits({
      userId: params.userId,
      delta: params.account.creditCost,
      reason: `自动发布失败自动退款：${params.account.name}`,
      refId: orderId,
    });
    getDb()
      .prepare(
        `UPDATE distribution_orders SET status = 'failed', admin_note = ?, updated_at = ? WHERE id = ?`
      )
      .run(dispatch.error, new Date().toISOString(), orderId);

    return {
      ok: false,
      error: `自动发布通道返回异常（已自动全额退还 ${params.account.creditCost} 积分）：${dispatch.error}${refund.ok ? "" : ""}`,
    };
  }

  return {
    ok: true,
    order: getDistributionOrderById(orderId)!,
    balanceAfter: charge.balanceAfter,
  };
}

export interface GlobalBlastChannelResult {
  orderId: string;
  accountId: string;
  platformName: string;
  platformType: PlatformAccountType;
  region: string;
  status: "published" | "failed";
  publishedUrl: string;
  message: string;
  creditsNet: number;
}

export async function submitGlobalBlastOrder(params: {
  userId: string;
  article: GeoArticle;
  accounts: PlatformAccountWithSecret[];
  customerNote?: string;
  baseUrl: string;
}): Promise<
  | {
      ok: true;
      originalCost: number;
      discountPercent: number;
      netCharged: number;
      totalRefunded: number;
      balanceAfter: number;
      results: GlobalBlastChannelResult[];
      proofMarkdown: string;
    }
  | { ok: false; error: string }
> {
  const autoAccounts = params.accounts.filter((a) => a.enabled && a.deliveryMode === "auto_api");
  if (autoAccounts.length === 0) {
    return { ok: false, error: "请至少选择 1 个已上架的官方 API 自动直发渠道" };
  }

  const originalCost = autoAccounts.reduce((acc, a) => acc + a.creditCost, 0);
  const discountFactor = autoAccounts.length >= 2 ? 0.8 : 1;
  const discountPercent = autoAccounts.length >= 2 ? 20 : 0;

  // Compute discounted cost per channel so failed channels get exact proportional refunds
  const perChannelCost = autoAccounts.map((a) => Math.max(0, Math.round(a.creditCost * discountFactor)));
  const totalBundleCost = perChannelCost.reduce((sum, c) => sum + c, 0);
  const blastId = newId("blst");

  const charge = adjustUserCredits({
    userId: params.userId,
    delta: -totalBundleCost,
    reason: `一键全网联发包（${autoAccounts.length} 平台${discountPercent ? ` · ${discountPercent}% 折扣` : ""}）：${params.article.title.slice(0, 20)}`,
    refId: blastId,
  });
  if (!charge.ok) {
    return { ok: false, error: charge.error };
  }

  const brand = getBrandById(params.article.brandId);
  const now = new Date().toISOString();
  let totalRefunded = 0;
  let latestBalance = charge.balanceAfter;

  const settled = await Promise.all(
    autoAccounts.map(async (account, idx): Promise<GlobalBlastChannelResult> => {
      const orderId = newId("ord");
      const channelFee = perChannelCost[idx];

      getDb()
        .prepare(
          `INSERT INTO distribution_orders (
            id, user_id, article_id, platform_account_id, platform_name, platform_type,
            delivery_mode, credits_charged, status, published_url, customer_note, admin_note, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'auto_api', ?, 'pending_review', '', ?, '', ?, ?)`
        )
        .run(
          orderId,
          params.userId,
          params.article.id,
          account.id,
          account.name,
          account.platformType,
          channelFee,
          (params.customerNote || `Global Auto-Blast ${blastId}`).trim(),
          now,
          now
        );

      const dispatch = await dispatchAutoApiOrder({
        article: params.article,
        brand,
        account,
        baseUrl: params.baseUrl,
      });

      if (dispatch.ok) {
        getDb()
          .prepare(
            `UPDATE distribution_orders SET status = 'published', published_url = ?, admin_note = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(dispatch.publishedUrl, dispatch.message, new Date().toISOString(), orderId);

        createPublishLog(params.userId, {
          articleId: params.article.id,
          channelType: account.platformType,
          channelName: account.name,
          status: "success",
          httpStatus: 200,
          externalUrl: dispatch.publishedUrl,
          message: dispatch.message,
        });

        return {
          orderId,
          accountId: account.id,
          platformName: account.name,
          platformType: account.platformType,
          region: account.region || "Global",
          status: "published",
          publishedUrl: dispatch.publishedUrl,
          message: dispatch.message,
          creditsNet: channelFee,
        };
      }

      if (channelFee > 0) {
        const refund = adjustUserCredits({
          userId: params.userId,
          delta: channelFee,
          reason: `联发包单渠道失败自动退款：${account.name}`,
          refId: orderId,
        });
        if (refund.ok) {
          totalRefunded += channelFee;
          latestBalance = refund.balanceAfter;
        }
      }

      getDb()
        .prepare(
          `UPDATE distribution_orders SET status = 'failed', admin_note = ?, updated_at = ? WHERE id = ?`
        )
        .run(dispatch.error, new Date().toISOString(), orderId);

      return {
        orderId,
        accountId: account.id,
        platformName: account.name,
        platformType: account.platformType,
        region: account.region || "Global",
        status: "failed",
        publishedUrl: "",
        message: dispatch.error,
        creditsNet: 0,
      };
    })
  );

  const succeeded = settled.filter((r) => r.status === "published");
  const proofLines = [
    `# Global GEO Syndication Proof Report`,
    `- **Article**: ${params.article.title}`,
    `- **GEO Readiness Score**: ${params.article.geoScore}/100`,
    `- **Canonical URL**: ${params.baseUrl.replace(/\/$/, "")}/p/${params.article.slug}`,
    `- **Published Channels**: ${succeeded.length}/${settled.length} succeeded`,
    `- **Generated At**: ${new Date().toISOString()}`,
    ``,
    `| Platform | Region | Status | Live URL |`,
    `| :--- | :--- | :--- | :--- |`,
    ...settled.map(
      (r) =>
        `| ${r.platformName} | ${r.region} | ${r.status === "published" ? "✅ Live" : "❌ Failed (Refunded)"} | ${r.publishedUrl || r.message} |`
    ),
  ];

  return {
    ok: true,
    originalCost,
    discountPercent,
    netCharged: Math.max(0, totalBundleCost - totalRefunded),
    totalRefunded,
    balanceAfter: latestBalance,
    results: settled,
    proofMarkdown: proofLines.join("\n"),
  };
}

export async function dispatchAutoApiOrder(params: {
  article: GeoArticle;
  brand: BrandProfile | null;
  account: PlatformAccountWithSecret;
  baseUrl: string;
}): Promise<{ ok: true; publishedUrl: string; message: string } | { ok: false; error: string }> {
  const { article, brand, account, baseUrl } = params;
  const cleanBase = baseUrl.replace(/\/$/, "");

  if (account.platformType === "geo_network") {
    const freshJsonLd = buildGeoJsonLd({
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      directAnswerCapsule: article.directAnswerCapsule,
      targetKeyword: article.targetKeyword,
      faqs: article.faqs,
      publishedAt: article.publishedAt || new Date().toISOString(),
      brand,
      baseUrl: cleanBase,
    });
    updateArticle(article.id, article.userId, {
      status: "published",
      jsonLd: freshJsonLd,
    });
    const url = `${cleanBase}/p/${article.slug}`;
    return {
      ok: true,
      publishedUrl: url,
      message: "已自动上线至 GeoPulse 官方高权重 GEO 专栏，并实时同步 /llms.txt 与 /sitemap.xml",
    };
  }

  const canonicalUrl = `${cleanBase}/p/${article.slug}`;

  try {
    // Global Official Auto-API channels with fixed official endpoints
    if (account.platformType === "telegraph") {
      return await publishToTelegraph({
        article,
        accessToken: account.credential,
        authorName: account.handleOrDomain || "GeoPulse Research",
        canonicalUrl,
        authorUrl: cleanBase,
      });
    }

    if (account.platformType === "github_pages") {
      return await publishToGitHubPages({
        article,
        brand,
        repoSlugOrEndpoint: account.endpointUrl || account.handleOrDomain,
        token: account.credential,
        canonicalUrl,
      });
    }

    if (account.platformType === "qiita") {
      return await publishToQiita({
        article,
        token: account.credential,
        canonicalUrl,
      });
    }

    if (account.platformType === "bluesky") {
      return await publishToBluesky({
        article,
        identifierAndAppPassword: account.credential,
        handleFallback: account.handleOrDomain,
        canonicalUrl,
      });
    }

    if (account.platformType === "hashnode") {
      return await publishToHashnode({
        article,
        publicationIdOrEndpoint: account.endpointUrl || account.handleOrDomain,
        token: account.credential,
        canonicalUrl,
      });
    }

    if (account.platformType === "ghost") {
      return await publishToGhost({
        article,
        siteUrl: account.endpointUrl,
        adminApiKey: account.credential,
        canonicalUrl,
      });
    }

    if (account.platformType === "devto") {
      if (!account.credential) {
        return { ok: false, error: "DEV.to 渠道尚未配置 api-key" };
      }
      const targetEndpoint = account.endpointUrl.trim() || "https://dev.to/api/articles";
      const safeUrl = assertSafeExternalUrl(targetEndpoint);
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": account.credential,
        },
        body: JSON.stringify({
          article: {
            title: article.title,
            published: true,
            body_markdown: `> ${article.directAnswerCapsule}\n\n${article.markdownContent}`,
            canonical_url: canonicalUrl,
            tags: extractCleanTags(article.targetKeyword, 4),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        return { ok: false, error: `DEV.to HTTP ${res.status}: ${json.error || "发布失败"}` };
      }
      return {
        ok: true,
        publishedUrl: json.url || safeUrl.toString(),
        message: "已通过 DEV.to 官方 REST API 自动发布（含 Canonical URL）",
      };
    }

    if (!account.endpointUrl) {
      return { ok: false, error: "该自动渠道尚未配置 API 接收地址，请联系管理员完善配置" };
    }

    const safeUrl = assertSafeExternalUrl(account.endpointUrl);

    if (account.platformType === "wordpress") {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (account.credential) {
        headers[account.authHeader || "Authorization"] = account.credential.startsWith("Basic ") ||
          account.credential.startsWith("Bearer ")
          ? account.credential
          : `Basic ${Buffer.from(account.credential).toString("base64")}`;
      }
      const res = await fetch(safeUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: article.title,
          slug: article.slug,
          status: "publish",
          excerpt: article.summary || article.directAnswerCapsule,
          content: markdownToCleanHtml(article.markdownContent),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json().catch(() => ({}))) as { link?: string; message?: string };
      if (!res.ok) {
        return { ok: false, error: `WordPress HTTP ${res.status}: ${json.message || "发布失败"}` };
      }
      return {
        ok: true,
        publishedUrl: json.link || safeUrl.toString(),
        message: "已通过 WordPress REST API 自动发布",
      };
    }

    // Generic managed webhook
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "GeoPulse-Distribution/4.0",
    };
    if (account.credential) {
      headers[account.authHeader || "Authorization"] = account.credential.startsWith("Bearer ")
        ? account.credential
        : `Bearer ${account.credential}`;
    }
    const res = await fetch(safeUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "geopulse.managed.publish",
        canonicalUrl: `${cleanBase}/p/${article.slug}`,
        article: {
          title: article.title,
          slug: article.slug,
          directAnswerCapsule: article.directAnswerCapsule,
          markdownContent: article.markdownContent,
          faqs: article.faqs,
          jsonLd: article.jsonLd,
          geoScore: article.geoScore,
        },
        brand: brand ? { name: brand.name, category: brand.category } : null,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, error: `Webhook HTTP ${res.status}: ${text.slice(0, 120)}` };
    }
    let returnedUrl = safeUrl.toString();
    try {
      const parsed = JSON.parse(text) as { url?: string };
      if (parsed.url) returnedUrl = parsed.url;
    } catch {
      // non-JSON ok response
    }
    return {
      ok: true,
      publishedUrl: returnedUrl,
      message: `已通过平台 Webhook 自动推送成功（HTTP ${res.status}）`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "网络请求失败",
    };
  }
}

export function fulfillDistributionOrder(params: {
  orderId: string;
  publishedUrl: string;
  adminNote?: string;
}): DistributionOrder | null {
  const existing = getDistributionOrderById(params.orderId);
  if (!existing) return null;

  getDb()
    .prepare(
      `UPDATE distribution_orders SET status = 'published', published_url = ?, admin_note = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      params.publishedUrl.trim(),
      (params.adminNote || "已由平台矩阵号审核发布完成").trim(),
      new Date().toISOString(),
      params.orderId
    );

  createPublishLog(existing.userId, {
    articleId: existing.articleId,
    channelType: existing.platformType,
    channelName: existing.platformName,
    status: "success",
    httpStatus: 200,
    externalUrl: params.publishedUrl.trim(),
    message: params.adminNote || "平台托管代发已完成并回传外链",
  });

  return getDistributionOrderById(params.orderId);
}

export function rejectDistributionOrderAndRefund(params: {
  orderId: string;
  adminNote?: string;
}): DistributionOrder | null {
  const existing = getDistributionOrderById(params.orderId);
  if (!existing || existing.status !== "pending_review") return null;

  if (existing.creditsCharged > 0) {
    adjustUserCredits({
      userId: existing.userId,
      delta: existing.creditsCharged,
      reason: `代发工单驳回全额退款：${existing.platformName}`,
      refId: existing.id,
    });
  }

  getDb()
    .prepare(
      `UPDATE distribution_orders SET status = 'rejected', admin_note = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      (params.adminNote || "内容暂不符合目标平台收录规范，积分已全额原路退回").trim(),
      new Date().toISOString(),
      params.orderId
    );

  return getDistributionOrderById(params.orderId);
}

// ---------------- Official GeoPulse Self-Promotion GEO Growth Pack ----------------

export function seedOfficialGeoGrowthPack(adminUserId: string, baseUrl: string): {
  brandId: string;
  createdCount: number;
  articles: Array<{ title: string; slug: string; geoScore: number }>;
} {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const db = getDb();
  db.exec("SAVEPOINT growth_pack_drafts");
  try {
    const existingBrand = db.prepare("SELECT id FROM brands WHERE user_id = ? AND name = 'GeoPulse Studio'").get(adminUserId);
    const brandId = existingBrand ? String(existingBrand.id) : createBrand(adminUserId, {
      name: "GeoPulse Studio", companyName: "GeoPulse Open-Source Project", productName: "GeoPulse Studio",
      category: "Content editing and configured API publishing",
      oneLiner: "An MIT-licensed content workspace with website audits and publishing adapters.",
      targetAudience: "Content teams and agencies", coreAdvantages: [], proofPoints: [],
      pricingInfo: "Review current configured checkout and service terms before quoting prices.",
      competitors: [], websiteUrl: cleanBase, forbiddenWords: [], regionFocus: "Both",
    }).id;
    const brand = getBrandById(brandId)!;
    const engines = ["doubao", "deepseek", "chatgpt", "perplexity", "gemini"] as const;
    const weights = blendEngineWeights([...engines]);
    const specs = [
      { slug: "robots-access-research", title: "如何记录 robots.txt 的规则与访问观察", keyword: "robots.txt 访问观察", source: "https://developers.google.com/search/docs/crawling-indexing/robots/intro", prompt: "记录具体 URL、User-agent、响应状态及观察时间。区分声明的规则与实际抓取记录。" },
      { slug: "llms-index-research", title: "如何维护与核对 llms.txt 页面索引", keyword: "llms.txt 索引核对", source: "https://llmstxt.org/", prompt: "核对索引中每个链接的公开内容与更新时间。说明该格式属于提案，不代表搜索服务采纳或收录。" },
      { slug: "article-schema-research", title: "如何核验 Article JSON-LD 与页面内容一致", keyword: "Article JSON-LD 核验", source: "https://schema.org/Article", prompt: "逐项核对标题、作者、日期与规范链接是否符合页面可见事实，不填未经证实的评价或数据。" },
      { slug: "website-audit-research", title: "How to record a reproducible website crawler-access audit", keyword: "reproducible website audit", source: "https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers", prompt: "Record the tested URL, response status, observation time, and method. Distinguish observed access rules from evidence of actual crawling or indexing." },
      { slug: "agency-report-research", title: "How to prepare an evidence-based content delivery report", keyword: "content delivery evidence report", source: "https://schema.org/CreativeWork", prompt: "Record original article links, confirmed delivery URLs, observation dates, and failures. Separate provider responses from independently observed publication and citation outcomes." },
    ];
    let createdCount = 0;
    const articles: Array<{ title: string; slug: string; geoScore: number }> = [];
    for (const spec of specs) {
      const slug = `${spec.slug}-${adminUserId.replace(/[^a-zA-Z0-9-]/g, "-")}`;
      const existing = db.prepare("SELECT title, slug, geo_score FROM articles WHERE user_id = ? AND slug = ?").get(adminUserId, slug);
      if (existing) {
        articles.push({ title: String(existing.title), slug: String(existing.slug), geoScore: Number(existing.geo_score) });
        continue;
      }
      const capsule = `Editorial research draft: ${spec.title}. Verify the observations and primary sources before publication.`;
      const markdown = `<!-- autopilot-review-required -->

## Research task
${spec.prompt}

## Primary reference
[Source documentation](${spec.source})

## Evidence to supply
Add the tested URL, date, original observations, and scope. Replace these prompts with original topic-specific findings before publishing.

## Limits
Crawler access, structured data, content scores, and delivery records do not guarantee indexing, rankings, AI citations, or revenue.`;
      const summary = capsule.slice(0, 175);
      const faqs: Array<{ question: string; answer: string }> = [];
      const jsonLd = buildGeoJsonLd({ title: spec.title, slug, summary, directAnswerCapsule: capsule,
        targetKeyword: spec.keyword, faqs, publishedAt: new Date().toISOString(), brand, baseUrl: cleanBase });
      const audit = auditGeoContent({ title: spec.title, slug, summary, targetKeyword: spec.keyword,
        directAnswerCapsule: capsule, markdownContent: markdown, faqs, jsonLd, brand, weights });
      const article = createArticle(adminUserId, {
        brandId, title: spec.title, slug, summary, archetype: "howto_playbook", targetEngines: [...engines],
        customWeights: weights, targetChannel: "geo_hub", targetKeyword: spec.keyword, directAnswerCapsule: capsule,
        markdownContent: markdown, faqs, comparisonTable: null, jsonLd, geoScore: audit.overallScore,
        engineScores: audit.engineScores, dimensionScores: audit.dimensionScores,
        status: "draft", generationMode: "builtin", publishedAt: null,
      });
      articles.push({ title: article.title, slug: article.slug, geoScore: article.geoScore });
      createdCount += 1;
    }
    db.exec("RELEASE SAVEPOINT growth_pack_drafts");
    return { brandId, createdCount, articles };
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT growth_pack_drafts");
    db.exec("RELEASE SAVEPOINT growth_pack_drafts");
    throw error;
  }
}
