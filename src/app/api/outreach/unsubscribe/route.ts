import { NextRequest, NextResponse } from "next/server";
import { markEmailUnsubscribed, verifyUnsubscribeToken } from "@/lib/outreach";

function htmlPage(title: string, message: string, ok: boolean) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
  .card { max-width: 460px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 8px 24px rgba(15,23,42,.06); }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; background: ${ok ? "#ecfdf5" : "#fef2f2"}; color: ${ok ? "#047857" : "#b91c1c"}; }
  h1 { margin: 14px 0 8px; font-size: 20px; }
  p { margin: 0; font-size: 14px; color: #475569; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">${ok ? "Unsubscribed" : "Invalid Link"}</span>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const token = (req.nextUrl.searchParams.get("token") || "").trim();

  if (!email || !verifyUnsubscribeToken(email, token)) {
    return htmlPage(
      "Invalid Unsubscribe Link",
      "The unsubscribe token is missing or invalid. Please check the link from your email.",
      false
    );
  }

  markEmailUnsubscribed(email);
  return htmlPage(
    "You have been unsubscribed",
    `${email} has been permanently added to our opt-out list and will no longer receive AI visibility audit emails from this platform.`,
    true
  );
}
