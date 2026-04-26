// ---------------------------------------------------------------------------
// Research & Web Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, tavilySearch, nextTavilyKey, TAVILY_KEYS,
  nextOllamaKey, OLLAMA_BASE, readWebPage, duckDuckGoSearch } from "./shared";
import {
  gDocsCreate, gDocsAppendText, gSheetsCreate, gSheetsAppendValues,
} from "./shared";

// ---------------------------------------------------------------------------
// Web Search Tool (dual-mode: Z.ai SDK local + AIHubMix fallback)
// ---------------------------------------------------------------------------

async function webSearchFallback(query: string, numResults: number, mode: "basic" | "advanced" = "basic") {
  // Layer 0: Tavily API (if keys configured)
  if (TAVILY_KEYS.length > 0) {
    try {
      const results = await tavilySearch(query, numResults, mode);
      if (results.length > 0) return results;
    } catch { /* Tavily failed, try next layer */ }
  }

  // Layer 1: DuckDuckGo via duck-duck-scrape npm package (more reliable than HTML scraping)
  try {
    const ddgResults = await duckDuckGoSearch(query, numResults);
    if (ddgResults.length > 0) return ddgResults;
  } catch { /* duck-duck-scrape failed, try HTML fallback */ }

  // Layer 1b: DuckDuckGo HTML search (POST request — fallback)
  try {
    const searchUrl = "https://html.duckduckgo.com/html/";
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://html.duckduckgo.com/",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const results = parseDuckDuckGoHTML(html, numResults);
      if (results.length > 0) return results;
    }
  } catch { /* DDG failed, try next layer */ }

  // Layer 2: Wikipedia API (for factual/reference queries)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${numResults}&origin=*`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await safeParseRes<{ query?: { search?: Array<{ title: string; snippet: string; pageid: number }> } }>(res);
      const wikiResults = data?.query?.search || [];
      if (wikiResults.length > 0) {
        return wikiResults.map((r, i) => ({
          title: r.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
          snippet: r.snippet.replace(/<[^>]*>/g, ""),
          rank: i + 1,
        }));
      }
    }
  } catch { /* Wikipedia failed */ }

  // Layer 3: Brave Search lite (no API key needed, public endpoint)
  try {
    const braveUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    const res = await fetch(braveUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const results = parseBraveHTML(html, numResults);
      if (results.length > 0) return results;
    }
  } catch { /* Brave failed */ }

  return [];
}

function parseDuckDuckGoHTML(html: string, numResults: number) {
  const results: Array<{ title: string; url: string; snippet: string; rank: number }> = [];

  // Strategy 1: Find result__a links followed by result__snippet
  const pattern1 = new RegExp(
    'class="result__a"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)</a>[\\s\\S]*?' +
    'class="result__snippet"[^>]*>([\\s\\S]*?)</a>',
    "g"
  );
  let match;
  let rank = 0;
  while ((match = pattern1.exec(html)) !== null && rank < numResults) {
    rank++;
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    const snippet = match[3].replace(/<[^>]*>/g, "").trim();
    const urlMatch = rawUrl.match(/uddg=([^&]+)/);
    const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
    if (title && actualUrl) {
      results.push({ title, url: actualUrl, snippet, rank });
    }
  }

  // Strategy 2: If no results, try extracting all external links
  if (results.length === 0) {
    const linkPattern = /<a[^>]*class="result__a"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/g;
    while ((match = linkPattern.exec(html)) !== null && rank < numResults) {
      rank++;
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      const urlMatch = rawUrl.match(/uddg=([^&]+)/);
      const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
      if (title && actualUrl && !actualUrl.includes("duckduckgo.com")) {
        results.push({ title, url: actualUrl, snippet: "", rank: results.length + 1 });
      }
    }
  }

  return results;
}

