import crypto from "node:crypto";
import type { PlanQuota, PlanTier, UserAccount } from "@/types/geo";

export const SESSION_COOKIE_NAME = "geopulse_session";

const DEVELOPMENT_SESSION_SECRET = "geopulse-commercial-dev-secret-change-in-prod-2026";
export const DEMO_EMAIL = "demo@geopulse.ai";

export function isDemoUser(user: Pick<UserAccount, "id" | "email">): boolean {
  return user.id === "usr_demo_geopulse" || user.email.trim().toLowerCase() === DEMO_EMAIL;
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const placeholder = secret && (
    /replace[-_ ]?with|change[-_ ]?(?:this|me|in[-_ ]?prod)|your[-_ ]?(?:session[-_ ]?)?secret|placeholder|(?:example|sample|default)[-_ ]?(?:session[-_ ]?)?secret|geopulse[-_].*(?:dev|default).*secret/i.test(secret) ||
    /^([a-z0-9])\1+$/i.test(secret.trim())
  );
  if (process.env.NODE_ENV === "production" &&
      (!secret || secret.trim().length < 32 || secret === DEVELOPMENT_SESSION_SECRET || placeholder)) {
    throw new Error("Production SESSION_SECRET must be a private random secret of at least 32 characters; defaults and placeholders are invalid");
  }
  return secret || DEVELOPMENT_SESSION_SECRET;
}

export const PLAN_QUOTAS: Record<PlanTier, PlanQuota> = {
  free: {
    tier: "free",
    label: "个人起步版 (Free)",
    priceMonthlyCny: 0,
    maxBrands: 3,
    maxArticlesPerMonth: 20,
    maxWebhooks: 1,
    liveLlmEnabled: true,
    customWeightsEnabled: true,
    publicHubEnabled: true,
  },
  pro: {
    tier: "pro",
    label: "中小企业专业版 (Pro)",
    priceMonthlyCny: 299,
    maxBrands: 20,
    maxArticlesPerMonth: 300,
    maxWebhooks: 10,
    liveLlmEnabled: true,
    customWeightsEnabled: true,
    publicHubEnabled: true,
  },
  enterprise: {
    tier: "enterprise",
    label: "机构多品牌旗舰版 (Enterprise)",
    priceMonthlyCny: 1299,
    maxBrands: 200,
    maxArticlesPerMonth: 5000,
    maxWebhooks: 100,
    liveLlmEnabled: true,
    customWeightsEnabled: true,
    publicHubEnabled: true,
  },
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, originalHex] = stored.split(":");
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, "hex");
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function generateApiKey(): string {
  return `gp_live_${crypto.randomBytes(20).toString("hex")}`;
}

export function signSessionToken(userId: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${userId}.${issuedAt}`;
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  let secret: string;
  try { secret = getSessionSecret(); } catch { return null; }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAtStr, sig] = parts;
  if (!userId || !issuedAtStr || !sig) return null;

  const payload = `${userId}.${issuedAtStr}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  const issuedAt = Number(issuedAtStr);
  const maxAgeSec = 60 * 60 * 24 * 14; // 14 days
  if (!Number.isSafeInteger(issuedAt) || issuedAt > Date.now() / 1000 + 60 || Date.now() / 1000 - issuedAt > maxAgeSec) {
    return null;
  }
  return userId;
}

export async function getSessionUserId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function hasServerGlobalLlm(): boolean {
  return Boolean(
    process.env.GLOBAL_LLM_PROVIDER &&
      process.env.GLOBAL_LLM_PROVIDER !== "none" &&
      process.env.GLOBAL_LLM_API_KEY
  );
}

export function sanitizeUser(user: UserAccount & { passwordHash?: string }) {
  const demo = isDemoUser(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: demo ? "user" as const : user.role,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
    creditsBalance: user.creditsBalance ?? 0,
    apiKey: demo ? "" : user.apiKey,
    llmProvider: user.llmProvider,
    llmBaseUrl: demo ? "" : user.llmBaseUrl,
    llmApiKeyMasked: !demo && user.llmApiKey
      ? `${user.llmApiKey.slice(0, 6)}••••${user.llmApiKey.slice(-4)}`
      : "",
    hasLlmApiKey: !demo && Boolean(user.llmApiKey),
    serverLlmEnabled: hasServerGlobalLlm(),
    llmModel: user.llmModel,
    createdAt: user.createdAt,
  };
}
