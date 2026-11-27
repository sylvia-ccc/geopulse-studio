import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileCode2,
  Globe2,
  Layers,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { AI_ENGINE_LIST, WEIGHT_DIMENSIONS } from "@/lib/geo/weights";
import { listPublishedArticles } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const published = listPublishedArticles().slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900">
                GeoPulse Studio
              </span>
              <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                商用 GEO 系统
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#weights" className="hover:text-indigo-600">
              AI 权重矩阵
            </a>
            <a href="#workflow" className="hover:text-indigo-600">
              工作流
            </a>
            <Link href="/hub" className="hover:text-indigo-600">
              公开 GEO 专栏
            </Link>
            <a href="/llms.txt" target="_blank" className="hover:text-indigo-600">
              /llms.txt
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
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/70 px-3.5 py-1.5 text-xs font-semibold text-indigo-700">
              <Bot className="h-3.5 w-3.5" />
              专为中小企业与个人打造的 AI 搜索收录引擎（GEO）
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:leading-[1.15]">
              输入品牌与产品，按
              <span className="bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                {" "}AI 收录权重{" "}
              </span>
              自动设计与发布高引用文章
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              不再盲写发软文。GeoPulse Studio 深度拆解{" "}
              <strong className="font-semibold text-slate-800">
                豆包 / 元宝、DeepSeek / Kimi、ChatGPT Search、Perplexity 与 Google AI Overviews
              </strong>{" "}
              的 8 维收录权重，一键完成选题架构、实时评分优化、JSON-LD 挂载、/llms.txt 索引与多渠道分发。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login?demo=1"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700"
              >
                <Zap className="h-4 w-4" />
                一键进入演示工作台（免注册）
              </Link>
              <Link
                href="/hub"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Globe2 className="h-4 w-4" />
                查看已发布 GEO 样板页
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                支持 DeepSeek / OpenAI / Gemini 接入 & 内置零配置引擎
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                自动生成 JSON-LD + /llms.txt + /sitemap.xml
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                知乎 / 公众号 / 小红书 / Webhook 多渠道分发
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5 AI Engines Weight Matrix */}
      <section id="weights" className="mx-auto max-w-7xl px-6 py-16">
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
              从品牌建档到 AI 爬虫收录监测，单人 5 分钟即可产出并发布高权重权威文章
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              {
                icon: Layers,
                step: "01",
                title: "极简品牌实体建档",
                desc: "输入品牌名、产品定位、核心卖点、价格与竞品，自动构建 AI 易识别的规范知识图谱。",
              },
              {
                icon: BarChart3,
                step: "02",
                title: "选引擎调权重生文",
                desc: "勾选目标 AI 引擎或微调 8 维权重滑块，一键生成对比评测、选型清单、FAQ 等高引用文章。",
              },
              {
                icon: FileCode2,
                step: "03",
                title: "实时评分与一键修复",
                desc: "透明量化 8 维得分与各引擎就绪度，一键补齐直答胶囊、对比表、去广告润色与 JSON-LD。",
              },
              {
                icon: Send,
                step: "04",
                title: "专栏托管 + 全渠道分发",
                desc: "一键发布至 SSR 公开专栏同步 /llms.txt，同时转为知乎、公众号、小红书或 Webhook 推送。",
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

      {/* Live Published Examples */}
      {published.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-16">
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
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
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
                  <span>/p/{art.slug}</span>
                  <span className="font-semibold text-indigo-600">查看结构化页面 →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-xs text-slate-500 sm:flex-row">
          <div>© 2026 GeoPulse Studio · 商用 GEO 生成式引擎优化发布平台</div>
          <div className="flex items-center gap-5">
            <Link href="/hub" className="hover:text-indigo-600">
              公开专栏
            </Link>
            <a href="/llms.txt" target="_blank" className="hover:text-indigo-600">
              llms.txt
            </a>
            <a href="/llms-full.txt" target="_blank" className="hover:text-indigo-600">
              llms-full.txt
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
