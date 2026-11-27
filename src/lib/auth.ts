import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { PlanQuota, PlanTier, UserAccount } from "@/types/geo";

export const SESSION_COOKIE_NAME = "geopulse_session";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "geopulse-commercial-dev-secret-change-in-prod-2026";

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
  const [salt, originalHex] = stored.split(":");
  if (!salt || !originalHex) return false;
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
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAtStr, sig] = parts;
  if (!userId || !issuedAtStr || !sig) return null;

  const payload = `${userId}.${issuedAtStr}`;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  const issuedAt = Number(issuedAtStr);
  const maxAgeSec = 60 * 60 * 24 * 14; // 14 days
  if (!Number.isFinite(issuedAt) || Date.now() / 1000 - issuedAt > maxAgeSec) {
    return null;
  }
  return userId;
}

export async function getSessionUserId(): Promise<string | null> {
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
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt,
    apiKey: user.apiKey,
    llmProvider: user.llmProvider,
    llmBaseUrl: user.llmBaseUrl,
    llmApiKeyMasked: user.llmApiKey
      ? `${user.llmApiKey.slice(0, 6)}••••${user.llmApiKey.slice(-4)}`
      : "",
    hasLlmApiKey: Boolean(user.llmApiKey),
    serverLlmEnabled: hasServerGlobalLlm(),
    llmModel: user.llmModel,
    createdAt: user.createdAt,
  };
}
