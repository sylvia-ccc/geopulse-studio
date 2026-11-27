import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PublicAuditWidget } from "@/components/PublicAuditWidget";

const title = "免费 GEO 网站与内容体检";
const description = "免登录检查官网的 robots.txt、LLM 文本与结构化数据配置，或分析文案的结构与可读性。";
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: "/audit" },
  openGraph: {
    type: "website", url: "/audit", title, description,
    images: [{ url: "/api/og?title=Free%20GEO%20Website%20Audit", width: 1200, height: 630, alt: title }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/api/og?title=Free%20GEO%20Website%20Audit"] },
};

export default function PublicAuditPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 GeoPulse Studio 首页
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            登录完整工作台
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <PublicAuditWidget />
      </main>
    </div>
  );
}
