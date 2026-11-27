import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import { getBrandById, listArticlesByUser, listCitationChecks } from "@/lib/db";
import { AI_ENGINE_LIST, AI_ENGINES } from "@/lib/geo/weights";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  const { id } = await context.params;

  const brand = getBrandById(id);
  if (!brand || brand.userId !== user.id) {
    return NextResponse.json({ error: "品牌不存在" }, { status: 404 });
  }

  const articles = listArticlesByUser(user.id, brand.id);
  const checks = listCitationChecks(user.id, brand.id);
  const baseUrl = getBaseUrl(req);

  const publishedCount = articles.filter((a) => a.status === "published").length;
  const avgScore =
    articles.length > 0
      ? Math.round(articles.reduce((acc, a) => acc + a.geoScore, 0) / articles.length)
      : 0;
  const hitCount = checks.filter((c) => c.mentioned).length;
  const hitRate = checks.length > 0 ? Math.round((hitCount / checks.length) * 100) : 0;

  // Competitor Share of Voice counts
  const sovMap = new Map<string, number>();
  sovMap.set(brand.name, hitCount);
  for (const comp of brand.competitors) {
    sovMap.set(comp, 0);
  }
  for (const c of checks) {
    for (const comp of c.competitorsMentioned || []) {
      sovMap.set(comp, (sovMap.get(comp) || 0) + 1);
    }
  }
  const totalMentions = Array.from(sovMap.values()).reduce((a, b) => a + b, 0) || 1;
  const sovRows = Array.from(sovMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([entity, count]) => ({
      entity,
      count,
      share: Math.round((count / totalMentions) * 100),
      isSelf: entity === brand.name,
    }));

  const engineRows = AI_ENGINE_LIST.map((engine) => {
    const score =
      articles.length > 0
        ? Math.round(
            articles.reduce((acc, a) => acc + (a.engineScores[engine.id] ?? a.geoScore), 0) /
              articles.length
          )
        : 0;
    const engChecks = checks.filter((c) => c.engineId === engine.id);
    const engHits = engChecks.filter((c) => c.mentioned).length;
    return {
      name: engine.name,
      score,
      checks: engChecks.length,
      hitRate: engChecks.length > 0 ? `${Math.round((engHits / engChecks.length) * 100)}%` : "待监测",
    };
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${esc(brand.name)} — GEO AI 搜索可见度与内容策略交付报告</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 32px; line-height: 1.65; }
    .container { max-width: 920px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; }
    .toolbar { max-width: 920px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; }
    .btn { background: #4f46e5; color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-weight: 700; font-size: 13px; cursor: pointer; }
    .badge { display: inline-block; background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    h1 { font-size: 26px; margin: 12px 0 6px; }
    h2 { font-size: 17px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #f1f5f9; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 20px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc; }
    .kpi .label { font-size: 12px; color: #64748b; font-weight: 600; }
    .kpi .val { font-size: 26px; font-weight: 800; margin-top: 4px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
    th, td { border: 1px solid #e2e8f0; padding: 9px 12px; text-align: left; }
    th { background: #f8fafc; font-weight: 700; }
    .bar-bg { height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; width: 140px; display: inline-block; vertical-align: middle; margin-right: 8px; }
    .bar-fg { height: 100%; background: #4f46e5; border-radius: 99px; }
    .bar-fg.self { background: #059669; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-top: 10px; font-size: 13px; }
    .footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none !important; }
      .container { border: none; padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:13px;color:#475569;font-weight:600;">客户交付级白标报告 · 可直接打印或另存为 PDF</span>
    <button class="btn" onclick="window.print()">打印 / 导出 PDF 报告</button>
  </div>
  <div class="container">
    <span class="badge">GEO AI 可见度与内容资产商用报告</span>
    <h1>${esc(brand.name)}（${esc(brand.productName)}）</h1>
    <p style="color:#475569;margin:0;font-size:14px;">${esc(brand.oneLiner)}</p>
    <p style="color:#64748b;margin:6px 0 0;font-size:12px;">
      企业主体：${esc(brand.companyName || brand.name)} ｜ 品类：${esc(brand.category)} ｜ 受众：${esc(brand.targetAudience)} ｜ 生成日期：${new Date().toLocaleDateString("zh-CN")}
    </p>

    <div class="kpi-grid">
      <div class="kpi"><div class="label">平均 GEO 权重分</div><div class="val">${avgScore}/100</div></div>
      <div class="kpi"><div class="label">已发布收录资产</div><div class="val">${publishedCount}/${articles.length}</div></div>
      <div class="kpi"><div class="label">AI 回答品牌提及率</div><div class="val">${hitRate}%</div></div>
      <div class="kpi"><div class="label">监测提问词总数</div><div class="val">${checks.length}</div></div>
    </div>

    <h2>一、五大 AI 搜索引擎收录就绪度</h2>
    <table>
      <thead><tr><th>AI 引擎生态</th><th>内容结构就绪分</th><th>实测提问数</th><th>品牌提及率</th></tr></thead>
      <tbody>
        ${engineRows
          .map(
            (r) =>
              `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.score} / 100</td><td>${r.checks}</td><td>${esc(r.hitRate)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>

    <h2>二、AI 回答竞品声量份额（Share of Voice）</h2>
    <table>
      <thead><tr><th>品牌 / 竞品实体</th><th>AI 回答出现次数</th><th>相对声量占比</th></tr></thead>
      <tbody>
        ${sovRows
          .map(
            (r) =>
              `<tr><td><strong>${esc(r.entity)}${r.isSelf ? "（本品牌）" : ""}</strong></td><td>${r.count} 次</td><td><span class="bar-bg"><span class="bar-fg ${r.isSelf ? "self" : ""}" style="width:${r.share}%"></span></span><strong>${r.share}%</strong></td></tr>`
          )
          .join("")}
      </tbody>
    </table>

    <h2>三、已布局高权重 GEO 文章资产清单</h2>
    ${
      articles.length === 0
        ? `<div class="card">尚未为该品牌创建 GEO 文章，建议优先生成「横向评测对比」与「场景选型清单」。</div>`
        : `<table>
      <thead><tr><th>文章标题</th><th>GEO 评分</th><th>状态</th><th>公开索引入口</th></tr></thead>
      <tbody>
        ${articles
          .map(
            (a) =>
              `<tr><td><strong>${esc(a.title)}</strong></td><td>${a.geoScore}/100</td><td>${a.status === "published" ? "已上线" : "草稿"}</td><td style="font-family:monospace;font-size:12px;">${a.status === "published" ? esc(`${baseUrl}/p/${a.slug}`) : "-"}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>`
    }

    <h2>四、近期 AI 回答收录监测明细</h2>
    ${
      checks.length === 0
        ? `<div class="card">暂无监测记录。</div>`
        : checks
            .slice(0, 8)
            .map(
              (c) =>
                `<div class="card"><strong>[${esc(AI_ENGINES[c.engineId]?.shortName || c.engineId)}]</strong> ${c.mentioned ? "✅ 已提及" : "⚠️ 未提及"} · “${esc(c.promptQuery)}”<div style="color:#475569;margin-top:4px;">${esc(c.snippet || "无摘录")}</div></div>`
            )
            .join("")
    }

    <div class="footer">
      <span>由 ${esc(user.company || "GeoPulse Studio")} 生成交付</span>
      <span>AI 索引总入口：${esc(baseUrl)}/llms.txt</span>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
