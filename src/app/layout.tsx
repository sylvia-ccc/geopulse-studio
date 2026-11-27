import type { Metadata } from "next";
import "./globals.css";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://geo.workagentpro.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "GeoPulse Studio — Open-Source GEO & Global AI Search Publishing Engine",
    template: "%s | GeoPulse Studio",
  },
  description:
    "Open-source commercial Generative Engine Optimization (GEO) platform: free 3s AI crawler audit (/audit), 8-dim bilingual scoring, /llms.txt + 4-in-1 JSON-LD hosting, white-label client reports, and 1-click official-API syndication to DEV.to, Bluesky, GitHub Pages, Qiita & Telegraph.",
  keywords: [
    "GEO",
    "Generative Engine Optimization",
    "AI SEO",
    "llms.txt",
    "ChatGPT Search SEO",
    "Perplexity Optimization",
    "Open Source GEO Tool",
    "White Label GEO Agency",
  ],
  openGraph: {
    type: "website",
    siteName: "GeoPulse Studio",
    title: "GeoPulse Studio — Open-Source GEO & Official-API Global Syndication",
    description:
      "Audit AI crawlers (GPTBot, PerplexityBot, ClaudeBot), host /llms.txt + JSON-LD, share white-label client reports, and auto-syndicate across 6 global official APIs.",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "GeoPulse Studio — Open-Source Commercial GEO Engine" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GeoPulse Studio — Open-Source GEO & AI Search Publishing Engine",
    description:
      "Free 3s Website AI Crawler Audit + 8-Dim GEO Scoring + 1-Click Global Official-API Syndication.",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
