"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Edit3,
  FileBarChart2,
  Globe,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { BrandProfile } from "@/types/geo";

interface Props {
  brands: BrandProfile[];
  onRefresh: () => Promise<void>;
  onStartStudioForBrand: (brandId: string) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const EMPTY_FORM = {
  name: "",
  companyName: "",
  productName: "",
  category: "",
  oneLiner: "",
  targetAudience: "",
  coreAdvantagesText: "",
  proofPointsText: "",
  pricingInfo: "",
  competitorsText: "",
  websiteUrl: "",
  forbiddenWordsText: "",
  regionFocus: "CN" as "CN" | "Global" | "Both",
};

export function BrandsView({
  brands,
  onRefresh,
  onStartStudioForBrand,
  onNotify,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingesting, setIngesting] = useState(false);

  const handleAutoIngest = async () => {
    if (!ingestUrl.trim()) {
      onNotify("请输入官网或产品页链接", "error");
      return;
    }
    setIngesting(true);
    try {
      const normalized = /^https?:\/\//i.test(ingestUrl.trim())
        ? ingestUrl.trim()
        : `https://${ingestUrl.trim()}`;
      const res = await fetch("/api/brands/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "抓取失败");
      const d = data.draft;
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        companyName: d.companyName || prev.companyName,
        productName: d.productName || prev.productName,
        category: d.category || prev.category,
        oneLiner: d.oneLiner || prev.oneLiner,
        targetAudience: d.targetAudience || prev.targetAudience,
        coreAdvantagesText:
          d.coreAdvantages?.length > 0 ? d.coreAdvantages.join("\n") : prev.coreAdvantagesText,
        proofPointsText:
          d.proofPoints?.length > 0 ? d.proofPoints.join("\n") : prev.proofPointsText,
        pricingInfo: d.pricingInfo || prev.pricingInfo,
        websiteUrl: d.websiteUrl || normalized,
      }));
      onNotify("已从官网自动提取品牌实体信息，请核对补充后保存");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "官网抓取失败", "error");
    } finally {
      setIngesting(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (b: BrandProfile) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      companyName: b.companyName,
      productName: b.productName,
      category: b.category,
      oneLiner: b.oneLiner,
      targetAudience: b.targetAudience,
      coreAdvantagesText: b.coreAdvantages.join("\n"),
      proofPointsText: b.proofPoints.join("\n"),
      pricingInfo: b.pricingInfo,
      competitorsText: b.competitors.join("、"),
      websiteUrl: b.websiteUrl,
      forbiddenWordsText: b.forbiddenWords.join("、"),
      regionFocus: b.regionFocus,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        companyName: form.companyName.trim(),
        productName: form.productName.trim() || form.name.trim(),
        category: form.category.trim(),
        oneLiner: form.oneLiner.trim(),
        targetAudience: form.targetAudience.trim(),
        coreAdvantages: form.coreAdvantagesText
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        proofPoints: form.proofPointsText
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        pricingInfo: form.pricingInfo.trim(),
        competitors: form.competitorsText
          .split(/[,，、\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        websiteUrl: form.websiteUrl.trim(),
        forbiddenWords: form.forbiddenWordsText
          .split(/[,，、\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        regionFocus: form.regionFocus,
      };

      const url = editingId ? `/api/brands/${editingId}` : "/api/brands";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");

      onNotify(editingId ? "品牌实体档案已更新" : "品牌实体档案已创建，可立即生成 GEO 文章");
      setShowModal(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除品牌「${name}」及其关联文章吗？此操作不可恢复。`)) return;
    const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
    if (res.ok) {
      onNotify(`已删除品牌「${name}」`);
      await onRefresh();
    } else {
      onNotify("删除失败", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">品牌与产品实体库</h1>
          <p className="mt-1 text-sm text-slate-500">
            中小企业或个人只需填写一次基础信息，系统即自动构建 AI 搜索引擎可精准识别的品牌实体知识卡。
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          新建品牌 / 产品档案
        </button>
      </div>

      {brands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-base font-bold text-slate-800">尚未添加品牌或产品</h3>
          <p className="mt-1 text-sm text-slate-500">
            只需 1 分钟录入产品定位与卖点，即可按不同 AI 引擎权重批量设计高收录文章
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            创建第一个品牌档案
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {brands.map((b) => (
            <div
              key={b.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{b.name}</h2>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        {b.category}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {b.regionFocus === "CN"
                          ? "主攻国内 AI"
                          : b.regionFocus === "Global"
                            ? "主攻海外 AI"
                            : "国内+出海"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      主体：{b.companyName || b.name} · 核心产品：{b.productName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="编辑品牌"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id, b.name)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="删除品牌"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* AI Entity Knowledge Card Preview */}
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    AI 实体定位摘要
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-800">{b.oneLiner}</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-slate-700">目标受众：</span>
                      {b.targetAudience}
                    </div>
                    {b.pricingInfo && (
                      <div>
                        <span className="font-semibold text-slate-700">参考定价：</span>
                        {b.pricingInfo}
                      </div>
                    )}
                  </div>
                </div>

                {b.coreAdvantages.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-700">核心差异卖点</div>
                    <ul className="mt-1.5 space-y-1">
                      {b.coreAdvantages.slice(0, 3).map((adv, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-1.5 text-xs text-slate-600"
                        >
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{adv}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {b.competitors.length > 0 && (
                    <span>对比竞品：{b.competitors.join("、")}</span>
                  )}
                  {b.websiteUrl && (
                    <a
                      href={b.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <Globe className="h-3 w-3" />
                      官网
                    </a>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <a
                  href={`/api/reports/brand/${b.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileBarChart2 className="h-3.5 w-3.5 text-indigo-600" />
                  客户交付报告 (PDF)
                </a>
                <button
                  type="button"
                  onClick={() => onStartStudioForBrand(b.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  设计 GEO 文章
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingId ? "编辑品牌实体档案" : "极简创建品牌 / 产品档案"}
                </h2>
                <p className="text-xs text-slate-500">
                  带 * 为必填项，其余字段越具体，AI 搜索引擎越容易直接摘录您的真实优势
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              {!editingId && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                  <div className="text-xs font-bold text-indigo-900">
                    极速建档：粘贴官网链接，一键自动提取品牌实体信息
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={ingestUrl}
                      onChange={(e) => setIngestUrl(e.target.value)}
                      placeholder="https://your-company.com"
                      className="flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAutoIngest()}
                      disabled={ingesting}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {ingesting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                      智能抓取填充
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    品牌名称 *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例如：轻舟云账 / 森屿咖啡"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    所属品类 *
                  </label>
                  <input
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="例如：小微企业财税 SaaS / 冻干精品咖啡"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    具体产品名称
                  </label>
                  <input
                    value={form.productName}
                    onChange={(e) => setForm({ ...form, productName: e.target.value })}
                    placeholder="留空则默认同品牌名"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    公司主体名称
                  </label>
                  <input
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="例如：杭州轻舟数科有限公司 / 个人工作室"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  一句话核心定位（供 AI 首段直答摘录）*
                </label>
                <input
                  required
                  value={form.oneLiner}
                  onChange={(e) => setForm({ ...form, oneLiner: e.target.value })}
                  placeholder="例如：专为 50 人以下小微企业设计的自动化记账与税务预警云端软件"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    目标客户 / 使用人群 *
                  </label>
                  <input
                    required
                    value={form.targetAudience}
                    onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                    placeholder="例如：小微企业老板、个体户、独立开发者"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    目标市场方向
                  </label>
                  <select
                    value={form.regionFocus}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        regionFocus: e.target.value as "CN" | "Global" | "Both",
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="CN">国内市场（豆包 / DeepSeek / Kimi / 元宝）</option>
                    <option value="Global">出海市场（ChatGPT / Perplexity / Gemini）</option>
                    <option value="Both">国内外全市场覆盖</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  核心差异优势（每行 1 条）
                </label>
                <textarea
                  rows={3}
                  value={form.coreAdvantagesText}
                  onChange={(e) => setForm({ ...form, coreAdvantagesText: e.target.value })}
                  placeholder={"微信收票 3 秒自动记账\n零实施费，当天上线\n内置 2026 最新小微税务风险提醒"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  可验证的量化数据 / 客户案例（每行 1 条，大幅提升 AI 引用权重）
                </label>
                <textarea
                  rows={3}
                  value={form.proofPointsText}
                  onChange={(e) => setForm({ ...form, proofPointsText: e.target.value })}
                  placeholder={"累计服务 5,000+ 小微企业，平均每月节省 10 小时人工录单\n相比传统代账年化综合成本降低 45%"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    参考价格区间
                  </label>
                  <input
                    value={form.pricingInfo}
                    onChange={(e) => setForm({ ...form, pricingInfo: e.target.value })}
                    placeholder="例如：99 元/月起，支持 14 天免费试用"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    对标竞品（顿号或逗号分隔）
                  </label>
                  <input
                    value={form.competitorsText}
                    onChange={(e) => setForm({ ...form, competitorsText: e.target.value })}
                    placeholder="例如：金蝶精斗云、用友畅捷通"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    官网 / 落地页链接
                  </label>
                  <input
                    value={form.websiteUrl}
                    onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                    placeholder="https://yourbrand.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    合规禁用词（顿号分隔，系统自动规避）
                  </label>
                  <input
                    value={form.forbiddenWordsText}
                    onChange={(e) => setForm({ ...form, forbiddenWordsText: e.target.value })}
                    placeholder="例如：绝对第一、包治百病"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "保存修改" : "保存品牌档案"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
