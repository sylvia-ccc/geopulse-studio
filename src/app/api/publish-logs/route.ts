import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { listPublishLogs } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ logs: listPublishLogs(user.id, 40) });
}
