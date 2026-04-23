// ---------------------------------------------------------------------------
// Claw AI — Free API Clients (no ZAI SDK dependency)
// ---------------------------------------------------------------------------
// Native implementations for web search, page reading, finance, academic search,
// and code execution — all using free, no-key-required APIs.
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';

// ═══════════════════════════════════════════════════════════════════════════
// JUDGE0 CE — Code Execution Sandbox (FREE, no API key needed)
// ═══════════════════════════════════════════════════════════════════════════

const JUDGE0_API = "https://ce.judge0.com";

const JUDGE0_LANGUAGES: Record<string, { id: number; aliases: string[] }> = {
  javascript: { id: 93, aliases: ["js", "node", "nodejs"] },      // Node.js 18
  python:     { id: 92, aliases: ["py", "python3"] },              // Python 3.11
  typescript: { id: 94, aliases: ["ts"] },                        // TypeScript 5.0
  go:         { id: 60, aliases: ["golang"] },                     // Go 1.21
  rust:       { id: 73, aliases: [] },                             // Rust
  java:       { id: 62, aliases: [] },                             // Java 17
  cpp:        { id: 54, aliases: ["c++", "c", "gcc"] },           // C++ GCC 12
  ruby:       { id: 72, aliases: [] },                             // Ruby 3.2
  php:        { id: 71, aliases: [] },                             // PHP 8.2
  swift:      { id: 83, aliases: [] },                             // Swift 5.9
  kotlin:     { id: 78, aliases: ["kt"] },                        // Kotlin
  r:          { id: 80, aliases: [] },                             // R 4.3
  sql:        { id: 82, aliases: ["sqlite"] },                    // SQLite
  bash:       { id: 86, aliases: ["sh", "shell", "zsh"] },       // Bash 5
  csharp:     { id: 51, aliases: ["cs", "c#"] },                 // C#
};

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  language: string;
  status: string;
  duration?: number;
}

