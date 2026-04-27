// ---------------------------------------------------------------------------
// A2A Inbox SSE — Real-time agent inbox streaming endpoint
// ---------------------------------------------------------------------------
// GET /api/a2a/inbox?agentId=mail  — SSE stream that pushes new messages
//
// The task executor (GitHub Actions) processes inboxes every 2 minutes.
// This endpoint provides a real-time push complement: clients subscribe
// and receive new unread messages as they arrive (long-poll every 5s).
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");

  if (!agentId) {
    return new Response(JSON.stringify({ error: "agentId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validAgents = ["general", "mail", "code", "data", "creative", "research", "ops"];
  if (!validAgents.includes(agentId)) {
    return new Response(JSON.stringify({ error: `Invalid agent: ${agentId}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Set up SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastCheckId = 0;
      let iterations = 0;
      const maxIterations = 12; // 12 * 5s = 60s max

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", agentId })}\n\n`)
      );

      try {
        // Initial fetch of unread messages
        const initial = await query(
          "SELECT id, from_agent, type, topic, payload, priority, created_at FROM a2a_messages WHERE to_agent = $1 AND is_read = FALSE ORDER BY priority, created_at DESC LIMIT 20",
          [agentId]
        );
        if (initial.rows.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "messages", messages: initial.rows, count: initial.rows.length })}\n\n`)
          );
          lastCheckId = Math.max(...initial.rows.map((r: any) => Number(r.id)));
        }

        // Long-poll loop
        while (iterations < maxIterations) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          iterations++;

          const newMsgs = await query(
            "SELECT id, from_agent, type, topic, payload, priority, created_at FROM a2a_messages WHERE to_agent = $1 AND id > $2 ORDER BY id ASC",
            [agentId, lastCheckId]
          );

          if (newMsgs.rows.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "messages", messages: newMsgs.rows, count: newMsgs.rows.length })}\n\n`)
            );
            lastCheckId = Math.max(...newMsgs.rows.map((r: any) => Number(r.id)));
          }

          // Send heartbeat
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", iteration: iterations })}\n\n`)
          );
        }

        // Close after max iterations
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "timeout" })}\n\n`)
        );
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
