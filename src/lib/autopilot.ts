import type { ArticleArchetype, GrowthTopic } from "@/types/geo";
import {
  createArticle,
  createBrand,
  listBrandsByUser,
  createPublishLog,
  findUserByEmail,
  getBrandById,
  getArticleById,
  getDb,
  newId,
} from "./db";
import { buildGeoJsonLd } from "./geo/schema";
import { buildVerifiedAutopilotContent } from "./autopilot-content";

function makeCleanSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return ascii || `geo-autopilot-${Date.now().toString(36)}`;
}
import { auditGeoContent } from "./geo/scorer";
import { blendEngineWeights } from "./geo/weights";
import {
  getPlatformAccountWithSecret,
  listPlatformAccounts,
  submitGlobalBlastOrder,
  type PlatformAccountWithSecret,
} from "./marketplace";

function mapTopic(row: Record<string, unknown>): GrowthTopic {
  let targetAccountIds: string[] = [];
  let publishedUrls: string[] = [];
  try {
    targetAccountIds = JSON.parse(String(row.target_account_ids_json || "[]"));
  } catch {
    targetAccountIds = [];
  }
  try {
    publishedUrls = JSON.parse(String(row.published_urls_json || "[]"));
  } catch {
    publishedUrls = [];
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    brandId: String(row.brand_id),
    titleHint: String(row.title_hint),
    keyword: String(row.keyword),
    language: String(row.language) === "zh" ? "zh" : "en",
    archetype: String(row.archetype || "comparison_matrix") as ArticleArchetype,
    targetAccountIds,
    status: String(row.status || "queued") as GrowthTopic["status"],
    articleId: String(row.article_id || ""),
    publishedUrls,
    errorMsg: String(row.error_msg || ""),
    createdAt: String(row.created_at),
    executedAt: row.executed_at ? String(row.executed_at) : null,
  };
}

export function listGrowthTopics(userId?: string): GrowthTopic[] {
  const db = getDb();
  const rows = userId
    ? db
        .prepare("SELECT * FROM growth_topics WHERE user_id = ? ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, created_at ASC LIMIT 80")
        .all(userId)
    : db
        .prepare("SELECT * FROM growth_topics ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, created_at ASC LIMIT 80")
        .all();
  return rows.map(mapTopic);
}

export function addGrowthTopic(params: {
  userId: string;
  brandId: string;
  titleHint: string;
  keyword: string;
  language?: "en" | "zh";
  archetype?: ArticleArchetype;
  targetAccountIds?: string[];
}): GrowthTopic {
  const id = newId("gtp");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO growth_topics (
        id, user_id, brand_id, title_hint, keyword, language, archetype,
        target_account_ids_json, status, article_id, published_urls_json, error_msg, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', '', '[]', '', ?)`
    )
    .run(
      id,
      params.userId,
      params.brandId,
      params.titleHint.trim(),
      params.keyword.trim(),
      params.language || "en",
      params.archetype || "comparison_matrix",
      JSON.stringify(params.targetAccountIds || []),
      now
    );
  const row = getDb().prepare("SELECT * FROM growth_topics WHERE id = ?").get(id)!;
  return mapTopic(row);
}

export function deleteGrowthTopic(id: string): boolean {
  const res = getDb().prepare("DELETE FROM growth_topics WHERE id = ? AND status != 'processing'").run(id);
  return res.changes > 0;
}

