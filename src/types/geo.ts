export type AIEngineId =
  | "doubao"
  | "deepseek"
  | "chatgpt"
  | "perplexity"
  | "gemini";

export type WeightDimensionId =
  | "directAnswer"
  | "entityClarity"
  | "structuredBlocks"
  | "verifiableFacts"
  | "faqCoverage"
  | "neutralAuthority"
  | "machineSchema"
  | "channelFit";

export type WeightVector = Record<WeightDimensionId, number>;

export type ArticleArchetype =
  | "category_guide"
  | "comparison_matrix"
  | "buyers_checklist"
  | "howto_playbook"
  | "faq_hub"
  | "case_benchmark";

export type PlanTier = "free" | "pro" | "enterprise";

export type UserRole = "user" | "admin";

export type FunnelStage = "awareness" | "comparison" | "decision" | "trust";

export type PublishChannelType =
  | "geo_hub"
  | "zhihu"
  | "wechat"
  | "xiaohongshu"
  | "csdn"
  | "wordpress"
  | "webhook";

export interface AIEngineProfile {
  id: AIEngineId;
  name: string;
  shortName: string;
  region: "CN" | "Global";
  tagline: string;
  crawlerAgent: string;
  preferredChannels: string[];
  citationStyle: string;
  weights: WeightVector;
  keyTips: string[];
}

export interface WeightDimensionMeta {
  id: WeightDimensionId;
  name: string;
  shortName: string;
  description: string;
  optimizationHint: string;
}

