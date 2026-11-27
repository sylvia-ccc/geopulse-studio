import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AIEngineId,
  ArticleArchetype,
  BrandProfile,
  CitationCheck,
  CommercialSiteSettings,
  ComparisonTable,
  FAQItem,
  FunnelStage,
  GeoArticle,
  PlanTier,
  PublishChannelConfig,
  PublishChannelType,
  PublishLog,
  RedemptionCode,
  UserAccount,
  UserRole,
  WeightDimensionId,
  WeightVector,
} from "@/types/geo";
import { generateApiKey, hashPassword } from "./auth";
import { decryptSecret, encryptSecret } from "./crypto-vault";
import { blendEngineWeights } from "./geo/weights";
import { generateBuiltinArticle } from "./geo/generator";
import { auditGeoContent } from "./geo/scorer";

// Minimal typed interface for Node 24's built-in node:sqlite DatabaseSync
interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

const DB_DIR = process.env.GEOPULSE_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = process.env.GEOPULSE_DB_PATH || path.join(DB_DIR, "geopulse.sqlite");

const globalForDb = globalThis as unknown as {
  __geopulseDb?: SqliteDatabase;
  __geopulseSeeded?: boolean;
};

function openDatabase(): SqliteDatabase {
  if (globalForDb.__geopulseDb) {
    return globalForDb.__geopulseDb;
  }

  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  // Use runtime require so Next.js bundler does not choke on node:sqlite
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (location: string) => SqliteDatabase;
  };

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'pro',
      api_key TEXT UNIQUE NOT NULL,
      llm_provider TEXT NOT NULL DEFAULT 'none',
      llm_base_url TEXT NOT NULL DEFAULT '',
      llm_api_key TEXT NOT NULL DEFAULT '',
      llm_model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      one_liner TEXT NOT NULL,
      target_audience TEXT NOT NULL,
      core_advantages_json TEXT NOT NULL DEFAULT '[]',
      proof_points_json TEXT NOT NULL DEFAULT '[]',
      pricing_info TEXT NOT NULL DEFAULT '',
      competitors_json TEXT NOT NULL DEFAULT '[]',
      website_url TEXT NOT NULL DEFAULT '',
      forbidden_words_json TEXT NOT NULL DEFAULT '[]',
      region_focus TEXT NOT NULL DEFAULT 'CN',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      brand_id TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      archetype TEXT NOT NULL,
      target_engines_json TEXT NOT NULL DEFAULT '[]',
      custom_weights_json TEXT NOT NULL DEFAULT '{}',
      target_channel TEXT NOT NULL DEFAULT 'geo_hub',
      target_keyword TEXT NOT NULL DEFAULT '',
      direct_answer_capsule TEXT NOT NULL DEFAULT '',
      markdown_content TEXT NOT NULL,
      faqs_json TEXT NOT NULL DEFAULT '[]',
      comparison_table_json TEXT,
      json_ld TEXT NOT NULL DEFAULT '',
      geo_score INTEGER NOT NULL DEFAULT 0,
      engine_scores_json TEXT NOT NULL DEFAULT '{}',
      dimension_scores_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      generation_mode TEXT NOT NULL DEFAULT 'builtin',
      views INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS publish_channels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      auth_header TEXT NOT NULL DEFAULT '',
      secret_token TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS publish_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      external_url TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS citation_checks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      brand_id TEXT NOT NULL,
      prompt_query TEXT NOT NULL,
      engine_id TEXT NOT NULL,
      mentioned INTEGER NOT NULL DEFAULT 0,
      cited_url TEXT NOT NULL DEFAULT '',
      source_domain TEXT NOT NULL DEFAULT '',
      competitors_mentioned_json TEXT NOT NULL DEFAULT '[]',
      has_hallucination INTEGER NOT NULL DEFAULT 0,
      funnel_stage TEXT NOT NULL DEFAULT 'comparison',
      position_rank INTEGER,
      sentiment TEXT NOT NULL DEFAULT 'neutral',
      snippet TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'manual',
      checked_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS redemption_codes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'active',
      redeemed_by_user_id TEXT,
      redeemed_by_email TEXT,
      redeemed_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform_type TEXT NOT NULL,
      delivery_mode TEXT NOT NULL DEFAULT 'managed_review',
      handle_or_domain TEXT NOT NULL DEFAULT '',
      authority_badge TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      credit_cost INTEGER NOT NULL DEFAULT 20,
      endpoint_url TEXT NOT NULL DEFAULT '',
      auth_header TEXT NOT NULL DEFAULT '',
      credential_enc TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 10,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS distribution_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      platform_account_id TEXT NOT NULL,
      platform_name TEXT NOT NULL,
      platform_type TEXT NOT NULL,
      delivery_mode TEXT NOT NULL,
      credits_charged INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_review',
      published_url TEXT NOT NULL DEFAULT '',
      customer_note TEXT NOT NULL DEFAULT '',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Safe forward migrations for existing production SQLite databases
  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => String(c.name) === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
  ensureColumn("users", "plan_expires_at", "TEXT");
  ensureColumn("users", "credits_balance", "INTEGER NOT NULL DEFAULT 20");
  ensureColumn("redemption_codes", "code_type", "TEXT NOT NULL DEFAULT 'plan'");
  ensureColumn("redemption_codes", "credits_amount", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("citation_checks", "source_domain", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("citation_checks", "competitors_mentioned_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("citation_checks", "has_hallucination", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("citation_checks", "funnel_stage", "TEXT NOT NULL DEFAULT 'comparison'");
  ensureColumn("platform_accounts", "region", "TEXT NOT NULL DEFAULT 'Global'");

  globalForDb.__geopulseDb = db;
  if (!globalForDb.__geopulseSeeded) {
    globalForDb.__geopulseSeeded = true;
    seedDemoDataIfEmpty(db);
  }

  // Ensure default platform publishing marketplace slots exist even on upgraded production DBs
  seedDefaultPlatformAccountsIfEmpty(db);

  // Tag domestic manual-review channels cleanly as CN (Optional) and sort global auto-API channels first
  db.prepare(
    `UPDATE platform_accounts
     SET region = 'CN (Optional)', sort_order = CASE WHEN sort_order < 50 THEN sort_order + 50 ELSE sort_order END
     WHERE delivery_mode = 'managed_review' AND region = 'Global'`
  ).run();

  // Ensure demo account and configured ADMIN_EMAIL always hold admin role
  db.prepare("UPDATE users SET role = 'admin' WHERE email = 'demo@geopulse.ai'").run();
  db.prepare(
    "UPDATE users SET credits_balance = 200 WHERE email = 'demo@geopulse.ai' AND credits_balance <= 20"
  ).run();
  if (process.env.ADMIN_EMAIL) {
    db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(
      process.env.ADMIN_EMAIL.toLowerCase().trim()
    );
  }

  return db;
}

export function getDb(): SqliteDatabase {
  return openDatabase();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface UserWithSecret extends UserAccount {
  passwordHash: string;
}

function mapUser(row: Record<string, unknown>): UserWithSecret {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    name: String(row.name),
    company: String(row.company || ""),
    role: String(row.role || "user") as UserRole,
    plan: (String(row.plan || "free") as PlanTier),
    planExpiresAt: row.plan_expires_at ? String(row.plan_expires_at) : null,
    creditsBalance: Number(row.credits_balance ?? 20),
    apiKey: String(row.api_key),
    llmProvider: String(row.llm_provider || "none") as UserAccount["llmProvider"],
    llmBaseUrl: String(row.llm_base_url || ""),
    llmApiKey: decryptSecret(String(row.llm_api_key || "")),
    llmModel: String(row.llm_model || ""),
    createdAt: String(row.created_at),
  };
}

function mapBrand(row: Record<string, unknown>): BrandProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    companyName: String(row.company_name || ""),
    productName: String(row.product_name || ""),
    category: String(row.category),
    oneLiner: String(row.one_liner),
    targetAudience: String(row.target_audience),
    coreAdvantages: safeJsonParse<string[]>(row.core_advantages_json, []),
    proofPoints: safeJsonParse<string[]>(row.proof_points_json, []),
    pricingInfo: String(row.pricing_info || ""),
    competitors: safeJsonParse<string[]>(row.competitors_json, []),
    websiteUrl: String(row.website_url || ""),
    forbiddenWords: safeJsonParse<string[]>(row.forbidden_words_json, []),
    regionFocus: (String(row.region_focus || "CN") as BrandProfile["regionFocus"]),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapArticle(row: Record<string, unknown>): GeoArticle {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    brandId: String(row.brand_id),
    title: String(row.title),
    slug: String(row.slug),
    summary: String(row.summary || ""),
    archetype: String(row.archetype) as ArticleArchetype,
    targetEngines: safeJsonParse<AIEngineId[]>(row.target_engines_json, ["doubao", "deepseek"]),
    customWeights: safeJsonParse<WeightVector>(row.custom_weights_json, blendEngineWeights(["doubao", "deepseek"])),
    targetChannel: String(row.target_channel || "geo_hub") as PublishChannelType,
    targetKeyword: String(row.target_keyword || ""),
    directAnswerCapsule: String(row.direct_answer_capsule || ""),
    markdownContent: String(row.markdown_content || ""),
    faqs: safeJsonParse<FAQItem[]>(row.faqs_json, []),
    comparisonTable: safeJsonParse<ComparisonTable | null>(row.comparison_table_json, null),
    jsonLd: String(row.json_ld || ""),
    geoScore: Number(row.geo_score || 0),
    engineScores: safeJsonParse<Record<AIEngineId, number>>(row.engine_scores_json, {
      doubao: 0,
      deepseek: 0,
      chatgpt: 0,
      perplexity: 0,
      gemini: 0,
    }),
    dimensionScores: safeJsonParse<Record<WeightDimensionId, number>>(row.dimension_scores_json, {
      directAnswer: 0,
      entityClarity: 0,
      structuredBlocks: 0,
      verifiableFacts: 0,
      faqCoverage: 0,
      neutralAuthority: 0,
      machineSchema: 0,
      channelFit: 0,
    }),
    status: String(row.status || "draft") as GeoArticle["status"],
    generationMode: String(row.generation_mode || "builtin") as GeoArticle["generationMode"],
    views: Number(row.views || 0),
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapChannel(row: Record<string, unknown>): PublishChannelConfig {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    type: String(row.type) as PublishChannelConfig["type"],
    endpointUrl: String(row.endpoint_url),
    authHeader: String(row.auth_header || ""),
    secretToken: String(row.secret_token || ""),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
  };
}

function mapPublishLog(row: Record<string, unknown>): PublishLog {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    articleId: String(row.article_id),
    articleTitle: row.article_title ? String(row.article_title) : undefined,
    channelType: String(row.channel_type),
    channelName: String(row.channel_name),
    status: String(row.status) as PublishLog["status"],
    httpStatus: row.http_status != null ? Number(row.http_status) : null,
    externalUrl: String(row.external_url || ""),
    message: String(row.message || ""),
    createdAt: String(row.created_at),
  };
}

function mapCitationCheck(row: Record<string, unknown>): CitationCheck {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    brandId: String(row.brand_id),
    brandName: row.brand_name ? String(row.brand_name) : undefined,
    promptQuery: String(row.prompt_query),
    engineId: String(row.engine_id) as AIEngineId,
    mentioned: Boolean(row.mentioned),
    citedUrl: String(row.cited_url || ""),
    sourceDomain: String(row.source_domain || ""),
    competitorsMentioned: safeJsonParse<string[]>(row.competitors_mentioned_json, []),
    hasHallucination: Boolean(row.has_hallucination),
    funnelStage: String(row.funnel_stage || "comparison") as FunnelStage,
    positionRank: row.position_rank != null ? Number(row.position_rank) : null,
    sentiment: String(row.sentiment || "neutral") as CitationCheck["sentiment"],
    snippet: String(row.snippet || ""),
    mode: String(row.mode || "manual") as CitationCheck["mode"],
    checkedAt: String(row.checked_at),
  };
}

