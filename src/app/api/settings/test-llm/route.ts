import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    llmProvider?: string;
    llmBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
  };

  const provider = body.llmProvider || user.llmProvider;
  const apiKey = body.llmApiKey?.trim() || user.llmApiKey;
  if (!provider || provider === "none" || !apiKey) {
    return NextResponse.json({ ok: false, error: "请先选择模型服务商并填写 API Key" }, { status: 400 });
  }

  const baseUrl = (
    body.llmBaseUrl?.trim() ||
    user.llmBaseUrl?.trim() ||
    (provider === "deepseek"
      ? "https://api.deepseek.com/v1"
      : provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/openai"
        : "https://api.openai.com/v1")
  ).replace(/\/$/, "");

  const model =
    body.llmModel?.trim() ||
    user.llmModel?.trim() ||
    (provider === "deepseek"
      ? "deepseek-chat"
      : provider === "gemini"
        ? "gemini-2.5-flash"
        : "gpt-4o-mini");

  try {
    const start = Date.now();
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with OK only." }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 120)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      model,
      latencyMs,
      message: `连通成功（模型 ${model}，延迟 ${latencyMs}ms）`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "连接超时" },
      { status: 502 }
    );
  }
}
