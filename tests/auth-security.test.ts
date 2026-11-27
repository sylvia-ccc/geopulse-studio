import crypto from "node:crypto";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { UserWithSecret } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(), findUserById: vi.fn(), findUserByApiKey: vi.fn(),
  findUserByEmail: vi.fn(), createUser: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/db", () => ({
  findUserById: mocks.findUserById,
  findUserByApiKey: mocks.findUserByApiKey,
  findUserByEmail: mocks.findUserByEmail,
  createUser: mocks.createUser,
}));

import { DEMO_EMAIL, getSessionSecret, hashPassword, sanitizeUser, signSessionToken, verifyPassword, verifySessionToken } from "@/lib/auth";
import { requireAuthUser } from "@/lib/api-auth";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";

const demo: UserWithSecret = {
  id: "usr_demo_geopulse", email: DEMO_EMAIL, name: "Sample", company: "Sample",
  role: "admin", plan: "pro", planExpiresAt: null, creditsBalance: 200,
  apiKey: "gp_live_previous_demo_key", passwordHash: hashPassword("old-demo-password"),
  llmProvider: "openai", llmBaseUrl: "https://private.example", llmApiKey: "private-model-key", llmModel: "model",
  createdAt: new Date().toISOString(),
};
const owner: UserWithSecret = { ...demo, id: "usr_private_owner", email: "owner@example.test", apiKey: "gp_live_owner" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-with-more-than-32-characters");
  vi.stubEnv("ADMIN_EMAIL", "owner@example.test");
  mocks.cookies.mockResolvedValue({ get: () => undefined });
});
afterEach(() => vi.unstubAllEnvs());

describe("public demo authentication boundary", () => {
  it.each(["GET", "POST", "PATCH", "DELETE"])("rejects stale demo cookies on %s requests", async (method) => {
    const token = signSessionToken(demo.id);
    mocks.cookies.mockResolvedValue({ get: () => ({ value: token }) });
    mocks.findUserById.mockReturnValue(demo);
    expect(await requireAuthUser(new NextRequest("https://app.test/api/admin/platforms", { method }))).toBeNull();
  });

  it.each(["x-api-key", "authorization"])("rejects known demo integration keys via %s", async (header) => {
    mocks.findUserByApiKey.mockReturnValue(demo);
    expect(await requireAuthUser(new NextRequest("https://app.test/api/settings", {
      headers: { [header]: header === "authorization" ? `Bearer ${demo.apiKey}` : demo.apiKey },
    }))).toBeNull();
  });

  it("preserves private owner cookie and API key access", async () => {
    mocks.findUserByApiKey.mockReturnValue(owner);
    expect(await requireAuthUser(new NextRequest("https://app.test/api/settings", { headers: { "x-api-key": owner.apiKey } }))).toEqual(owner);
    mocks.cookies.mockResolvedValue({ get: () => ({ value: signSessionToken(owner.id) }) });
    mocks.findUserById.mockReturnValue(owner);
    expect(await requireAuthUser(new NextRequest("https://app.test/api/settings"))).toEqual(owner);
  });

  it("cannot expose demo privileges or integration credentials through user responses", () => {
    expect(sanitizeUser(demo)).toMatchObject({ role: "user", apiKey: "", llmBaseUrl: "", llmApiKeyMasked: "", hasLlmApiKey: false });
  });

  it.each([{ demo: true }, { email: DEMO_EMAIL, password: "old-demo-password" }])("disables each public demo login mechanism", async (body) => {
    const res = await login(new NextRequest("https://app.test/api/auth/login", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(403);
    expect(res.cookies.get("geopulse_session")).toBeUndefined();
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
  });

  it.each([DEMO_EMAIL, "OWNER@example.test"])("reserves demo and configured owner emails from public registration", async (email) => {
    const res = await register(new NextRequest("https://app.test/api/auth/register", {
      method: "POST", body: JSON.stringify({ email, password: "some-valid-password", name: "Visitor" }),
    }));
    expect(res.status).toBe(403);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("session and password verification", () => {
  it.each([
    "", "short", " ".repeat(64),
    "geopulse-commercial-dev-secret-change-in-prod-2026",
    "geopulse-dev-session-secret-change-in-prod",
    "replace-with-64-char-random-hex-secret-in-production",
    "replace_with_a_private_random_secret_before_use",
    "change-this-to-a-64-char-random-secret",
    "change-me-before-production-session-signing-secret",
    "placeholder-session-secret-for-production-template",
    "your_session_secret_should_be_private_and_random",
    "default-session-secret-must-be-overridden",
    "sample-session-secret-template-not-for-production",
    "x".repeat(64), "0".repeat(64),
  ])("fails closed for invalid production session configuration", (secret) => {
    const token = signSessionToken(owner.id);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", secret);
    expect(() => signSessionToken(owner.id)).toThrow("SESSION_SECRET");
    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects the published environment template secret in production", () => {
    const template = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const placeholder = template.match(/^SESSION_SECRET=(.*)$/m)?.[1];
    expect(placeholder).toBeTruthy();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", placeholder!);
    expect(() => getSessionSecret()).toThrow("defaults and placeholders");
  });

  it("keeps a private 64-character production secret unchanged and signs valid sessions", () => {
    const secret = crypto.randomBytes(32).toString("hex");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", secret);
    expect(getSessionSecret() === secret).toBe(true);
    expect(verifySessionToken(signSessionToken(owner.id))).toBe(owner.id);
  });

  it("rejects forged, expired and future-issued sessions", () => {
    const signedAt = (issuedAt: number) => {
      const payload = `${owner.id}.${issuedAt}`;
      return `${payload}.${crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex")}`;
    };
    const now = Math.floor(Date.now() / 1000);
    expect(verifySessionToken(signSessionToken(owner.id))).toBe(owner.id);
    expect(verifySessionToken(signedAt(now - 15 * 86400))).toBeNull();
    expect(verifySessionToken(signedAt(now + 3600))).toBeNull();
    expect(verifySessionToken(`${signSessionToken(owner.id)}x`)).toBeNull();
  });

  it("does not create users when production signing configuration is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    const res = await register(new NextRequest("https://app.test/api/auth/register", {
      method: "POST", body: JSON.stringify({ email: "visitor@example.test", password: "valid-password", name: "Visitor" }),
    }));
    expect(res.status).toBe(500);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("verifies valid password hashes and rejects malformed hashes without exceptions", () => {
    const stored = hashPassword("correct-password");
    expect(verifyPassword("correct-password", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
    for (const malformed of ["", "salt:hash", ":", `${stored}:extra`, "a".repeat(1024)]) {
      expect(verifyPassword("correct-password", malformed)).toBe(false);
    }
  });
});
