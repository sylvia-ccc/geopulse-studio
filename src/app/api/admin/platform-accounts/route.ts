import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  createPlatformAccount,
  deletePlatformAccount,
  listPlatformAccounts,
  updatePlatformAccount,
} from "@/lib/marketplace";

function forbiddenAdmin() {
  return NextResponse.json({ error: "仅管理员可管理平台矩阵账号池" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();
  return NextResponse.json({ accounts: listPlatformAccounts(true) });
}

const createSchema = z.object({
  name: z.string().min(2, "请填写渠道/账号名称").max(100),
  platformType: z.enum([
    "geo_network",
    "devto",
    "qiita",
    "bluesky",
    "telegraph",
    "github_pages",
    "hashnode",
    "ghost",
    "wordpress",
    "webhook",
    "zhihu_managed",
    "wechat_managed",
    "xiaohongshu_managed",
    "bundle_managed",
  ]),
  deliveryMode: z.enum(["auto_api", "managed_review"]).default("auto_api"),
  region: z.string().max(40).optional().default("Global"),
  handleOrDomain: z.string().max(120).optional().default(""),
  authorityBadge: z.string().max(100).optional().default(""),
  description: z.string().max(400).optional().default(""),
  creditCost: z.number().int().min(0).max(10000).default(25),
  endpointUrl: z.string().max(300).optional().default(""),
  authHeader: z.string().max(80).optional().default("Authorization"),
  credential: z.string().max(400).optional().default(""),
  enabled: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "账号配置参数无效" },
      { status: 400 }
    );
  }

  const account = createPlatformAccount(parsed.data);
  return NextResponse.json({ account }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const body = (await req.json()) as {
    id?: string;
    name?: string;
    region?: string;
    handleOrDomain?: string;
    authorityBadge?: string;
    description?: string;
    creditCost?: number;
    enabled?: boolean;
    endpointUrl?: string;
    credential?: string;
  };
  if (!body.id) return NextResponse.json({ error: "缺少账号 id" }, { status: 400 });

  const updated = updatePlatformAccount(body.id, {
    name: body.name,
    region: body.region,
    handleOrDomain: body.handleOrDomain,
    authorityBadge: body.authorityBadge,
    description: body.description,
    creditCost: body.creditCost,
    enabled: body.enabled,
    endpointUrl: body.endpointUrl,
    credential: body.credential,
  });
  if (!updated) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  return NextResponse.json({ account: updated });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuthUser(req);
  if (!user) return unauthorizedResponse();
  if (user.role !== "admin") return forbiddenAdmin();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  return NextResponse.json({ ok: deletePlatformAccount(id) });
}
