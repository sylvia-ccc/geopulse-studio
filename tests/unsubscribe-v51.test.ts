import {describe,it,expect,vi} from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
process.env.GEOPULSE_DB_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"geopulse-unsub51-")),"unsub.db");
const out=await import("@/lib/outreach");
const {NextRequest}=await import("next/server");
const route=await import("@/app/api/outreach/unsubscribe/route");
describe("Unsubscribe intent",()=>{
  it("renders GET confirmation without changing suppression, POST confirms it, rejects forged tokens",async()=>{
    const email="unsubscribe-scanner@example.com";
    const url=out.buildUnsubscribeUrl("https://geo.example",email);
    expect((await route.GET(new NextRequest(url))).status).toBe(200);
    expect(out.isEmailUnsubscribed(email)).toBe(false);
    expect((await route.POST(new NextRequest(url,{method:"POST"}))).status).toBe(200);
    expect(out.isEmailUnsubscribed(email)).toBe(true);
    expect((await route.POST(new NextRequest(url.replace(/token=.*/,"token=forged"),{method:"POST"}))).status).toBe(400);
  });
});
