// ---------------------------------------------------------------------------
// Finance Query Tool
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, getStockQuote, getHistoricalData, getMarketNews } from "./shared";

// Finance Query Tool (via Yahoo Finance API — FREE, no API key needed)
// ---------------------------------------------------------------------------

export const financeQueryTool = tool({
  description: "Query financial data including stock prices, market data, historical data, and market news. Use this when the user asks about stock prices, market trends, financial analysis, company earnings, or any finance-related queries. Powered by Yahoo Finance (free, no API key required).",
  inputSchema: zodSchema(z.object({
    query_type: z.enum(["stock_price", "historical_data", "market_news", "company_info"]).describe("Type of financial query"),
    symbol: z.string().optional().describe("Stock ticker symbol (e.g., 'AAPL', 'GOOGL', 'MSFT', 'TSLA')"),
    query: z.string().describe("Natural language query describing what financial information you need"),
    range: z.string().optional().describe("Time range for historical data: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, ytd, max"),
  })),
  execute: safeJson(async ({ query_type, symbol, query, range }) => {
    try {
      switch (query_type) {
        case "stock_price": {
          if (!symbol) {
            // Try to extract symbol from query
            const match = query.match(/\b([A-Z]{1,5})\b/);
            if (!match) return { success: false, error: "Please provide a stock ticker symbol (e.g., 'AAPL', 'GOOGL')." };
            symbol = match[1];
          }
          const quote = await getStockQuote(symbol.toUpperCase());
          return {
            success: true,
            query_type: "stock_price",
            symbol: quote.symbol,
            data: quote,
            message: `${quote.name || quote.symbol} is trading at $${quote.price} (${quote.change >= 0 ? "+" : ""}${quote.changePercent}%)`,
          };
        }
        case "historical_data": {
          if (!symbol) {
            const match = query.match(/\b([A-Z]{1,5})\b/);
            if (!match) return { success: false, error: "Please provide a stock ticker symbol." };
            symbol = match[1];
          }
          const historical = await getHistoricalData(symbol.toUpperCase(), range || "1mo");
          return {
            success: true,
            query_type: "historical_data",
            symbol: symbol.toUpperCase(),
            range: range || "1mo",
            data: historical,
            message: `Retrieved ${historical.length} data points for ${symbol.toUpperCase()}.`,
          };
        }
        case "market_news": {
          const news = await getMarketNews();
          return {
            success: true,
            query_type: "market_news",
            data: news,
            message: `Retrieved ${news.length} market news articles.`,
          };
        }
        case "company_info": {
          if (!symbol) {
            const match = query.match(/\b([A-Z]{1,5})\b/);
            if (!match) return { success: false, error: "Please provide a stock ticker symbol." };
            symbol = match[1];
          }
          const quote = await getStockQuote(symbol.toUpperCase());
          const historical = await getHistoricalData(symbol.toUpperCase(), "1mo");
          return {
            success: true,
            query_type: "company_info",
            symbol: quote.symbol,
            data: {
              quote,
              recentPerformance: historical.slice(-5),
            },
            message: `Retrieved company info for ${quote.name || quote.symbol}.`,
          };
        }
        default:
          return { success: false, error: `Unknown query type: ${query_type}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Finance query failed: ${errMsg}` };
    }
  }),
});

