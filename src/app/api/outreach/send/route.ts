import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  getOutreachEmailConfig,
  sanitizeOutreachConfig,
  sendOutreachEmailToLead,
  updateOutreachEmailConfig,
} from "@/lib/outreach";

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({
    config: sanitizeOutreachConfig(getOutreachEmailConfig(user.id)),
  });
}

const configSchema = z.object({
  provider: z.enum(["none", "resend", "brevo", "webhook"]).optional(),
  fromName: z.string().max(80).optional(),
  fromEmail: z.string().max(120).optional(),
  replyTo: z.string().max(120).optional(),
  webhookUrl: z.string().max(300).optional(),
  dailyLimit: z.number().int().min(1).max(50).optional(),
  apiKey: z.string().max(300).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "邮件配置参数无效" }, { status: 400 });
  }
  const config = updateOutreachEmailConfig(parsed.data);
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = (await req.json()) as { leadId?: string };
  if (!body.leadId) {
    return NextResponse.json({ error: "缺少 leadId" }, { status: 400 });
  }

  const res = await sendOutreachEmailToLead({
    leadId: body.leadId,
    userId: user.id,
    baseUrl: getBaseUrl(req),
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json(res);
}
