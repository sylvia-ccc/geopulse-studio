import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
process.env.GEOPULSE_DB_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"geopulse-mail51-")),"mail.db");
process.env.ADMIN_EMAIL="owner@mail51.example";
const db=await import("@/lib/db");
const out=await import("@/lib/outreach");
let ownerId:string;
function prepared(email="client@permission.example") {
  const lead=out.createOutreachLead(ownerId,{companyName:"Client",email,websiteUrl:"https://example.com"});
  out.updateOutreachLead(lead.id,ownerId,{emailSubject:"Requested technical audit",emailBody:'Review https://example.com/\" onmouseover=\"evil <script>bad</script>',consentStatus:"opted_in",consentEvidence:"Recipient requested audit by email on 2026-11-26"});
  const approved=out.approveOutreachLead(lead.id,ownerId);
  if(!approved.ok) throw Error(approved.error);
  return approved.lead;
}
function send(lead:ReturnType<typeof prepared>) {return out.sendOutreachEmailToLead({leadId:lead.id,userId:ownerId,baseUrl:"https://geo.example",approvalHash:lead.approvalHash});}
beforeAll(()=>{ownerId=db.provisionConfiguredOwner({email:process.env.ADMIN_EMAIL!,password:"test-password-long-enough",name:"Owner",migrateDemoWorkspace:false}).user.id;});
beforeEach(()=>{
  db.getDb().exec("DELETE FROM email_send_attempts; DELETE FROM outreach_leads;");
  out.updateOutreachEmailConfig({provider:"resend",apiKey:"unit-test-provider-key",fromEmail:"hello@sender.example",dailyLimit:20});
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"message-1"}),{status:200})));
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("Reviewed outreach durable send ledger",()=>{
  it("requires recipient permission and content approval, invalidates approval when edited",async()=>{
    const raw=out.createOutreachLead(ownerId,{companyName:"Cold",email:"cold@unknown.example"});
    out.updateOutreachLead(raw.id,ownerId,{emailSubject:"Hi",emailBody:"Draft"});
    expect(out.approveOutreachLead(raw.id,ownerId).ok).toBe(false);
    const lead=prepared();
    expect((await out.sendOutreachEmailToLead({leadId:lead.id,userId:ownerId,baseUrl:"https://geo.example"})).ok).toBe(false);
    out.updateOutreachLead(lead.id,ownerId,{emailBody:"Changed after review"});
    const result=await send(lead);expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects stale reviewed snapshot from another tab",()=>{
    const lead=prepared();
    const result=out.approveOutreachLead(lead.id,ownerId,{...lead,emailBody:"Unseen old body"});
    expect(result.ok).toBe(false);
  });
  it("deduplicates concurrent attempts for same approved version",async()=>{
    const lead=prepared();
    const results=await Promise.all([send(lead),send(lead)]);
    expect(results.some(r=>r.ok)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(out.countOutreachSentToday()).toBe(1);
    expect((await send(lead)).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains global daily quota after deleting lead and across users",async()=>{
    out.updateOutreachEmailConfig({dailyLimit:1});
    const lead=prepared();expect((await send(lead)).ok).toBe(true);
    out.deleteOutreachLead(lead.id,ownerId);
    vi.setSystemTime(Date.now()+2000);
    const next=prepared("second@permission.example");
    const result=await send(next);
    expect(result.ok).toBe(false);
    expect(out.countOutreachSentToday()).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains separate repeated-send history and throttles parallel distinct recipients",async()=>{
    const first=prepared();const other=prepared("other@permission.example");
    const results=await Promise.all([send(first),send(other)]);
    expect(results.filter(r=>r.ok)).toHaveLength(1);
    vi.setSystemTime(Date.now()+2000);
    out.updateOutreachLead(first.id,ownerId,{emailBody:"Requested follow-up content"});
    const approval=out.approveOutreachLead(first.id,ownerId);if(!approval.ok) throw Error(approval.error);
    expect((await send(approval.lead)).ok).toBe(true);
    expect(out.countOutreachSentToday()).toBe(2);
  });
  it("records ambiguous timeout and never retries it automatically",async()=>{
    const lead=prepared();vi.mocked(fetch).mockRejectedValueOnce(new Error("Request timed out"));
    expect((await send(lead)).ok).toBe(false);
    vi.setSystemTime(Date.now()+2000);
    expect((await send(lead)).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(out.listOutreachSendAttempts(ownerId)[0].status).toBe("unknown");
  });
  it("records provider rejection, safely escapes email HTML and sends idempotency key",async()=>{
    const lead=prepared();vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({message:"domain unverified"}),{status:403}));
    expect((await send(lead)).ok).toBe(false);
    expect(out.listOutreachSendAttempts(ownerId)[0].status).toBe("failed");
    const init=vi.mocked(fetch).mock.calls[0][1]!;
    const payload=JSON.parse(init.body as string);
    expect(payload.html).not.toContain("<script>");expect(payload.html).not.toContain(' onmouseover="');
    expect(payload.html).toContain('<a href="https://example.com/">');
    expect((init.headers as Record<string,string>)["Idempotency-Key"]).toBeTruthy();
  });
  it("enforces suppression independent of lead deletion",async()=>{
    const lead=prepared();out.markEmailUnsubscribed(lead.email);out.deleteOutreachLead(lead.id,ownerId);
    const recreated=out.createOutreachLead(ownerId,{companyName:"Client",email:lead.email});
    expect(recreated.unsubscribed).toBe(true);expect(out.approveOutreachLead(recreated.id,ownerId).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not manufacture clicks on inbound capture and keeps client unsubscribe",()=>{
    const lead=out.captureInboundAuditLead({email:"inbound@permission.example",websiteUrl:"https://example.com",baseUrl:"https://geo.example",consent:true,auditScore:70});
    expect(lead?.clickCount).toBe(0);expect(lead?.consentStatus).toBe("opted_in");
    out.markEmailUnsubscribed(lead!.email);
    expect(out.captureInboundAuditLead({email:lead!.email,websiteUrl:"https://example.com",baseUrl:"https://geo.example",consent:true})?.unsubscribed).toBe(true);
  });
  it("rejects tenant attempting to use global provider key",async()=>{
    const user=db.createUser({email:"tenant@mail51.example",password:"another-valid-password",name:"Tenant"});
    const lead=out.createOutreachLead(user.id,{companyName:"Tenant",email:"recipient@example.com"});
    out.updateOutreachLead(lead.id,user.id,{emailSubject:"Requested",emailBody:"Audit",consentStatus:"opted_in",consentEvidence:"Requested"});
    const approved=out.approveOutreachLead(lead.id,user.id);if(!approved.ok) throw Error(approved.error);
    expect((await out.sendOutreachEmailToLead({leadId:lead.id,userId:user.id,baseUrl:"https://geo.example",approvalHash:approved.lead.approvalHash})).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
