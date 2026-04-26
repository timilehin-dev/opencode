// ---------------------------------------------------------------------------
// Content Analysis Tool
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson } from "./shared";

// Content Analysis Tool
// ---------------------------------------------------------------------------

export const contentAnalyzeTool = tool({
  description: "Analyze content for readability, sentiment, SEO optimization, keyword density, structure, and quality scoring. Use this when the user wants to analyze text content, check writing quality, optimize for SEO, extract key themes, or get a comprehensive content audit.",
  inputSchema: zodSchema(z.object({
    content: z.string().describe("The text content to analyze"),
    analysis_type: z.enum(["full_audit", "readability", "sentiment", "seo", "keywords", "structure"]).optional().describe("Type of analysis (default: 'full_audit')"),
  })),
  execute: safeJson(async ({ content, analysis_type }) => {
    const type = analysis_type || "full_audit";
    const results: Record<string, unknown> = { analysis_type: type };

    // Basic text stats (always computed)
    const words = content.split(/\s+/).filter(Boolean);
    const sentences = content.split(/[.!?]+/).filter(Boolean);
    const paragraphs = content.split(/\n\n+/).filter(Boolean);
    const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
    const avgCharsPerWord = words.length > 0 ? words.reduce((a, w) => a + w.length, 0) / words.length : 0;

    results.basic_stats = {
      word_count: words.length,
      sentence_count: sentences.length,
      paragraph_count: paragraphs.length,
      avg_words_per_sentence: Math.round(avgWordsPerSentence * 10) / 10,
      avg_chars_per_word: Math.round(avgCharsPerWord * 10) / 10,
      estimated_reading_time_min: Math.ceil(words.length / 200),
    };

    if (type === "full_audit" || type === "readability") {
      // Flesch-Kincaid Grade Level
      const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
      const fk = words.length > 0 && sentences.length > 0
        ? 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59
        : 0;
      results.readability = {
        flesch_kincaid_grade: Math.round(fk * 10) / 10,
        reading_level: fk < 5 ? "Very Easy" : fk < 8 ? "Easy" : fk < 10 ? "Average" : fk < 13 ? "Difficult" : "Very Difficult",
        syllable_count: syllables,
      };
    }

    if (type === "full_audit" || type === "sentiment") {
      // Simple sentiment analysis based on positive/negative word lists
      const positiveWords = ["good", "great", "excellent", "amazing", "wonderful", "best", "love", "happy", "success", "outstanding", "perfect", "brilliant", "fantastic", "superb", "innovative", "efficient", "powerful", "remarkable", "impressive", "positive", "benefit", "advantage", "improve", "growth", "opportunity", "achieve", "win", "gain", "lead", "strong"];
      const negativeWords = ["bad", "poor", "terrible", "horrible", "worst", "hate", "fail", "failure", "wrong", "problem", "issue", "risk", "threat", "concern", "weakness", "decline", "loss", "drop", "fall", "crash", "negative", "damage", "destroy", "difficult", "challenge", "obstacle", "barrier", "complicate", "confuse"];
      const lowerContent = content.toLowerCase();
      const posCount = positiveWords.filter(w => lowerContent.includes(w)).length;
      const negCount = negativeWords.filter(w => lowerContent.includes(w)).length;
      const total = posCount + negCount || 1;
      results.sentiment = {
        score: Math.round(((posCount - negCount) / total) * 100) / 100,
        label: posCount > negCount * 1.5 ? "Positive" : negCount > posCount * 1.5 ? "Negative" : "Neutral",
        positive_mentions: posCount,
        negative_mentions: negCount,
      };
    }

    if (type === "full_audit" || type === "keywords") {
      // Keyword frequency analysis
      const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "about", "also", "and", "but", "or", "if", "it", "its", "this", "that", "these", "those", "i", "we", "you", "he", "she", "they", "what", "which", "who", "whom"]);
      const wordFreq: Record<string, number> = {};
      for (const word of words) {
        const lower = word.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lower.length > 2 && !stopWords.has(lower)) {
          wordFreq[lower] = (wordFreq[lower] || 0) + 1;
        }
      }
      const topKeywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word, count]) => ({ word, count, density: Math.round((count / words.length) * 10000) / 100 }));
      results.keywords = { total_unique: Object.keys(wordFreq).length, top_keywords: topKeywords };
    }

    if (type === "full_audit" || type === "structure") {
      const headings = content.match(/^#{1,6}\s.+/gm) || [];
      const lists = content.match(/^[\s]*[-*+]\s.+/gm) || [];
      const links = content.match(/https?:\/\/[^\s\])}>"']+/g) || [];
      const boldText = content.match(/\*\*[^*]+\*\*/g) || [];
      results.structure = {
        heading_count: headings.length,
        list_item_count: lists.length,
        link_count: links.length,
        bold_text_count: boldText.length,
        has_title: headings.length > 0,
        uses_lists: lists.length > 0,
        uses_links: links.length > 0,
      };
    }

    if (type === "full_audit" || type === "seo") {
      // SEO analysis
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const firstParagraph = content.split("\n\n")[0] || "";
      const metaDesc = firstParagraph.slice(0, 160);

      results.seo = {
        title_present: title.length > 0,
        title_length: title.length,
        title_optimal: title.length >= 30 && title.length <= 60,
        meta_description: metaDesc,
        meta_description_length: metaDesc.length,
        meta_description_optimal: metaDesc.length >= 120 && metaDesc.length <= 160,
        word_count_ok: words.length >= 300,
        has_headings: (content.match(/^#{1,6}\s.+/gm) || []).length > 0,
        content_score: Math.min(100, Math.round(
          (title.length >= 30 && title.length <= 60 ? 20 : 0) +
          (metaDesc.length >= 120 ? 20 : metaDesc.length >= 50 ? 10 : 0) +
          (words.length >= 300 ? 20 : words.length >= 150 ? 10 : 0) +
          ((content.match(/^#{1,6}\s.+/gm) || []).length >= 2 ? 20 : 10) +
          ((content.match(/^[\s]*[-*+]\s.+/gm) || []).length > 0 ? 20 : 0)
        )),
      };
    }

    return {
      success: true,
      ...results,
      message: `Content analysis (${type}) completed. ${words.length} words analyzed.`,
    };
  }),
});

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// ---------------------------------------------------------------------------
// Gmail Send with Attachments Tool
// ---------------------------------------------------------------------------


