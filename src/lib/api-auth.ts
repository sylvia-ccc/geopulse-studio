import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "./auth";
import { findUserByApiKey, findUserById, type UserWithSecret } from "./db";

export async function requireAuthUser(req: NextRequest): Promise<UserWithSecret | null> {
  // 1. Commercial API Key header support (for external integrations / webhooks / scripts)
  const apiKeyHeader =
    req.headers.get("x-api-key") ||
    (req.headers.get("authorization")?.startsWith("Bearer gp_live_")
      ? req.headers.get("authorization")!.slice("Bearer ".length)
      : null);

  if (apiKeyHeader) {
    const userByKey = findUserByApiKey(apiKeyHeader);
    if (userByKey) return userByKey;
  }

  // 2. Signed HTTP-only session cookie
  const userId = await getSessionUserId();
  if (!userId) return null;
  return findUserById(userId);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "请先登录账号后再操作" }, { status: 401 });
}

export function getBaseUrl(req: NextRequest): string {
  const envBase = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}