function parseBraveHTML(html: string, numResults: number) {
  const results: Array<{ title: string; url: string; snippet: string; rank: number }> = [];
  // Brave uses div.web-result with h3 > a inside
  const pattern = /<div[^>]*class="[^"]*web-result[^"]*"[^>]*>[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/g;
  let match;
  let rank = 0;
  while ((match = pattern.exec(html)) !== null && rank < numResults) {
    rank++;
    const url = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    if (title && url && !url.includes("search.brave.com")) {
      results.push({ title, url, snippet: "", rank });
    }
  }
  return results;
}

export const webSearchTool = tool({
  description: "Search the web for real-time information, news, documentation, market data, trends, competitor analysis, or any current information. Use this when you need up-to-date facts, research topics, look up company details, find documentation, or gather context that goes beyond your training data.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — be specific and use keywords. Examples: 'Next.js 15 Server Actions docs', 'Q4 2024 SaaS market trends', 'OpenAI GPT-5 release date'"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 20)"),
  })),
  execute: safeJson(async ({ query, num_results }) => {
    const num = Math.min(num_results || 10, 20);
    // Multi-layer fallback: Tavily (optional) → duck-duck-scrape → DDG HTML → Wikipedia → Brave
    return await webSearchFallback(query, num, "basic");
  }),
});

// ---------------------------------------------------------------------------
// Advanced Web Search Tool (for Research Agent — uses Tavily advanced mode)
// ---------------------------------------------------------------------------

export const webSearchAdvancedTool = tool({
  description: "Perform an advanced/deep web search with AI-powered answer synthesis. Returns higher-quality results with an AI-generated summary. Use this for in-depth research, factual analysis, multi-faceted topics, or when you need comprehensive coverage of a subject. Uses Tavily's advanced search depth.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — can be more specific and complex. Examples: 'What are the key differences between React Server Components and traditional SSR?', 'Latest developments in quantum computing 2025 2026', 'Comprehensive analysis of African fintech market trends'"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 10)"),
  })),
  execute: safeJson(async ({ query, num_results }) => {
    const num = Math.min(num_results || 10, 10);
    // Multi-layer fallback: Tavily advanced → duck-duck-scrape → DDG HTML → Wikipedia → Brave
    return await webSearchFallback(query, num, "advanced");
  }),
});

// ---------------------------------------------------------------------------
// Web Reader Tool (dual-mode: Z.ai SDK local + fetch fallback)
// ---------------------------------------------------------------------------

async function webReaderFallback(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KlawhubBot/1.0; +https://klawhub.xyz)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Simple HTML to text: remove scripts, styles, tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
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

  // Truncate to reasonable length
  if (text.length > 15000) {
    text = text.slice(0, 15000) + "... [truncated]";
  }

  return {
    title,
    content: text,
    url,
    fetchedAt: new Date().toISOString(),
    charCount: text.length,
  };
}

export const webReaderTool = tool({
  description: "Read and extract content from a web page URL. Returns the page title, main content as plain text, and URL. Use this to read articles, documentation pages, reports, or any web content for detailed analysis. Always use this after web_search when you need the full content of a result.",
  inputSchema: zodSchema(z.object({
    url: z.string().describe("The full URL of the web page to read. Must include protocol (https://)"),
  })),
  execute: safeJson(async ({ url }) => {
    // Cheerio-based reader (fast, no browser needed)
    return await readWebPage(url);
  }),
});

// ---------------------------------------------------------------------------
// Research Deep Tool (Multi-query parallel search)
// ---------------------------------------------------------------------------

