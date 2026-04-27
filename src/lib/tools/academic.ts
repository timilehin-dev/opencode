// ---------------------------------------------------------------------------
// Academic Search Tool
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, searchPapers } from "./shared";

// Academic Search Tool (via Semantic Scholar API — FREE, no API key needed)
// ---------------------------------------------------------------------------

export const academicSearchTool = tool({
  description: "Search for academic papers, scholarly articles, research publications, citations, and author information. Use this when the user asks about academic research, scientific papers, literature reviews, citations, research trends, or scholarly publications. Powered by Semantic Scholar (free, no API key required).",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query for academic papers (e.g., 'transformer architecture attention mechanism')"),
    search_type: z.enum(["paper_search", "author_search", "paper_detail"]).optional().describe("Type of academic search (default: 'paper_search')"),
    paper_id: z.string().optional().describe("Paper ID for paper_detail search (DOI, ArXiv ID, or Semantic Scholar ID)"),
    author_id: z.string().optional().describe("Author ID for author_search (Semantic Scholar author ID)"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 100)"),
    year: z.string().optional().describe("Filter by year (e.g., '2024' or '2020-2024')"),
  })),
  execute: safeJson(async ({ query, search_type, paper_id, author_id, num_results, year }) => {
    try {
      switch (search_type || "paper_search") {
        case "paper_search": {
          const result = await searchPapers(query, num_results || 10, year);
          return {
            success: true,
            search_type: "paper_search",
            query,
            total: result.total,
            papers: result.papers,
            message: `Found ${result.total} papers matching "${query}". Showing ${result.papers.length} results.`,
          };
        }
        case "paper_detail": {
          if (!paper_id) return { success: false, error: "Please provide a paper_id (DOI, ArXiv ID, or Semantic Scholar ID)." };
          const { getPaperDetails } = await import("@/lib/integrations/api-clients");
          const paper = await getPaperDetails(paper_id);
          return {
            success: true,
            search_type: "paper_detail",
            data: paper,
            message: `Retrieved details for paper: ${paper.title || paper_id}.`,
          };
        }
        case "author_search": {
          if (!author_id) {
            // Fall back to paper search with the query
            const result = await searchPapers(query, num_results || 10, year);
            return {
              success: true,
              search_type: "author_search",
              query,
              papers: result.papers,
              message: `No author_id provided. Showing paper search results for "${query}" instead.`,
            };
          }
          const { getAuthorPapers } = await import("@/lib/integrations/api-clients");
          const papers = await getAuthorPapers(author_id, num_results || 10);
          return {
            success: true,
            search_type: "author_search",
            author_id,
            papers,
            message: `Retrieved ${papers.length} papers for author ${author_id}.`,
          };
        }
        default:
          return { success: false, error: `Unknown search type: ${search_type}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Academic search failed: ${errMsg}` };
    }
  }),
});

