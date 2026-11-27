import { NextRequest, NextResponse } from "next/server";
import { markEmailUnsubscribed, verifyUnsubscribeToken } from "@/lib/outreach";
function page(message:string, content:string,status=200) {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head><body style="font:16px Arial;max-width:560px;margin:80px auto;padding:24px"><h1>${message}</h1>${content}</body></html>`,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
function valid(req:NextRequest) {
  const email=(req.nextUrl.searchParams.get("email")||"").trim().toLowerCase();
  const token=req.nextUrl.searchParams.get("token")||"";
  return email && verifyUnsubscribeToken(email,token) ? email : null;
}
// GET renders a confirmation so link preview scanners cannot unsubscribe a recipient.
export async function GET(req:NextRequest) {
  if(!valid(req)) return page("Invalid unsubscribe link","<p>Please use the link in your email.</p>",400);
  return page("Email preferences",'<p>Stop receiving GeoPulse marketing and audit follow-ups.</p><form method="post"><button type="submit">Confirm unsubscribe</button></form>');
}
export async function POST(req:NextRequest) {
  const email=valid(req);
  if(!email) return page("Invalid unsubscribe link","<p>Please use the link in your email.</p>",400);
  markEmailUnsubscribed(email);
  return page("Unsubscribed","<p>Your address has been suppressed from future outreach.</p>");
}
