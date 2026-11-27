"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Radar,
  Rocket,
  Send,
  Settings,
  Shield,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  BrandProfile,
  CitationCheck,
  CommercialSiteSettings,
  GeoArticle,
  PlanQuota,
  PlanTier,
  PublishChannelConfig,
  PublishLog,
  UserRole,
} from "@/types/geo";
import { DashboardView } from "./views/DashboardView";
import { BrandsView } from "./views/BrandsView";
import { StudioView } from "./views/StudioView";
import { PublishView } from "./views/PublishView";
import { MarketplaceView } from "./views/MarketplaceView";
import { OutreachView } from "./views/OutreachView";
import { MonitorView } from "./views/MonitorView";
import { SiteAuditView } from "./views/SiteAuditView";
import { AdminView } from "./views/AdminView";
import { SettingsView } from "./views/SettingsView";

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    company: string;
    role: UserRole;
    plan: PlanTier;
    planExpiresAt: string | null;
    creditsBalance: number;
    apiKey: string;
    llmProvider: "none" | "openai" | "deepseek" | "gemini" | "custom";
    llmBaseUrl: string;
    llmApiKeyMasked: string;
    hasLlmApiKey: boolean;
    serverLlmEnabled: boolean;
    llmModel: string;
  };
  quota: PlanQuota;
  usage: {
    brandsCount: number;
    articlesTotal: number;
    articlesThisMonth: number;
    publishedCount: number;
    channelsCount: number;
    avgGeoScore: number;
    citationHitRate: number;
    citationsCount: number;
  };
}

type TabId =
  | "dashboard"
  | "brands"
  | "studio"
  | "publish"
  | "marketplace"
  | "outreach"
  | "monitor"
  | "audit"
  | "settings"
  | "admin";

