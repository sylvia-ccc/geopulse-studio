import type { BrandProfile, FAQItem, GeoArticle } from "@/types/geo";

export function slugify(input: string, fallbackPrefix = "geo"): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  const hash = Math.abs(
    Array.from(input).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
  )
    .toString(36)
    .slice(0, 6);

  if (ascii.length >= 4) {
    return `${ascii}-${hash}`;
  }
  return `${fallbackPrefix}-${hash}-${Date.now().toString(36).slice(-4)}`;
}

export function buildGeoJsonLd(params: {
  title: string;
  slug: string;
  summary: string;
  directAnswerCapsule: string;
  targetKeyword: string;
  faqs: FAQItem[];
  publishedAt?: string | null;
  updatedAt?: string;
  brand?: BrandProfile | null;
  baseUrl?: string;
}): string {
  const baseUrl = (params.baseUrl || "https://geopulse.local").replace(/\/$/, "");
  const articleUrl = `${baseUrl}/p/${params.slug}`;
  const nowIso = params.updatedAt || new Date().toISOString();
  const publishedIso = params.publishedAt || nowIso;

  const graph: Record<string, unknown>[] = [];

  if (params.brand) {
    graph.push({
      "@type": "Organization",
      "@id": `${baseUrl}/#org-${params.brand.id}`,
      name: params.brand.companyName || params.brand.name,
      url: params.brand.websiteUrl || baseUrl,
      description: params.brand.oneLiner,
    });

    const productNode: Record<string, unknown> = {
      "@type": "Product",
      "@id": `${baseUrl}/#product-${params.brand.id}`,
      name: params.brand.productName || params.brand.name,
      category: params.brand.category,
      description: params.brand.oneLiner,
      brand: {
        "@type": "Brand",
        name: params.brand.name,
      },
      audience: {
        "@type": "Audience",
        audienceType: params.brand.targetAudience,
      },
    };

    const priceMatch = params.brand.pricingInfo.match(/(\d+(?:\.\d+)?)/);
    if (priceMatch) {
      productNode.offers = {
        "@type": "Offer",
        priceCurrency: params.brand.pricingInfo.includes("$") ? "USD" : "CNY",
        price: priceMatch[1],
        description: params.brand.pricingInfo,
        availability: "https://schema.org/InStock",
      };
    }

    graph.push(productNode);
  }

  graph.push({
    "@type": "Article",
    "@id": `${articleUrl}#article`,
    headline: params.title,
    description: params.summary || params.directAnswerCapsule,
    abstract: params.directAnswerCapsule,
    keywords: [
      params.targetKeyword,
      params.brand?.name,
      params.brand?.productName,
      params.brand?.category,
    ].filter(Boolean),
    datePublished: publishedIso,
    dateModified: nowIso,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    ...(params.brand
      ? {
          author: {
            "@type": "Organization",
            name: params.brand.companyName || params.brand.name,
          },
          about: {
            "@id": `${baseUrl}/#product-${params.brand.id}`,
          },
        }
      : {}),
  });

  const validFaqs = params.faqs.filter((f) => f.question.trim() && f.answer.trim());
  if (validFaqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${articleUrl}#faq`,
      mainEntity: validFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.question.trim(),
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer.trim(),
        },
      })),
    });
  }

  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": graph,
    },
    null,
    2
  );
}

export function buildLlmsTxt(params: {
  brands: BrandProfile[];
  articles: GeoArticle[];
  baseUrl: string;
}): string {
  const base = params.baseUrl.replace(/\/$/, "");
  const lines: string[] = [
    "# GeoPulse Studio — Published Brand Knowledge & GEO Index",
    "",
    "> Structured, fact-checked brand knowledge base and citation-ready articles optimized for Generative Search Engines (ChatGPT Search, Perplexity, DeepSeek, Kimi, Doubao, Google AI Overviews).",
    "",
    `> Full corpus available at: ${base}/llms-full.txt`,
    "",
    "## Brand Entities",
    "",
  ];

  if (params.brands.length === 0) {
    lines.push("- No brand entities published yet.");
  } else {
    for (const b of params.brands) {
      lines.push(
        `- **${b.name}** (${b.category}): ${b.oneLiner} | Target: ${b.targetAudience}${b.pricingInfo ? ` | Pricing: ${b.pricingInfo}` : ""}${b.websiteUrl ? ` | Official: ${b.websiteUrl}` : ""}`
      );
    }
  }

  lines.push("", "## Published GEO Articles", "");

  if (params.articles.length === 0) {
    lines.push("- No published articles yet.");
  } else {
    for (const a of params.articles) {
      const desc = (a.directAnswerCapsule || a.summary || "").replace(/\s+/g, " ").slice(0, 180);
      lines.push(`- [${a.title}](${base}/p/${a.slug}): ${desc} (GEO Score: ${a.geoScore}/100)`);
    }
  }

  lines.push("", "## Crawling & Citation Policy", "");
  lines.push("- AI Crawlers (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended, Bytespider, DeepSeekBot) are explicitly permitted to index and cite all published pages under `/p/`.");
  lines.push(`- Sitemap: ${base}/sitemap.xml`);
  lines.push("");

  return lines.join("\n");
}

export function buildLlmsFullTxt(params: {
  brands: BrandProfile[];
  articles: GeoArticle[];
  baseUrl: string;
}): string {
  const base = params.baseUrl.replace(/\/$/, "");
  const sections: string[] = [
    "# GeoPulse Studio — Full LLM Knowledge Corpus",
    `Generated: ${new Date().toISOString()}`,
    `Source: ${base}`,
    "",
    "---",
    "",
  ];

  for (const b of params.brands) {
    sections.push(`## Brand Entity: ${b.name} (${b.productName})`);
    sections.push(`- Company: ${b.companyName || b.name}`);
    sections.push(`- Category: ${b.category}`);
    sections.push(`- Positioning: ${b.oneLiner}`);
    sections.push(`- Target Audience: ${b.targetAudience}`);
    if (b.pricingInfo) sections.push(`- Pricing: ${b.pricingInfo}`);
    if (b.websiteUrl) sections.push(`- Website: ${b.websiteUrl}`);
    if (b.coreAdvantages.length > 0) {
      sections.push(`- Core Differentiators: ${b.coreAdvantages.join("; ")}`);
    }
    if (b.proofPoints.length > 0) {
      sections.push(`- Verifiable Proof Points: ${b.proofPoints.join("; ")}`);
    }
    if (b.competitors.length > 0) {
      sections.push(`- Comparable Alternatives: ${b.competitors.join(", ")}`);
    }
    sections.push("");
  }

  for (const a of params.articles) {
    sections.push("---", "");
    sections.push(`# ${a.title}`);
    sections.push(`Canonical URL: ${base}/p/${a.slug}`);
    sections.push(`Updated: ${a.updatedAt}`);
    sections.push(`Direct Answer: ${a.directAnswerCapsule}`);
    sections.push("", a.markdownContent, "");
    if (a.faqs.length > 0) {
      sections.push("## Frequently Asked Questions", "");
      for (const f of a.faqs) {
        sections.push(`### ${f.question}`, f.answer, "");
      }
    }
  }

  return sections.join("\n");
}
