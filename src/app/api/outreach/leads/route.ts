import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  approveOutreachLead,
  auditLeadAndGenerateDraft,
  createOutreachLead,
  deleteOutreachLead,
  draftFollowupForLead,
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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({error:"请求参数无效"},{status:400});

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

  const rawBody = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return NextResponse.json({error:"请求参数无效"},{status:400});
  const body = rawBody as {
    id?: string;
    ids?: string[];
    action?: "audit_and_draft" | "batch_audit" | "draft_followup" | "approve" | "update";
    consentStatus?: "unknown" | "opted_in";
    consentEvidence?: string;
    expectedSnapshot?: unknown;
    companyName?: string;
    contactName?: string;
    websiteUrl?: string;
    segment?: "agency_white_label" | "saas_growth" | "strategic_acquirer";
    emailSubject?: string;
    emailBody?: string;
    status?: "new" | "audited" | "emailed" | "replied" | "converted" | "unsubscribed";
  };

  if (body.action === "batch_audit") {
    const parsedIds = z.array(z.string().min(1).max(100)).min(1).max(8).safeParse(body.ids);
    if (!parsedIds.success) return NextResponse.json({error:"请选择1至8条线索进行体检"},{status:400});
    const baseUrl = getBaseUrl(req);
    const allLeads = listOutreachLeads(user.id);
    const targetLeads = allLeads.filter(l => parsedIds.data.includes(l.id));

    if (targetLeads.length === 0) {
      return NextResponse.json({ error: "没有需要体检的新线索（请确保填写了官网 URL）" }, { status: 400 });
    }

    let okCount = 0;
    let failCount = 0;
    for (const lead of targetLeads) {
      const r = await auditLeadAndGenerateDraft(lead.id, user.id, baseUrl);
      if (r.ok) okCount += 1;
      else failCount += 1;
    }
    return NextResponse.json({
      ok: true,
      auditedCount: okCount,
      failedCount: failCount,
      leads: listOutreachLeads(user.id),
    });
  }

  if (!body.id) {
    return NextResponse.json({ error: "缺少线索 id" }, { status: 400 });
  }

  if (body.action === "audit_and_draft") {
    const res = await auditLeadAndGenerateDraft(body.id, user.id, getBaseUrl(req));
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ lead: res.lead });
  }

  if (body.action === "draft_followup") {
    const res = draftFollowupForLead(body.id, user.id, getBaseUrl(req));
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ lead: res.lead });
  }

  if (body.action === "approve") {
    const snapshot = z.object({email:z.string().email(), emailSubject:z.string().max(200), emailBody:z.string().max(20000), consentStatus:z.enum(["unknown","opted_in"]), consentEvidence:z.string().max(1000)}).safeParse(body.expectedSnapshot);
    if (!snapshot.success) return NextResponse.json({error:"缺少已检查的草稿快照，请重新打开审核"},{status:400});
    const result = approveOutreachLead(body.id, user.id, snapshot.data);
    return NextResponse.json(result, {status:result.ok ? 200 : 400});
  }
  const fields = z.object({
    companyName:z.string().min(1).max(120).optional(), contactName:z.string().max(80).optional(),
    websiteUrl:z.string().max(260).optional(), segment:z.enum(["agency_white_label","saas_growth","strategic_acquirer"]).optional(),
    emailSubject:z.string().max(200).refine(v=>!/[\r\n]/.test(v)).optional(), emailBody:z.string().max(20000).optional(),
    status:z.enum(["new","audited","emailed","replied","converted","unsubscribed"]).optional(),
    consentStatus:z.enum(["unknown","opted_in"]).optional(), consentEvidence:z.string().max(1000).optional()
  }).safeParse(body);
  if (!fields.success) return NextResponse.json({error:"线索更新参数无效"},{status:400});
  const updated = updateOutreachLead(body.id, user.id, fields.data);
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
