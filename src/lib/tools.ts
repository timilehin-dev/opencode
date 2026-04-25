// ---------------------------------------------------------------------------
// Klawhub Agent System — Tool Definitions (Re-exports)
// ---------------------------------------------------------------------------
// The actual tool definitions have been split into modular files in ./tools/.
// This file provides backward-compatible re-exports for all consumers.
// ---------------------------------------------------------------------------

export {
  allTools,
  getToolsForAgent,
  setCurrentAgentId,
  withAgentContext,
  getCurrentAgentId,
} from "./tools/index";

// Backward compatibility: some consumers may import `tools` as a named export
export { allTools as tools } from "./tools/index";
