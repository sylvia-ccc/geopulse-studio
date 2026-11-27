import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PublicAuditWidget } from "@/components/PublicAuditWidget";

export const metadata: Metadata = {
  title: "免费 GEO 收录体检与 AI 权重测算工具 — GeoPulse Studio",
  description:
    "免登录实时检测你的官网是否放行 GPTBot、PerplexityBot、Google-Extended 与 Bytespider，或粘贴产品文案即时测算五大 AI 搜索引擎收录得分。",
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
            href="/login?demo=1"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            进入完整工作台
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <PublicAuditWidget />
      </main>
    </div>
  );
}
