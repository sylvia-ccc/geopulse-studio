export interface VerifiedAutopilotContent {
  key: string;
  title: string;
  capsule: string;
  markdown: string;
  faqs: Array<{ question: string; answer: string }>;
  sourceUrls: string[];
}

type Topic = { titleHint: string; keyword: string; language: "en" | "zh" };
type Template = Omit<VerifiedAutopilotContent, "markdown"> & { body: string; matches: (title: string, all: string) => boolean };

const repo = "https://github.com/sylvia-ccc/geopulse-studio/blob/main";
const templates: Template[] = [
  {
    key: "crawler-permissions-evidence-v1",
    title: "How to Check AI Crawler Permissions Without Confusing Access With Citations",
    capsule: "Check the robots.txt rules for each documented crawler, then distinguish declared permission, observed requests, and search citations. An allowed user-agent is neither verified bot identity nor evidence that an answer engine indexed or cited a page.",
    matches: (title, all) => /robots|crawler|gptbot|claudebot|perplexitybot/.test(title) && /robots|crawler|bot/.test(all),
    sourceUrls: ["https://developers.google.com/search/docs/crawling-indexing/robots/intro", "https://platform.openai.com/docs/bots", `${repo}/src/lib/telemetry.ts`],
    body: `## Start with three separate questions

A crawler access review should answer what your site permits, what your server observed, and what an answer engine displayed. These questions require different evidence. A robots.txt rule expresses a crawling preference for cooperating agents. A request log records a request. An answer with a source link records an observed citation. Moving directly from the first item to the third produces a claim the evidence cannot support.

Google's robots documentation also explains why robots.txt is not a reliable method of preventing indexing: a blocked URL can still be discovered through other links. Use the appropriate indexing controls for the relevant search engine. Keep authentication in front of private content; robots.txt is public and is not an access control system.

## Map the agents to the purpose you want to control

Use the provider's own bot documentation to record the current user-agent names and their stated purposes. OpenAI documents separate agents for search discovery, model training, and certain user-initiated visits. Do not assume that blocking a training crawler blocks every search feature, or that allowing one name authorizes every provider activity. Recheck the documentation when your policy changes.

For each agent, write down the desired policy, the relevant path, the applicable robots group, and the date checked. Evaluate the actual group-selection and path-matching behavior rather than treating every occurrence of Allow as a site-wide permission. Rules on one origin do not describe every subdomain, protocol, or host variation.

## Run a repeatable permission check

1. Open the public robots.txt for the exact origin being reviewed. Save the response status, retrieval time, and response body.
2. Choose a public article URL, a private application route, and an intentionally excluded path. Avoid testing with confidential query parameters.
3. Evaluate each path against the selected agent's rules. Record unknown or unreachable separately from allowed and disallowed.
4. Check whether the public article actually loads without authentication, challenge pages, or redirect loops. Robots permission alone does not establish retrieval success.
5. Keep a dated record of any rule change so later observations can be compared with the policy that existed at the time.

An illustrative evidence row might contain “agent: OAI-SearchBot; path: /guides/example; policy observation: allowed; request observed: not checked; citation observed: not checked.” This is a record format, not a measured result. Keeping the final two fields explicit prevents a permissions check from becoming an unsupported visibility claim.

## Interpret server evidence carefully

A user-agent string can be copied. Validate crawler identity using the provider's documented verification method where one exists; otherwise describe the request as claiming that identity. Preserve timestamps, response codes, and relevant paths without exporting secrets or personal data. One request does not show that a whole article was retained or used in a generated answer.

The linked GeoPulse telemetry implementation classifies some requests using user-agent patterns. That code is implementation evidence for a classification rule, not independent proof of crawler identity. Event counts can include repeated requests and should not be presented as unique users, indexing coverage, or citations.

## Close the review with bounded conclusions

Report a status such as “the saved robots policy permits the documented agent on this path.” If you also have a verified request or an observed answer, attach that separate evidence. When the result is uncertain, keep it uncertain. A dated, reproducible finding is more useful than an unqualified promise that a configuration change will generate traffic.`,
    faqs: [
      { question: "Does allowing GPTBot guarantee a ChatGPT citation?", answer: "No. Permission, retrieval, indexing, and selection as an answer source are separate observations. Check the documented purpose of each bot and measure citations directly." },
      { question: "Is a bot name in my logs proof of identity?", answer: "No. User-agent text is self-reported. Use the provider's documented verification method when available and label unverified requests accurately." },
    ],
  },
  {
    key: "llms-txt-proposal-checklist-v1",
    title: "How to Publish an llms.txt Guide With Clear Limits and Useful Links",
    capsule: "Treat llms.txt as an optional proposal for describing useful website resources. Publish accurate links, test the file, and measure observed fetches separately; the file is not a standardized ranking signal or a guarantee of AI citations.",
    matches: (title) => /llms[.-]?(?:full\.)?txt|llms\.txt/.test(title),
    sourceUrls: ["https://llmstxt.org/", "https://developers.google.com/search/docs/crawling-indexing/robots/intro", `${repo}/src/lib/telemetry.ts`],
    body: `## Decide whether the file solves a reader problem

The llms.txt proposal describes a Markdown document that helps people and language-model tools find useful material on a website. It can be a convenient editorial index when documentation is scattered across many pages. The proposal itself does not establish a standardized ranking signal or a commitment by every answer engine to fetch the file. Do not present adding it as a completed distribution strategy.

Start by defining its audience. A product documentation site might point to setup instructions, API references, and support policies. A publication might point to its topic guides and correction policy. Select resources because they are accurate and useful, rather than because a keyword list looks comprehensive.

## Create a small, maintainable index

Follow the proposal's structure: a top-level site title, a short summary, any necessary explanatory text, and sections containing descriptive links. Keep the descriptions factual. Prefer stable public URLs that a visitor can open directly. If an optional section contains material of secondary importance, label it so a reader can distinguish it from essential references.

An illustrative outline for a documentation website is:

- Site title and a one-sentence description of the documentation.
- A getting-started section linking to installation and configuration.
- A reference section linking to the supported API and release notes.
- A support section linking to current support policies and known limitations.

This outline is an example of organization, not proof that any provider consumes a particular section. The proposal discusses additional conventions, including links to Markdown representations. Implement those only where your publishing system can maintain them correctly; do not create links to files that do not exist.

## Check the document before publishing it

1. Read each description against the destination page. Remove features or promises that the page does not substantiate.
2. Request the public file from its intended origin and confirm a successful response with readable content.
3. Open every linked URL. Resolve broken links, surprising redirects, login requirements, and stale paths.
4. Verify that the file contains no private document locations, account tokens, unpublished plans, or internal support notes.
5. Assign an owner and a review trigger, such as a documentation release or a changed product policy.

Maintain a revision record alongside the site. Record what changed and why, and retain enough history to identify which links existed when a tool fetched the file. Avoid stuffing the document with duplicated marketing text; an index becomes less useful when it is harder to navigate than the site itself.

## Keep crawling controls and discovery aids separate

The llms.txt proposal does not replace robots.txt, authentication, sitemaps, or normal navigation. Google documents robots.txt as a crawling instruction mechanism with specific limitations. A descriptive index and a crawling rule serve different purposes. Check each mechanism according to its own documentation and do not assume that a private-looking URL is protected merely because it was omitted from an index.

If your site also offers a larger Markdown export, test its size, freshness, and consistency with the linked pages. Avoid implying that a particular export filename is universally required. Publish only the formats you can keep accurate.

## Measure adoption without inventing results

Record observed requests to the file over a defined window, and state whether bot identity was independently verified. The linked GeoPulse telemetry code includes llms fetch events and user-agent classification; it demonstrates an implementation approach, not a customer result. Repeated requests are not unique readers, and a fetch is not an answer citation.

To investigate downstream use, run a separate documented citation experiment. Keep the prompt, engine, date, and inspected answers. If no use is observed, report that bounded observation instead of turning a successfully served text file into a claim about rankings.`,
    faqs: [
      { question: "Is llms.txt required for AI search visibility?", answer: "The linked specification is a proposal. It does not establish a universal requirement, standardized ranking signal, or guaranteed citation benefit." },
      { question: "Does an llms.txt request prove my content was cited?", answer: "No. A request demonstrates an observed fetch under the logging rules used. Verify answer citations as a separate measurement." },
    ],
  },
  {
    key: "organization-jsonld-validation-v1",
    title: "How to Validate Organization JSON-LD Without Promising Rich Results",
    capsule: "Describe the organization truthfully, validate JSON syntax and schema usage, and check search eligibility separately. Valid JSON-LD is a technical property; rich-result display and AI citations require separate evidence.",
    matches: (title) => /json[ -]?ld|structured data|schema\.org|organization schema/.test(title),
    sourceUrls: ["https://schema.org/Organization", "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data", "https://search.google.com/test/rich-results"],
    body: `## Define the claim before choosing the markup

Organization structured data describes an entity using a shared vocabulary. Begin with facts that the public website supports: the organization's name, its official URL, and relevant identity references. A vocabulary can represent many properties, but the existence of a property does not make every value appropriate for your business.

Schema.org defines the Organization type and its properties. Google's structured-data documentation explains a separate layer: supported search features, their requirements, and quality guidelines. Treat these as related references with different purposes. General vocabulary validity does not automatically establish eligibility for a particular search appearance.

## Build the smallest truthful entity record

A minimal illustrative record could describe an Organization with a name such as “Example Documentation Company” and the URL https://example.com/. This is fictional example data for understanding the shape of a record; it is not a customer, an endorsement, or a performance result. Replace example facts with independently checked facts before deploying your own markup.

Use a stable identifier when you need multiple pages to refer to the same entity. Confirm that the logo URL resolves to the intended public image. Add sameAs references only when they identify the same organization. A link to a review, an article about the organization, or a loosely related account does not automatically serve that purpose.

Avoid importing unsupported ratings, awards, customer totals, or claims of leadership into structured data. Machine-readable content should remain consistent with what a visitor can verify on the page. If an organizational fact changes, update both the visible content and the structured record.

## Validate four separate layers

1. Parse the JSON. Check for trailing commas, missing quotation marks, malformed strings, and unexpected escaping after rendering.
2. Check the vocabulary. Confirm that types and properties match the Schema.org definitions and that value shapes are sensible.
3. Check the published page. Inspect the actual rendered script, its public availability, and its agreement with visible facts.
4. Test applicable Google features using the Rich Results Test and the relevant feature documentation. Record unsupported types or missing eligibility information without turning them into a blanket failure of JSON-LD.

Keep a dated validation record containing the page URL, markup revision, test used, and specific findings. Separate syntax errors from recommended properties and from policy concerns. This makes the next engineering action clear instead of reducing several kinds of problem to a single unexplained score.

## Review entity consistency across pages

Inspect the homepage, contact page, and representative articles for conflicting names or identifiers. A website can describe several organizations, such as a publisher and an article's subject. Assign the correct roles instead of copying the same entity block into every available field.

If a plugin generates markup automatically, inspect its output after changes to themes, plugins, or content templates. Duplicate blocks can disagree even when each block parses independently. Keep the public canonical URL and organization identity consistent with the website's actual routing and ownership.

## Report validation as validation

Google explains that structured data can make content eligible for certain search features but does not guarantee display. A passing test is not evidence that a search engine showed a rich result, and a rich result is not evidence of an AI answer citation. Record those observations separately with the search context and date.

A useful handoff states what was checked, what passed, what remains uncertain, and which page revision was tested. If you later observe a search appearance, preserve the observation without claiming that markup alone caused it. Other content and search conditions can change at the same time.`,
    faqs: [
      { question: "Does valid JSON-LD guarantee a Google rich result?", answer: "No. Syntax, vocabulary validity, eligibility, and actual display are different checks. Google explicitly does not guarantee rich-result display." },
      { question: "Should I add claims that appear only in the markup?", answer: "Use truthful, supported facts consistent with the visible page and applicable structured-data guidelines. Markup is not a place to introduce unsupported ratings or outcomes." },
    ],
  },
  {
    key: "agency-report-provenance-v1",
    title: "How to Review a White-Label GEO Report With Traceable Evidence",
    capsule: "Review a client report by tracing each metric to its sample, denominator, date range, and collection method. Separate report presentation, automated audit checks, recorded mentions, and observed business outcomes.",
    matches: (title, all) => /white[ -]label|agency|client report/.test(title) && /report|workflow|measurement|evidence/.test(all),
    sourceUrls: [`${repo}/src/app/r/%5Bid%5D/page.tsx`, `${repo}/src/lib/telemetry.ts`, `${repo}/src/app/api/citations/route.ts`],
    body: `## Start with the decision the report supports

A white-label report is a presentation format. Agency branding does not change the strength of the underlying evidence. Before sending a report, decide whether the reader is evaluating published content, technical audit findings, sampled AI answers, or business activity. Each requires a different measurement method and a different set of limitations.

The linked GeoPulse report route is implementation evidence. It shows how this repository assembles a shareable report from stored articles, citation checks, and publishing logs. It is not an independent evaluation of an agency, a customer case study, or proof of improved visibility. Review the actual deployed version before treating the source as a description of your own installation.

## Build a metric dictionary alongside the report

For every displayed metric, record its definition, source table or collection process, time window, numerator, denominator, and relevant exclusions. Use explicit labels such as “recorded positive mention checks divided by all stored checks in the selected sample.” Avoid abbreviating that to universal visibility across an entire engine.

In the linked report implementation, the average content score is computed from the brand's stored articles, while the mention rate is derived from stored citation checks. These populations differ. Confirm whether a section uses all available records or a date-filtered subset; a date in a report heading does not automatically apply a filter to every query.

The report's entity share calculation counts recorded brand and competitor mentions within its available checks. Describe that denominator precisely. It should not be presented as market share, audience share, or a census of every answer an engine produced.

## Preserve the evidence needed to reproduce a number

1. Export the record identifiers and collection timestamps supporting the metric.
2. For AI answer checks, retain the prompt, engine, model information when available, and the inspected response or evidence location.
3. Distinguish a brand-name mention from a clickable citation to the intended website.
4. Record failures and unreviewed answers separately so missing observations cannot silently improve the rate.
5. State the rounding rule and preserve raw counts beside percentages.

A sample definition should make repeated observations visible. Several runs of one prompt are not the same coverage as several independent questions. If an engine was unavailable, disclose the missing portion of the planned sample. Avoid presenting a small convenience sample as a statistically representative benchmark.

## Review access and telemetry separately

The linked shareable report route requires a token and sets indexing restrictions. Treat a share link as a private access capability, and avoid copying its token into public articles, screenshots, or exported analytics. Confirm permissions before distributing a report to a client contact.

The linked telemetry implementation stores several request and activity event types. A report view is a recorded request under those rules, not necessarily a unique human reader. User-agent classification is not independently verified bot identity. Check the selected time window and explain whether repeated requests, prefetch filtering, and path cleanup affect your totals.

## Write conclusions that match the available sample

Use wording such as “these stored checks contained these observations,” followed by the collection method and limitations. Keep the audit score, observed mentions, source citations, referrals, and qualified enquiries in separate sections. Do not infer revenue or retention from a content score or a publishing log.

Finish with an action tied to a documented finding: repair a broken public page, repeat an inconclusive check, or expand a narrowly sampled prompt group. A report is useful when the client can see both the finding and the reason for the next action.`,
    faqs: [
      { question: "Does a white-label report establish client results?", answer: "Branding establishes presentation. Results require dated observations, a defined sample, supporting records, and limitations appropriate to each metric." },
      { question: "What denominator should a mention rate use?", answer: "State the exact set of checks included, how failures were treated, and whether the numerator means a name mention or an actual source citation. Preserve raw counts." },
    ],
  },
  {
    key: "canonical-syndication-proof-v1",
    title: "How to Syndicate Content With Platform-Specific Canonical Checks",
    capsule: "Choose an original URL, check each platform's actual canonical capability, and preserve publication evidence. Sending a canonical field or adding an attribution link does not guarantee which URL a search engine selects.",
    matches: (title, all) => /syndicat|canonical|content distribution/.test(title) && /canonical|syndicat|publishing api/.test(all),
    sourceUrls: ["https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls", `${repo}/src/lib/marketplace.ts`, `${repo}/src/lib/global-publishers.ts`],
    body: `## Choose the original before creating copies

Canonicalization helps search engines understand a preferred URL among duplicate or similar pages. Google's documentation describes canonical signals and explains that Google can choose a different canonical. A canonical declaration is not an instruction that guarantees attribution, rankings, or AI citations. Start with a stable original page that readers can access and that your team can maintain.

Record the original URL, publication date, article revision, and intended syndication destinations. Confirm that the original's own canonical points to the intended page. Avoid distributing copies while the original redirects unexpectedly, requires authentication, or still contains inaccurate content.

## Build a capability matrix for your configured channels

Treat each destination as a separate integration. Check whether its current API exposes a canonical field, whether a generated page can include a canonical link element, or whether the platform only allows a visible source link. A source attribution link can be useful to readers, but it is not equivalent to a canonical declaration.

The linked GeoPulse publishing implementation shows several distinct behaviors. Its DEV.to payload includes canonical_url. The generated GitHub Pages HTML includes a canonical link element. The Hashnode integration sends originalArticleURL, and the Ghost integration sends canonical_url. Other adapters can add a source link or a short social post instead. These statements describe code paths, not evidence that a particular account is configured or a remote platform accepted a publication.

For custom webhooks, review the receiving implementation and resulting page. A payload field named canonicalUrl has no effect unless the receiver uses it correctly. Account credentials, publishing rights, platform settings, and API changes can affect what actually reaches the public page.

## Use a staged verification workflow

1. Publish or verify the original article and save its canonical URL.
2. Confirm that the chosen channel is enabled and its delivery mode supports the intended action.
3. Submit one publication and keep the remote response, record identifier, and returned URL without storing credentials in the evidence bundle.
4. Open the resulting public page and inspect the rendered canonical or visible attribution, according to the channel's capability.
5. Record a separate status for submission accepted, public page verified, and canonical verified. Leave unknown states explicit.

Do not count an HTTP success code alone as proof that the intended public content exists. Some APIs accept work asynchronously or return a management URL. Save the actual public URL once it is available, and check that the copy contains the intended revision rather than a stale draft.

## Preserve proof without overstating what it proves

Maintain a record containing the original URL, destination, remote post identifier, submitted revision, verification date, public URL, and observed canonical behavior. Screenshots can support a review, but rendered metadata and saved response details often explain technical failures more clearly. Redact access tokens, private request headers, and account secrets.

A proof record demonstrates what was submitted or observed. It does not demonstrate that every search engine indexed the copy, transferred authority, or cited the original in an answer. Search canonical selection and answer-engine behavior need their own observations.

## Plan corrections and rollback

Keep enough destination identifiers to update or remove a mistaken copy using the platform's supported tools. When the original changes, review important syndicated copies for conflicting facts. If a destination cannot set a canonical and duplication is unsuitable for your purpose, consider a short excerpt with a clear source link instead of assuming all channels have the same capability.

Report delivery totals alongside verification status and unresolved failures. This gives an editor a usable publishing record while keeping search and citation claims tied to evidence collected for those specific questions.`,
    faqs: [
      { question: "Does every platform support the same canonical setting?", answer: "No. Check the adapter, destination API, and rendered result. A source link, a short social post, and a canonical metadata field have different meanings." },
      { question: "Does successful syndication prove AI citations?", answer: "No. Submission, public-page verification, canonical behavior, indexing, and answer citations are separate observations." },
    ],
  },
  {
    key: "ai-citation-experiment-v1",
    title: "How to Measure AI Citations Separately From a GEO Audit Score",
    capsule: "Use an audit score to prioritize technical checks, then measure AI answers with a documented prompt sample, date, engine, and denominator. Track mentions, source citations, referrals, and business outcomes as separate metrics.",
    matches: (title, all) => /measure|experiment|citation|audit score|mentions/.test(title) && /ai|geo|citation|chatgpt|perplexity/.test(all),
    sourceUrls: [`${repo}/src/lib/geo/scorer.ts`, `${repo}/src/app/api/citations/route.ts`, `${repo}/src/lib/telemetry.ts`],
    body: `## Separate a diagnostic from an observed answer

A GEO audit can inspect content structure, technical accessibility, and other defined checks. Its score summarizes the rules implemented by that tool. It is not a measured probability that an answer engine will mention a brand, a live census of search results, or proof that a particular edit caused a citation.

The linked GeoPulse scorer is implementation evidence for its diagnostic rules. Review that source when interpreting a score. The citation endpoint and telemetry module describe other data collection paths. Their existence does not establish that an experiment has run or that any customer obtained a particular outcome.

## Write a measurement plan before changing the site

Choose the question you want to answer. For example, you may want to know whether a defined group of informational prompts produces a source link to your documentation during a specified observation window. Keep that question narrower than “does AI recommend us?” because different engines, accounts, locations, and sessions can produce different answers.

Create prompt groups from actual audience tasks, then save the exact wording. State the engines being tested, the available model identifiers, the date and timezone, browsing settings, account context, language, and intended repetitions. If some details are hidden by the product, mark them unavailable rather than guessing.

Avoid constructing a sample exclusively from prompts that already name the brand. Branded questions and unbranded discovery questions answer different questions. Keep them in separate groups and report the composition of the sample.

## Collect evidence using consistent labels

1. Run the planned prompts using the relevant product's supported workflow.
2. Save the inspected answer and its source links where permitted, with the timestamp and prompt identifier.
3. Mark whether the brand name appears and whether a clickable citation points to the intended domain or page.
4. Record unavailable, refused, failed, or incomplete runs separately.
5. Review ambiguous names and unrelated domains before calculating totals.

A name mention and a citation are distinct labels. An answer may name a company without linking to its site, or link to a page without using the expected brand spelling. Decide in advance whether third-party pages about the company count toward a different metric, and preserve that distinction in the data.

## Show the denominator and missing observations

Report raw counts beside any rate. Define the denominator as the exact included observations, and explain whether unavailable runs are excluded or retained as planned-but-missing. Show enough information for a reader to calculate either interpretation when missing observations materially affect the result.

Repeated runs of one prompt can describe variability for that prompt. They do not automatically broaden topic coverage. A small convenience sample should be described as such; avoid presenting it as a representative estimate for all possible users and questions. Record the observation window because engine behavior and underlying source selection can change.

## Compare revisions without assuming causation

Save a baseline before an edit, change a documented element, and repeat the same prompt plan afterward. Record other changes, including model versions, publication timing, and product settings. Differences between two windows are observations. Establishing that the edit caused the difference requires a stronger experimental design and attention to competing explanations.

Keep attribution metrics separate from answer observations. A cited page may receive no click, a referral may lose its source information, and a recorded enquiry may have several prior touchpoints. Track referrals and qualified enquiries with explicit definitions and consent-appropriate instrumentation. Do not infer revenue from the audit score, crawler requests, or an isolated citation.

## Make the next decision explicit

Use the evidence to choose a bounded action: inspect a page that could not be retrieved, broaden an under-sampled topic group, or repeat an unstable observation. Keep the score as a diagnostic and the experiment as a dated record of what was actually seen.`,
    faqs: [
      { question: "Does a higher audit score prove more AI citations?", answer: "No. The score summarizes implemented checks. Citation evidence requires inspected answers collected with a documented prompt sample and observation window." },
      { question: "What should an AI citation experiment record?", answer: "Keep exact prompts, dates, engine and available model details, settings, repetitions, inspected answers, source links, classification rules, raw counts, and the denominator including treatment of missing runs." },
    ],
  },
];

