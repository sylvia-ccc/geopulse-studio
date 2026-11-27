"use client";

import { Printer } from "lucide-react";

export function PrintReportButton({ accent }: { accent: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-90"
      style={{ backgroundColor: accent }}
    >
      <Printer className="h-3.5 w-3.5" />
      打印 / 导出 PDF 报告
    </button>
  );
}