export interface BrandProfile {
  id: string;
  userId: string;
  name: string;
  companyName: string;
  productName: string;
  category: string;
  oneLiner: string;
  targetAudience: string;
  coreAdvantages: string[];
  proofPoints: string[];
  pricingInfo: string;
  competitors: string[];
  websiteUrl: string;
  forbiddenWords: string[];
  regionFocus: "CN" | "Global" | "Both";
  createdAt: string;
  updatedAt: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ComparisonRow {
  dimension: string;
  brandValue: string;
  competitorValues: Record<string, string>;
}

export interface ComparisonTable {
  competitors: string[];
  rows: ComparisonRow[];
}

export interface DiagnosticIssue {
  id: string;
  dimension: WeightDimensionId;
  severity: "critical" | "warning" | "tip";
  title: string;
  detail: string;
  fixAction?:
    | "insert_direct_answer"
    | "insert_comparison_table"
    | "insert_faq_block"
    | "regenerate_schema"
    | "neutralize_tone"
    | "insert_proof_block";
}

export interface GeoAuditResult {
  overallScore: number;
  grade: "S" | "A" | "B" | "C" | "D";
  dimensionScores: Record<WeightDimensionId, number>;
  engineScores: Record<AIEngineId, number>;
  activeWeights: WeightVector;
  metrics: {
    wordCount: number;
    headingCount: number;
    tableCount: number;
    listItemCount: number;
    faqCount: number;
    brandMentions: number;
    numericEvidenceCount: number;
    hypeWordMatches: string[];
    hasDirectAnswerLead: boolean;
    hasValidJsonLd: boolean;
  };
  issues: DiagnosticIssue[];
  strengths: string[];
}

export interface GeoArticle {
  id: string;
  userId: string;
  brandId: string;
  title: string;
  slug: string;
  summary: string;
  archetype: ArticleArchetype;
  targetEngines: AIEngineId[];
  customWeights: WeightVector;
  targetChannel: PublishChannelType;
  targetKeyword: string;
  directAnswerCapsule: string;
  markdownContent: string;
  faqs: FAQItem[];
  comparisonTable: ComparisonTable | null;
  jsonLd: string;
  geoScore: number;
  engineScores: Record<AIEngineId, number>;
  dimensionScores: Record<WeightDimensionId, number>;
  status: "draft" | "published";
  generationMode: "llm" | "builtin";
  views: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishChannelConfig {
  id: string;
  userId: string;
  name: string;
  type: "webhook" | "wordpress" | "custom_cms";
  endpointUrl: string;
  authHeader: string;
  secretToken: string;
  enabled: boolean;
  createdAt: string;
}

export interface PublishLog {
  id: string;
  userId: string;
  articleId: string;
  articleTitle?: string;
  channelType: string;
  channelName: string;
  status: "success" | "failed";
  httpStatus: number | null;
  externalUrl: string;
  message: string;
  createdAt: string;
}

export interface CitationCheck {
  id: string;
  userId: string;
  brandId: string;
  brandName?: string;
  promptQuery: string;
  engineId: AIEngineId;
  mentioned: boolean;
  citedUrl: string;
  sourceDomain: string;
  competitorsMentioned: string[];
  hasHallucination: boolean;
  funnelStage: FunnelStage;
  positionRank: number | null;
  sentiment: "positive" | "neutral" | "negative";
  snippet: string;
  mode: "live_llm" | "manual";
  checkedAt: string;
}

export interface RedemptionCode {
  id: string;
  code: string;
  codeType: "plan" | "credits";
  plan: PlanTier;
  durationDays: number;
  creditsAmount: number;
  status: "active" | "redeemed" | "revoked";
  redeemedByUserId: string | null;
  redeemedByEmail: string | null;
  redeemedAt: string | null;
  note: string;
  createdAt: string;
}

export type PlatformAccountType =
  | "geo_network"
  | "devto"
  | "qiita"
  | "bluesky"
  | "telegraph"
  | "github_pages"
  | "hashnode"
  | "ghost"
  | "wordpress"
  | "webhook"
  | "zhihu_managed"
  | "wechat_managed"
  | "xiaohongshu_managed"
  | "bundle_managed";

export interface PlatformAccount {
  id: string;
  name: string;
  platformType: PlatformAccountType;
  deliveryMode: "auto_api" | "managed_review";
  region: string;
  handleOrDomain: string;
  authorityBadge: string;
  description: string;
  creditCost: number;
  endpointUrl: string;
  authHeader: string;
  hasCredential: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface DistributionOrder {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  articleId: string;
  articleTitle?: string;
  articleSlug?: string;
  articleGeoScore?: number;
  platformAccountId: string;
  platformName: string;
  platformType: PlatformAccountType;
  deliveryMode: "auto_api" | "managed_review";
  creditsCharged: number;
  status: "pending_review" | "published" | "rejected" | "failed";
  publishedUrl: string;
  customerNote: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  refId: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  company: string;
  role: UserRole;
  plan: PlanTier;
  planExpiresAt: string | null;
  creditsBalance: number;
  apiKey: string;
  llmProvider: "none" | "openai" | "deepseek" | "gemini" | "custom";
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  createdAt: string;
}

export interface CommercialSiteSettings {
  brandTitle: string;
  contactWechatOrEmail: string;
  checkoutProUrl: string;
  checkoutEnterpriseUrl: string;
  checkoutCreditsUrl: string;
  agencyLogoUrl: string;
  agencyAccentColor: string;
  hidePoweredBy: boolean;
  acquisitionNote: string;
  announcement: string;
  strictBilling: boolean;
}

export interface GrowthTopic {
  id: string;
  userId: string;
  brandId: string;
  titleHint: string;
  keyword: string;
  language: "en" | "zh";
  archetype: ArticleArchetype;
  targetAccountIds: string[];
  status: "queued" | "published" | "failed";
  articleId: string;
  publishedUrls: string[];
  errorMsg: string;
  createdAt: string;
  executedAt: string | null;
}

export type OutreachSegment = "agency_white_label" | "saas_growth" | "strategic_acquirer";

export interface OutreachLead {
  id: string;
  userId: string;
  companyName: string;
  contactName: string;
  email: string;
  websiteUrl: string;
  segment: OutreachSegment;
  auditScore: number | null;
  auditGrade: string;
  auditMissing: string[];
  emailSubject: string;
  emailBody: string;
  status: "new" | "audited" | "emailed" | "replied" | "converted" | "unsubscribed";
  lastSentAt: string | null;
  unsubscribed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachEmailConfig {
  provider: "none" | "resend" | "brevo" | "webhook";
  fromName: string;
  fromEmail: string;
  replyTo: string;
  webhookUrl: string;
  dailyLimit: number;
  hasApiKey: boolean;
  sentToday: number;
}

export interface PlanQuota {
  tier: PlanTier;
  label: string;
  priceMonthlyCny: number;
  maxBrands: number;
  maxArticlesPerMonth: number;
  maxWebhooks: number;
  liveLlmEnabled: boolean;
  customWeightsEnabled: boolean;
  publicHubEnabled: boolean;
}