function mapRedemptionCode(row: Record<string, unknown>): RedemptionCode {
  return {
    id: String(row.id),
    code: String(row.code),
    codeType: (String(row.code_type || "plan") as RedemptionCode["codeType"]),
    plan: String(row.plan || "pro") as PlanTier,
    durationDays: Number(row.duration_days || 30),
    creditsAmount: Number(row.credits_amount || 0),
    status: String(row.status) as RedemptionCode["status"],
    redeemedByUserId: row.redeemed_by_user_id ? String(row.redeemed_by_user_id) : null,
    redeemedByEmail: row.redeemed_by_email ? String(row.redeemed_by_email) : null,
    redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
    note: String(row.note || ""),
    createdAt: String(row.created_at),
  };
}

// ---------------- Users Repository ----------------

export function findUserByEmail(email: string): UserWithSecret | null {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
  return row ? mapUser(row) : null;
}

export function findUserById(id: string): UserWithSecret | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? mapUser(row) : null;
}

export function findUserByApiKey(apiKey: string): UserWithSecret | null {
  const row = getDb().prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey.trim());
  return row ? mapUser(row) : null;
}

export function createUser(params: {
  email: string;
  password: string;
  name: string;
  company?: string;
  plan?: PlanTier;
}): UserWithSecret {
  const id = newId("usr");
  const now = new Date().toISOString();
  const email = params.email.toLowerCase().trim();
  const passwordHash = hashPassword(params.password);
  const apiKey = generateApiKey();
  const plan = params.plan || "free";

  const isAdminEmail =
    process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.toLowerCase().trim();
  const role: UserRole = isAdminEmail ? "admin" : "user";

  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, company, role, plan, api_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, email, passwordHash, params.name.trim(), params.company?.trim() || "", role, plan, apiKey, now);

  return findUserById(id)!;
}