const OFFICIAL_AUTOPILOT_TOPICS: Array<{
  titleHint: string;
  keyword: string;
  language: "en" | "zh";
  archetype: ArticleArchetype;
}> = [
  {
    titleHint: "How to Evaluate a White-Label GEO Workflow for Agency Clients",
    keyword: "white label GEO agency software 2026 open source AI SEO retainers",
    language: "en",
    archetype: "howto_playbook",
  },
  {
    titleHint: "How to Verify AI Crawler Access: GPTBot, PerplexityBot & ClaudeBot",
    keyword: "free AI crawler audit tool GPTBot PerplexityBot llms.txt checker 2026",
    language: "en",
    archetype: "comparison_matrix",
  },
  {
    titleHint: "How to Measure B2B SaaS Mentions in AI Search Results",
    keyword: "get B2B SaaS cited by ChatGPT Search Perplexity GEO guide 2026",
    language: "en",
    archetype: "howto_playbook",
  },
  {
    titleHint: "Self-Hosted GEO Stack vs Enterprise AI Visibility Tools: Total Cost of Ownership (2026)",
    keyword: "self hosted GEO tool Profound Scrunch AI alternative pricing 2026",
    language: "en",
    archetype: "comparison_matrix",
  },
  {
    titleHint: "Official API Content Syndication for GEO: DEV.to vs GitHub Pages vs Bluesky vs WordPress",
    keyword: "canonical content syndication API GEO AI search authority 2026",
    language: "en",
    archetype: "category_guide",
  },
  {
    titleHint: "代运营机构如何核验白标 GEO 客户报告的证据？",
    keyword: "白标 GEO 代运营 开源平台 客户报告 DeepSeek 豆包",
    language: "zh",
    archetype: "howto_playbook",
  },
];

export function seedOfficialAutopilotQueue(adminUserId: string, baseUrl: string): {
  addedCount: number;
  topics: GrowthTopic[];
} {
  const db = getDb();
  // Queue seeding must never call the legacy published marketing-article pack.
  db.exec("SAVEPOINT autopilot_seed");
  try {
    const brand = listBrandsByUser(adminUserId).find((item) => item.name === "GeoPulse Studio") ||
      createBrand(adminUserId, {
        name: "GeoPulse Studio", companyName: "GeoPulse Open-Source Project",
        productName: "GeoPulse Studio", category: "Content editing and API publishing",
        oneLiner: "An MIT-licensed workspace for content editing and configured API publishing.",
        targetAudience: "Content teams and agencies", coreAdvantages: [], proofPoints: [],
        pricingInfo: "Review configured checkout and service terms before quoting prices.",
        competitors: [], websiteUrl: baseUrl.replace(/\/$/, ""), forbiddenWords: [], regionFocus: "Both",
      });
    const existingTitles = new Set(db.prepare(
      "SELECT title_hint FROM growth_topics WHERE user_id = ?"
    ).all(adminUserId).map((row) => String(row.title_hint).toLowerCase()));
    let addedCount = 0;
    for (const spec of OFFICIAL_AUTOPILOT_TOPICS) {
      if (existingTitles.has(spec.titleHint.toLowerCase())) continue;
      addGrowthTopic({ userId: adminUserId, brandId: brand.id, ...spec, targetAccountIds: [] });
      addedCount += 1;
    }
    const topics = listGrowthTopics(adminUserId);
    db.exec("RELEASE SAVEPOINT autopilot_seed");
    return { addedCount, topics };
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT autopilot_seed");
    db.exec("RELEASE SAVEPOINT autopilot_seed");
    throw error;
  }
}

// Removing this marker is an explicit editorial acknowledgement, separate from
// the mechanical GEO score. Scores do not establish factual accuracy or citations.
export const AUTOPILOT_REVIEW_MARKER = "<!-- autopilot-review-required -->";