export const researchDeepTool = tool({
  description: "Perform deep multi-query research on a topic. Generates multiple search queries from the topic and optional aspects, runs them in parallel, deduplicates results, and returns a unified ranked result set. Keep numResults low (5-8) to avoid overwhelming the model context.",
  inputSchema: zodSchema(z.object({
    topic: z.string().describe("The main research topic"),
    aspects: z.array(z.string()).optional().describe("Specific aspects to research (e.g., ['market size', 'competition', 'trends'])"),
    numResults: z.number().optional().describe("Total number of results to return (default: 8, max 15). Keep low to avoid context overflow."),
  })),
  execute: safeJson(async ({ topic, aspects, numResults }) => {
    // Cap at 15 and default to 8 (was 15 — too many for large context models)
    const capped = Math.min(numResults || 8, 15);
    // Generate search queries from topic and aspects
    const queries = [
      topic,
      `${topic} overview`,
      ...(aspects || []).map(a => `${topic} ${a}`),
    ].slice(0, 4); // Reduced from 5 to 4 queries to cut search load

    // Search helper: Tavily → DuckDuckGo → Wikipedia → Brave
    async function searchQuery(q: string): Promise<Array<Record<string, unknown>>> {
      // Fallback: webSearchFallback (tries Tavily → DuckDuckGo → Wikipedia → Brave)
      const fallbackResults = await webSearchFallback(q, Math.ceil(capped / 2));
      return fallbackResults;
    }

    // Run all queries in parallel
    const allResults = await Promise.all(queries.map(searchQuery));

    // Flatten and deduplicate by URL — truncate snippets to reduce context size
    const seen = new Set<string>();
    const unique: Array<{ url: string; title?: string; snippet?: string; [key: string]: unknown }> = [];
    for (const results of allResults) {
      const items = Array.isArray(results) ? results : [];
      for (const item of items) {
        const r = item as Record<string, unknown>;
        const url = String(r.url || r.link || "");
        if (url && !seen.has(url)) {
          seen.add(url);
          unique.push({
            url,
            title: r.title ? String(r.title).slice(0, 100) : undefined,
            snippet: r.snippet || r.description ? String(r.snippet || r.description).slice(0, 200) : undefined,
          });
        }
      }
    }

    return {
      topic,
      queriesUsed: queries,
      totalFound: unique.length,
      results: unique.slice(0, capped),
    };
  }),
});

// ---------------------------------------------------------------------------
// Research Synthesize Tool
// ---------------------------------------------------------------------------

export const researchSynthesizeTool = tool({
  description: "Cross-reference and synthesize research findings from multiple sources. Uses AI to identify agreements, disagreements, assess credibility, and produce a structured synthesis.",
  inputSchema: zodSchema(z.object({
    findings: z.array(z.object({
      source: z.string().describe("Source URL or citation"),
      claim: z.string().describe("The claim or finding from this source"),
    })).describe("Array of findings from different sources"),
    question: z.string().describe("The research question to answer"),
  })),
  execute: safeJson(async ({ findings, question }) => {
    const prompt = `You are a research analyst. Analyze these findings from multiple sources and produce a synthesis.

Research Question: ${question}

Findings:
${findings.map((f, i) => `${i + 1}. [${f.source}] ${f.claim}`).join("\n")}

Provide a structured analysis with:
1. **Key Findings Summary** — Main takeaways
2. **Areas of Agreement** — Where sources align
3. **Areas of Disagreement** — Where sources conflict
4. **Credibility Assessment** — Which sources are most reliable
5. **Answer** — Your synthesized answer to the research question
6. **Gaps** — What additional research would help`;

    // Use Ollama Cloud (DeepSeek V4 Flash) for synthesis
    try {
      const apiKey = nextOllamaKey();
      const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gemma4:31b-cloud",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await safeParseRes<{ choices?: Array<{ message?: { content?: string } }> }>(res);
      const synthesis = data.choices?.[0]?.message?.content || "No synthesis generated.";
      return { question, sourcesCount: findings.length, synthesis };
    } catch (err) {
      // Ollama failed — provide a manual synthesis
      const agreements = findings.length > 1
        ? findings.map(f => f.claim).join("\n- ")
        : findings[0]?.claim || "No findings to synthesize";
      return {
        question,
        sourcesCount: findings.length,
        synthesis: `**Manual Synthesis** (AI synthesis unavailable)\n\n**Findings Summary:**\n- ${agreements}\n\n**Sources:** ${findings.map(f => f.source).join(", ")}\n\n*Note: Full AI-powered cross-reference synthesis requires a working LLM connection.*`,
        fallback: true,
        error: err instanceof Error ? err.message : "Ollama unavailable",
      };
    }
  }),
});

