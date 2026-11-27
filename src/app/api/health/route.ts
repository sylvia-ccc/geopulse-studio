import { NextResponse } from "next/server";
import { dbHealthCheck } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbOk = dbHealthCheck();
  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      service: "geopulse-studio",
      version: "5.1.1",
      database: dbOk ? "connected" : "error",
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 }
  );
}