export function updateUserSettings(
  userId: string,
  updates: Partial<{
    name: string;
    company: string;
    plan: PlanTier;
    planExpiresAt: string | null;
    llmProvider: UserAccount["llmProvider"];
    llmBaseUrl: string;
    llmApiKey: string;
    llmModel: string;
    rotateApiKey: boolean;
  }>
): UserWithSecret | null {
  const current = findUserById(userId);
  if (!current) return null;

  const nextApiKey = updates.rotateApiKey ? generateApiKey() : current.apiKey;
  const rawLlmKey =
    updates.llmApiKey !== undefined ? updates.llmApiKey : current.llmApiKey;
  const encryptedLlmKey = rawLlmKey ? encryptSecret(rawLlmKey) : "";

  getDb()
    .prepare(
      `UPDATE users SET
        name = ?,
        company = ?,
        plan = ?,
        plan_expires_at = ?,
        api_key = ?,
        llm_provider = ?,
        llm_base_url = ?,
        llm_api_key = ?,
        llm_model = ?
       WHERE id = ?`
    )
    .run(
      updates.name ?? current.name,
      updates.company ?? current.company,
      updates.plan ?? current.plan,
      updates.planExpiresAt !== undefined ? updates.planExpiresAt : current.planExpiresAt,
      nextApiKey,
      updates.llmProvider ?? current.llmProvider,
      updates.llmBaseUrl ?? current.llmBaseUrl,
      encryptedLlmKey,
      updates.llmModel ?? current.llmModel,
      userId
    );
  return findUserById(userId);
}

// ---------------- Brands Repository ----------------

export function listBrandsByUser(userId: string): BrandProfile[] {
  const rows = getDb()
    .prepare("SELECT * FROM brands WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId);
  return rows.map(mapBrand);
}

export function listAllPublicBrands(): BrandProfile[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT b.* FROM brands b
       INNER JOIN articles a ON a.brand_id = b.id
       WHERE a.status = 'published'
       ORDER BY b.updated_at DESC`
    )
    .all();
  return rows.map(mapBrand);
}

export function getBrandById(id: string): BrandProfile | null {
  const row = getDb().prepare("SELECT * FROM brands WHERE id = ?").get(id);
  return row ? mapBrand(row) : null;
}

export function createBrand(
  userId: string,
  data: Omit<BrandProfile, "id" | "userId" | "createdAt" | "updatedAt">
): BrandProfile {
  const id = newId("brd");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO brands (
        id, user_id, name, company_name, product_name, category, one_liner,
        target_audience, core_advantages_json, proof_points_json, pricing_info,
        competitors_json, website_url, forbidden_words_json, region_focus,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      data.name.trim(),
      data.companyName.trim(),
      data.productName.trim() || data.name.trim(),
      data.category.trim(),
      data.oneLiner.trim(),
      data.targetAudience.trim(),
      JSON.stringify(data.coreAdvantages),
      JSON.stringify(data.proofPoints),
      data.pricingInfo.trim(),
      JSON.stringify(data.competitors),
      data.websiteUrl.trim(),
      JSON.stringify(data.forbiddenWords),
      data.regionFocus,
      now,
      now
    );
  return getBrandById(id)!;
}

export function updateBrand(
  id: string,
  userId: string,
  data: Partial<Omit<BrandProfile, "id" | "userId" | "createdAt" | "updatedAt">>
): BrandProfile | null {
  const current = getBrandById(id);
  if (!current || current.userId !== userId) return null;
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `UPDATE brands SET
        name = ?, company_name = ?, product_name = ?, category = ?, one_liner = ?,
        target_audience = ?, core_advantages_json = ?, proof_points_json = ?,
        pricing_info = ?, competitors_json = ?, website_url = ?,
        forbidden_words_json = ?, region_focus = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      data.name ?? current.name,
      data.companyName ?? current.companyName,
      data.productName ?? current.productName,
      data.category ?? current.category,
      data.oneLiner ?? current.oneLiner,
      data.targetAudience ?? current.targetAudience,
      JSON.stringify(data.coreAdvantages ?? current.coreAdvantages),
      JSON.stringify(data.proofPoints ?? current.proofPoints),
      data.pricingInfo ?? current.pricingInfo,
      JSON.stringify(data.competitors ?? current.competitors),
      data.websiteUrl ?? current.websiteUrl,
      JSON.stringify(data.forbiddenWords ?? current.forbiddenWords),
      data.regionFocus ?? current.regionFocus,
      now,
      id,
      userId
    );
  return getBrandById(id);
}

export function deleteBrand(id: string, userId: string): boolean {
  const res = getDb().prepare("DELETE FROM brands WHERE id = ? AND user_id = ?").run(id, userId);
  return res.changes > 0;
}

// ---------------- Articles Repository ----------------

export function listArticlesByUser(userId: string, brandId?: string): GeoArticle[] {
  const rows = brandId
    ? getDb()
        .prepare("SELECT * FROM articles WHERE user_id = ? AND brand_id = ? ORDER BY updated_at DESC")
        .all(userId, brandId)
    : getDb()
        .prepare("SELECT * FROM articles WHERE user_id = ? ORDER BY updated_at DESC")
        .all(userId);
  return rows.map(mapArticle);
}

export function listPublishedArticles(): GeoArticle[] {
  const rows = getDb()
    .prepare("SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC")
    .all();
  return rows.map(mapArticle);
}

export function getArticleById(id: string): GeoArticle | null {
  const row = getDb().prepare("SELECT * FROM articles WHERE id = ?").get(id);
  return row ? mapArticle(row) : null;
}

export function getPublishedArticleBySlug(slug: string): GeoArticle | null {
  const row = getDb()
    .prepare("SELECT * FROM articles WHERE slug = ? AND status = 'published'")
    .get(slug);
  return row ? mapArticle(row) : null;
}

export function incrementArticleViews(id: string): void {
  getDb().prepare("UPDATE articles SET views = views + 1 WHERE id = ?").run(id);
}

export function countUserArticlesThisMonth(userId: string): number {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const row = getDb()
    .prepare("SELECT COUNT(*) as cnt FROM articles WHERE user_id = ? AND created_at LIKE ?")
    .get(userId, `${monthPrefix}%`);
  return Number(row?.cnt || 0);
}