// ---------------------------------------------------------------------------
// Research Save Brief Tool
// ---------------------------------------------------------------------------

export const researchSaveBriefTool = tool({
  description: "Save a research brief to a new Google Doc with formatted sections.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the research brief document"),
    objective: z.string().describe("Research objective"),
    methodology: z.string().describe("Research methodology used"),
    findings: z.string().describe("Key findings summary"),
    sources: z.array(z.string()).describe("List of source URLs or citations"),
    recommendations: z.string().describe("Recommendations based on findings"),
  })),
  execute: safeJson(async ({ title, objective, methodology, findings, sources, recommendations }) => {
    const doc = await gDocsCreate(title);

    const content = `RESEARCH BRIEF: ${title}\n\n` +
      `========================================\n\n` +
      `OBJECTIVE\n${objective}\n\n` +
      `METHODOLOGY\n${methodology}\n\n` +
      `KEY FINDINGS\n${findings}\n\n` +
      `SOURCES\n${sources.map(s => `- ${s}`).join("\n")}\n\n` +
      `RECOMMENDATIONS\n${recommendations}\n`;

    await gDocsAppendText(doc.id, content);

    return {
      success: true,
      documentId: doc.id,
      documentUrl: doc.webViewLink,
      title,
    };
  }),
});

// ---------------------------------------------------------------------------
// Research Save Data Tool
// ---------------------------------------------------------------------------

export const researchSaveDataTool = tool({
  description: "Save research data to a Google Sheet. Creates a new spreadsheet if no ID is provided, or appends data to an existing one.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().optional().describe("Existing spreadsheet ID (creates new if omitted)"),
    title: z.string().optional().describe("Title for new spreadsheet (used only if spreadsheetId is not provided)"),
    data: z.array(z.array(z.string())).describe("2D array of data to save (first row = headers)"),
  })),
  execute: safeJson(async ({ spreadsheetId, title, data }) => {
    let sheetId = spreadsheetId;

    if (!sheetId) {
      const created = await gSheetsCreate(title || "Research Data");
      sheetId = created.spreadsheetId;
    }

    // Append data rows
    const result = await gSheetsAppendValues(sheetId!, "Sheet1!A1", data);

    return {
      success: true,
      spreadsheetId: sheetId,
      updatedRange: result.updates?.updatedRange,
      rowsAppended: result.updates?.updatedRows || data.length,
    };
  }),
});

// ---------------------------------------------------------------------------
// Weather Tool (Open-Meteo API — FREE, no API key needed)
// ---------------------------------------------------------------------------

/**
 * Geocode a location name to lat/lon using Open-Meteo's geocoding API.
 */
async function geocodeLocation(query: string): Promise<{ name: string; country: string; latitude: number; longitude: number; timezone: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const data = await safeParseRes(res) as { results?: Array<{ name: string; country: string; latitude: number; longitude: number; timezone: string }> };
  return data.results?.[0] || null;
}

