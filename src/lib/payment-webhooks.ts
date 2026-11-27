import crypto from "crypto";
import { createRedemptionCodes, findUserByEmail, getDb } from "./db";
import { adjustUserCredits } from "./marketplace";

export interface NormalizedPaymentEvent {
  eventId: string;
  provider: "lemonsqueezy" | "stripe" | "generic";
  buyerEmail: string;
  sku: "pro_monthly" | "enterprise_monthly" | "credits_100" | "credits_300" | "credits_1000";
}

export function verifyLemonSqueezySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signatureHeader.trim(), "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyGenericWebhookSecret(headerVal: string, secret: string): boolean {
  if (!headerVal || !secret) return false;
  const a = Buffer.from(secret.trim(), "utf-8");
  const b = Buffer.from(headerVal.trim(), "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function normalizeSkuFromName(rawName: string): NormalizedPaymentEvent["sku"] {
  const lower = (rawName || "").toLowerCase();
  if (lower.includes("1000") || lower.includes("credits_1000")) return "credits_1000";
  if (lower.includes("300") || lower.includes("credits_300")) return "credits_300";
  if (lower.includes("credit") || lower.includes("blast") || lower.includes("100")) return "credits_100";
  if (lower.includes("enterprise") || lower.includes("agency") || lower.includes("white")) {
    return "enterprise_monthly";
  }
  return "pro_monthly";
}

export function processVerifiedPaymentEvent(event: NormalizedPaymentEvent): {
  ok: true;
  duplicate?: boolean;
  actionTaken: string;
  generatedCode?: string;
} {
  const db = getDb();
  const existing = db
    .prepare("SELECT event_id, action_taken FROM payment_webhook_events WHERE event_id = ?")
    .get(event.eventId);

  if (existing) {
    return {
      ok: true,
      duplicate: true,
      actionTaken: String(existing.action_taken),
    };
  }

  const cleanEmail = event.buyerEmail.toLowerCase().trim();
  const user = findUserByEmail(cleanEmail);
  const now = new Date().toISOString();
  let actionTaken = "";
  let generatedCode: string | undefined;

  if (event.sku.startsWith("credits_")) {
    const amount = event.sku === "credits_1000" ? 1000 : event.sku === "credits_300" ? 300 : 100;
    if (user) {
      adjustUserCredits({
        userId: user.id,
        delta: amount,
        reason: `在线支付自动到账 (${event.provider} · ${event.sku})`,
        refId: event.eventId,
      });
      actionTaken = `credited_user:${user.id}:+${amount}`;
    } else {
      const [code] = createRedemptionCodes({
        codeType: "credits",
        creditsAmount: amount,
        count: 1,
        note: `Auto-minted for ${cleanEmail} (${event.provider} ${event.eventId})`,
      });
      generatedCode = code.code;
      actionTaken = `minted_credit_code:${code.code}:+${amount}`;
    }
  } else {
    const plan = event.sku === "enterprise_monthly" ? "enterprise" : "pro";
    const bonusCredits = plan === "enterprise" ? 300 : 50;
    if (user) {
      const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
      db.prepare("UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?").run(
        plan,
        expiresAt,
        user.id
      );
      adjustUserCredits({
        userId: user.id,
        delta: bonusCredits,
        reason: `${plan.toUpperCase()} 支付自动开通附赠积分 (${event.provider})`,
        refId: event.eventId,
      });
      actionTaken = `upgraded_user:${user.id}:${plan}:+${bonusCredits}`;
    } else {
      const [code] = createRedemptionCodes({
        codeType: "plan",
        plan,
        durationDays: 30,
        creditsAmount: bonusCredits,
        count: 1,
        note: `Auto-minted ${plan} for ${cleanEmail} (${event.provider} ${event.eventId})`,
      });
      generatedCode = code.code;
      actionTaken = `minted_plan_code:${code.code}:${plan}`;
    }
  }

  db.prepare(
    `INSERT INTO payment_webhook_events (event_id, provider, buyer_email, product_sku, action_taken, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(event.eventId, event.provider, cleanEmail, event.sku, actionTaken, now);

  return { ok: true, actionTaken, generatedCode };
}
