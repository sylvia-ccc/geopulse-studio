"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Layers,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { markdownToCleanHtml } from "@/lib/geo/generator";
import { buildExternalPromptPack } from "@/lib/geo/prompt-pack";
import type {
  AIEngineId,
  ArticleArchetype,
  BrandProfile,
  DiagnosticIssue,
  FAQItem,
  GeoArticle,
  GeoAuditResult,
  PublishChannelType,
  WeightDimensionId,
  WeightVector,
} from "@/types/geo";
import {
  AI_ENGINE_LIST,
  ARTICLE_ARCHETYPE_LIST,
  blendEngineWeights,
  normalizeWeights,
  WEIGHT_DIMENSION_IDS,
  WEIGHT_DIMENSIONS,
  WEIGHT_PRESETS,
} from "@/lib/geo/weights";
import type { TopicBlueprint } from "@/lib/geo/generator";

interface Props {
  brands: BrandProfile[];
  articles: GeoArticle[];
  initialBrandId?: string;
  initialArticleId?: string;
  hasLlmKey: boolean;
  onRefresh: () => Promise<void>;
  onGoPublish: (articleId: string) => void;
  onOpenSettings?: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export function StudioView({
  brands,
  articles,
  initialBrandId,
  initialArticleId,
  hasLlmKey,
  onRefresh,
  onGoPublish,
  onOpenSettings,
  onNotify,
}: Props) {
  const [subMode, setSubMode] = useState<"architect" | "editor" | "import">(
    initialArticleId ? "editor" : "architect"
  );
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [importTitle, setImportTitle] = useState("");
  const [importKeyword, setImportKeyword] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [showPromptPack, setShowPromptPack] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Architect state
  const [selectedBrandId, setSelectedBrandId] = useState<string>(
    initialBrandId || brands[0]?.id || ""
  );
  const [targetEngines, setTargetEngines] = useState<AIEngineId[]>([
    "doubao",
    "deepseek",
    "chatgpt",
  ]);
  const [weights, setWeights] = useState<WeightVector>(() =>
    blendEngineWeights(["doubao", "deepseek", "chatgpt"])
  );
  const [showSliders, setShowSliders] = useState(true);
  const [archetype, setArchetype] = useState<ArticleArchetype>("comparison_matrix");
  const [targetChannel, setTargetChannel] = useState<PublishChannelType>("geo_hub");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [customAngle, setCustomAngle] = useState("");
  const [autoPublish, setAutoPublish] = useState(false);
  const [blueprints, setBlueprints] = useState<TopicBlueprint[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selectedBrandObj = brands.find((b) => b.id === selectedBrandId) || null;
  const externalPromptPackText = selectedBrandObj
    ? buildExternalPromptPack({
        brand: selectedBrandObj,
        archetype,
        targetEngines,
        weights,
        targetChannel,
        targetKeyword,
        customAngle,
      })
    : "";

  const handleCopyPromptPack = async () => {
    if (!externalPromptPackText) return;
    await navigator.clipboard.writeText(externalPromptPackText);
    setCopiedPrompt(true);
    onNotify("专家 GEO 提示词包已复制！可粘贴给 DeepSeek / 豆包 / ChatGPT 生成后再点「3. 已有文章改造」回填");
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  // Editor & Auditor state
  const [activeArticleId, setActiveArticleId] = useState<string | null>(
    initialArticleId || null
  );
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editKeyword, setEditKeyword] = useState("");
  const [editCapsule, setEditCapsule] = useState("");
  const [editMarkdown, setEditMarkdown] = useState("");
  const [editFaqs, setEditFaqs] = useState<FAQItem[]>([]);
  const [editJsonLd, setEditJsonLd] = useState("");
  const [editBrandId, setEditBrandId] = useState("");
  const [editWeights, setEditWeights] = useState<WeightVector>(
    blendEngineWeights(["doubao", "deepseek", "chatgpt"])
  );
  const [editStatus, setEditStatus] = useState<"draft" | "published">("draft");
  const [editorTab, setEditorTab] = useState<"markdown" | "preview" | "faq" | "schema">("markdown");
  const [audit, setAudit] = useState<GeoAuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (initialBrandId) setSelectedBrandId(initialBrandId);
  }, [initialBrandId]);