function buildEditorialDraft(topic: GrowthTopic, brandName: string) {
  const zh = topic.language === "zh";
  const capsule = zh
    ? `选题：${topic.titleHint}。本文为待核验编辑草稿，涉及 ${brandName} 与 ${topic.keyword} 的结论需由编辑补充证据。`
    : `Research topic: ${topic.titleHint}. This editorial draft needs verified evidence before drawing conclusions about ${brandName} and ${topic.keyword}.`;
  const markdown = zh
    ? `${AUTOPILOT_REVIEW_MARKER}

> 编辑审核：请完成以下核验、替换占位内容并移除此审核标记，再通过编辑器发布。

## 研究问题
${topic.titleHint}

目标关键词：${topic.keyword}

## 可核验事实与来源
- 补充原始来源 URL、观察日期、测试方法及适用范围。
- 定价、竞品能力、客户成果与平台规则必须逐项核验，不得凭空填写。

## 方法与观察
补充本选题独有的实测步骤、样本及结果，避免重复的推广模板。

## 局限与适用范围
技术可抓取性与内容评分不代表收录、排名或 AI 引用保证。

## 编辑发布检查
核对事实与来源；检查原创性、授权及目标渠道规则；确认本篇有独立价值。`
    : `${AUTOPILOT_REVIEW_MARKER}

> Editorial review: verify the evidence, replace the research prompts, and remove this marker before publishing through the editor.

## Research question
${topic.titleHint}

Target keyword: ${topic.keyword}

## Facts and primary sources
- Add primary-source URLs, observation dates, test methods, and scope.
- Verify pricing, competitor capabilities, customer outcomes, and platform rules individually.

## Method and observations
Add topic-specific steps, samples, and findings. Replace repeated promotional copy with original evidence.

## Limitations and applicability
Crawler access and content scores do not guarantee indexing, rankings, or AI citations.

## Editorial publication check
Verify facts and sources, originality, permissions, channel rules, and the independent value of this article.`;
  return { capsule, markdown, faqs: [] as Array<{ question: string; answer: string }> };
}

export async function runNextAutopilotJob(params: {
  baseUrl: string;
  userId?: string;
  skipExternalBlast?: boolean;
}): Promise<
  | {
      ok: true;
      ran: boolean;
      topic?: GrowthTopic;
      articleSlug?: string;
      geoScore?: number;
      publishedUrls?: string[];
      message: string;
    }
  | { ok: false; error: string }