export const weatherGetTool = tool({
  description: "Get current weather conditions and a 7-day forecast for any location worldwide. Also supports distance calculation between two locations. FREE — no API key needed. Use this when users ask about weather, temperature, humidity, wind, precipitation, or 'How far is X from Y?'.",
  inputSchema: zodSchema(z.object({
    location: z.string().describe("City name or location (e.g., 'Lagos', 'London', 'New York', 'Tokyo'). Be specific for best results."),
    forecast_days: z.number().optional().describe("Number of forecast days (1-16, default: 3)"),
    include_hourly: z.boolean().optional().describe("Include hourly breakdown for today (default: false)"),
    units: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature unit (default: celsius)"),
    distance_from: z.string().optional().describe("Optional: calculate distance FROM this location TO 'location'. E.g., distance_from='Lagos', location='Abuja' gives distance between them."),
  })),
  execute: safeJson(async ({ location, forecast_days, include_hourly, units, distance_from }) => {
    const days = Math.min(forecast_days || 3, 16);
    const tempUnit = units === "fahrenheit" ? "fahrenheit" : "celsius";

    // If distance_from is provided, calculate distance between two locations
    if (distance_from) {
      const [loc1, loc2] = await Promise.all([
        geocodeLocation(distance_from),
        geocodeLocation(location),
      ]);
      if (!loc1) throw new Error(`Could not find location: "${distance_from}"`);
      if (!loc2) throw new Error(`Could not find location: "${location}"`);

      const R = 6371; // Earth's radius in km
      const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
      const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = R * c;
      const distanceMi = distanceKm * 0.621371;

      return {
        type: "distance",
        from: { name: loc1.name, country: loc1.country, lat: loc1.latitude, lon: loc1.longitude },
        to: { name: loc2.name, country: loc2.country, lat: loc2.latitude, lon: loc2.longitude },
        distance: {
          kilometers: Math.round(distanceKm * 10) / 10,
          miles: Math.round(distanceMi * 10) / 10,
        },
      };
    }

    // Geocode the location
    const geo = await geocodeLocation(location);
    if (!geo) throw new Error(`Could not find location: "${location}". Try a more specific city name.`);

    // Fetch weather from Open-Meteo
    const params = new URLSearchParams({
      latitude: geo.latitude.toString(),
      longitude: geo.longitude.toString(),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max",
      timezone: geo.timezone,
      forecast_days: days.toString(),
      temperature_unit: tempUnit,
    });
    if (include_hourly) {
      params.set("hourly", "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m");
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
    const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(15000) });
    if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);

    const weatherData = await weatherRes.json() as {
      current?: Record<string, unknown>;
      daily?: Record<string, unknown[]>;
      hourly?: Record<string, unknown[]>;
    };

    // Map WMO weather codes to descriptions
    const weatherCodeMap: Record<number, string> = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Foggy", 48: "Rime fog",
      51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      56: "Freezing drizzle", 57: "Dense freezing drizzle",
      61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      66: "Light freezing rain", 67: "Heavy freezing rain",
      71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
      77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers",
      82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers",
      95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
    };

    const codeToDesc = (code: number) => weatherCodeMap[code] || "Unknown";

    return {
      location: { name: geo.name, country: geo.country, timezone: geo.timezone, lat: geo.latitude, lon: geo.longitude },
      current: weatherData.current ? {
        temperature: weatherData.current.temperature_2m,
        feelsLike: weatherData.current.apparent_temperature,
        humidity: weatherData.current.relative_humidity_2m,
        weather: codeToDesc(weatherData.current.weather_code as number),
        weatherCode: weatherData.current.weather_code,
        windSpeed: weatherData.current.wind_speed_10m,
        windDirection: weatherData.current.wind_direction_10m,
        pressure: weatherData.current.pressure_msl,
        precipitation: weatherData.current.precipitation,
      } : null,
      forecast: weatherData.daily ? weatherData.daily.time?.map((date: unknown, i: number) => ({
        date,
        weather: codeToDesc(weatherData.daily!.weather_code[i] as number),
        high: weatherData.daily!.temperature_2m_max[i],
        low: weatherData.daily!.temperature_2m_min[i],
        precipitation: weatherData.daily!.precipitation_sum[i],
        windMax: weatherData.daily!.wind_speed_10m_max[i],
        sunrise: weatherData.daily!.sunrise?.[i],
        sunset: weatherData.daily!.sunset?.[i],
        uvIndex: weatherData.daily!.uv_index_max?.[i],
      })) : [],
      hourly: include_hourly && weatherData.hourly ? weatherData.hourly.time?.slice(0, 24).map((time: unknown, i: number) => ({
        time,
        temperature: weatherData.hourly!.temperature_2m[i],
        humidity: weatherData.hourly!.relative_humidity_2m[i],
        precipProb: weatherData.hourly!.precipitation_probability[i],
        weather: codeToDesc(weatherData.hourly!.weather_code[i] as number),
        wind: weatherData.hourly!.wind_speed_10m[i],
      })) : [],
      units: tempUnit,
    };
  }),
});

