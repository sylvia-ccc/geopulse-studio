import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

process.env.GEOPULSE_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "geopulse-pay-ingress-")), "payment.sqlite");
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
process.env.PAYMENT_LEMONSQUEEZY_VARIANT_SKUS = JSON.stringify({ "123": "credits_100" });
const payment = await import("@/lib/payment-webhooks");
const db = await import("@/lib/db");
const route = await import("@/app/api/webhooks/payment/route");

function order(id = "order_123") {
  return {
    meta: { event_name: "order_created" }, data: { id, type: "orders", attributes: {
      user_email: "demo@geopulse.ai", status: "paid", test_mode: false, refunded: false, total: 1000,
      first_order_item: { variant_id: 123, quantity: 1 },
    } },
  };
}

function request(payload: unknown, headers: Record<string, string> = {}) {
  const raw = JSON.stringify(payload);
  return new NextRequest("https://geopulse.example/api/webhooks/payment", { method: "POST", body: raw, headers });
}

function signed(payload: unknown) {
  const signature = crypto.createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(payload)).digest("hex");
  return request(payload, { "x-signature": signature });
}

const bridge = { paymentId: "pi_canonical", eventId: "event_one", provider: "stripe", buyerEmail: "demo@geopulse.ai",
  sku: "credits_100", status: "paid", testMode: false, refunded: false, amountTotal: 1000, quantity: 1 };

describe("Payment ingress validation and canonical receipts", () => {
  it("rejects unknown product names rather than guessing a paid entitlement", () => {
    for (const sku of ["", "mystery", "10000 credits", "agency training", "pro", "credits_999"]) {
      expect(() => payment.normalizeSkuFromName(sku)).toThrow("Unknown payment SKU");
    }
    expect(payment.normalizeSkuFromName("credits_100")).toBe("credits_100");
  });

  it("rejects unpaid, free, refunded, test, and unstable-ID orders", async () => {
    const cases = [
      (p: ReturnType<typeof order>) => { p.data.attributes.status = "pending"; },
      (p: ReturnType<typeof order>) => { p.data.attributes.test_mode = true; },
      (p: ReturnType<typeof order>) => { p.data.attributes.refunded = true; },
      (p: ReturnType<typeof order>) => { p.data.attributes.total = 0; },
      (p: ReturnType<typeof order>) => { p.data.id = ""; },
      (p: ReturnType<typeof order>) => { p.data.attributes.first_order_item.variant_id = 999; },
      (p: ReturnType<typeof order>) => { p.data.attributes.first_order_item.quantity = 2; },
    ];
    const before = db.findUserByEmail("demo@geopulse.ai")!.creditsBalance;
    for (const modify of cases) {
      const payload = order(); modify(payload);
      expect((await route.POST(signed(payload))).status).toBe(400);
    }
    expect(db.findUserByEmail("demo@geopulse.ai")!.creditsBalance).toBe(before);
  });

  it("fulfills one canonical paid order once and ignores overlapping subscription notifications", async () => {
    const payload = order("order_overlap");
    const before = db.findUserByEmail("demo@geopulse.ai")!.creditsBalance;
    expect((await route.POST(signed(payload))).status).toBe(200);
    const repeated = await route.POST(signed(payload));
    expect(await repeated.json()).toMatchObject({ duplicate: true });
    for (const eventName of ["subscription_created", "subscription_payment_success"]) {
      payload.meta.event_name = eventName;
      expect(await (await route.POST(signed(payload))).json()).toMatchObject({ ignored: eventName });
    }
    expect(db.findUserByEmail("demo@geopulse.ai")!.creditsBalance).toBe(before + 100);
  });

  it("dedupes different bridge event IDs by monetary payment ID", async () => {
    const before = db.findUserByEmail("demo@geopulse.ai")!.creditsBalance;
    const headers = { "x-geopulse-webhook-secret": process.env.PAYMENT_WEBHOOK_SECRET! };
    expect((await route.POST(request(bridge, headers))).status).toBe(200);
    const second = await route.POST(request({ ...bridge, eventId: "event_two" }, headers));
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(db.findUserByEmail("demo@geopulse.ai")!.creditsBalance).toBe(before + 100);
    for (const payload of [{ ...bridge, paymentId: "" }, { ...bridge, testMode: true }, { ...bridge, status: "unpaid" }, { ...bridge, sku: "unknown" }]) {
      expect((await route.POST(request(payload, headers))).status).toBe(400);
    }
  });

  it("rejects invalid signatures even when a fallback shared-secret header is present", async () => {
    const response = await route.POST(request(order(), { "x-signature": "invalid", "x-geopulse-webhook-secret": process.env.PAYMENT_WEBHOOK_SECRET! }));
    expect(response.status).toBe(401);
    expect((await route.POST(request(bridge, { "Stripe-Signature": "t=123,v1=not-supported" }))).status).toBe(401);
  });
});