  useEffect(() => {
    if (!selectedBrandId && brands[0]?.id) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  const loadArticleIntoEditor = async (articleId: string) => {
    const res = await fetch(`/api/articles/${articleId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      article: GeoArticle;
      audit: GeoAuditResult;
    };
    const a = data.article;
    setActiveArticleId(a.id);
    setEditBrandId(a.brandId);
    setEditTitle(a.title);
    setEditSlug(a.slug);
    setEditSummary(a.summary);
    setEditKeyword(a.targetKeyword);
    setEditCapsule(a.directAnswerCapsule);
    setEditMarkdown(a.markdownContent);
    setEditFaqs(a.faqs || []);
    setEditJsonLd(a.jsonLd || "");
    setEditWeights(a.customWeights);
    setEditStatus(a.status);
    setAudit(data.audit);
    setSubMode("editor");
  };

  useEffect(() => {
    if (initialArticleId) {
      void loadArticleIntoEditor(initialArticleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialArticleId]);

  const toggleEngine = (id: AIEngineId) => {
    const next = targetEngines.includes(id)
      ? targetEngines.length > 1
        ? targetEngines.filter((x) => x !== id)
        : targetEngines
      : [...targetEngines, id];
    setTargetEngines(next);
    setWeights(blendEngineWeights(next));
  };

  const applyPreset = (engines: AIEngineId[]) => {
    setTargetEngines(engines);
    setWeights(blendEngineWeights(engines));
  };

  const handleWeightSlider = (dim: WeightDimensionId, rawValue: number) => {
    const updated = { ...weights, [dim]: rawValue };
    setWeights(normalizeWeights(updated));
  };

  const handleGenerateTopics = async () => {
    if (!selectedBrandId) {
      onNotify("请先创建并选择一个品牌档案", "error");
      return;
    }
    setLoadingTopics(true);
    try {
      const res = await fetch(`/api/brands/${selectedBrandId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEngines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "选题生成失败");
      setBlueprints(data.blueprints || []);
      onNotify("已依据当前 AI 权重矩阵生成 6 个高收录选题蓝图");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "生成选题失败", "error");
    } finally {
      setLoadingTopics(false);
    }
  };

  const handleGenerateArticle = async () => {
    if (!selectedBrandId) {
      onNotify("请先选择品牌档案", "error");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/articles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          archetype,
          targetEngines,
          customWeights: weights,
          targetChannel,
          targetKeyword,
          customAngle,
          autoPublish,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成文章失败");

      await onRefresh();
      const a: GeoArticle = data.article;
      setActiveArticleId(a.id);
      setEditBrandId(a.brandId);
      setEditTitle(a.title);
      setEditSlug(a.slug);
      setEditSummary(a.summary);
      setEditKeyword(a.targetKeyword);
      setEditCapsule(a.directAnswerCapsule);
      setEditMarkdown(a.markdownContent);
      setEditFaqs(a.faqs || []);
      setEditJsonLd(a.jsonLd || "");
      setEditWeights(a.customWeights);
      setEditStatus(a.status);
      setAudit(data.audit);
      setSubMode("editor");
      onNotify(
        data.llmNote || `GEO 文章已生成（综合权重评分 ${data.audit.overallScore}/100）`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "文章生成失败", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleBatchGenerate = async () => {
    if (!selectedBrandId) {
      onNotify("请先选择品牌档案", "error");
      return;
    }
    setBatchGenerating(true);
    try {
      const res = await fetch("/api/articles/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          targetEngines,
          archetypes: ["comparison_matrix", "buyers_checklist", "faq_hub"],
          autoPublish,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量生成失败");
      await onRefresh();
      onNotify(`批量矩阵生成成功！已创建 ${data.count} 篇高权重 GEO 文章`);
      if (data.articles?.[0]?.id) {
        await loadArticleIntoEditor(data.articles[0].id);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "批量生成失败", "error");
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleImportArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrandId) {
      onNotify("请先选择关联品牌档案", "error");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/articles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          title: importTitle,
          targetKeyword: importKeyword,
          markdownContent: importContent,
          targetEngines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入诊断失败");
      await onRefresh();
      setImportTitle("");
      setImportKeyword("");
      setImportContent("");
      onNotify(`已有文章已导入，初始 GEO 评分 ${data.audit.overallScore}/100，可右侧一键提权修复`);
      await loadArticleIntoEditor(data.article.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "导入失败", "error");
    } finally {
      setImporting(false);
    }
  };

  const runLiveAudit = async (fixAction?: DiagnosticIssue["fixAction"]) => {
    setAuditing(true);
    try {
      const res = await fetch("/api/articles/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: editBrandId,
          title: editTitle,
          slug: editSlug,
          summary: editSummary,
          targetKeyword: editKeyword,
          directAnswerCapsule: editCapsule,
          markdownContent: editMarkdown,
          faqs: editFaqs,
          jsonLd: editJsonLd,
          weights: editWeights,
          fixAction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "诊断失败");
      setAudit(data.audit);
      if (data.patched) {
        setEditCapsule(data.patched.directAnswerCapsule);
        setEditMarkdown(data.patched.markdownContent);
        setEditFaqs(data.patched.faqs);
        setEditJsonLd(data.patched.jsonLd);
        onNotify(data.patched.changeNote || "已一键优化并重新计算权重分");
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "诊断失败", "error");
    } finally {
      setAuditing(false);
    }
  };

  const handleSaveArticle = async (regenerateSchema = false) => {
    if (!activeArticleId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/articles/${activeArticleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          slug: editSlug,
          summary: editSummary,
          targetKeyword: editKeyword,
          directAnswerCapsule: editCapsule,
          markdownContent: editMarkdown,
          faqs: editFaqs,
          jsonLd: editJsonLd,
          customWeights: editWeights,
          regenerateSchema,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setAudit(data.audit);
      setEditJsonLd(data.article.jsonLd);
      await onRefresh();
      onNotify("文章修改与最新 GEO 评分已保存");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishHub = async () => {
    if (!activeArticleId) return;
    setPublishing(true);
    try {
      await handleSaveArticle(true);
      const res = await fetch(`/api/articles/${activeArticleId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish_hub" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发布失败");
      setEditStatus("published");
      await onRefresh();
      onNotify(`已成功发布至公开 GEO 专栏：/p/${data.article.slug}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "发布失败", "error");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Mode Switcher */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">GEO 智能权重创作工坊</h1>
          <p className="mt-1 text-sm text-slate-500">
            按 5 大 AI 引擎差异化权重设计文章结构，并实时诊断、一键修复至高收录水准。
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold shadow-2xs">
          <button
            type="button"
            onClick={() => setSubMode("architect")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
              subMode === "architect"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            1. 权重架构与生成
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeArticleId && articles[0]) {
                void loadArticleIntoEditor(articles[0].id);
              } else {
                setSubMode("editor");
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
              subMode === "editor"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            2. 实时诊断编辑器
          </button>
          <button
            type="button"
            onClick={() => setSubMode("import")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
              subMode === "import"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileUp className="h-3.5 w-3.5" />
            3. 已有文章改造
          </button>
        </div>
      </div>

      {/* MODE A: WEIGHT-DRIVEN ARCHITECT */}
      {subMode === "architect" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left 7 cols: Brand + AI Engine Matrix + Archetype */}
          <div className="space-y-6 lg:col-span-7">
            {/* Step 1: Select Brand */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  第一步：选择目标品牌 / 产品
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className={hasLlmKey ? "font-semibold text-emerald-700" : "text-slate-500"}>
                    {hasLlmKey ? "实时 LLM 模型已就绪" : "内置零配置引擎"}
                  </span>
                  {!hasLlmKey && onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      30秒接入免费模型Key →
                    </button>
                  )}
                </div>
              </div>
              {brands.length === 0 ? (
                <p className="mt-3 text-xs text-amber-700">
                  请先前往「品牌实体库」创建一个品牌档案。
                </p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {brands.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBrandId(b.id)}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        selectedBrandId === b.id
                          ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-100"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">{b.name}</span>
                        <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {b.category}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{b.oneLiner}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Select Target AI Engines */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  第二步：选择目标 AI 搜索引擎（多选自动融合权重）
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {WEIGHT_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.engines)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {AI_ENGINE_LIST.map((engine) => {
                  const active = targetEngines.includes(engine.id);
                  return (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => toggleEngine(engine.id)}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        active
                          ? "border-indigo-600 bg-indigo-50/70"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{engine.name}</span>
                        <span
                          className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                            active
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-slate-300"
                          }`}
                        >
                          {active && <CheckCircle2 className="h-3 w-3" />}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {engine.tagline}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Archetype & Topic Blueprints */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  第三步：选择高收录文章原型（或一键出选题）
                </h2>
                <button
                  type="button"
                  onClick={handleGenerateTopics}
                  disabled={loadingTopics || !selectedBrandId}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {loadingTopics ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Lightbulb className="h-3.5 w-3.5" />
                  )}
                  AI 生成 6 个高引用选题蓝图
                </button>
              </div>

              {blueprints.length > 0 && (
                <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <div className="text-[11px] font-bold text-amber-900">
                    点击任意推荐选题，自动回填原型与提问意图词：
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {blueprints.map((bp, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setArchetype(bp.archetype);
                          setTargetKeyword(bp.targetKeyword);
                          setTargetChannel(bp.recommendedChannel);
                          setCustomAngle(bp.simulatedAiPrompt);
                          onNotify(`已套用选题：「${bp.targetKeyword}」`);
                        }}
                        className="rounded-lg border border-amber-200/80 bg-white p-2.5 text-left transition hover:border-indigo-400"
                      >
                        <div className="text-xs font-bold text-slate-900 line-clamp-1">
                          {bp.title}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 line-clamp-1">
                          模拟提问：{bp.simulatedAiPrompt}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {ARTICLE_ARCHETYPE_LIST.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setArchetype(item.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      archetype === item.id
                        ? "border-indigo-600 bg-indigo-50/70"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-900">{item.shortName}</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-emerald-700">
                      {item.citationRateLabel}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                      {item.bestFor}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    目标 AI 提问词 / 核心词（选填）
                  </label>
                  <input
                    value={targetKeyword}
                    onChange={(e) => setTargetKeyword(e.target.value)}
                    placeholder="例如：2026适合小微企业的财税软件推荐"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    主发渠道语境适配
                  </label>
                  <select
                    value={targetChannel}
                    onChange={(e) => setTargetChannel(e.target.value as PublishChannelType)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="geo_hub">GeoPulse 官网公开 GEO 专栏（全结构化）</option>
                    <option value="zhihu">知乎深度专栏 / 问答</option>
                    <option value="wechat">微信公众号图文</option>
                    <option value="xiaohongshu">小红书种草测评笔记</option>
                    <option value="csdn">CSDN / 掘金 / 技术博客</option>
                    <option value="wordpress">WordPress / 独立站 HTML</option>
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  补充切入角度或特定要求（选填）
                </label>
                <input
                  value={customAngle}
                  onChange={(e) => setCustomAngle(e.target.value)}
                  placeholder="例如：重点突出 10 人以下初创团队零基础上手、对比年化成本"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Right 5 cols: Live 8-Dimension Weight Matrix + Generate CTA */}
          <div className="space-y-5 lg:col-span-5">
            <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    实时 8 维 GEO 权重配比（总计 100%）
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    已按所选 {targetEngines.length} 个 AI 引擎自动加权，可拖动微调
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWeights(blendEngineWeights(targetEngines))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  重置
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowSliders(!showSliders)}
                className="mt-2 text-[11px] font-medium text-indigo-600 hover:underline"
              >
                {showSliders ? "收起权重滑块" : "展开微调权重滑块"}
              </button>

              {showSliders && (
                <div className="mt-3 space-y-3">
                  {WEIGHT_DIMENSION_IDS.map((dimId) => {
                    const meta = WEIGHT_DIMENSIONS[dimId];
                    const val = weights[dimId];
                    return (
                      <div key={dimId}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700" title={meta.description}>
                            {meta.name}
                          </span>
                          <span className="font-mono font-bold text-indigo-600">{val}%</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={35}
                          step={1}
                          value={Math.round(val)}
                          onChange={(e) => handleWeightSlider(dimId, Number(e.target.value))}
                          className="mt-1 h-1.5 w-full cursor-pointer accent-indigo-600"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
                <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={autoPublish}
                    onChange={(e) => setAutoPublish(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  生成后直接发布至公开 GEO 专栏并同步 /llms.txt
                </label>
              </div>

              <button
                type="button"
                onClick={handleGenerateArticle}
                disabled={generating || batchGenerating || !selectedBrandId}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在按 AI 权重架构生成完整文章...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    一键生成高权重 GEO 文章
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBatchGenerate}
                disabled={generating || batchGenerating || !selectedBrandId}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
              >
                {batchGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在批量生成 3 篇核心矩阵（对比 + 清单 + FAQ）...
                  </>
                ) : (
                  <>
                    <Layers className="h-3.5 w-3.5" />
                    一键批量生成 3 篇核心 GEO 矩阵（对比评测 + 选型清单 + FAQ）
                  </>
                )}
              </button>

              {/* Zero-API-Key Expert Prompt Pack Mode */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPromptPack(!showPromptPack)}
                  disabled={!selectedBrandObj}
                  className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-left text-xs font-bold text-emerald-900 transition hover:bg-emerald-100/70 disabled:opacity-50"
                >
                  <span>💡 无 API Key？导出专家级 GEO 提示词包（用自己的豆包/DeepSeek）</span>
                  <span className="text-[11px] text-emerald-700">
                    {showPromptPack ? "收起" : "展开"}
                  </span>
                </button>

                {showPromptPack && selectedBrandObj && (
                  <div className="mt-3 space-y-2.5 rounded-xl border border-emerald-200 bg-white p-3.5 text-xs">
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      1. 点击下方复制按当前 8 维权重编排好的提示词 → 2. 粘贴到 DeepSeek/豆包/ChatGPT/Kimi 网页版生成 → 3. 点「回填解析」自动提取胶囊、FAQ、算分并发布！
                    </p>
                    <textarea
                      readOnly
                      rows={6}
                      value={externalPromptPackText}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyPromptPack()}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedPrompt ? "已复制提示词包" : "一键复制提示词包"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubMode("import")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        去粘贴 AI 生成结果 →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE C: IMPORT EXISTING ARTICLE FOR GEO AUDIT & REWRITE */}
      {subMode === "import" && (
        <form
          onSubmit={handleImportArticle}
          className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900">
              粘贴已有文章，立即执行 8 维 GEO 权重体检与一键改造
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              适合把企业现有的公众号推文、官网介绍或知乎旧文导入系统，精准找出“为何不被 AI 引擎引用”的短板并一键补齐。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">关联品牌档案 *</label>
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}（{b.category}）
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">目标搜索/提问词</label>
              <input
                value={importKeyword}
                onChange={(e) => setImportKeyword(e.target.value)}
                placeholder="例如：小微企业记账软件推荐"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              文章标题（选填：留空则自动从粘贴内容中的 # 标题提取）
            </label>
            <input
              value={importTitle}
              onChange={(e) => setImportTitle(e.target.value)}
              placeholder="粘贴已有标题，或留空由系统自动提取"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              文章正文 / 外部 AI 生成结果（支持自动解析直答胶囊与 FAQ 并生成 JSON-LD）*
            </label>
            <textarea
              required
              rows={12}
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder="直接粘贴公众号文章、官网文章或知乎草稿正文（至少 30 字）..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3.5 text-xs leading-relaxed"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={importing || !selectedBrandId}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              导入并立即诊断提权
            </button>
          </div>
        </form>
      )}

      {/* MODE B: DUAL-PANE EDITOR & REAL-TIME AUDITOR */}
      {subMode === "editor" && (
        <div className="space-y-4">
          {!activeArticleId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-sm text-slate-600">请先生成一篇文章，或从已有文章中选择一篇编辑。</p>
              <button
                type="button"
                onClick={() => setSubMode("architect")}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
              >
                返回生成新文章
              </button>
            </div>
          ) : (
            <>
              {/* Article Switcher & Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <select
                    value={activeArticleId}
                    onChange={(e) => void loadArticleIntoEditor(e.target.value)}
                    className="max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none"
                  >
                    {articles.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.geoScore}分] {a.title.slice(0, 34)}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      editStatus === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {editStatus === "published" ? "已上线收录" : "草稿"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runLiveAudit()}
                    disabled={auditing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {auditing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    重新实时评分
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveArticle(false)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    保存草稿
                  </button>
                  <button
                    type="button"
                    onClick={handlePublishHub}
                    disabled={publishing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    {publishing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    发布到公开 GEO 专栏
                  </button>
                  <button
                    type="button"
                    onClick={() => onGoPublish(activeArticleId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    多平台导出 / Webhook
                  </button>
                  {editStatus === "published" && (
                    <a
                      href={`/p/${editSlug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      预览
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Dual-Pane Workspace */}
              <div className="grid gap-6 lg:grid-cols-12">
                {/* Left 7 cols: Content Editor */}
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      文章标题（建议包含品牌/品类/2026 时效词）
                    </label>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        公开 URL Slug（/p/slug）
                      </label>
                      <input
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        目标 AI 意图词
                      </label>
                      <input
                        value={editKeyword}
                        onChange={(e) => setEditKeyword(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-indigo-700">
                      首段直答胶囊（Direct Answer Capsule · AI 首选摘录块）
                    </label>
                    <textarea
                      rows={3}
                      value={editCapsule}
                      onChange={(e) => setEditCapsule(e.target.value)}
                      className="w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-xs leading-relaxed text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Sub Tabs: Markdown / FAQ / JSON-LD */}
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setEditorTab("markdown")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
                        editorTab === "markdown"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Markdown 正文
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab("preview")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
                        editorTab === "preview"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      实时渲染预览
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab("faq")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
                        editorTab === "faq"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      FAQ 结构化问答（{editFaqs.length}）
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab("schema")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
                        editorTab === "schema"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      JSON-LD Schema
                    </button>
                  </div>

                  {editorTab === "markdown" && (
                    <textarea
                      rows={20}
                      value={editMarkdown}
                      onChange={(e) => setEditMarkdown(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3.5 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-indigo-500"
                    />
                  )}

                  {editorTab === "preview" && (
                    <div className="max-h-[540px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5">
                      <h2 className="text-lg font-extrabold text-slate-900">{editTitle}</h2>
                      {editCapsule && (
                        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs leading-relaxed text-indigo-950">
                          <div className="font-bold text-indigo-700">核心直答胶囊：</div>
                          <p className="mt-1">{editCapsule}</p>
                        </div>
                      )}
                      <div
                        className="geo-prose mt-4 text-sm"
                        dangerouslySetInnerHTML={{
                          __html: markdownToCleanHtml(editMarkdown),
                        }}
                      />
                    </div>
                  )}

                  {editorTab === "faq" && (
                    <div className="space-y-3">
                      {editFaqs.map((faq, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-indigo-700">
                              FAQ #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditFaqs(editFaqs.filter((_, i) => i !== idx))
                              }
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <input
                            value={faq.question}
                            onChange={(e) => {
                              const next = [...editFaqs];
                              next[idx] = { ...faq, question: e.target.value };
                              setEditFaqs(next);
                            }}
                            placeholder="用户可能向 AI 提问的问句"
                            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                          />
                          <textarea
                            rows={2}
                            value={faq.answer}
                            onChange={(e) => {
                              const next = [...editFaqs];
                              next[idx] = { ...faq, answer: e.target.value };
                              setEditFaqs(next);
                            }}
                            placeholder="先给结论，再给数据/条件依据"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setEditFaqs([...editFaqs, { question: "", answer: "" }])
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新增一组 FAQ
                      </button>
                    </div>
                  )}

                  {editorTab === "schema" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          发布到公开专栏时将自动嵌入页面 &lt;script type=&quot;application/ld+json&quot;&gt;
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSaveArticle(true)}
                          className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          重新编译 Schema
                        </button>
                      </div>
                      <textarea
                        rows={16}
                        value={editJsonLd}
                        onChange={(e) => setEditJsonLd(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-slate-900 p-3.5 font-mono text-[11px] leading-relaxed text-emerald-300 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Right 5 cols: Live GEO Diagnostic & One-Click Fix Panel */}
                <div className="space-y-4 lg:col-span-5">
                  {audit && (
                    <>
                      {/* Score Summary Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold text-slate-500">
                              综合 GEO 收录权重评分
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-4xl font-extrabold text-slate-900">
                                {audit.overallScore}
                              </span>
                              <span className="text-sm font-medium text-slate-400">/ 100</span>
                            </div>
                          </div>
                          <div
                            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black ${
                              audit.grade === "S" || audit.grade === "A"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : audit.grade === "B"
                                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            }`}
                          >
                            {audit.grade}
                          </div>
                        </div>

                        {/* Per-Engine Mini Matrix */}
                        <div className="mt-4 grid grid-cols-5 gap-1.5 border-t border-slate-100 pt-4 text-center">
                          {AI_ENGINE_LIST.map((e) => {
                            const s = audit.engineScores[e.id];
                            return (
                              <div
                                key={e.id}
                                className="rounded-lg bg-slate-50 px-1 py-2"
                              >
                                <div className="truncate text-[10px] font-medium text-slate-500">
                                  {e.shortName.split("·")[0]}
                                </div>
                                <div
                                  className={`mt-0.5 text-sm font-extrabold ${
                                    s >= 85
                                      ? "text-emerald-600"
                                      : s >= 70
                                        ? "text-indigo-600"
                                        : "text-amber-600"
                                  }`}
                                >
                                  {s}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Diagnostics & 1-Click Fixes */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                          <Wand2 className="h-4 w-4 text-indigo-600" />
                          实时诊断与一键提权修复（{audit.issues.length}）
                        </h3>
                        {audit.issues.length === 0 ? (
                          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            恭喜！全部 8 项 GEO 核心权重指标均已达标，可直接发布。
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2.5">
                            {audit.issues.map((issue) => (
                              <div
                                key={issue.id}
                                className={`rounded-xl border p-3 text-xs ${
                                  issue.severity === "critical"
                                    ? "border-rose-200 bg-rose-50/50"
                                    : "border-amber-200 bg-amber-50/50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-1.5">
                                    <AlertTriangle
                                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                                        issue.severity === "critical"
                                          ? "text-rose-600"
                                          : "text-amber-600"
                                      }`}
                                    />
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {issue.title}
                                      </div>
                                      <p className="mt-0.5 text-[11px] text-slate-600">
                                        {issue.detail}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                {issue.fixAction && (
                                  <button
                                    type="button"
                                    onClick={() => void runLiveAudit(issue.fixAction)}
                                    disabled={auditing}
                                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 shadow-2xs ring-1 ring-indigo-200 hover:bg-indigo-50"
                                  >
                                    <Wand2 className="h-3 w-3" />
                                    一键补全优化
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 8-Dimension Breakdown */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                        <h3 className="text-sm font-bold text-slate-900">8 维权重得分明细</h3>
                        <div className="mt-3 space-y-2.5">
                          {WEIGHT_DIMENSION_IDS.map((dimId) => {
                            const score = audit.dimensionScores[dimId];
                            const weightPct = audit.activeWeights[dimId];
                            return (
                              <div key={dimId}>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-slate-700">
                                    {WEIGHT_DIMENSIONS[dimId].name}
                                    <span className="ml-1 text-[10px] text-slate-400">
                                      (权重 {weightPct}%)
                                    </span>
                                  </span>
                                  <span className="font-bold text-slate-900">{score}</span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full ${
                                      score >= 80
                                        ? "bg-emerald-500"
                                        : score >= 60
                                          ? "bg-indigo-500"
                                          : "bg-rose-500"
                                    }`}
                                    style={{ width: `${score}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
