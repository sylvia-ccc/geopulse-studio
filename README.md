# GeoPulse Studio 5.1.0

GeoPulse Studio is an MIT-licensed workspace for preparing GEO (Generative Engine Optimization) content, auditing website crawler access, and publishing through configured platform APIs. It uses Next.js 15, React 19, TypeScript, and Node's embedded SQLite.

[Application](https://geo.workagentpro.com) · [Website audit](https://geo.workagentpro.com/audit) · [Source](https://github.com/sylvia-ccc/geopulse-studio) · [Commercial information](./COMMERCIAL_AND_ACQUISITION.md)

## Capabilities and limits

- **Website audit:** checks publicly accessible crawler rules, `/llms.txt`, readable HTML, and structured data. Results are observations at request time; crawler access does not prove that an AI service crawled or indexed a page.
- **Content workspace:** bilingual content templates, five configurable engine weight profiles, eight scoring dimensions, and editing suggestions. Scores are heuristics; they do not predict rankings, recommendation likelihood, or citations.
- **Published hub:** server-rendered article pages, structured data, a sitemap, and an `/llms.txt` index for published content.
- **Platform publishing:** adapters for DEV.to, Bluesky, GitHub Pages, Qiita, Telegraph, Ghost, Hashnode, WordPress, and custom webhooks. Operators must supply authorized credentials and comply with each platform's rules and limits. A delivery success records the provider result; it does not establish a search ranking or citation benefit.
- **Agency tools:** configurable branding, signed shareable report links, browser print-to-PDF, plans, redemption codes, publishing credits, and delivery records.
- **Autopilot:** a topic queue with an explicit editorial gate, atomic worker claims, and honest partial-failure reporting. See the workflow below.

Configured publishing credentials and BYOK keys are encrypted at rest. Keep the deployment secret stable and back it up securely; rotating it without a migration can make existing encrypted values unreadable.

## Run locally

Use **Node 24** for the built-in `node:sqlite` runtime.

```bash
git clone https://github.com/sylvia-ccc/geopulse-studio.git
cd geopulse-studio
npm ci
cp .env.example .env
# Configure a strong SESSION_SECRET and NEXT_PUBLIC_APP_URL in .env.
npm test
npm run dev
```

Review authentication and account-bootstrap configuration before exposing a deployment publicly. Production credentials belong in runtime environment configuration, outside the repository. The historical demo account cannot access protected account or administration routes.

Create the owner with the bundled bootstrap CLI, supplying `ADMIN_EMAIL`, a `SESSION_SECRET` of at least 32 characters, a valid `APP_URL`, and the same database path used by the app. `--migrate-demo-workspace` transfers historical demo-owned workspace records to this owner. The CLI writes a private credentials file before provisioning and never prints its password. It refuses to overwrite an existing ledger file or reset an existing account.

For an operator-managed container, mount a separate private host directory as `/secure`, then run:

```bash
docker exec -it geopulse-studio node scripts/bootstrap-owner.cjs \
  --credentials-file /secure/geopulse-owner.md --migrate-demo-workspace
```

The directory must be writable by the container user, restricted to its owner, and outside `/app`. Credentials files must stay outside Git repositories and application data directories. Local source checkout invocation is `npm run owner:bootstrap -- --credentials-file /absolute/private/owner.md --migrate-demo-workspace`.

## Docker

```bash
docker build -t geopulse-studio:5.1.0 .
mkdir -p data
# Ensure the mounted data directory is writable by container UID 1000.
docker run -d --name geopulse-studio --restart unless-stopped \
  --memory=768m -p 127.0.0.1:3000:3000 --env-file .env \
  -v "$(pwd)/data:/app/data" geopulse-studio:5.1.0
```

The build context excludes local environment files, database files, backups, Git history, and dependency directories. Runtime data persists in `/app/data`; back up that volume before upgrades. The health endpoint is `/api/health` and reports application version `5.1.0`, database connectivity, and process uptime. It does not certify delivery integrations or business outcomes.

For a release rollback, retain the previous image tag and database backup, then recreate the container with that tag and the same runtime settings. For example, after stopping and removing the new container:

```bash
docker run -d --name geopulse-studio --restart unless-stopped \
  --memory=768m -p 127.0.0.1:3000:3000 --env-file .env \
  -v "$(pwd)/data:/app/data" geopulse-studio:previous
```

## Autopilot editorial workflow

`POST /api/cron/autopilot` attempts one queue item. Authenticated administrators manage topics; an automation caller uses the configured `CRON_SECRET` bearer credential. Configure scheduling separately. A daily slot is an attempt to advance the queue, not a guarantee of a published article.

1. A queued topic is atomically claimed as `processing`. Six source-backed English tutorial families can pass the automatic content gate: crawler permissions, llms.txt, Organization JSON-LD, report evidence, canonical syndication, and citation measurement. Each uses a fixed, distinct title and documented scope. The per-owner template ledger allows each tutorial version to be published once; similar queued topics reuse it without another external push.
2. Unsupported briefs, including unverified competitor prices, acquisition claims, and research questions, become editorial **drafts** with `review_pending`. An editor supplies original observations and verifies sources, then removes `<!-- autopilot-review-required -->` and publishes through the editor. A GEO score alone never establishes factual accuracy.
3. A source-backed tutorial is published and distributed in the same attempt. A later attempt can distribute a manually reviewed and published article. Enabled automatic channels are selected unless the topic has an explicit target list. `skipExternalBlast` records the local article only.
4. The topic becomes `published` only after all selected delivery results succeed. Any failed, missing, or unavailable channel yields `failed`; confirmed URLs and the article reference remain available for reconciliation. API acceptance does not independently verify public availability or indexing.

Failed topics are not retried automatically. Inspect their delivery orders and confirmed URLs before any manual recovery so that successful channels are not sent duplicate content. A worker interrupted while `processing` also requires operator inspection before recovery; there is no automatic claim expiry or blind retry.

The seed pack supplies research topics, not researched articles, competitive benchmarks, or promised outcomes. Review or remove previously queued promotional topics and previously published content separately during upgrades.

## Payment webhooks

`POST /api/webhooks/payment` authenticates LemonSqueezy raw-body HMAC-SHA256 using `x-signature`, or a trusted generic bridge using `x-geopulse-webhook-secret`. Both use `PAYMENT_WEBHOOK_SECRET`; use TLS and keep the secret private.

Native LemonSqueezy fulfillment accepts only live, paid, non-refunded `order_created` receipts with a stable order ID, positive total, and one item quantity. Configure `PAYMENT_LEMONSQUEEZY_VARIANT_SKUS` as a JSON object mapping your variant IDs to exact application SKUs, for example `{"123":"credits_100"}`. Product names and checkout metadata are never guessed into entitlements. Supported SKUs are `pro_monthly`, `enterprise_monthly`, `credits_100`, `credits_300`, and `credits_1000`.

`subscription_created` and `subscription_payment_success` notifications are ignored so that overlapping notifications cannot fulfill the initial payment twice. **Native recurring renewal fulfillment is not implemented.** Use a trusted bridge for renewals and send each monetary receipt through exactly one integration path.

A generic bridge must independently verify the original provider's signature, settled payment, product, amount, and live mode before forwarding this normalized payload:

```json
{
  "provider": "stripe",
  "paymentId": "pi_stable_monetary_receipt",
  "buyerEmail": "buyer@example.com",
  "sku": "credits_100",
  "status": "paid",
  "testMode": false,
  "refunded": false,
  "amountTotal": 1000,
  "quantity": 1
}
```

`provider` is `stripe` or `generic`. `paymentId` identifies the actual payment, not a notification or changing event ID; repeated event notifications for that payment are no-ops. `amountTotal` is a positive integer in the provider's minor currency units. The bridge is responsible for checking it against the configured product price. Test purchases, unpaid/free/refunded receipts, unknown SKUs, unsupported quantities, and missing stable payment IDs are rejected.

**Native Stripe `Stripe-Signature` timestamp/signature verification is not implemented.** A `provider: "stripe"` label does not authenticate a native Stripe webhook. The event receipt and fulfillment changes use one SQLite transaction; conflicting receipt data is rejected, and failed fulfillment rolls back the receipt and account changes. Refund/reversal fulfillment and native subscription lifecycle management are not implemented; reconcile these operationally.

The optional growth research pack creates five private tutorial drafts with primary-reference links and editorial prompts. It neither publishes them nor overwrites historical published content; review existing content separately during upgrades.

## Commercial use

MIT permits commercial use subject to its terms. Agencies can evaluate the workspace under their own brand and domain. Subscription settings, checkout links, and integrations require operator configuration and acceptance testing. No revenue, valuation, customer acquisition, ranking, indexing, or citation outcome is promised.

For licensing or implementation discussions, see [commercial information](./COMMERCIAL_AND_ACQUISITION.md).

## 中文说明

GeoPulse Studio 提供网站 AI 爬虫可访问性检查、双语内容编辑与启发式评分、公开文章页面、白标报告及已配置平台 API 分发。可访问性检查与内容评分不代表实际收录、排名或 AI 引用。

Autopilot 对六类有来源的英文技术教程自动执行内容检查、按教程版本去重并发布分发；不会靠改标题重复铺稿。超出此范围的研究选题保留为待核验草稿，补充事实和来源后再发布。每日运行只是队列处理尝试，不保证每日发文。分发部分失败会保留已成功链接并标记失败，不自动重试。邮件始终需要保存收件许可、审核当前草稿版本，再由站点管理员提交发送；服务商接受不等于实际送达。

## License

MIT © 2026 GeoPulse Studio Contributors
