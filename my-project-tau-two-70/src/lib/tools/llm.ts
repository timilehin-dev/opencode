// ---------------------------------------------------------------------------
// LLM Chat Tool
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, OLLAMA_BASE } from "./shared";

export const llmChatTool = tool({
  description: "Send a message to an AI language model and get a response. Use this for text generation, summarization, translation, analysis, brainstorming, coding help, Q&A, or any task that requires AI text intelligence. NOTE: This tool uses your configured Ollama model (gemma4:31b). For simple tasks, you can generate the response directly as an LLM agent.",
  inputSchema: zodSchema(z.object({
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant"]).describe("Message role"),
      content: z.string().describe("Message content"),
    })).describe("Array of conversation messages (system prompt + user message at minimum)"),
    temperature: z.number().optional().describe("Creativity level 0-2 (default: 0.7). Lower = more focused, higher = more creative."),
  })),
  execute: safeJson(async ({ messages, temperature }) => {
    try {
      // Use Ollama API directly (self-hosted model)
      const ollamaUrl = process.env.OLLAMA_BASE_URL || OLLAMA_BASE;
      const ollamaModel = process.env.OLLAMA_MODEL || "gemma4:31b-cloud";
      const systemMsg = messages.find(m => m.role === "system")?.content || "You are a helpful assistant.";
      const userMsg = messages.filter(m => m.role !== "system").map(m => `${m.role}: ${m.content}`).join("\n\n");

      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: userMsg,
          system: systemMsg,
          stream: false,
          options: { temperature: temperature || 0.7 },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await res.json() as any;
      return {
        success: true,
        content: data.response || "",
        model: ollamaModel,
        usage: { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count || 0 },
        message: "LLM chat completion successful.",
        source: "ollama",
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM chat failed: ${errMsg}` };
    }
  }),
});