export async function executeCodeJudge0(
  code: string,
  language: string = "javascript",
  stdin: string = ""
): Promise<CodeExecutionResult> {
  const langKey = language.toLowerCase().trim();
  let langConfig = JUDGE0_LANGUAGES[langKey];
  if (!langConfig) {
    for (const cfg of Object.values(JUDGE0_LANGUAGES)) {
      if (cfg.aliases.includes(langKey)) { langConfig = cfg; break; }
    }
  }
  if (!langConfig) {
    throw new Error(
      `Unsupported language: "${langKey}". Supported: ${Object.keys(JUDGE0_LANGUAGES).join(", ")}`
    );
  }

  const startTime = Date.now();

  // Step 1: Submit code (async, no wait)
  const submitRes = await fetch(
    `${JUDGE0_API}/submissions?base64_encoded=false&wait=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: langConfig.id,
        stdin: stdin || "",
        cpu_time_limit: 5,      // 5 seconds
        cpu_memory_limit: 128000, // 128MB
      }),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`Judge0 submission failed (${submitRes.status}): ${errText}`);
  }

  const { token } = await submitRes.json() as { token: string };

  // Step 2: Poll for result (up to 10 attempts, 1s apart)
  let result: any;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(
      `${JUDGE0_API}/submissions/${token}?base64_encoded=false&fields=token,stdout,stderr,status,exit_code,language,time`,
      { signal: AbortSignal.timeout(10000) }
    );
    result = await res.json() as any;
    // Status IDs: 1=In Queue, 2=Processing, 3+=Done
    if (result.status?.id >= 3) break;
  }

  const duration = Date.now() - startTime;
  return {
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    exitCode: result.exit_code ?? -1,
    language: language,
    status: result.status?.description || "Unknown",
    duration,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHEERIO WEB READER — Parse HTML pages without a browser
// ═══════════════════════════════════════════════════════════════════════════

export interface PageContent {
  title: string;
  description: string;
  content: string;
  url: string;
  ogImage?: string;
  links?: Array<{ text: string; href: string }>;
  charCount: number;
  fetchedAt: string;
}

export async function readWebPage(url: string): Promise<PageContent> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Extract metadata
  const title = $("title").text().trim() || "";
  const description =
    $('meta[name="description"]').attr("content") ??
    $('meta[property="og:description"]').attr("content") ??
    "";
  const ogImage = $('meta[property="og:image"]').attr("content") ?? undefined;

  // Remove non-content elements
  $("script, style, nav, footer, header, iframe, noscript, svg, .ads, .ad, .sidebar, .navigation, .menu, .cookie-banner, [role='banner'], [role='navigation']").remove();

  // Try to find main content area
  const mainContent =
    $("article").html() ??
    $("main").html() ??
    $('[role="main"]').html() ??
    $(".content, .post-content, .article-content, .entry-content, .main-content, #content").first().html() ??
    $("body").html() ??
    "";

  // Convert HTML to readable text
  const text = $(mainContent)
    .text()
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Extract important links
  const links: Array<{ text: string; href: string }> = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")!;
    const linkText = $(el).text().trim();
    if (href.startsWith("http") && linkText.length > 2 && linkText.length < 100) {
      links.push({ text: linkText, href });
    }
  });

  // Truncate to prevent context overflow
  const maxLen = 15000;
  const truncatedText = text.length > maxLen ? text.slice(0, maxLen) + "... [truncated]" : text;

  return {
    title,
    description,
    content: truncatedText,
    url,
    ogImage,
    links: links.slice(0, 50), // Cap at 50 links
    charCount: truncatedText.length,
    fetchedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// YAHOO FINANCE API — Free stock data (no API key needed)
// ═══════════════════════════════════════════════════════════════════════════

export interface StockQuote {
  symbol: string;
  name?: string;
  price: number;
  previousClose: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  exchange: string;
  currency: string;
  marketCap?: number;
  timestamp: string;
}

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Yahoo Finance API error: ${res.status}`);
  const data = await res.json() as any;

  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No data found for symbol: ${symbol}`);

  const price = meta.regularMarketPrice ?? 0;
  const previousClose = meta.chartPreviousClose ?? 0;
  const change = price - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName,
    price: Math.round(price * 100) / 100,
    previousClose: Math.round(previousClose * 100) / 100,
    high: Math.round((meta.regularMarketDayHigh ?? 0) * 100) / 100,
    low: Math.round((meta.regularMarketDayLow ?? 0) * 100) / 100,
    open: Math.round((meta.regularMarketPrice ?? 0) * 100) / 100,
    volume: meta.regularMarketVolume ?? 0,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    fiftyTwoWeekHigh: Math.round((meta.fiftyTwoWeekHigh ?? 0) * 100) / 100,
    fiftyTwoWeekLow: Math.round((meta.fiftyTwoWeekLow ?? 0) * 100) / 100,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    currency: meta.currency || "USD",
    marketCap: meta.regularMarketCap,
    timestamp: new Date().toISOString(),
  };
}

export interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getHistoricalData(
  symbol: string,
  range: string = "1mo",
  interval: string = "1d"
): Promise<HistoricalData[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Yahoo Finance API error: ${res.status}`);
  const data = await res.json() as any;

  const timestamps = data?.chart?.result?.[0]?.timestamp ?? [];
  const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};

  return timestamps
    .map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      open: Math.round((quotes.open?.[i] ?? 0) * 100) / 100,
      high: Math.round((quotes.high?.[i] ?? 0) * 100) / 100,
      low: Math.round((quotes.low?.[i] ?? 0) * 100) / 100,
      close: Math.round((quotes.close?.[i] ?? 0) * 100) / 100,
      volume: quotes.volume?.[i] ?? 0,
    }))
    .filter((d: HistoricalData) => d.close > 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC SCHOLAR API — Free academic paper search (no key needed for basic)
// ═══════════════════════════════════════════════════════════════════════════

export interface PaperResult {
  title: string;
  year?: number;
  authors: string[];
  abstract?: string;
  citationCount: number;
  url?: string;
  doi?: string;
  arxivId?: string;
  publicationDate?: string;
  venue?: string;
}

export async function searchPapers(
  query: string,
  limit: number = 10,
  year?: string
): Promise<{ papers: PaperResult[]; total: number; offset: number }> {
  const params = new URLSearchParams({
    query,
    limit: String(Math.min(limit, 100)),
    fields:
      "title,year,authors,abstract,citationCount,externalIds,url,publicationDate,venue",
  });
  if (year) params.set("year", year);

  const headers: Record<string, string> = {};
  // Optional: use API key for higher rate limits (1 req/sec vs 100/5min)
  if (process.env.S2_API_KEY) {
    headers["x-api-key"] = process.env.S2_API_KEY;
  }

  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
    { headers, signal: AbortSignal.timeout(15000) }
  );

  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`);
  const data = (await res.json()) as any;

  const papers: PaperResult[] = (data.data || []).map((p: any) => ({
    title: p.title || "Untitled",
    year: p.year,
    authors: (p.authors || []).map((a: any) => a.name || "Unknown"),
    abstract: p.abstract || undefined,
    citationCount: p.citationCount || 0,
    url: p.url,
    doi: p.externalIds?.DOI,
    arxivId: p.externalIds?.ArXiv,
    publicationDate: p.publicationDate,
    venue: p.venue,
  }));

  return {
    papers,
    total: data.total || 0,
    offset: data.offset || 0,
  };
}

export async function getPaperDetails(paperId: string): Promise<any> {
  const fields =
    "title,year,authors,abstract,citationCount,externalIds,url,references,tldr,venue";
  const headers: Record<string, string> = {};
  if (process.env.S2_API_KEY) {
    headers["x-api-key"] = process.env.S2_API_KEY;
  }

  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}?fields=${fields}`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`);
  return res.json();
}

export async function getAuthorPapers(
  authorId: string,
  limit: number = 10
): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    fields:
      "title,year,authors,abstract,citationCount,externalIds,url,publicationDate,venue",
  });

  const headers: Record<string, string> = {};
  if (process.env.S2_API_KEY) {
    headers["x-api-key"] = process.env.S2_API_KEY;
  }

  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/author/${encodeURIComponent(authorId)}/papers?${params}`,
    { headers, signal: AbortSignal.timeout(10000) }
  );

  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`);
  const data = (await res.json()) as any;

  return (data.data || []).map((p: any) => ({
    title: p.title || "Untitled",
    year: p.year,
    authors: (p.authors || []).map((a: any) => a.name || "Unknown"),
    abstract: p.abstract || undefined,
    citationCount: p.citationCount || 0,
    url: p.url,
    doi: p.externalIds?.DOI,
    arxivId: p.externalIds?.ArXiv,
    publicationDate: p.publicationDate,
    venue: p.venue,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// DUCK-DUCK-SCRAPE — Free web search (no API key, npm package)
// ═══════════════════════════════════════════════════════════════════════════

export async function duckDuckGoSearch(
  query: string,
  numResults: number = 10
): Promise<Array<{ title: string; url: string; snippet: string; rank: number }>> {
  try {
    const { search } = await import("duck-duck-scrape");
    const results = await search(query, { safeSearch: "STRICT" as any });
    const resultArray = Array.isArray(results) ? results : [];
    return resultArray
      .slice(0, numResults)
      .map((r: any, i: number) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.description || "",
        rank: i + 1,
      }));
  } catch (error) {
    console.error("[duck-duck-scrape] search failed:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKET NEWS — Scrape finance news from Yahoo Finance RSS
// ═══════════════════════════════════════════════════════════════════════════

interface MarketNewsItem { title: string; url: string; source: string; publishedAt?: string }

export async function getMarketNews(): Promise<MarketNewsItem[]> {
  try {
    const res = await fetch(
      "https://finance.yahoo.com/news/",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    const news: MarketNewsItem[] = [];
    $("h3 a, .stream-item a").each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr("href");
      if (title && href && title.length > 10) {
        const fullUrl = href.startsWith("http") ? href : `https://finance.yahoo.com${href}`;
        news.push({ title, url: fullUrl, source: "Yahoo Finance" });
        if (news.length >= 20) return false as any; // break
      }
    });
    return news;
  } catch {
    return [];
  }
}