/** Deterministic, narrowly scoped tutorials; unsupported briefs remain editorial drafts. */
export function buildVerifiedAutopilotContent(topic: Topic, baseUrl: string): VerifiedAutopilotContent | null {
  if (topic.language !== "en") return null;
  const title = topic.titleHint.trim().toLowerCase();
  const all = `${title} ${topic.keyword.toLowerCase()}`;
  if (!title || /\b(pricing|prices?|cost|roi|revenue|acquisition|competitors?|alternatives?|profound|scrunch)\b|guaranteed|guarantee\s+(?:results|ranking)|get\s+(?:customers|clients)|\b\d+\s*%\s*(?:increase|growth)/i.test(all)) return null;
  // Platform capability checks are supported; competitor/product comparisons are not.
  if (/\b(vs\.?|versus|compare|comparison|best)\b/.test(all) && !/canonical|syndicat/.test(title)) return null;
  let origin: string;
  try {
    const parsed = new URL(baseUrl);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    origin = parsed.origin;
  } catch { return null; }
  const template = templates.find((candidate) => candidate.matches(title, all));
  if (!template) return null;
  const { matches: _matches, body, ...content } = template;
  const markdown = `${body}\n\n## Sources and scope\n\n${template.sourceUrls.map((url) => `- ${url}`).join("\n")}\n\nExternal references describe the relevant documentation or proposal. Repository links describe implementation behavior and are not customer performance evidence. Check the current documentation and deployed version before applying a configuration.\n\nUse the [website audit](${origin}/audit) to identify technical questions to investigate, then verify findings with the methods above.`;
  const words = markdown.split(/\s+/).filter(Boolean).length;
  if (words < 500 || words > 1400 || content.sourceUrls.length < 2 || !content.key || !content.title || /TODO|TBD|REQUIRES_EDITORIAL_REVIEW|\[insert\b|\[citation needed\]/i.test(markdown)) return null;
  return { ...content, markdown, sourceUrls: [...content.sourceUrls], faqs: content.faqs.map((faq) => ({ ...faq })) };
}
