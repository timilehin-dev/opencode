// ---------------------------------------------------------------------------
// Workflow Engine — Re-exports for backward compatibility
// ---------------------------------------------------------------------------
// This module was split into focused files. All exports are re-exported here
// so that existing imports from "@/lib/workflows/workflow-engine" continue
// to work without any changes.
// ---------------------------------------------------------------------------

// Types & shared utilities
export type {
  WorkflowPlan,
  WorkflowStepRow,
  WorkflowRow,
  WorkflowWithSteps,
  ValidationResult,
} from "./workflow-types";

export {
  EXECUTOR_SYSTEM_PROMPT,
  callLLM,
  logExecution,
  recalcWorkflowState,
} from "./workflow-types";

// Planning
export { planWorkflow } from "./workflow-planning";

// Execution
export { executeWorkflow, runSingleStep } from "./workflow-execution";

// Validation
export { validateStep } from "./workflow-validation";

// Status queries
export { getWorkflowStatus, listWorkflows } from "./workflow-status";
