import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  auditLeadAndGenerateDraft,
  createOutreachLead,
  deleteOutreachLead,
  listOutreachLeads,
  updateOutreachLead,
} from "@/lib/outreach";

const createLeadSchema = z.object({
  companyName: z.string().min(1, "请填写公司或机构名称").max(120),
  contactName: z.string().max(80).optional().default(""),
  email: z.string().email("请输入合法的收件人邮箱"),
  websiteUrl: z.string().max(260).optional().default(""),
  segment: z
    .enum(["agency_white_label", "saas_growth", "strategic_acquirer"])
    .optional()
    .default("agency_white_label"),
});

const bulkSchema = z.object({
  bulkText: z.string().min(5).max(20000),
  segment: z
    .enum(["agency_white_label", "saas_growth", "strategic_acquirer"])
    .optional()
    .default("agency_white_label"),
});

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ leads: listOutreachLeads(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();

  if (typeof body.bulkText === "string") {
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "批量导入文本格式无效" }, { status: 400 });
    }
    const lines = parsed.data.bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 50);

    const created = [];
    for (const line of lines) {
      // Supported format: Company, ContactName, Email, WebsiteUrl (comma or tab separated)
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const emailPart = parts.find((p) => p.includes("@")) || "";
      if (!emailPart || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPart)) continue;
      const urlPart = parts.find((p) => /^https?:\/\//i.test(p) || (p.includes(".") && !p.includes("@") && p !== parts[0])) || "";
      const companyName = parts[0] && parts[0] !== emailPart ? parts[0] : emailPart.split("@")[1];
      const contactName =
        parts[1] && parts[1] !== emailPart && parts[1] !== urlPart ? parts[1] : "";

      created.push(
        createOutreachLead(user.id, {
          companyName,
          contactName,
          email: emailPart,
          websiteUrl: urlPart,
          segment: parsed.data.segment,
        })
      );
    }

    if (created.length === 0) {
      return NextResponse.json(
        { error: "未解析到有效邮箱，请按「公司名, 联系人, 邮箱, 官网URL」每行一条填写" },
        { status: 400 }
      );
    }
    return NextResponse.json({ createdCount: created.length, leads: created }, { status: 201 });
  }

  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "线索参数无效" },
      { status: 400 }
    );
  }
  const lead = createOutreachLead(user.id, parsed.data);
  return NextResponse.json({ lead }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = (await req.json()) as {
    id?: string;
    action?: "audit_and_draft" | "update";
    companyName?: string;
    contactName?: string;
    websiteUrl?: string;
    segment?: "agency_white_label" | "saas_growth" | "strategic_acquirer";
    emailSubject?: string;
    emailBody?: string;
    status?: "new" | "audited" | "emailed" | "replied" | "converted" | "unsubscribed";
  };

  if (!body.id) {
    return NextResponse.json({ error: "缺少线索 id" }, { status: 400 });
  }

  if (body.action === "audit_and_draft") {
    const res = await auditLeadAndGenerateDraft(body.id, user.id, getBaseUrl(req));
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ lead: res.lead });
  }

  const updated = updateOutreachLead(body.id, user.id, {
    companyName: body.companyName,
    contactName: body.contactName,
    websiteUrl: body.websiteUrl,
    segment: body.segment,
    emailSubject: body.emailSubject,
    emailBody: body.emailBody,
    status: body.status,
  });
  if (!updated) return NextResponse.json({ error: "线索不存在" }, { status: 404 });
  return NextResponse.json({ lead: updated });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  return NextResponse.json({ ok: deleteOutreachLead(id, user.id) });
}