// ---------------------------------------------------------------------------
// Enhanced Web Reader with Open Graph Metadata
// ---------------------------------------------------------------------------

/**
 * Enhanced fallback with Open Graph metadata extraction.
 */
async function webReaderEnhanced(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KlawhubBot/1.0; +https://klawhub.xyz)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract Open Graph / meta metadata
  const metaRegex = /<meta[^>]+(?:property|name)="([^"]+)"[^>]+content="([^"]*)"[^>]*\/?>/gi;
  const metadata: Record<string, string> = {};
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metadata[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
  }

  // Also match content before property (alternate meta format)
  const metaRegex2 = /<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="([^"]+)"[^>]*\/?>/gi;
  while ((metaMatch = metaRegex2.exec(html)) !== null) {
    const key = metaMatch[2].toLowerCase();
    if (!metadata[key]) metadata[key] = metaMatch[1].trim();
  }

  // Extract structured metadata
  const author = metadata["author"] || metadata["og:article:author"] || metadata["article:author"] || "";
  const publishDate = metadata["article:published_time"] || metadata["og:article:published_time"] || metadata["date"] || metadata["pubdate"] || "";
  const description = metadata["description"] || metadata["og:description"] || "";
  const ogImage = metadata["og:image"] || metadata["twitter:image"] || "";
  const ogSiteName = metadata["og:site_name"] || "";
  const ogType = metadata["og:type"] || "";

  // Simple HTML to text: remove scripts, styles, tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "-")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/\s+/g, " ")
    .trim();

  // Truncate to reasonable length
  if (text.length > 15000) {
    text = text.slice(0, 15000) + "... [truncated]";
  }

  return {
    title,
    url,
    fetchedAt: new Date().toISOString(),
    charCount: text.length,
    metadata: {
      author: author || null,
      publishDate: publishDate || null,
      description: description || null,
      siteName: ogSiteName || null,
      type: ogType || null,
      image: ogImage || null,
    },
    content: text,
  };
}

// ---------------------------------------------------------------------------
// Create XLSX Spreadsheet Tool — v3.0 (Claude/glm5.1 Quality Upgrade)
// ---------------------------------------------------------------------------
// Professional spreadsheet generator with full feature set:
//   - Multiple sheets with professional navy-themed styling
//   - Auto-fit columns (smart algorithm: header + data sampling + format padding)
//   - Formula columns (SUM, AVERAGE, COUNT, MIN, MAX)
//   - Freeze panes
//   - Charts (bar, line, pie, doughnut, scatter, area)
//   - Conditional formatting (color scale, data bars, icon sets, cell-is rules)
//   - Cell style customization (fonts, sizes, colors, number formats)
//   - Summary rows (total, average, etc. with formulas)
//   - Data validation (list, whole, decimal, date)
//   - Auto-detection of numbers, currency, percentages, and dates
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = /[$\u20AC\u00A3\u00A5\u00A4\u20A9\u20B9\u0052\u00BF]/;
const CURRENCY_RE = new RegExp(`^(${CURRENCY_SYMBOLS.source})?([0-9]{1,3}(,[0-9]{3})*(\\.[0-9]+)?|([0-9]+(\\.[0-9]+)?))$`);
const PERCENTAGE_RE = /^(-?\d+(?:\.\d+)?)%$/;
const DATE_FORMATS: Array<{ re: RegExp; fmt: string }> = [
  { re: /^\d{4}-\d{2}-\d{2}$/, fmt: "yyyy-mm-dd" },
  { re: /^\d{4}\/\d{2}\/\d{2}$/, fmt: "yyyy/mm/dd" },
  { re: /^\d{1,2}\/\d{1,2}\/\d{4}$/, fmt: "mm/dd/yyyy" },
  { re: /^\d{1,2}-\d{1,2}-\d{4}$/, fmt: "mm-dd-yyyy" },
  { re: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}$/i, fmt: "mmm dd, yyyy" },
  { re: /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$/i, fmt: "dd mmm yyyy" },
  { re: /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, fmt: "yyyy-mm-dd h:mm" },
  { re: /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, fmt: "mm/dd/yyyy h:mm" },
];

