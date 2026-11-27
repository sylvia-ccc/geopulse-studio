import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl } from "@/lib/api-auth";
import { captureInboundAuditLead } from "@/lib/outreach";
import { verifyAuditReceipt } from "@/lib/telemetry";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const captureSchema = z.object({
  email: z.string().trim().max(254).email("请输入有效的接收邮箱"),
  consent: z.literal(true, { errorMap: () => ({ message: "请先同意保存邮箱和本次体检结果，以便联系你提供修复建议" }) }),
  auditToken: z.string().min(1, "请先完成体检").max(8192),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit({ key: `lead-cap:${ip}`, limit: 6, windowMs: 10 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "提交过于频繁，请稍后再试" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = captureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请输入合法的邮箱地址" },
      { status: 400 }
    );
  }

  const receipt = verifyAuditReceipt(parsed.data.auditToken);
  if (!receipt) {
    return NextResponse.json({ error: "体检结果已过期或无效，请重新运行体检后提交" }, { status: 400 });
  }
  const lead = captureInboundAuditLead({
    email: parsed.data.email,
    ...receipt,
    consent: true,
    consentEvidence: "public-audit-contact-v1",
    telemetryHeaders: req.headers,
    baseUrl: getBaseUrl(req),
  });

  if (!lead) {
    return NextResponse.json({ error: "线索保存暂不可用" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "已保存你的联系请求与本次体检结果。团队可据此联系你提供修复建议；本次提交不会自动发送邮件。",
  });
}
