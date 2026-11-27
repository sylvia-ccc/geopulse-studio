import { ImageResponse } from "next/og";
import { createElement } from "react";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") || "GeoPulse Studio").slice(0, 100);
  return new ImageResponse(
    createElement("div", {
      style: { display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", padding: "72px 88px", background: "linear-gradient(130deg, #0f172a, #312e81)", color: "white", fontFamily: "sans-serif" },
    },
    createElement("div", { style: { color: "#6ee7b7", fontSize: 24, marginBottom: 30 } }, "OPEN SOURCE · GENERATIVE ENGINE OPTIMIZATION"),
    createElement("div", { style: { fontSize: title.length > 60 ? 42 : 58, fontWeight: 700, lineHeight: 1.2, overflowWrap: "break-word" } }, title),
    createElement("div", { style: { fontSize: 26, color: "#cbd5e1", marginTop: 32 } }, "Audit crawler access. Publish structured content."),
    createElement("div", { style: { fontSize: 24, color: "#a5b4fc", marginTop: 42 } }, "GeoPulse Studio · Free website audit")),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