/**
 * Attempt to detect a value's semantic type and return { value, numFmt }.
 * Returns null if the value should be left as a plain string.
 */
function detectValueAndFormat(raw: string, overrideNumFmt?: string, overrideDateFormat?: string): { value: string | number | Date; numFmt?: string } | null {
  if (raw == null || raw === "") return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  // If an explicit number format is provided, check for plain numbers first
  if (overrideNumFmt) {
    if (!isNaN(Number(trimmed)) && trimmed !== "") {
      return { value: Number(trimmed), numFmt: overrideNumFmt };
    }
  }

  // Check explicit date format override
  if (overrideDateFormat) {
    for (const df of DATE_FORMATS) {
      if (df.re.test(trimmed)) {
        return { value: new Date(trimmed), numFmt: overrideDateFormat };
      }
    }
  }

  // Currency detection (e.g., "$1,234.56", "€1,234.56")
  const currMatch = trimmed.match(new RegExp(`^(${CURRENCY_SYMBOLS.source})?([0-9]{1,3}(,[0-9]{3})*(\\.[0-9]+)?|([0-9]+(\\.[0-9]+)?))$`));
  if (currMatch && CURRENCY_SYMBOLS.test(trimmed.charAt(0))) {
    const numStr = trimmed.replace(CURRENCY_SYMBOLS, "").replace(/,/g, "");
    if (!isNaN(Number(numStr))) {
      const hasCents = numStr.includes(".");
      return { value: Number(numStr), numFmt: hasCents ? "$#,##0.00" : "$#,##0" };
    }
  }

  // Percentage detection (e.g., "50%", "0.5%")
  const pctMatch = trimmed.match(PERCENTAGE_RE);
  if (pctMatch) {
    const numVal = Number(pctMatch[1]) / 100;
    return { value: numVal, numFmt: "0.0%" };
  }

  // Plain number detection
  if (!isNaN(Number(trimmed)) && trimmed !== "" && !/^[0]/.test(trimmed.replace(/[.,]/g, "")) === false || /^-?\d+(?:\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
    const cleanNum = trimmed.replace(/,/g, "");
    if (!isNaN(Number(cleanNum)) && cleanNum !== "") {
      return { value: Number(cleanNum), numFmt: "#,##0.00" };
    }
  }

  // Date detection
  for (const df of DATE_FORMATS) {
    if (df.re.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return { value: parsed, numFmt: df.fmt };
      }
    }
  }

  return null;
}

/**
 * Smart column width calculation.
 * Samples up to 50 rows, accounts for header, data, and number format width.
 */