export function createArticle(
  userId: string,
  data: Omit<GeoArticle, "id" | "userId" | "views" | "createdAt" | "updatedAt">
): GeoArticle {
  const id = newId("art");
  const now = new Date().toISOString();
  let uniqueSlug = data.slug;
  const existing = getDb().prepare("SELECT id FROM articles WHERE slug = ?").get(uniqueSlug);
  if (existing) {
    uniqueSlug = `${uniqueSlug}-${crypto.randomBytes(2).toString("hex")}`;
  }

  getDb()
    .prepare(
      `INSERT INTO articles (
        id, user_id, brand_id, title, slug, summary, archetype,
        target_engines_json, custom_weights_json, target_channel, target_keyword,
        direct_answer_capsule, markdown_content, faqs_json, comparison_table_json,
        json_ld, geo_score, engine_scores_json, dimension_scores_json,
        status, generation_mode, views, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      data.brandId,
      data.title,
      uniqueSlug,
      data.summary,
      data.archetype,
      JSON.stringify(data.targetEngines),
      JSON.stringify(data.customWeights),
      data.targetChannel,
      data.targetKeyword,
      data.directAnswerCapsule,
      data.markdownContent,
      JSON.stringify(data.faqs),
      data.comparisonTable ? JSON.stringify(data.comparisonTable) : null,
      data.jsonLd,
      data.geoScore,
      JSON.stringify(data.engineScores),
      JSON.stringify(data.dimensionScores),
      data.status,
      data.generationMode,
      data.publishedAt,
      now,
      now
    );

  return getArticleById(id)!;
}

export function updateArticle(
  id: string,
  userId: string,
  data: Partial<Omit<GeoArticle, "id" | "userId" | "createdAt" | "updatedAt">>
): GeoArticle | null {
  const current = getArticleById(id);
  if (!current || current.userId !== userId) return null;
  const now = new Date().toISOString();

  const nextStatus = data.status ?? current.status;
  const nextPublishedAt =
    nextStatus === "published"
      ? data.publishedAt ?? current.publishedAt ?? now
      : null;

  getDb()
    .prepare(
      `UPDATE articles SET
        title = ?, slug = ?, summary = ?, archetype = ?,
        target_engines_json = ?, custom_weights_json = ?, target_channel = ?,
        target_keyword = ?, direct_answer_capsule = ?, markdown_content = ?,
        faqs_json = ?, comparison_table_json = ?, json_ld = ?,
        geo_score = ?, engine_scores_json = ?, dimension_scores_json = ?,
        status = ?, published_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      data.title ?? current.title,
      data.slug ?? current.slug,
      data.summary ?? current.summary,
      data.archetype ?? current.archetype,
      JSON.stringify(data.targetEngines ?? current.targetEngines),
      JSON.stringify(data.customWeights ?? current.customWeights),
      data.targetChannel ?? current.targetChannel,
      data.targetKeyword ?? current.targetKeyword,
      data.directAnswerCapsule ?? current.directAnswerCapsule,
      data.markdownContent ?? current.markdownContent,
      JSON.stringify(data.faqs ?? current.faqs),
      data.comparisonTable !== undefined
        ? data.comparisonTable
          ? JSON.stringify(data.comparisonTable)
          : null
        : current.comparisonTable
          ? JSON.stringify(current.comparisonTable)
          : null,
      data.jsonLd ?? current.jsonLd,
      data.geoScore ?? current.geoScore,
      JSON.stringify(data.engineScores ?? current.engineScores),
      JSON.stringify(data.dimensionScores ?? current.dimensionScores),
      nextStatus,
      nextPublishedAt,
      now,
      id,
      userId
    );
  return getArticleById(id);
}

export function deleteArticle(id: string, userId: string): boolean {
  const res = getDb().prepare("DELETE FROM articles WHERE id = ? AND user_id = ?").run(id, userId);
  return res.changes > 0;
}

// ---------------- Channels & Logs Repository ----------------

