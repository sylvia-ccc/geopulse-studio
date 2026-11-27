import crypto from "node:crypto";
import { z } from "zod";
import type { TelemetrySummary } from "@/types/geo";
import { getDb, newId } from "./db";
import { getSessionSecret } from "./auth";

// User agents are self-reported claims, never proof of operator identity or indexing.
const AI_BOT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User",
    "ClaudeBot", "Claude-Web", "anthropic-ai", "Google-Extended", "GoogleOther",
    "Bytespider", "DeepSeekBot", "Googlebot", "bingbot"].map((name) => ({
      name, regex: new RegExp(`(?:^|[^a-z0-9_-])${name}(?=$|[^a-z0-9_-])`, "i"),
    })),
];

export function isTelemetryPrefetch(headers?: Pick<Headers, "get">): boolean {
  if (!headers) return false;
  return headers.get("next-router-prefetch") === "1" ||
    /prefetch|prerender/i.test([headers.get("purpose"), headers.get("sec-purpose"), headers.get("x-moz")].join(" "));
}

export function shouldExcludeTelemetry(headers?: Pick<Headers, "get">, userAgent = ""): boolean {
  return isTelemetryPrefetch(headers) || headers?.get("rsc") === "1" ||
    headers?.get("x-geopulse-test") === "1" ||
    /geopulse-test/i.test(userAgent || headers?.get("user-agent") || "");
}

const TELEMETRY_RETENTION_MS = 90 * 86400_000;
function pruneTelemetryEvents() {
  getDb().prepare("DELETE FROM telemetry_events WHERE created_at < ?")
    .run(new Date(Date.now() - TELEMETRY_RETENTION_MS).toISOString());
}

function cleanTelemetryPath(value: string): string {
  if (!value) return "";
  try { return new URL(value, "https://telemetry.invalid").pathname.slice(0, 200); }
  catch { return ""; }
}

const receiptSchema = z.object({
  websiteUrl: z.string().max(2048),
  auditScore: z.number().int().min(0).max(100),
  auditGrade: z.string().max(10),
  auditMissing: z.array(z.string().max(160)).max(6),
  expiresAt: z.number().int(),
});
export type AuditReceipt = Omit<z.infer<typeof receiptSchema>, "expiresAt">;
const receiptGlobal = globalThis as typeof globalThis & { __geopulseAuditReceiptSecret?: string };
function receiptSecret() {
  if (process.env.NODE_ENV === "production" || process.env.SESSION_SECRET) return getSessionSecret();
  return receiptGlobal.__geopulseAuditReceiptSecret ??= crypto.randomBytes(32).toString("hex");
}
function receiptSignature(payload: string) {
  return crypto.createHmac("sha256", receiptSecret()).update(`public-audit:v1:${payload}`).digest("base64url");
}
export function signAuditReceipt(receipt: AuditReceipt): string {
  const data = receiptSchema.parse({ ...receipt, expiresAt: Date.now() + 60 * 60_000 });
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${receiptSignature(payload)}`;
}
export function verifyAuditReceipt(token: string): AuditReceipt | null {
  if (!token || token.length > 8192) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const expected = Buffer.from(receiptSignature(payload));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const parsed = receiptSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (!parsed.success || parsed.data.expiresAt <= Date.now()) return null;
    const { expiresAt: _expiresAt, ...receipt } = parsed.data;
    return receipt;
  } catch { return null; }
}

export function detectAiBotFromUserAgent(ua: string): string {
  const clean = ua || "";
  for (const p of AI_BOT_PATTERNS) {
    if (p.regex.test(clean)) return p.name;
  }
  return "";
}

export function recordTelemetryEvent(params: {
  eventType:
    | "ai_crawler_hit"
    | "public_audit"
    | "inbound_lead"
    | "outreach_click"
    | "article_view"
    | "report_view"
    | "llms_fetch";
  path: string;
  headers?: Pick<Headers, "get">;
  userAgent?: string;
  referer?: string;
  meta?: string;
}) {
  if (shouldExcludeTelemetry(params.headers, params.userAgent)) return;
  try {
    pruneTelemetryEvents();
    const userAgent = params.userAgent || params.headers?.get("user-agent") || "";
    const botName = detectAiBotFromUserAgent(userAgent);
    const finalType = botName && ["article_view", "llms_fetch"].includes(params.eventType) ? "ai_crawler_hit" : params.eventType;
    getDb()
      .prepare(
        `INSERT INTO telemetry_events (id, event_type, path, bot_name, user_agent, referer, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId("tel"),
        finalType,
        cleanTelemetryPath(params.path),
        botName,
        userAgent.slice(0, 220),
        cleanTelemetryPath(params.referer || ""),
        (params.meta || "").slice(0, 240),
        new Date().toISOString()
      );
  } catch {
    // Telemetry must never break primary request handling
  }
}

export function getTelemetrySummary(days = 7): TelemetrySummary {
  days = Number.isFinite(days) ? Math.max(1, Math.min(30, Math.floor(days))) : 7;
  const db = getDb();
  pruneTelemetryEvents();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const countBy = (sql: string, ...args: string[]) =>
    Number(db.prepare(sql).get(...args)?.cnt || 0);

  const totalEvents7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ?",
    since
  );
  const aiCrawlerHits7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ? AND bot_name != '' AND event_type IN ('ai_crawler_hit', 'article_view', 'report_view', 'llms_fetch')",
    since
  );
  const publicAudits7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ? AND event_type = 'public_audit'",
    since
  );
  const inboundLeads7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ? AND event_type = 'inbound_lead'",
    since
  );
  const outreachClicks7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ? AND event_type = 'outreach_click'",
    since
  );
  const articleViews7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ? AND event_type = 'article_view'",
    since
  );
  const reportViews7d = countBy(
    "SELECT COUNT(*) AS cnt FROM telemetry_events WHERE created_at >= ? AND event_type = 'report_view'",
    since
  );

  const botRows = db
    .prepare(
      `SELECT bot_name, COUNT(*) AS cnt, MAX(created_at) AS last_seen
       FROM telemetry_events
       WHERE created_at >= ? AND bot_name != '' AND event_type IN ('ai_crawler_hit', 'article_view', 'report_view', 'llms_fetch')
       GROUP BY bot_name
       ORDER BY cnt DESC
       LIMIT 10`
    )
    .all(since);

  const pathRows = db
    .prepare(
      `SELECT path, COUNT(*) AS cnt
       FROM telemetry_events
       WHERE created_at >= ? AND path != ''
       GROUP BY path
       ORDER BY cnt DESC
       LIMIT 8`
    )
    .all(since);

  const recentRows = db
    .prepare(
      `SELECT id, event_type, path, bot_name, meta, created_at
       FROM telemetry_events
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(since);

  return {
    totalEvents7d,
    aiCrawlerHits7d,
    publicAudits7d,
    inboundLeads7d,
    outreachClicks7d,
    articleViews7d,
    reportViews7d,
    botBreakdown: botRows.map((r) => ({
      botName: String(r.bot_name),
      count: Number(r.cnt || 0),
      lastSeen: String(r.last_seen || ""),
    })),
    topPaths: pathRows.map((r) => ({
      path: String(r.path),
      count: Number(r.cnt || 0),
    })),
    recentEvents: recentRows.map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      path: String(r.path),
      botName: String(r.bot_name),
      meta: String(r.meta),
      createdAt: String(r.created_at),
    })),
  };
}
