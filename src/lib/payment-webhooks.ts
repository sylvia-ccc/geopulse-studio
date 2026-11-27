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

const PAYMENT_SKUS = new Set<NormalizedPaymentEvent["sku"]>([
  "pro_monthly", "enterprise_monthly", "credits_100", "credits_300", "credits_1000",
]);

export function normalizeSkuFromName(rawName: string): NormalizedPaymentEvent["sku"] {
  const sku = rawName.trim().toLowerCase() as NormalizedPaymentEvent["sku"];
  if (!PAYMENT_SKUS.has(sku)) throw new Error("Unknown payment SKU; configure an explicit canonical product mapping");
  return sku;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid payment payload object");
  return value as Record<string, unknown>;
}

function stableId(value: unknown): string {
  const id = typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(id)) throw new Error("Missing stable payment receipt ID");
  return id;
}

/** Parse only after authenticating the raw webhook. No product-name guesses. */
export function normalizeVerifiedPaymentPayload(
  payloadValue: unknown,
  ingress: "lemonsqueezy" | "generic",
  variantMapJson = process.env.PAYMENT_LEMONSQUEEZY_VARIANT_SKUS || "",
): { event: NormalizedPaymentEvent } | { ignored: string } {
  const payload = record(payloadValue);
  if (ingress === "lemonsqueezy") {
    const meta = record(payload.meta);
    const data = record(payload.data);
    const attrs = record(data.attributes);
    // Subscription lifecycle and invoice notifications overlap with the initial
    // order. Native fulfillment has exactly one canonical source: paid orders.
    if (meta.event_name !== "order_created") return { ignored: String(meta.event_name || "unsupported_event") };
    if (data.type !== "orders" || attrs.status !== "paid" || attrs.test_mode !== false || attrs.refunded !== false ||
        typeof attrs.total !== "number" || !Number.isSafeInteger(attrs.total) || attrs.total <= 0) {
      throw new Error("Only settled, non-refunded, live paid orders may be fulfilled");
    }
    const orderId = stableId(data.id);
    const item = record(attrs.first_order_item);
    if (item.quantity !== 1) throw new Error("Only single-quantity configured payment products are supported");
    const variantId = stableId(item.variant_id);
    const mapping = record(JSON.parse(variantMapJson || "{}"));
    if (!Object.hasOwn(mapping, variantId) || typeof mapping[variantId] !== "string") {
      throw new Error("Payment variant has no configured SKU mapping");
    }
    return { event: {
      // Preserve the legacy canonical order key to prevent upgrade replays.
      eventId: `ls_${orderId}_order_created`, provider: "lemonsqueezy",
      buyerEmail: typeof attrs.user_email === "string" ? attrs.user_email : "",
      sku: normalizeSkuFromName(mapping[variantId] as string),
    } };
  }
  if (payload.status !== "paid" || payload.testMode !== false || payload.refunded !== false ||
      payload.quantity !== 1 || typeof payload.amountTotal !== "number" ||
      !Number.isSafeInteger(payload.amountTotal) || payload.amountTotal <= 0) {
    throw new Error("Bridge must assert a live, settled, non-refunded single-quantity payment");
  }
  const provider = payload.provider === "stripe" ? "stripe" : payload.provider === "generic" ? "generic" : null;
  if (!provider) throw new Error("Unsupported normalized payment provider");
  const receiptId = stableId(payload.paymentId);
  if (typeof payload.sku !== "string") throw new Error("Missing canonical payment SKU");
  return { event: {
    // Different provider event IDs for the same monetary receipt map to one key.
    eventId: `${provider}_payment_${receiptId}`, provider,
    buyerEmail: typeof payload.buyerEmail === "string" ? payload.buyerEmail : "",
    sku: normalizeSkuFromName(payload.sku),
  } };
}

export function processVerifiedPaymentEvent(event: NormalizedPaymentEvent): {
  ok: true;
  duplicate?: boolean;
  actionTaken: string;
  generatedCode?: string;
} {
  if (!PAYMENT_SKUS.has(event.sku)) throw new Error("Unknown payment SKU");
  const db = getDb();
  const cleanEmail = event.buyerEmail.toLowerCase().trim();
  if (!event.eventId.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Payment event requires a stable event ID and valid buyer email");
  }
  // The receipt insert obtains SQLite's write lock before reading or changing
  // balances. Receipt and fulfillment commit together, including code minting.
  db.exec("SAVEPOINT payment_fulfillment");
  try {
    const claimed = db.prepare(`
      INSERT INTO payment_webhook_events (event_id, provider, buyer_email, product_sku, action_taken, created_at)
      VALUES (?, ?, ?, ?, 'processing', ?)
      ON CONFLICT(event_id) DO NOTHING
    `).run(event.eventId, event.provider, cleanEmail, event.sku, new Date().toISOString());
    if (claimed.changes === 0) {
      const existing = db.prepare("SELECT * FROM payment_webhook_events WHERE event_id = ?").get(event.eventId)!;
      if (existing.provider !== event.provider || existing.buyer_email !== cleanEmail || existing.product_sku !== event.sku) {
        throw new Error("Payment event ID conflicts with a different verified purchase");
      }
      db.exec("RELEASE SAVEPOINT payment_fulfillment");
      return { ok: true, duplicate: true, actionTaken: String(existing.action_taken) };
    }
    const user = findUserByEmail(cleanEmail);
    let actionTaken = "";
    let generatedCode: string | undefined;

    if (event.sku.startsWith("credits_")) {
      const amount = event.sku === "credits_1000" ? 1000 : event.sku === "credits_300" ? 300 : 100;
      if (user) {
        const creditResult = adjustUserCredits({
          userId: user.id,
          delta: amount,
          reason: `在线支付自动到账 (${event.provider} · ${event.sku})`,
          refId: event.eventId,
        });
        if (!creditResult.ok) throw new Error(creditResult.error);
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
        const creditResult = adjustUserCredits({
          userId: user.id,
          delta: bonusCredits,
          reason: `${plan.toUpperCase()} 支付自动开通附赠积分 (${event.provider})`,
          refId: event.eventId,
        });
        if (!creditResult.ok) throw new Error(creditResult.error);
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

    db.prepare("UPDATE payment_webhook_events SET action_taken = ? WHERE event_id = ?").run(
      actionTaken, event.eventId,
    );
    db.exec("RELEASE SAVEPOINT payment_fulfillment");
    return { ok: true, actionTaken, generatedCode };
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT payment_fulfillment");
    db.exec("RELEASE SAVEPOINT payment_fulfillment");
    throw error;
  }
}