export function listPublishChannels(userId: string): PublishChannelConfig[] {
  const rows = getDb()
    .prepare("SELECT * FROM publish_channels WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
  return rows.map(mapChannel);
}

export function createPublishChannel(
  userId: string,
  data: Omit<PublishChannelConfig, "id" | "userId" | "createdAt">
): PublishChannelConfig {
  const id = newId("chn");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO publish_channels (id, user_id, name, type, endpoint_url, auth_header, secret_token, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      data.name.trim(),
      data.type,
      data.endpointUrl.trim(),
      data.authHeader.trim(),
      data.secretToken.trim(),
      data.enabled ? 1 : 0,
      now
    );
  const row = getDb().prepare("SELECT * FROM publish_channels WHERE id = ?").get(id);
  return mapChannel(row!);
}

export function deletePublishChannel(id: string, userId: string): boolean {
  const res = getDb()
    .prepare("DELETE FROM publish_channels WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return res.changes > 0;
}

export function createPublishLog(
  userId: string,
  data: Omit<PublishLog, "id" | "userId" | "articleTitle" | "createdAt">
): PublishLog {
  const id = newId("plg");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO publish_logs (id, user_id, article_id, channel_type, channel_name, status, http_status, external_url, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      data.articleId,
      data.channelType,
      data.channelName,
      data.status,
      data.httpStatus,
      data.externalUrl,
      data.message,
      now
    );
  const row = getDb()
    .prepare(
      `SELECT l.*, a.title AS article_title FROM publish_logs l
       LEFT JOIN articles a ON a.id = l.article_id WHERE l.id = ?`
    )
    .get(id);
  return mapPublishLog(row!);
}

export function listPublishLogs(userId: string, limit = 30): PublishLog[] {
  const rows = getDb()
    .prepare(
      `SELECT l.*, a.title AS article_title FROM publish_logs l
       LEFT JOIN articles a ON a.id = l.article_id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC
       LIMIT ?`
    )
    .all(userId, limit);
  return rows.map(mapPublishLog);
}

// ---------------- Citation Checks Repository ----------------

export function listCitationChecks(userId: string, brandId?: string): CitationCheck[] {
  const rows = brandId
    ? getDb()
        .prepare(
          `SELECT c.*, b.name AS brand_name FROM citation_checks c
           LEFT JOIN brands b ON b.id = c.brand_id
           WHERE c.user_id = ? AND c.brand_id = ?
           ORDER BY c.checked_at DESC`
        )
        .all(userId, brandId)
    : getDb()
        .prepare(
          `SELECT c.*, b.name AS brand_name FROM citation_checks c
           LEFT JOIN brands b ON b.id = c.brand_id
           WHERE c.user_id = ?
           ORDER BY c.checked_at DESC`
        )
        .all(userId);
  return rows.map(mapCitationCheck);
}

export function createCitationCheck(
  userId: string,
  data: Omit<CitationCheck, "id" | "userId" | "brandName" | "checkedAt">
): CitationCheck {
  const id = newId("cit");
  const now = new Date().toISOString();
  let domain = data.sourceDomain?.trim() || "";
  if (!domain && data.citedUrl?.trim()) {
    try {
      domain = new URL(
        data.citedUrl.startsWith("http") ? data.citedUrl : `https://geopulse.local${data.citedUrl}`
      ).hostname.replace(/^www\./, "");
    } catch {
      domain = "";
    }
  }
  getDb()
    .prepare(
      `INSERT INTO citation_checks (
        id, user_id, brand_id, prompt_query, engine_id, mentioned,
        cited_url, source_domain, competitors_mentioned_json, has_hallucination,
        funnel_stage, position_rank, sentiment, snippet, mode, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      data.brandId,
      data.promptQuery.trim(),
      data.engineId,
      data.mentioned ? 1 : 0,
      data.citedUrl.trim(),
      domain,
      JSON.stringify(data.competitorsMentioned || []),
      data.hasHallucination ? 1 : 0,
      data.funnelStage || "comparison",
      data.positionRank,
      data.sentiment,
      data.snippet.trim(),
      data.mode,
      now
    );
  const row = getDb()
    .prepare(
      `SELECT c.*, b.name AS brand_name FROM citation_checks c
       LEFT JOIN brands b ON b.id = c.brand_id WHERE c.id = ?`
    )
    .get(id);
  return mapCitationCheck(row!);
}

export function deleteCitationCheck(id: string, userId: string): boolean {
  const res = getDb()
    .prepare("DELETE FROM citation_checks WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return res.changes > 0;
}

// ---------------- Commercial Licensing / Admin Repository ----------------

export function createRedemptionCodes(params: {
  codeType?: "plan" | "credits";
  plan?: PlanTier;
  durationDays?: number;
  creditsAmount?: number;
  count: number;
  note?: string;
}): RedemptionCode[] {
  const now = new Date().toISOString();
  const created: RedemptionCode[] = [];
  const codeType = params.codeType || "plan";
  const plan = params.plan || "pro";
  const durationDays = params.durationDays ?? 30;
  const creditsAmount =
    codeType === "credits"
      ? Math.max(10, params.creditsAmount ?? 100)
      : plan === "enterprise"
        ? 300
        : plan === "pro"
          ? 50
          : 0;
  const prefix =
    codeType === "credits"
      ? "CRD"
      : plan === "enterprise"
        ? "ENT"
        : plan === "pro"
          ? "PRO"
          : "FREE";
  const safeCount = Math.min(50, Math.max(1, params.count));

  for (let i = 0; i < safeCount; i++) {
    const id = newId("cd");
    const randA = crypto.randomBytes(2).toString("hex").toUpperCase();
    const randB = crypto.randomBytes(2).toString("hex").toUpperCase();
    const code = `GP-${prefix}-${randA}-${randB}`;
    getDb()
      .prepare(
        `INSERT INTO redemption_codes (id, code, code_type, plan, duration_days, credits_amount, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(id, code, codeType, plan, durationDays, creditsAmount, (params.note || "").trim(), now);
    const row = getDb().prepare("SELECT * FROM redemption_codes WHERE id = ?").get(id);
    if (row) created.push(mapRedemptionCode(row));
  }
  return created;
}

export function listRedemptionCodes(): RedemptionCode[] {
  const rows = getDb()
    .prepare("SELECT * FROM redemption_codes ORDER BY created_at DESC LIMIT 100")
    .all();
  return rows.map(mapRedemptionCode);
}

export function revokeRedemptionCode(id: string): boolean {
  const res = getDb()
    .prepare("UPDATE redemption_codes SET status = 'revoked' WHERE id = ? AND status = 'active'")
    .run(id);
  return res.changes > 0;
}

export function redeemActivationCode(
  userId: string,
  rawCode: string
):
  | {
      ok: true;
      codeType: "plan" | "credits";
      plan: PlanTier;
      expiresAt: string | null;
      durationDays: number;
      creditsAdded: number;
      creditsBalance: number;
    }
  | { ok: false; error: string } {
  const normalized = rawCode.trim().toUpperCase();
  const row = getDb().prepare("SELECT * FROM redemption_codes WHERE code = ?").get(normalized);
  if (!row) {
    return { ok: false, error: "激活码不存在，请核对后重试" };
  }
  const rec = mapRedemptionCode(row);
  if (rec.status !== "active") {
    return {
      ok: false,
      error: rec.status === "redeemed" ? "该激活码已被使用" : "该激活码已作废",
    };
  }

  const user = findUserById(userId);
  if (!user) return { ok: false, error: "用户不存在" };

  const now = new Date();
  const db = getDb();

  db.prepare(
    `UPDATE redemption_codes SET status = 'redeemed', redeemed_by_user_id = ?, redeemed_by_email = ?, redeemed_at = ?
     WHERE id = ? AND status = 'active'`
  ).run(user.id, user.email, now.toISOString(), rec.id);

  let nextBalance = user.creditsBalance ?? 0;
  if (rec.creditsAmount > 0) {
    nextBalance += rec.creditsAmount;
    db.prepare("UPDATE users SET credits_balance = ? WHERE id = ?").run(nextBalance, user.id);
    db.prepare(
      `INSERT INTO credit_transactions (id, user_id, delta, balance_after, reason, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId("ctx"),
      user.id,
      rec.creditsAmount,
      nextBalance,
      rec.codeType === "credits" ? `积分卡密充值（${rec.code}）` : `套餐激活赠送发布积分（${rec.code}）`,
      rec.id,
      now.toISOString()
    );
  }

  if (rec.codeType === "credits") {
    return {
      ok: true,
      codeType: "credits",
      plan: user.plan,
      expiresAt: user.planExpiresAt,
      durationDays: 0,
      creditsAdded: rec.creditsAmount,
      creditsBalance: nextBalance,
    };
  }

  const baseDate =
    user.planExpiresAt && new Date(user.planExpiresAt).getTime() > now.getTime()
      ? new Date(user.planExpiresAt)
      : now;
  const expiresAt = new Date(
    baseDate.getTime() + rec.durationDays * 24 * 60 * 60 * 1000
  ).toISOString();

  updateUserSettings(user.id, {
    plan: rec.plan,
    planExpiresAt: expiresAt,
  });

  return {
    ok: true,
    codeType: "plan",
    plan: rec.plan,
    expiresAt,
    durationDays: rec.durationDays,
    creditsAdded: rec.creditsAmount,
    creditsBalance: nextBalance,
  };
}

function seedDefaultPlatformAccountsIfEmpty(db: SqliteDatabase) {
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM platform_accounts").get();
  if (Number(existing?.cnt || 0) > 0) return;

  const now = new Date().toISOString();
  const defaults = [
    {
      id: "pac_geo_hub_official",
      name: "GeoPulse 官方高权重 GEO 精选专栏",
      platformType: "geo_network",
      deliveryMode: "auto_api",
      handleOrDomain: "geo.workagentpro.com/hub",
      authorityBadge: "即时自动上线 · /llms.txt 全网索引",
      description:
        "实时发布至 SSR 公开专栏并嵌入四合一 JSON-LD，自动写入 /llms.txt 与 /sitemap.xml，全面放行 6 大 AI 引擎爬虫。",
      creditCost: 10,
      sortOrder: 1,
    },
    {
      id: "pac_zhihu_eval",
      name: "知乎 · 商业与数字化客观评测号",
      platformType: "zhihu_managed",
      deliveryMode: "managed_review",
      handleOrDomain: "知乎认证专栏矩阵（平台自营）",
      authorityBadge: "DeepSeek / 豆包 / Kimi 极高权重源",
      description:
        "无需自己养知乎账号！平台审核通过后发布至垂直客观评测专栏，24 小时内回传真实知乎链接（未通过自动全额退积分）。",
      creditCost: 39,
      sortOrder: 2,
    },
    {
      id: "pac_wechat_growth",
      name: "微信公众号 · 企业增长实战矩阵",
      platformType: "wechat_managed",
      deliveryMode: "managed_review",
      handleOrDomain: "认证服务号/订阅号矩阵",
      authorityBadge: "腾讯元宝 / 微信 AI 搜索核心信源",
      description:
        "自动转为公众号富文本排版并经编辑审核后发至合作/自营垂直号，显著提升微信生态与国内大模型提及率。",
      creditCost: 49,
      sortOrder: 3,
    },
    {
      id: "pac_xhs_review",
      name: "小红书 · 消费与效率工具实测号",
      platformType: "xiaohongshu_managed",
      deliveryMode: "managed_review",
      handleOrDomain: "小红书测评笔记矩阵",
      authorityBadge: "消费决策 & 豆包种草高引源",
      description:
        "提炼核心卖点、对比表与避坑指南，以真实测评口吻发布至垂直好物/工具测评号，回传笔记链接。",
      creditCost: 35,
      sortOrder: 4,
    },
    {
      id: "pac_bundle_3x",
      name: "全网 3 渠道 GEO 组合代发包（专栏 + 知乎 + 公众号）",
      platformType: "bundle_managed",
      deliveryMode: "managed_review",
      handleOrDomain: "3 大核心高权源联动共现",
      authorityBadge: "省 20% · 多信源共现效果最佳",
      description:
        "单篇文章一次覆盖 SSR 专栏 + 知乎 + 微信公众号，建立多平台品牌实体共现，大幅加速 AI 收录与推荐。",
      creditCost: 79,
      sortOrder: 5,
    },
  ];

  for (const a of defaults) {
    db.prepare(
      `INSERT INTO platform_accounts (
        id, name, platform_type, delivery_mode, handle_or_domain, authority_badge,
        description, credit_cost, endpoint_url, auth_header, credential_enc, enabled, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 1, ?, ?)`
    ).run(
      a.id,
      a.name,
      a.platformType,
      a.deliveryMode,
      a.handleOrDomain,
      a.authorityBadge,
      a.description,
      a.creditCost,
      a.sortOrder,
      now
    );
  }

  // Also ensure a sample credit top-up code exists for testing
  const hasCrd = db.prepare("SELECT id FROM redemption_codes WHERE code = 'GP-CRD-2026-100C'").get();
  if (!hasCrd) {
    db.prepare(
      `INSERT INTO redemption_codes (id, code, code_type, plan, duration_days, credits_amount, status, note, created_at)
       VALUES (?, 'GP-CRD-2026-100C', 'credits', 'free', 0, 100, 'active', '100 积分托管代发体验充值码', ?)`
    ).run(newId("cd"), now);
  }
}

export function listAllUsersForAdmin() {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.company, u.role, u.plan, u.plan_expires_at, u.created_at,
        (SELECT COUNT(*) FROM brands b WHERE b.user_id = u.id) AS brands_count,
        (SELECT COUNT(*) FROM articles a WHERE a.user_id = u.id) AS articles_count
       FROM users u
       ORDER BY u.created_at DESC
       LIMIT 100`
    )
    .all();

  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    company: String(r.company || ""),
    role: String(r.role || "user") as UserRole,
    plan: String(r.plan || "free") as PlanTier,
    planExpiresAt: r.plan_expires_at ? String(r.plan_expires_at) : null,
    brandsCount: Number(r.brands_count || 0),
    articlesCount: Number(r.articles_count || 0),
    createdAt: String(r.created_at),
  }));
}

export function getAdminPlatformStats() {
  const db = getDb();
  const totalUsers = Number(db.prepare("SELECT COUNT(*) as cnt FROM users").get()?.cnt || 0);
  const paidUsers = Number(
    db.prepare("SELECT COUNT(*) as cnt FROM users WHERE plan IN ('pro', 'enterprise')").get()?.cnt || 0
  );
  const totalBrands = Number(db.prepare("SELECT COUNT(*) as cnt FROM brands").get()?.cnt || 0);
  const totalArticles = Number(db.prepare("SELECT COUNT(*) as cnt FROM articles").get()?.cnt || 0);
  const publishedArticles = Number(
    db.prepare("SELECT COUNT(*) as cnt FROM articles WHERE status = 'published'").get()?.cnt || 0
  );
  const activeCodes = Number(
    db.prepare("SELECT COUNT(*) as cnt FROM redemption_codes WHERE status = 'active'").get()?.cnt || 0
  );
  const redeemedCodes = Number(
    db.prepare("SELECT COUNT(*) as cnt FROM redemption_codes WHERE status = 'redeemed'").get()?.cnt || 0
  );
  return {
    totalUsers,
    paidUsers,
    totalBrands,
    totalArticles,
    publishedArticles,
    activeCodes,
    redeemedCodes,
  };
}

export function dbHealthCheck(): boolean {
  try {
    const row = getDb().prepare("SELECT 1 AS ok").get();
    return Number(row?.ok) === 1;
  } catch {
    return false;
  }
}

// ---------------- Commercial Site Settings Repository ----------------

const DEFAULT_SITE_SETTINGS: Omit<CommercialSiteSettings, "strictBilling"> = {
  brandTitle: "GeoPulse Studio",
  contactWechatOrEmail: "商务/购买激活码与源码合作：请在 GitHub 提 Issue 或联系管理员",
  checkoutProUrl: "",
  checkoutEnterpriseUrl: "",
  acquisitionNote: "开放 MIT 社区版自托管，同时支持企业私有化定制与整站商业合作/收购洽谈。",
  announcement: "GeoPulse Studio 3.0 正式上线：新增免登录 GEO 秒测、10 大模型一键接入与零 API Key 专家提示词模式！",
};

export function getCommercialSiteSettings(): CommercialSiteSettings {
  const rows = getDb().prepare("SELECT key, value FROM site_settings").all();
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(String(r.key), String(r.value));
  }

  return {
    brandTitle: map.get("brandTitle") || DEFAULT_SITE_SETTINGS.brandTitle,
    contactWechatOrEmail:
      map.get("contactWechatOrEmail") || DEFAULT_SITE_SETTINGS.contactWechatOrEmail,
    checkoutProUrl: map.get("checkoutProUrl") ?? DEFAULT_SITE_SETTINGS.checkoutProUrl,
    checkoutEnterpriseUrl:
      map.get("checkoutEnterpriseUrl") ?? DEFAULT_SITE_SETTINGS.checkoutEnterpriseUrl,
    acquisitionNote: map.get("acquisitionNote") || DEFAULT_SITE_SETTINGS.acquisitionNote,
    announcement: map.get("announcement") ?? DEFAULT_SITE_SETTINGS.announcement,
    strictBilling: process.env.COMMERCIAL_STRICT_BILLING === "true",
  };
}