const BASE_NAV_ITEMS: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "总览工作台", icon: LayoutDashboard },
  { id: "brands", label: "品牌实体库", icon: Building2 },
  { id: "studio", label: "GEO 创作工坊", icon: Sparkles },
  { id: "publish", label: "多渠道发布中心", icon: Send },
  { id: "marketplace", label: "托管代发市场", icon: Rocket },
  { id: "outreach", label: "体检获客触达", icon: Mail },
  { id: "monitor", label: "AI 收录与 SOV", icon: Radar },
  { id: "audit", label: "官网 AI 体检", icon: Globe2 },
  { id: "settings", label: "设置与配额", icon: Settings },
];

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "dashboard";

  const [tab, setTab] = useState<TabId>(initialTab);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [articles, setArticles] = useState<GeoArticle[]>([]);
  const [channels, setChannels] = useState<PublishChannelConfig[]>([]);
  const [logs, setLogs] = useState<PublishLog[]>([]);
  const [checks, setChecks] = useState<CitationCheck[]>([]);
  const [plans, setPlans] = useState<PlanQuota[]>([]);
  const [siteConfig, setSiteConfig] = useState<CommercialSiteSettings | null>(null);

  const [studioBrandId, setStudioBrandId] = useState<string | undefined>(undefined);
  const [studioArticleId, setStudioArticleId] = useState<string | undefined>(undefined);
  const [publishArticleId, setPublishArticleId] = useState<string | undefined>(undefined);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const notify = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 4000);
  }, []);

  const refreshAll = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    if (meRes.status === 401) {
      router.replace("/login");
      return;
    }
    const meData = (await meRes.json()) as MeResponse;
    setMe(meData);

    const [brandsRes, articlesRes, channelsRes, logsRes, checksRes, settingsRes, siteCfgRes] =
      await Promise.all([
        fetch("/api/brands"),
        fetch("/api/articles"),
        fetch("/api/channels"),
        fetch("/api/publish-logs"),
        fetch("/api/citations"),
        fetch("/api/settings"),
        fetch("/api/site-config"),
      ]);

    const [bJson, aJson, chJson, lJson, cJson, sJson, cfgJson] = await Promise.all([
      brandsRes.json(),
      articlesRes.json(),
      channelsRes.json(),
      logsRes.json(),
      checksRes.json(),
      settingsRes.json(),
      siteCfgRes.json(),
    ]);

    setBrands(bJson.brands || []);
    setArticles(aJson.articles || []);
    setChannels(chJson.channels || []);
    setLogs(lJson.logs || []);
    setChecks(cJson.checks || []);
    setPlans(sJson.plans || []);
    setSiteConfig(cfgJson.config || null);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navigateTab = (nextTab: string, articleId?: string, brandId?: string) => {
    if (brandId) setStudioBrandId(brandId);
    if (nextTab === "studio") setStudioArticleId(articleId);
    if (nextTab === "publish") setPublishArticleId(articleId);
    setTab(nextTab as TabId);
  };

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          正在加载 GeoPulse Studio 商用工作台...
        </div>
      </div>
    );
  }

  const navItems =
    me.user.role === "admin"
      ? [...BASE_NAV_ITEMS, { id: "admin" as TabId, label: "商用运营后台", icon: Shield }]
      : BASE_NAV_ITEMS;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-slate-900">
                {siteConfig?.brandTitle || "GeoPulse Studio"}
              </div>
              <div className="text-[10px] font-semibold text-indigo-600">
                {siteConfig?.hidePoweredBy ? "White-Label GEO Suite" : "GEO 5.0 Global 商用版"}
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "studio") setStudioArticleId(undefined);
                  setTab(item.id);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Quota & Credits & Public Links */}
        <div className="border-t border-slate-100 p-4 space-y-3">
          <button
            type="button"
            onClick={() => setTab("marketplace")}
            className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100/70"
          >
            <span className="inline-flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-amber-600" />
              发布积分
            </span>
            <span>{me.user.creditsBalance ?? 0} 分</span>
          </button>

          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>本月文章配额</span>
              <span>
                {me.usage.articlesThisMonth}/{me.quota.maxArticlesPerMonth}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((me.usage.articlesThisMonth / me.quota.maxArticlesPerMonth) * 100)
                  )}%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <Link href="/hub" target="_blank" className="inline-flex items-center gap-1 hover:text-indigo-600">
                公开专栏 <ExternalLink className="h-2.5 w-2.5" />
              </Link>
              <a href="/llms.txt" target="_blank" className="font-mono hover:text-indigo-600">
                /llms.txt
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-slate-900">{me.user.name}</div>
              <div className="truncate text-[11px] text-slate-400">{me.user.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Nav */}
        <header className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              GeoPulse Studio
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  tab === item.id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {tab === "dashboard" && (
            <DashboardView
              brands={brands}
              articles={articles}
              logs={logs}
              quota={me.quota}
              usage={me.usage}
              onNavigate={navigateTab}
            />
          )}

          {tab === "brands" && (
            <BrandsView
              brands={brands}
              onRefresh={refreshAll}
              onStartStudioForBrand={(brandId) => {
                setStudioBrandId(brandId);
                setStudioArticleId(undefined);
                setTab("studio");
              }}
              onNotify={notify}
            />
          )}

          {tab === "studio" && (
            <StudioView
              brands={brands}
              articles={articles}
              initialBrandId={studioBrandId}
              initialArticleId={studioArticleId}
              hasLlmKey={
                (me.user.hasLlmApiKey && me.user.llmProvider !== "none") ||
                me.user.serverLlmEnabled
              }
              onRefresh={refreshAll}
              onGoPublish={(artId) => {
                setPublishArticleId(artId);
                setTab("publish");
              }}
              onOpenSettings={() => setTab("settings")}
              onNotify={notify}
            />
          )}

          {tab === "publish" && (
            <PublishView
              brands={brands}
              articles={articles}
              channels={channels}
              logs={logs}
              initialArticleId={publishArticleId}
              onRefresh={refreshAll}
              onOpenEditor={(artId) => {
                setStudioArticleId(artId);
                setTab("studio");
              }}
              onNotify={notify}
            />
          )}

          {tab === "marketplace" && (
            <MarketplaceView
              brands={brands}
              articles={articles}
              onRefreshGlobal={refreshAll}
              onGoStudio={(artId) => {
                setStudioArticleId(artId);
                setTab("studio");
              }}
              onNotify={notify}
            />
          )}

          {tab === "outreach" && <OutreachView onNotify={notify} />}

          {tab === "monitor" && (
            <MonitorView
              brands={brands}
              checks={checks}
              hasLlmKey={
                (me.user.hasLlmApiKey && me.user.llmProvider !== "none") ||
                me.user.serverLlmEnabled
              }
              onRefresh={refreshAll}
              onNotify={notify}
            />
          )}

          {tab === "audit" && <SiteAuditView brands={brands} onNotify={notify} />}

          {tab === "admin" && me.user.role === "admin" && (
            <AdminView onRefreshGlobal={refreshAll} onNotify={notify} />
          )}

          {tab === "settings" && (
            <SettingsView
              user={me.user}
              plans={plans}
              siteConfig={siteConfig}
              onRefresh={refreshAll}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-lg">
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-400" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