> {
  const db = getDb();
  const configuredOwner = process.env.ADMIN_EMAIL?.trim()
    ? findUserByEmail(process.env.ADMIN_EMAIL.trim()) : null;
  const targetUserId = params.userId || (
    configuredOwner?.role === "admin" && configuredOwner.email !== "demo@geopulse.ai"
      ? configuredOwner.id : undefined
  );
  if (!targetUserId) {
    return { ok: false, error: "未找到管理员账号以执行 Autopilot" };
  }

  // Claim in one SQLite write. A concurrent worker cannot select the same topic.
  // Reviewed drafts are eligible only after an editor removes the review marker
  // and explicitly publishes the existing article through the normal editor.
  const nextRow = db.prepare(`
    UPDATE growth_topics SET status = 'processing', error_msg = ''
    WHERE id = (
      SELECT t.id FROM growth_topics t
      WHERE t.user_id = ? AND (
        t.status = 'queued' OR (
          t.status = 'review_pending' AND EXISTS (
            SELECT 1 FROM articles a WHERE a.id = t.article_id
              AND a.user_id = t.user_id AND a.brand_id = t.brand_id
              AND a.status = 'published' AND instr(a.markdown_content, ?) = 0
          )
        )
      )
      ORDER BY CASE WHEN t.status = 'review_pending' THEN 0 ELSE 1 END,
        t.created_at ASC, t.id ASC LIMIT 1
    ) AND status IN ('queued', 'review_pending')
    RETURNING *
  `).get(targetUserId, AUTOPILOT_REVIEW_MARKER);

  if (!nextRow) {
    return { ok: true, ran: false, message: "没有可执行选题；待审核草稿须经编辑核验后发布" };
  }

  const topic = mapTopic(nextRow);
  let articleId = topic.articleId;
  const publishedUrls: string[] = [...topic.publishedUrls];
  const customerNote = `GEO Autopilot scheduled syndication (${topic.id})`;
  try {
    const brand = getBrandById(topic.brandId);
    if (!brand || brand.userId !== targetUserId) throw new Error("关联品牌不存在或无权访问");
    const cleanBase = params.baseUrl.replace(/\/$/, "");
    let article = articleId ? getArticleById(articleId) : null;

    if (!articleId) {
      const verified = buildVerifiedAutopilotContent(topic, cleanBase);
      const engines = ["doubao", "deepseek", "chatgpt", "perplexity", "gemini"] as const;
      const weights = blendEngineWeights([...engines]);
      const draft = verified || buildEditorialDraft(topic, brand.name);
      const { capsule, faqs } = draft;
      const markdown = verified ? `<!-- autopilot-template:${verified.key} -->\n${verified.markdown}` : draft.markdown;
      const title = verified?.title || topic.titleHint;
      const slug = `${makeCleanSlug(title)}-${brand.id.slice(-6)}`;
      const summary = capsule.slice(0, 175);
      const jsonLd = buildGeoJsonLd({
        title, slug, summary, directAnswerCapsule: capsule,
        targetKeyword: topic.keyword, faqs, publishedAt: new Date().toISOString(),
        brand, baseUrl: cleanBase,
      });
      const audit = auditGeoContent({
        title, slug, summary, targetKeyword: topic.keyword,
        directAnswerCapsule: capsule, markdownContent: markdown, faqs, jsonLd, brand, weights,
      });
      db.exec("SAVEPOINT autopilot_draft");
      try {
        if (verified) {
          // First write obtains the SQLite writer lock before article creation.
          // The unique key survives topic deletion and prevents repeated template publication.
          const reservation = db.prepare("INSERT OR IGNORE INTO autopilot_template_publications(user_id,template_key,article_id) VALUES(?,?,'')").run(targetUserId, verified.key);
          if (!reservation.changes) {
            const prior = db.prepare("SELECT article_id FROM autopilot_template_publications WHERE user_id=? AND template_key=?").get(targetUserId,verified.key);
            const existing = prior ? getArticleById(String(prior.article_id)) : null;
            if (!existing) throw new Error("该教程的历史发布记录需要核查；未重复创建内容");
            const urls = existing.status === "published" ? [`${cleanBase}/p/${existing.slug}`] : [];
            db.prepare("UPDATE growth_topics SET status=?, article_id=?, published_urls_json=?, error_msg=?, executed_at=? WHERE id=?").run(existing.status === "published" ? "published" : "review_pending",existing.id,JSON.stringify(urls),"已复用同主题教程；本次未重复发布或外部分发",new Date().toISOString(),topic.id);
            db.exec("RELEASE SAVEPOINT autopilot_draft");
            return {ok:true,ran:true,topic:mapTopic(db.prepare("SELECT * FROM growth_topics WHERE id=?").get(topic.id)!),articleSlug:existing.slug,publishedUrls:urls,message:"该主题已有教程，已复用现有内容；本次未重复发文或推送渠道"};
          }
        }
        article = createArticle(targetUserId, {
          brandId: brand.id, title, slug, summary,
          archetype: topic.archetype, targetEngines: [...engines], customWeights: weights,
          targetChannel: "geo_hub", targetKeyword: topic.keyword,
          directAnswerCapsule: capsule, markdownContent: markdown, faqs,
          comparisonTable: null, jsonLd, geoScore: audit.overallScore,
          engineScores: audit.engineScores, dimensionScores: audit.dimensionScores,
          status: verified ? "published" : "draft", generationMode: "builtin",
          publishedAt: verified ? new Date().toISOString() : null,
        });
        articleId = article.id;
        if (verified) db.prepare("UPDATE autopilot_template_publications SET article_id=? WHERE user_id=? AND template_key=?").run(article.id,targetUserId,verified.key);
        db.prepare(`UPDATE growth_topics SET status = ?, article_id = ?,
          error_msg = ?, executed_at = ? WHERE id = ? AND status = 'processing'`).run(
          verified ? "processing" : "review_pending", article.id,
          verified ? "" : "选题超出有来源的教程范围；请补充事实、来源和原创观察后在编辑器发布",
          new Date().toISOString(), topic.id,
        );
        db.exec("RELEASE SAVEPOINT autopilot_draft");
      } catch (error) {
        db.exec("ROLLBACK TO SAVEPOINT autopilot_draft");
        db.exec("RELEASE SAVEPOINT autopilot_draft");
        articleId = "";
        throw error;
      }
      if (!verified) return {
        ok: true, ran: true,
        topic: mapTopic(db.prepare("SELECT * FROM growth_topics WHERE id = ?").get(topic.id)!),
        articleSlug: article!.slug, geoScore: article!.geoScore, publishedUrls: [],
        message: `已创建《${article!.title}》待核验草稿；选题超出有来源教程范围，尚未发布`,
      };
    }

    if (!article || article.userId !== targetUserId || article.brandId !== topic.brandId ||
        article.status !== "published" || article.markdownContent.includes(AUTOPILOT_REVIEW_MARKER)) {
      throw new Error("关联文章尚未完成编辑审核并发布");
    }
    const primaryUrl = `${cleanBase}/p/${article.slug}`;
    if (!publishedUrls.includes(primaryUrl)) publishedUrls.push(primaryUrl);
    // Persist the local publication before any external side effect.
    db.prepare("UPDATE growth_topics SET published_urls_json = ? WHERE id = ?").run(
      JSON.stringify(publishedUrls), topic.id,
    );

    if (!params.skipExternalBlast) {
      const autoAccounts = listPlatformAccounts(false).filter((a) => a.deliveryMode === "auto_api");
      const targetIds = topic.targetAccountIds.length > 0 ? [...new Set(topic.targetAccountIds)] :
        autoAccounts.filter((a) => a.platformType !== "geo_network" && a.platformType !== "qiita").map((a) => a.id);
      const accounts: PlatformAccountWithSecret[] = [];
      for (const id of targetIds) {
        const account = getPlatformAccountWithSecret(id);
        if (!account || !account.enabled || account.deliveryMode !== "auto_api") {
          throw new Error(`目标渠道不可用：${id}`);
        }
        accounts.push(account);
      }
      if (accounts.length > 0) {
        const blast = await submitGlobalBlastOrder({
          userId: targetUserId, article, accounts, customerNote, baseUrl: cleanBase,
        });
        if (!blast.ok) throw new Error(`外部分发失败：${blast.error}`);
        const failures: string[] = [];
        for (const result of blast.results) {
          if (result.status === "published" && result.publishedUrl) {
            if (!publishedUrls.includes(result.publishedUrl)) publishedUrls.push(result.publishedUrl);
          } else failures.push(result.platformName);
        }
        if (blast.results.length !== accounts.length || failures.length > 0) {
          throw new Error(`外部分发未全部完成：${failures.join("、") || "缺少渠道结果"}；请核对渠道订单，勿重复推送已成功入口`);
        }
      }
    }

    createPublishLog(targetUserId, {
      articleId: article.id, channelType: "geo_hub", channelName: "GEO Autopilot 有来源内容分发",
      status: "success", httpStatus: 200, externalUrl: primaryUrl,
      message: "已记录通过来源教程检查或编辑核验的文章及本次分发结果",
    });
    db.prepare(`UPDATE growth_topics SET status = 'published', article_id = ?,
      published_urls_json = ?, error_msg = '', executed_at = ? WHERE id = ? AND status = 'processing'`).run(
      article.id, JSON.stringify(publishedUrls), new Date().toISOString(), topic.id,
    );
    return {
      ok: true, ran: true,
      topic: mapTopic(db.prepare("SELECT * FROM growth_topics WHERE id = ?").get(topic.id)!),
      articleSlug: article.slug, geoScore: article.geoScore, publishedUrls,
      message: `已完成《${article.title}》本次配置渠道的分发记录，共 ${publishedUrls.length} 个公开入口`,
    };
  } catch (error) {
    // Preserve confirmed external URLs even if a publisher throws after a partial
    // side effect. Failed topics require manual reconciliation, never auto-retry.
    if (articleId) {
      const delivered = db.prepare(`SELECT published_url FROM distribution_orders
        WHERE user_id = ? AND article_id = ? AND customer_note = ? AND status = 'published'`).all(
        targetUserId, articleId, customerNote,
      );
      for (const row of delivered) {
        const url = String(row.published_url || "");
        if (url && !publishedUrls.includes(url)) publishedUrls.push(url);
      }
    }
    const message = error instanceof Error ? error.message : "Autopilot 执行失败";
    db.prepare(`UPDATE growth_topics SET status = 'failed', article_id = ?,
      published_urls_json = ?, error_msg = ?, executed_at = ? WHERE id = ?`).run(
      articleId, JSON.stringify(publishedUrls), message, new Date().toISOString(), topic.id,
    );
    return { ok: false, error: message };
  }
}