function calculateColumnWidth(
  header: string,
  rows: string[][],
  colIndex: number,
  numFmt?: string,
  headerFontSize = 11,
  dataFontSize = 10,
): number {
  const MIN_WIDTH = 8;
  const MAX_WIDTH = 50;
  const PADDING = 4;

  let maxLen = String(header || "").length;

  // Account for header font size (larger font = wider characters)
  const headerScale = headerFontSize / 10;

  // Sample up to 50 rows for content width
  const sampleRows = rows.slice(0, 50);
  for (const row of sampleRows) {
    const cellVal = row[colIndex];
    if (cellVal != null && cellVal !== "") {
      maxLen = Math.max(maxLen, String(cellVal).length);
    }
  }

  // Account for number format visual width (e.g., "$#,##0.00" needs extra space)
  if (numFmt) {
    if (numFmt.includes("$") || numFmt.includes("\u20AC") || numFmt.includes("\u00A3")) {
      // Currency: add ~3 chars for symbol + separators
      maxLen = Math.max(maxLen + 3, 12);
    }
    if (numFmt.includes("%")) {
      maxLen = Math.max(maxLen, 8);
    }
    if (numFmt.includes("#,##0")) {
      // Thousand separator: add chars for commas
      maxLen = Math.max(maxLen, 10);
    }
    if (numFmt.includes("yyyy") || numFmt.toLowerCase().includes("mm") || numFmt.toLowerCase().includes("dd")) {
      // Date: fixed-ish width
      maxLen = Math.max(maxLen, 12);
    }
  }

  // Scale by font size ratio
  maxLen = Math.ceil(maxLen * headerScale);

  return Math.max(MIN_WIDTH, Math.min(maxLen + PADDING, MAX_WIDTH));
}

/**
 * Convert column letters (A, B, ..., Z, AA, AB, ...) to 1-based column number.
 */
function colLetterToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Convert 1-based column number to column letter(s).
 */
function colIndexToLetter(col: number): string {
  let result = "";
  let n = col;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Build an ExcelJS range string from start/end row and col indices (1-based).
 */
function buildRange(startRow: number, endRow: number, startCol: number, endCol: number): string {
  return `${colIndexToLetter(startCol)}${startRow}:${colIndexToLetter(endCol)}${endRow}`;
}

/**
 * Determine the function keyword for a summary row entry.
 */
function summaryFuncLabel(fn: string): string {
  const labels: Record<string, string> = {
    SUM: "TOTAL",
    AVERAGE: "AVERAGE",
    COUNT: "COUNT",
    MIN: "MIN",
    MAX: "MAX",
  };
  return labels[fn] || fn;
}

// ---------------------------------------------------------------------------
// Zod schema components for the new optional parameters
// ---------------------------------------------------------------------------

const ChartConfigSchema = z.object({
  type: z.enum(["bar", "line", "pie", "doughnut", "scatter", "area"]).describe("Chart type"),
  title: z.string().describe("Chart title"),
  dataRange: z.string().optional().describe("Data range like 'A1:E10' (auto-calculated if omitted)"),
  xAxis: z.string().optional().describe("Column header for X axis"),
  yAxes: z.array(z.string()).optional().describe("Column headers for Y axis data series"),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }).optional().describe("Chart position in cells {x, y, w, h}"),
});

const ConditionalFormattingSchema = z.object({
  range: z.string().describe("Range like 'B2:B100'"),
  type: z.enum(["colorScale", "dataBar", "iconSet", "cellIs"]).describe("Formatting type"),
  rule: z.any().describe("Rule configuration (varies by type)"),
});

const CellStylesSchema = z.object({
  headerFontSize: z.number().optional().describe("Header font size (default: 11)"),
  dataFontSize: z.number().optional().describe("Data font size (default: 10)"),
  headerFontName: z.string().optional().describe("Header font family (default: Calibri)"),
  dataFontName: z.string().optional().describe("Data font family (default: Calibri)"),
  headerColor: z.string().optional().describe("Header background hex color without alpha prefix (default: 1E3A5F)"),
  altRowColor: z.string().optional().describe("Alternating row hex color without alpha prefix (default: F8FAFC)"),
  numberFormat: z.string().optional().describe("Default number format e.g. '$#,##0.00', '0.0%', 'yyyy-mm-dd'"),
  dateFormat: z.string().optional().describe("Format for auto-detected date strings"),
});

const SummaryRowSchema = z.object({
  label: z.string().describe("Summary label e.g. 'TOTAL', 'AVERAGE'"),
  functions: z.record(z.string(), z.enum(["SUM", "AVERAGE", "COUNT", "MIN", "MAX"])).optional()
    .describe("Column header → aggregate function"),
  showAll: z.boolean().optional().describe("If true, SUM all numeric columns automatically"),
});


