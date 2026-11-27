import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "工作台",
  robots: { index: false, follow: false, nocache: true },
};

export default function AppWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          加载工作台中...
        </div>
      }
    >
      <AppShell />
    </Suspense>
  );
}
