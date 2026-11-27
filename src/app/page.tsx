import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileCode2,
  Github,
  Globe2,
  Layers,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { AI_ENGINE_LIST, WEIGHT_DIMENSIONS } from "@/lib/geo/weights";
import { getCommercialSiteSettings, listPublishedArticles } from "@/lib/db";
import { PLAN_QUOTAS } from "@/lib/auth";
import { PublicAuditWidget } from "@/components/PublicAuditWidget";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const published = listPublishedArticles().slice(0, 3);
  const siteConfig = getCommercialSiteSettings();
  const plans = Object.values(PLAN_QUOTAS);

  const softwareJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: siteConfig.brandTitle || "GeoPulse Studio",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Docker, Linux",
        description:
          "开源商用 GEO（生成式引擎优化）内容架构、8维实时评分、官网AI爬虫体检与多渠道发布平台，支持豆包、DeepSeek、Kimi、ChatGPT Search、Perplexity 与 Google AI Overviews。",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "0",
          highPrice: "1299",
          priceCurrency: "CNY",
        },
        url: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://geo.workagentpro.com",
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "没有 API Key 也能使用 GeoPulse Studio 吗？",
            acceptedAnswer: {
              "@type": "Answer",
              text: "可以。系统支持 3 种零门槛模式：内置零配置 GEO 结构化引擎、一键复制专家级权重提示词包（直接粘贴到自己的 DeepSeek/豆包/ChatGPT 网页版后回填解析），以及一键接入 10 大国内外大模型（含智谱 GLM、硅基流动、Gemini 免费额度）。",
            },
          },
          {
            "@type": "Question",
            name: "GeoPulse Studio 支持哪些 AI 搜索引擎的权重优化？",
            acceptedAnswer: {
              "@type": "Answer",
              text: "内置豆包/元宝、DeepSeek/Kimi/秘塔、ChatGPT Search、Perplexity AI 与 Google AI Overviews (Gemini) 五大生态的 8 维权重矩阵，并自动生成 Schema.org JSON-LD 与 /llms.txt。",
            },
          },
        ],
      },
    ],
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: softwareJsonLd }}
      />

      {/* Top Commercial Announcement Bar */}
      {siteConfig.announcement && (
        <div className="bg-slate-900 px-4 py-2 text-center text-xs font-medium text-slate-200">
          <span>{siteConfig.announcement}</span>
          <Link
            href="/audit"
            className="ml-2 font-bold text-emerald-400 underline hover:text-emerald-300"
          >
            立即免费秒测 →
          </Link>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900">
                {siteConfig.brandTitle}
              </span>
              <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                GEO 3.0 商用版
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#free-audit" className="hover:text-indigo-600">
              免费 GEO 秒测
            </a>
            <a href="#weights" className="hover:text-indigo-600">
              AI 权重矩阵
            </a>
            <a href="#pricing" className="hover:text-indigo-600">
              商用定价
            </a>
            <Link href="/hub" className="hover:text-indigo-600">
              公开专栏
            </Link>
            <a
              href="https://github.com/sylvia-ccc/geopulse-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-indigo-600"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              登录 / 注册
            </Link>
            <Link
              href="/login?demo=1"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              进入工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/70 px-3.5 py-1.5 text-xs font-semibold text-indigo-700">
              <Bot className="h-3.5 w-3.5" />
              对标 Profound · Scrunch · Peec AI 的开源商用 GEO 平台
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:leading-[1.15]">
              输入品牌与产品，按
              <span className="bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                {" "}AI 收录权重{" "}
              </span>
              自动设计与发布高引用文章
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              面向中小企业、独立开发者与代运营机构：覆盖{" "}
              <strong className="font-semibold text-slate-800">
                豆包/元宝、DeepSeek/Kimi、ChatGPT Search、Perplexity 与 Google AI Overviews
              </strong>
              。支持 10 大模型一键接入、零 API Key 专家提示词包、实时 8 维评分修复、JSON-LD + `/llms.txt` 托管与多渠道分发。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login?demo=1"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700"
              >
                <Zap className="h-4 w-4" />
                一键进入演示工作台（免注册）
              </Link>
              <a
                href="#free-audit"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Globe2 className="h-4 w-4" />
                免登录秒测官网 / 文案
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                10 大国内外模型一键接入（含智谱/硅基流动/Gemini 免费档）
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                无 API Key 也能用：专家提示词包 + 回填自动解析
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                MIT 开源自托管 · 支持私有化部署与商业合作
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* No-Login Interactive PLG Lead Magnet */}
      <section id="free-audit" className="mx-auto max-w-5xl px-6 py-14">
        <PublicAuditWidget />
      </section>

      {/* 5 AI Engines Weight Matrix */}
      <section id="weights" className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              AI Engine Weight Matrix
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
              不同 AI 引擎收录权重差异，一眼看清并可自由微调
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-600">
            系统内置 5 大 AI 生态的 8 维权重向量，创作时自动按所选引擎配比调整文章结构与评分标准。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {AI_ENGINE_LIST.map((engine) => {
            const top3 = Object.entries(engine.weights)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3);
            return (
              <div
                key={engine.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {engine.region === "CN" ? "国内生态" : "全球生态"}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {engine.crawlerAgent.split(" ")[0]}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900">{engine.name}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{engine.tagline}</p>

                <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
                  <div className="text-[11px] font-semibold text-slate-500">核心权重 TOP 3</div>
                  {top3.map(([dimId, val]) => {
                    const meta = WEIGHT_DIMENSIONS[dimId as keyof typeof WEIGHT_DIMENSIONS];
                    return (
                      <div key={dimId}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{meta.shortName}</span>
                          <span className="font-semibold text-indigo-600">{val}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-600"
                            style={{ width: `${Math.min(100, val * 4.2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4-Step Commercial Workflow */}
      <section id="workflow" className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              4 步跑通中小企业 GEO 增长闭环
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              从官网自动抓档到 AI 竞品声量份额（SOV）追踪，单人 5 分钟完成全流程
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              {
                icon: Layers,
                step: "01",
                title: "官网一键抓档建实体",
                desc: "输入官网链接自动提取定位、价格与卖点，沉淀 AI 易识别的品牌实体知识卡。",
              },
              {
                icon: BarChart3,
                step: "02",
                title: "3 种方式零门槛生文",
                desc: "支持 10 大模型直连、无 Key 专家提示词包回填，或内置引擎批量生成 3 篇矩阵。",
              },
              {
                icon: FileCode2,
                step: "03",
                title: "实时诊断与一键修复",
                desc: "量化 8 维权重与 5 引擎得分，一键补齐直答胶囊、对比表、FAQ、去广告词与 JSON-LD。",
              },
              {
                icon: Send,
                step: "04",
                title: "专栏托管 + 竞品 SOV",
                desc: "上线 SSR 专栏同步 /llms.txt，一键转知乎/公众号/小红书，并导出白标 PDF 客户报告。",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-2xl font-bold text-slate-300">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Commercial Pricing Section */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
            Transparent Commercial Pricing
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            清晰的商用订阅方案，支持自备 API Key 零加价
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            免费版即可长期使用；专业版与旗舰版支持购买激活码秒级开通，也支持企业源码私有化部署
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isPro = plan.tier === "pro";
            const checkoutUrl =
              plan.tier === "pro"
                ? siteConfig.checkoutProUrl
                : plan.tier === "enterprise"
                  ? siteConfig.checkoutEnterpriseUrl
                  : "";
            return (
              <div
                key={plan.tier}
                className={`flex flex-col justify-between rounded-3xl border p-7 ${
                  isPro
                    ? "border-indigo-600 bg-white shadow-xl shadow-indigo-950/10 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white shadow-xs"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">{plan.label}</h3>
                    {isPro && (
                      <span className="rounded-full bg-indigo-600 px-3 py-0.5 text-[11px] font-bold text-white">
                        最受欢迎
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-slate-900">
                      ¥{plan.priceMonthlyCny}
                    </span>
                    <span className="text-sm text-slate-500">/ 月</span>
                  </div>
                  <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      最多 {plan.maxBrands} 个品牌实体档案
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      每月 {plan.maxArticlesPerMonth} 篇高权重 GEO 文章额度
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      {plan.maxWebhooks} 个 Webhook / CMS 自动推送渠道
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      10 大模型 BYOK 加密接入 + 无 Key 提示词包
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      公开 SSR 专栏 + `/llms.txt` + 白标 PDF 报告
                    </li>
                  </ul>
                </div>

                <div className="mt-7">
                  {checkoutUrl ? (
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block w-full rounded-xl py-3 text-center text-sm font-bold transition ${
                        isPro
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      立即购买激活码 →
                    </a>
                  ) : (
                    <Link
                      href="/login"
                      className={`block w-full rounded-xl py-3 text-center text-sm font-bold transition ${
                        isPro
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {plan.tier === "free" ? "免费注册立即使用" : "登录兑换激活码 / 联系开通"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Commercial Contact & Acquisition Banner */}
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white md:flex-row md:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Open-Source · Private Deployment · Acquisition
            </div>
            <div className="mt-1 text-base font-bold">{siteConfig.acquisitionNote}</div>
            <div className="mt-1 text-xs text-slate-300">{siteConfig.contactWechatOrEmail}</div>
          </div>
          <a
            href="https://github.com/sylvia-ccc/geopulse-studio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-slate-900 hover:bg-slate-100"
          >
            <Github className="h-4 w-4" />
            Star & 查看开源源码
          </a>
        </div>
      </section>

      {/* Live Published Examples */}
      {published.length > 0 && (
        <section className="border-t border-slate-200 bg-white py-16">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">实时公开 GEO 托管样板文章</h2>
                <p className="mt-1 text-sm text-slate-600">
                  以下页面由本系统 SSR 直出，已嵌入完整 Schema.org JSON-LD 并同步至 /llms.txt
                </p>
              </div>
              <Link
                href="/hub"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                查看全部专栏 →
              </Link>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {published.map((art) => (
                <Link
                  key={art.id}
                  href={`/p/${art.slug}`}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs transition hover:border-indigo-300 hover:bg-white hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        GEO 评分 {art.geoScore}/100
                      </span>
                      <span className="text-xs text-slate-400">{art.views} 次抓取/浏览</span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-indigo-600">
                      {art.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">
                      {art.directAnswerCapsule}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span className="truncate">/p/{art.slug}</span>
                    <span className="shrink-0 font-semibold text-indigo-600">查看页面 →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-xs text-slate-500 sm:flex-row">
          <div>© 2026 {siteConfig.brandTitle} · MIT 开源商用 GEO 生成式引擎优化发布平台</div>
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/audit" className="hover:text-indigo-600">
              免费体检
            </Link>
            <Link href="/hub" className="hover:text-indigo-600">
              公开专栏
            </Link>
            <a href="/llms.txt" target="_blank" className="hover:text-indigo-600">
              llms.txt
            </a>
            <a href="/sitemap.xml" target="_blank" className="hover:text-indigo-600">
              sitemap.xml
            </a>
            <a href="/robots.txt" target="_blank" className="hover:text-indigo-600">
              robots.txt
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
