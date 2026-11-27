import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getOutreachEmailConfig, sanitizeOutreachConfig, sendOutreachEmailToLead, updateOutreachEmailConfig, listOutreachSendAttempts } from "@/lib/outreach";

async function admin(req:NextRequest) {
  const user=await requireAuthUser(req);
  return user?.role === "admin" && user.email !== "demo@geopulse.ai" ? user : null;
}
const denied=()=>NextResponse.json({error:"共享邮件配置和发送仅限站点管理员"},{status:403});
export async function GET(req:NextRequest) {
  const user=await admin(req); if(!user) return denied();
  return NextResponse.json({config:sanitizeOutreachConfig(getOutreachEmailConfig()), attempts:listOutreachSendAttempts(user.id)});
}
const configSchema=z.object({
  provider:z.enum(["none","resend","brevo","webhook"]).optional(),
  fromName:z.string().max(80).refine(v=>!/[\r\n<>]/.test(v)).optional(),
  fromEmail:z.string().email().max(120).optional(), replyTo:z.union([z.literal(""),z.string().email()]).optional(),
  webhookUrl:z.string().max(300).optional(), dailyLimit:z.number().int().min(1).max(50).optional(), apiKey:z.string().max(300).optional()
});
export async function PATCH(req:NextRequest) {
  if(!await admin(req)) return denied();
  const parsed=configSchema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"邮件配置参数无效"},{status:400});
  return NextResponse.json({config:updateOutreachEmailConfig(parsed.data)});
}
const itemSchema=z.object({leadId:z.string().min(1).max(100),approvalHash:z.string().regex(/^[a-f0-9]{64}$/)});
const sendSchema=z.union([itemSchema,z.object({items:z.array(itemSchema).min(1).max(20)})]);
export async function POST(req:NextRequest) {
  const user=await requireAuthUser(req); if(!user) return unauthorizedResponse();
  if(user.role!=="admin" || user.email==="demo@geopulse.ai") return denied();
  const parsed=sendSchema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"请提交已审核草稿的 leadId 和 approvalHash（最多20封）"},{status:400});
  const items="items" in parsed.data ? parsed.data.items : [parsed.data];
  const results=[];
  for(const [index,item] of items.entries()) {
    if(index>0) await new Promise(r=>setTimeout(r,1200));
    const result=await sendOutreachEmailToLead({...item,userId:user.id,baseUrl:getBaseUrl(req)});
    results.push({leadId:item.leadId,...result});
  }
  if(!("items" in parsed.data)) {
    const result=results[0]; return NextResponse.json(result,{status:result.ok?200:400});
  }
  return NextResponse.json({ok:results.every(r=>r.ok),sentCount:results.filter(r=>r.ok).length,failedCount:results.filter(r=>!r.ok).length,results,config:sanitizeOutreachConfig(getOutreachEmailConfig())});
}
