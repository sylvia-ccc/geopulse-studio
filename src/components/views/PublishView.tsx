"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  Send,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import type {
  BrandProfile,
  GeoArticle,
  PublishChannelConfig,
  PublishChannelType,
  PublishLog,
} from "@/types/geo";

interface Props {
  brands: BrandProfile[];
  articles: GeoArticle[];
  channels: PublishChannelConfig[];
  logs: PublishLog[];
  initialArticleId?: string;
  onRefresh: () => Promise<void>;
  onOpenEditor: (articleId: string) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const CHANNEL_PLATFORMS: Array<{ id: PublishChannelType; label: string; desc: string }> = [
  { id: "zhihu", label: "知乎深度专栏", desc: "DeepSeek / 豆包高权源 Markdown" },
  { id: "wechat", label: "微信公众号 HTML", desc: "腾讯元宝核心源，内联样式可直接粘贴" },
  { id: "xiaohongshu", label: "小红书笔记版", desc: "消费/口碑决策 AI 高频引用" },
  { id: "csdn", label: "CSDN / 掘金", desc: "含 Frontmatter 的技术专栏 Markdown" },
  { id: "wordpress", label: "独立站 HTML + JSON-LD", desc: "内嵌完整 Schema 的静态发布包" },
];

export function PublishView({
  brands,
  articles,
  channels,
  logs,
  initialArticleId,
  onRefresh,
  onOpenEditor,
  onNotify,
}: Props) {
  const [selectedArticleId, setSelectedArticleId] = useState<string>(
    initialArticleId || articles[0]?.id || ""
  );
  const [activePlatform, setActivePlatform] = useState<PublishChannelType>("zhihu");
  const [adaptedOutput, setAdaptedOutput] = useState<{
    channelLabel: string;
    format: string;
    filename: string;
    tips: string[];
    output: string;
  } | null>(null);
  const [loadingAdapt, setLoadingAdapt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New Webhook Connector form
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState<"webhook" | "wordpress" | "custom_cms">("webhook");
  const [chUrl, setChUrl] = useState("");
  const [chHeader, setChHeader] = useState("Authorization");
  const [chSecret, setChSecret] = useState("");
  const [savingCh, setSavingCh] = useState(false);

  const selectedArticle = articles.find((a) => a.id === selectedArticleId) || articles[0];

  const handleTogglePublishHub = async (article: GeoArticle) => {
    setBusyId(article.id);
    try {
      const action = article.status === "published" ? "unpublish_hub" : "publish_hub";
      const res = await fetch(`/api/articles/${article.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      await onRefresh();
      onNotify(
        action === "publish_hub"
          ? `已发布上线：/p/${article.slug}，/llms.txt 已同步`
          : "已下线转为草稿"
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteArticle = async (article: GeoArticle) => {
    if (!confirm(`确定删除文章「${article.title}」吗？`)) return;
    const res = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
    if (res.ok) {
      onNotify("文章已删除");
      await onRefresh();
    }
  };

  const handleAdapt = async (platform: PublishChannelType, artId?: string) => {
    const id = artId || selectedArticle?.id;
    if (!id) return;
    setActivePlatform(platform);
    setLoadingAdapt(true);
    try {
      const res = await fetch(`/api/articles/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adapt", channel: platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "转换失败");
      setAdaptedOutput(data.adapted);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "格式转换失败", "error");
    } finally {
      setLoadingAdapt(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!adaptedOutput) return;
    await navigator.clipboard.writeText(adaptedOutput.output);
    setCopied(true);
    onNotify("已复制到剪贴板，可直接粘贴发布");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadOutput = () => {
    if (!adaptedOutput) return;
    const blob = new Blob([adaptedOutput.output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = adaptedOutput.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCh(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: chName,
          type: chType,
          endpointUrl: chUrl,
          authHeader: chHeader,
          secretToken: chSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "添加失败");
      setShowAddChannel(false);
      setChName("");
      setChUrl("");
      setChSecret("");
      await onRefresh();
      onNotify("自动发布连接器已添加");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "添加失败", "error");
    } finally {
      setSavingCh(false);
    }
  };

  const handlePushWebhook = async (channelConfigId: string) => {
    if (!selectedArticle) return;
    setBusyId(channelConfigId);
    try {
      const res = await fetch(`/api/articles/${selectedArticle.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push_webhook", channelConfigId }),
      });
      const data = await res.json();
      await onRefresh();
      if (!res.ok) {
        onNotify(data.error || "推送返回异常，已记录日志", "error");
      } else {
        onNotify(data.log?.message || "Webhook 推送成功");
      }
    } catch {
      onNotify("推送请求失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    const res = await fetch(`/api/channels?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onNotify("连接器已删除");
      await onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">文章库与多渠道发布中心</h1>
          <p className="mt-1 text-sm text-slate-500">
            一键托管到公开 GEO 专栏（自动生成 JSON-LD 与 /llms.txt），或一键转为知乎/公众号/小红书与 Webhook 自动推送。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <a
            href="/hub"
            target="_blank"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Globe2 className="h-3.5 w-3.5 text-indigo-600" />
            公开 GEO 专栏
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="/llms.txt"
            target="_blank"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-mono font-semibold text-slate-700 hover:bg-slate-50"
          >
            /llms.txt
          </a>
        </div>
      </div>

      {/* Articles Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-900">
          全部 GEO 文章（{articles.length}）
        </div>
        {articles.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">暂无文章，请前往创作工坊生成。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {articles.map((art) => {
              const b = brands.find((x) => x.id === art.brandId);
              const isSelected = selectedArticle?.id === art.id;
              return (
                <div
                  key={art.id}
                  className={`flex flex-col justify-between gap-3 px-5 py-4 transition sm:flex-row sm:items-center ${
                    isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50/70"
                  }`}
                >
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => {
                      setSelectedArticleId(art.id);
                      setAdaptedOutput(null);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          art.status === "published"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {art.status === "published" ? "已发布" : "草稿"}
                      </span>
                      {b && <span className="font-semibold text-indigo-600">{b.name}</span>}
                      <span className="font-bold text-slate-700">GEO {art.geoScore} 分</span>
                      <span className="text-slate-400">浏览 {art.views}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-900">
                      {art.title}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenEditor(art.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                    >
                      编辑诊断
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTogglePublishHub(art)}
                      disabled={busyId === art.id}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                        art.status === "published"
                          ? "bg-slate-500 hover:bg-slate-600"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {busyId === art.id
                        ? "处理中..."
                        : art.status === "published"
                          ? "下线"
                          : "一键发布上线"}
                    </button>
                    {art.status === "published" && (
                      <a
                        href={`/p/${art.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        访问
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteArticle(art)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="删除文章"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-Platform Format Adapter */}
      {selectedArticle && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                多平台高权重格式一键适配导出
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                当前选中：<strong className="text-slate-800">{selectedArticle.title}</strong>
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {CHANNEL_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void handleAdapt(p.id, selectedArticle.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  adaptedOutput && activePlatform === p.id
                    ? "border-indigo-600 bg-indigo-50/70"
                    : "border-slate-200 hover:border-indigo-300"
                }`}
              >
                <div className="text-xs font-bold text-slate-900">{p.label}</div>
                <div className="mt-1 text-[11px] text-slate-500">{p.desc}</div>
              </button>
            ))}
          </div>

          {loadingAdapt && (
            <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              正在按平台权重特征转换格式...
            </div>
          )}

          {adaptedOutput && !loadingAdapt && (
            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800">
                  {adaptedOutput.channelLabel}（{adaptedOutput.filename}）
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "已复制" : "一键复制全文"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadOutput}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载文件
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-indigo-50/80 p-3 text-[11px] text-indigo-900">
                <div className="font-bold">平台收录加权建议：</div>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {adaptedOutput.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <textarea
                readOnly
                rows={10}
                value={adaptedOutput.output}
                className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700"
              />
            </div>
          )}
        </div>
      )}

      {/* Webhook & External CMS Connectors */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Webhook className="h-4 w-4 text-indigo-600" />
                Webhook / CMS 自动发布连接器
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                对接企业官网、WordPress、Ghost、飞书/n8n 工作流一键推送
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddChannel(!showAddChannel)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              新增连接器
            </button>
          </div>

          {showAddChannel && (
            <form
              onSubmit={handleCreateChannel}
              className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  value={chName}
                  onChange={(e) => setChName(e.target.value)}
                  placeholder="名称，如：官网博客 Webhook"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                />
                <select
                  value={chType}
                  onChange={(e) =>
                    setChType(e.target.value as "webhook" | "wordpress" | "custom_cms")
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="webhook">通用 Webhook (JSON POST)</option>
                  <option value="wordpress">WordPress REST API</option>
                  <option value="custom_cms">自建官网 CMS 接口</option>
                </select>
              </div>
              <input
                required
                type="url"
                value={chUrl}
                onChange={(e) => setChUrl(e.target.value)}
                placeholder="接收端点 URL，例如 https://your-site.com/api/geo-webhook"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={chHeader}
                  onChange={(e) => setChHeader(e.target.value)}
                  placeholder="鉴权 Header（默认 Authorization）"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                />
                <input
                  value={chSecret}
                  onChange={(e) => setChSecret(e.target.value)}
                  placeholder="Secret / Bearer Token（选填）"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddChannel(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingCh}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white"
                >
                  {savingCh ? "保存中..." : "保存连接器"}
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 space-y-2.5">
            {channels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                暂未配置外部 Webhook 连接器。您已可直接发布至内置公开 GEO 专栏，或点击右上角添加外部 CMS。
              </div>
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">{ch.name}</div>
                    <div className="truncate font-mono text-[11px] text-slate-500">
                      {ch.endpointUrl}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={!selectedArticle || busyId === ch.id}
                      onClick={() => void handlePushWebhook(ch.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      推送选中文章
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteChannel(ch.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Publish Logs */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">发布与推送审计日志</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            记录每一次公开上线与 Webhook 推送的 HTTP 状态与结果
          </p>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-500">暂无日志</p>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                      {l.status === "success" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-500" />
                      )}
                      {l.channelName}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(l.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-slate-700">
                    {l.articleTitle || l.articleId}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{l.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
