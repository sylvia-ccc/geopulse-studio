import { NextRequest, NextResponse } from "next/server";
import {
  normalizeVerifiedPaymentPayload,
  processVerifiedPaymentEvent,
  verifyGenericWebhookSecret,
  verifyLemonSqueezySignature,
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
  if (Buffer.byteLength(rawBody, "utf8") > 131072) {
    return NextResponse.json({ error: "Webhook payload too large" }, { status: 413 });
  }
  const lsSig = req.headers.get("x-signature") || "";
  const genericSig = req.headers.get("x-geopulse-webhook-secret") || "";

  let ingress: "lemonsqueezy" | "generic";
  // An invalid provider signature must never fall back to a different verifier.
  if (lsSig) {
    if (!verifyLemonSqueezySignature(rawBody, lsSig, secret)) {
      return NextResponse.json({ error: "Webhook 签名校验失败" }, { status: 401 });
    }
    ingress = "lemonsqueezy";
  } else if (verifyGenericWebhookSecret(genericSig, secret)) {
    ingress = "generic";
  } else {
    return NextResponse.json({ error: "Webhook 签名校验失败" }, { status: 401 });
  }

  try {
    const normalized = normalizeVerifiedPaymentPayload(JSON.parse(rawBody), ingress);
    if ("ignored" in normalized) return NextResponse.json({ ok: true, ignored: normalized.ignored });
    const result = processVerifiedPaymentEvent(normalized.event);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook 解析失败" },
      { status: 400 }
    );
  }
}
