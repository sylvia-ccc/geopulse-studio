import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req).replace(/\/$/, "");
  const txt = `# GeoPulse Studio — AI-First Crawler Policy
User-agent: *
Allow: /
Allow: /hub
Allow: /p/
Allow: /llms.txt
Allow: /llms-full.txt
Disallow: /api/
Disallow: /studio
Disallow: /settings

# Explicitly welcome Generative Search & AI Engine Crawlers
User-agent: GPTBot
Allow: /p/
Allow: /hub
Allow: /llms.txt
Allow: /llms-full.txt

User-agent: OAI-SearchBot
Allow: /p/
Allow: /hub
Allow: /llms.txt
Allow: /llms-full.txt

User-agent: PerplexityBot
Allow: /p/
Allow: /hub
Allow: /llms.txt
Allow: /llms-full.txt

User-agent: ClaudeBot
Allow: /p/
Allow: /hub
Allow: /llms.txt
Allow: /llms-full.txt

User-agent: Google-Extended
Allow: /p/
Allow: /hub
Allow: /llms.txt
Allow: /llms-full.txt

User-agent: Bytespider
Allow: /p/
Allow: /hub
Allow: /llms.txt
Allow: /llms-full.txt

Sitemap: ${baseUrl}/sitemap.xml
# LLM Knowledge Index: ${baseUrl}/llms.txt
`;

  return new NextResponse(txt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
