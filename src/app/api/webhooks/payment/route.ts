import { NextRequest, NextResponse } from "next/server";
import {
  normalizeSkuFromName,
  processVerifiedPaymentEvent,
  verifyGenericWebhookSecret,
  verifyLemonSqueezySignature,
  type NormalizedPaymentEvent,
} from "@/lib/payment-webhooks";

export async function POST(req: NextRequest) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim() || "";
  if (!secret) {
    return NextResponse.json(
      { error: "服务器尚未配置 PAYMENT_WEBHOOK_SECRET，暂拒处理支付回调" },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  const lsSig = req.headers.get("x-signature") || "";
  const genericSig = req.headers.get("x-geopulse-webhook-secret") || "";

  let provider: NormalizedPaymentEvent["provider"] | null = null;
  if (lsSig && verifyLemonSqueezySignature(rawBody, lsSig, secret)) {
    provider = "lemonsqueezy";
  } else if (genericSig && verifyGenericWebhookSecret(genericSig, secret)) {
    provider = "generic";
  } else {
    return NextResponse.json({ error: "Webhook 签名校验失败" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    let eventId = "";
    let buyerEmail = "";
    let skuRaw = "";

    if (provider === "lemonsqueezy") {
      const meta = (payload.meta || {}) as Record<string, unknown>;
      const data = (payload.data || {}) as Record<string, unknown>;
      const attrs = (data.attributes || {}) as Record<string, unknown>;
      const firstItem = (attrs.first_order_item || {}) as Record<string, unknown>;

      const eventName = String(meta.event_name || "");
      if (eventName && !["order_created", "subscription_created", "subscription_payment_success"].includes(eventName)) {
        return NextResponse.json({ ok: true, ignored: eventName });
      }
      eventId = `ls_${String(data.id || Date.now())}_${eventName || "order"}`;
      buyerEmail = String(attrs.user_email || "");
      skuRaw = String(firstItem.product_name || firstItem.variant_name || attrs.variant_name || "pro");
    } else {
      eventId = String(payload.eventId || payload.id || "");
      buyerEmail = String(payload.buyerEmail || payload.email || "");
      skuRaw = String(payload.sku || payload.productName || "pro_monthly");
      if (payload.provider === "stripe") provider = "stripe";
    }

    if (!eventId || !buyerEmail) {
      return NextResponse.json({ error: "缺少 eventId 或 buyerEmail" }, { status: 400 });
    }

    const result = processVerifiedPaymentEvent({
      eventId,
      provider,
      buyerEmail,
      sku: normalizeSkuFromName(skuRaw),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook 解析失败" },
      { status: 400 }
    );
  }
}
