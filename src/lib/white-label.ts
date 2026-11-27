import crypto from "crypto";

import { getSessionSecret } from "./auth";

function getReportSecret(): string {
  return getSessionSecret();
}

export function signWhiteLabelReportToken(brandId: string, ownerUserId: string): string {
  const hmac = crypto
    .createHmac("sha256", getReportSecret())
    .update(`wl-report:${brandId}:${ownerUserId}`)
    .digest("base64url");
  return hmac.slice(0, 32);
}

export function verifyWhiteLabelReportToken(
  brandId: string,
  ownerUserId: string,
  token: string
): boolean {
  if (!token || token.length < 16) return false;
  const expected = signWhiteLabelReportToken(brandId, ownerUserId);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(token.trim(), "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildShareableReportUrl(
  baseUrl: string,
  brandId: string,
  ownerUserId: string
): string {
  const token = signWhiteLabelReportToken(brandId, ownerUserId);
  return `${baseUrl.replace(/\/$/, "")}/r/${encodeURIComponent(brandId)}?token=${encodeURIComponent(token)}`;
}