export function updateCommercialSiteSettings(
  updates: Partial<Omit<CommercialSiteSettings, "strictBilling">>
): CommercialSiteSettings {
  const stmt = getDb().prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const allowedKeys: Array<keyof Omit<CommercialSiteSettings, "strictBilling">> = [
    "brandTitle",
    "contactWechatOrEmail",
    "checkoutProUrl",
    "checkoutEnterpriseUrl",
    "acquisitionNote",
    "announcement",
  ];
  for (const k of allowedKeys) {
    if (updates[k] !== undefined) {
      stmt.run(k, String(updates[k]).trim());
    }
  }
  return getCommercialSiteSettings();
}

// ---------------- Initial Commercial Demo Seed ----------------

function seedDemoDataIfEmpty(db: SqliteDatabase) {
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM users").get();
  if (Number(existing?.cnt || 0) > 0) return;

  const now = new Date().toISOString();
  const demoUserId = "usr_demo_geopulse";
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, company, role, plan, api_key, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?)`
  ).run(
    demoUserId,
    "demo@geopulse.ai",
    hashPassword("Demo123456!"),
    "林知远（演示负责人）",
    "智引增长实验室",
    "pro",
    generateApiKey(),
    now
  );

  // Seed Brand 1: B2B SMB SaaS
  const brand1: BrandProfile = {
    id: "brd_qingzhou_saas",
    userId: demoUserId,
    name: "轻舟云账",
    companyName: "杭州轻舟数科有限公司",
    productName: "轻舟云账 AI 财税助手",
    category: "小微企业智能财税 SaaS",
    oneLiner: "专为 50 人以下小微企业设计的自动化记账、发票识别与税务预警云端软件",
    targetAudience: "50 人以下小微企业老板、兼职会计与个体工商户",
    coreAdvantages: [
      "拍照/微信收票 3 秒自动生成凭证，无需专业会计基础也能看懂现金流",
      "内置 2026 最新小规模纳税人及个税优惠政策智能体检，自动预警税务风险",
      "零实施费，手机小程序与网页端实时同步，老板随时查利润与应收账款",
    ],
    proofPoints: [
      "累计服务超过 18,000 家小微商户，平均每月减少 12 小时手工录单耗时",
      "OCR 发票与银行回单识别准确率在 2026 实测中达到 99.3%",
      "相比外包代账+传统财务软件组合，年度综合财税管理成本降低约 52%",
    ],
    pricingInfo: "起步版 99 元/月（含自动记账+税务体检），专业版 199 元/月，支持 14 天全功能免费试用",
    competitors: ["金蝶精斗云", "用友畅捷通好会计"],
    websiteUrl: "https://qingzhou.example.com",
    forbiddenWords: ["避税神器", "绝对免税"],
    regionFocus: "CN",
    createdAt: now,
    updatedAt: now,
  };

  // Seed Brand 2: Specialty DTC Coffee
  const brand2: BrandProfile = {
    id: "brd_senyu_coffee",
    userId: demoUserId,
    name: "森屿咖啡",
    companyName: "上海森屿烘焙坊",
    productName: "森屿冷萃冻干精品咖啡",
    category: "精品即溶冻干咖啡",
    oneLiner: "采用云南保山高海拔单一产区水洗豆、-40°C 低温冻干保留手冲花果香的 3 秒即溶精品咖啡",
    targetAudience: "一二线城市上班族、熬夜程序员与追求手冲风味的精品咖啡入门者",
    coreAdvantages: [
      "100% 云南高海拔阿拉比卡单一产区豆，拒绝罗布斯塔拼配与香精添加",
      "-40°C 慢速宇航冻干工艺，冷水/冰牛奶 3 秒完全溶解无残渣",
      "每批次公开 SCA 杯测分数（84.5+）与烘焙日期，风味稳定可追溯",
    ],
    proofPoints: [
      "单杯到手价约 4.2 元，仅为连锁现磨精品拿铁价格的 1/5",
      "2026 年盲测复购率达到 63%，小红书与知乎累计真实测评超 4,200 篇",
      "0 植脂末、0 蔗糖、0 防腐剂，每颗热量低于 8 千卡",
    ],
    pricingInfo: "尝鲜装 12 颗 59 元，办公囤货装 36 颗 149 元（折合 4.14 元/杯）",
    competitors: ["三顿半", "隅田川"],
    websiteUrl: "https://senyucoffee.example.com",
    forbiddenWords: ["提神神药", "全网最好喝"],
    regionFocus: "Both",
    createdAt: now,
    updatedAt: now,
  };

  for (const b of [brand1, brand2]) {
    db.prepare(
      `INSERT INTO brands (
        id, user_id, name, company_name, product_name, category, one_liner,
        target_audience, core_advantages_json, proof_points_json, pricing_info,
        competitors_json, website_url, forbidden_words_json, region_focus,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      b.id,
      b.userId,
      b.name,
      b.companyName,
      b.productName,
      b.category,
      b.oneLiner,
      b.targetAudience,
      JSON.stringify(b.coreAdvantages),
      JSON.stringify(b.proofPoints),
      b.pricingInfo,
      JSON.stringify(b.competitors),
      b.websiteUrl,
      JSON.stringify(b.forbiddenWords),
      b.regionFocus,
      b.createdAt,
      b.updatedAt
    );
  }

  // Seed 2 high-scoring published GEO articles asynchronously-free via builtin composer
  const seedSpecs: Array<{
    id: string;
    slug: string;
    brand: BrandProfile;
    archetype: ArticleArchetype;
    engines: AIEngineId[];
    channel: PublishChannelType;
    keyword: string;
    views: number;
  }> = [
    {
      id: "art_seed_qingzhou_1",
      slug: "2026-smb-accounting-saas-qingzhou-comparison",
      brand: brand1,
      archetype: "comparison_matrix",
      engines: ["deepseek", "doubao", "chatgpt"],
      channel: "zhihu",
      keyword: "2026小微企业财税软件对比 轻舟云账",
      views: 342,
    },
    {
      id: "art_seed_senyu_1",
      slug: "2026-freeze-dried-coffee-guide-senyu",
      brand: brand2,
      archetype: "buyers_checklist",
      engines: ["doubao", "perplexity", "gemini"],
      channel: "xiaohongshu",
      keyword: "高性价比精品冻干咖啡推荐 森屿咖啡",
      views: 518,
    },
  ];

  for (const spec of seedSpecs) {
    const weights = blendEngineWeights(spec.engines);
    const gen = generateBuiltinArticle({
      brand: spec.brand,
      archetype: spec.archetype,
      targetEngines: spec.engines,
      weights,
      targetChannel: spec.channel,
      targetKeyword: spec.keyword,
      preferBuiltin: true,
      baseUrl: "http://localhost:3000",
    });

    const audit = auditGeoContent({
      title: gen.title,
      slug: spec.slug,
      summary: gen.summary,
      targetKeyword: gen.targetKeyword,
      directAnswerCapsule: gen.directAnswerCapsule,
      markdownContent: gen.markdownContent,
      faqs: gen.faqs,
      comparisonTable: gen.comparisonTable,
      jsonLd: gen.jsonLd,
      brand: spec.brand,
      weights,
    });

    db.prepare(
      `INSERT INTO articles (
        id, user_id, brand_id, title, slug, summary, archetype,
        target_engines_json, custom_weights_json, target_channel, target_keyword,
        direct_answer_capsule, markdown_content, faqs_json, comparison_table_json,
        json_ld, geo_score, engine_scores_json, dimension_scores_json,
        status, generation_mode, views, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'builtin', ?, ?, ?, ?)`
    ).run(
      spec.id,
      demoUserId,
      spec.brand.id,
      gen.title,
      spec.slug,
      gen.summary,
      spec.archetype,
      JSON.stringify(spec.engines),
      JSON.stringify(weights),
      spec.channel,
      gen.targetKeyword,
      gen.directAnswerCapsule,
      gen.markdownContent,
      JSON.stringify(gen.faqs),
      JSON.stringify(gen.comparisonTable),
      gen.jsonLd,
      audit.overallScore,
      JSON.stringify(audit.engineScores),
      JSON.stringify(audit.dimensionScores),
      spec.views,
      now,
      now,
      now
    );

    db.prepare(
      `INSERT INTO publish_logs (id, user_id, article_id, channel_type, channel_name, status, http_status, external_url, message, created_at)
       VALUES (?, ?, ?, 'geo_hub', 'GeoPulse 公开 GEO 专栏', 'success', 200, ?, '已发布并同步至 /llms.txt 与 sitemap.xml', ?)`
    ).run(newId("plg"), demoUserId, spec.id, `/p/${spec.slug}`, now);
  }

  // Seed citation checks with competitor SOV & source attribution
  const seedChecks = [
    {
      brandId: brand1.id,
      prompt: "50人以下小微企业有哪些简单好用的云端财税记账软件？",
      engine: "deepseek",
      mentioned: 1,
      citedUrl: "https://zhihu.com/p/smb-accounting-2026",
      sourceDomain: "zhihu.com",
      competitors: ["金蝶精斗云", "用友畅捷通好会计"],
      stage: "awareness",
      rank: 2,
      sentiment: "positive",
      snippet: "对于50人以下小微企业，轻舟云账以99元/月的透明门槛和微信3秒识票能力在性价比维度表现突出...",
    },
    {
      brandId: brand1.id,
      prompt: "轻舟云账和金蝶精斗云哪个更适合初创小公司？",
      engine: "doubao",
      mentioned: 1,
      citedUrl: "https://mp.weixin.qq.com/s/qingzhou-vs-kingdee",
      sourceDomain: "mp.weixin.qq.com",
      competitors: ["金蝶精斗云"],
      stage: "comparison",
      rank: 1,
      sentiment: "positive",
      snippet: "如果团队没有专职会计且追求当天上手，轻舟云账门槛更低；若需要复杂多账套则可考虑金蝶精斗云。",
    },
    {
      brandId: brand2.id,
      prompt: "2026年单杯5元以内好喝的精品冻干咖啡推荐？",
      engine: "perplexity",
      mentioned: 1,
      citedUrl: "http://localhost:3000/p/2026-freeze-dried-coffee-guide-senyu",
      sourceDomain: "geopulse.hub",
      competitors: ["三顿半", "隅田川"],
      stage: "decision",
      rank: 2,
      sentiment: "positive",
      snippet: "森屿咖啡主打云南保山单一产区水洗豆，囤货装折合4.14元/杯，公开SCA 84.5+杯测分。",
    },
    {
      brandId: brand2.id,
      prompt: "三顿半平替有哪些0蔗糖精品冻干咖啡？",
      engine: "chatgpt",
      mentioned: 0,
      citedUrl: "https://xiaohongshu.com/explore/coffee-2026",
      sourceDomain: "xiaohongshu.com",
      competitors: ["三顿半", "隅田川"],
      stage: "comparison",
      rank: null,
      sentiment: "neutral",
      snippet: "当前回答主要提及永璞、隅田川与连咖啡，建议补充一篇知乎/官网横向对比评测拦截该词。",
    },
  ];

  for (const c of seedChecks) {
    db.prepare(
      `INSERT INTO citation_checks (
        id, user_id, brand_id, prompt_query, engine_id, mentioned,
        cited_url, source_domain, competitors_mentioned_json, has_hallucination,
        funnel_stage, position_rank, sentiment, snippet, mode, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'manual', ?)`
    ).run(
      newId("cit"),
      demoUserId,
      c.brandId,
      c.prompt,
      c.engine,
      c.mentioned,
      c.citedUrl,
      c.sourceDomain,
      JSON.stringify(c.competitors),
      c.stage,
      c.rank,
      c.sentiment,
      c.snippet,
      now
    );
  }

  // Seed 2 sample commercial activation codes for testing the licensing workflow
  db.prepare(
    `INSERT INTO redemption_codes (id, code, plan, duration_days, status, note, created_at)
     VALUES (?, 'GP-PRO-2026-DEMO', 'pro', 30, 'active', '商用演示月卡激活码', ?)`
  ).run(newId("cd"), now);
  db.prepare(
    `INSERT INTO redemption_codes (id, code, plan, duration_days, status, note, created_at)
     VALUES (?, 'GP-ENT-2026-VIP1', 'enterprise', 365, 'active', '机构旗舰年卡示例', ?)`
  ).run(newId("cd"), now);
}
