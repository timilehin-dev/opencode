// ---------------------------------------------------------------------------
// Phase 4 Advanced: Prompt Injection Detection & Input Sanitization
// ---------------------------------------------------------------------------
// Detects common prompt injection patterns in user input and provides
// risk-level assessment. Also provides a sanitize function for cleaning input.
//
// Usage:
//   import { detectPromptInjection, sanitizeUserInput } from "@/lib/security/prompt-guard"
//   const result = detectPromptInjection(userInput);
//   if (result.risk === 'high') { /* reject or flag */ }
//   const clean = sanitizeUserInput(userInput);
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface InjectionPattern {
  pattern: RegExp;
  category: "role_reversal" | "data_extraction" | "instruction_override" | "delimiter_abuse";
  riskWeight: number;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Role reversal — attempts to change the AI's identity or role
  { pattern: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?|directives?)/i, category: "role_reversal", riskWeight: 3 },
  { pattern: /you\s+are\s+now\s+(a|an|the)\s+/i, category: "role_reversal", riskWeight: 2 },
  { pattern: /pretend\s+(you\s+)?(to\s+be|you're|you are)\s+/i, category: "role_reversal", riskWeight: 2 },
  { pattern: /act\s+as\s+(if\s+you\s+(are|were|was)|a|an)\s+/i, category: "role_reversal", riskWeight: 1 },
  { pattern: /from\s+now\s+on[,\s]+(you\s+)?(are|will|must)\s+/i, category: "role_reversal", riskWeight: 2 },
  { pattern: /system\s*:?\s*(you|assistant|ai)\s+(are|is|must)\s+/i, category: "role_reversal", riskWeight: 3 },
  { pattern: /new\s+(role|identity|persona)\s*:/i, category: "role_reversal", riskWeight: 2 },
  { pattern: /forget\s+(everything|all|your|the)\s+(instructions?|rules?|training|prompts?|directives?)/i, category: "role_reversal", riskWeight: 3 },

  // Data extraction — attempts to reveal system prompts or internal data
  { pattern: /reveal\s+(your|the|system)\s+(instructions?|prompt|prompts?|rules?|directives?|configuration)/i, category: "data_extraction", riskWeight: 3 },
  { pattern: /show\s+(me\s+)?(your|the|system)\s+(instructions?|prompt|prompts?|rules?|system\s+message)/i, category: "data_extraction", riskWeight: 3 },
  { pattern: /print\s+(your|the|system)\s+(instructions?|prompt|prompts?|rules?|directives?)/i, category: "data_extraction", riskWeight: 3 },
  { pattern: /output\s+(your|the)\s+(system\s+)?prompt/i, category: "data_extraction", riskWeight: 3 },
  { pattern: /what\s+(are\s+)?(your|the)\s+(initial|original|system)\s+(instructions?|prompt|prompts?|rules?)/i, category: "data_extraction", riskWeight: 2 },
  { pattern: /dump\s+(your|the)\s+(prompt|prompts?|instructions?|memory|context)/i, category: "data_extraction", riskWeight: 3 },
  { pattern: /repeat\s+(your|the)\s+(instructions?|prompt|system\s+message|rules?)/i, category: "data_extraction", riskWeight: 3 },
  { pattern: /tell\s+me\s+(your|the)\s+(secret|hidden)\s+(instructions?|prompt|rules?)/i, category: "data_extraction", riskWeight: 2 },
  { pattern: /expose\s+(your|the|all)\s+(system|prompt|instructions?|rules?|directives?)/i, category: "data_extraction", riskWeight: 3 },

  // Instruction override — attempts to inject new instructions
  { pattern: /new\s+instructions?\s*:/i, category: "instruction_override", riskWeight: 3 },
  { pattern: /override\s+(your|the|current|existing|all)\s+(instructions?|rules?|directives?)/i, category: "instruction_override", riskWeight: 3 },
  { pattern: /disregard\s+(all\s+)?(previous|your|the|above|current)\s+(instructions?|rules?|directives?|constraints?)/i, category: "instruction_override", riskWeight: 3 },
  { pattern: /do\s+not\s+follow\s+(your|the|any|all)\s+(instructions?|rules?|guidelines?)/i, category: "instruction_override", riskWeight: 2 },
  { pattern: /instead[,\s]+(you\s+)?(should|must|will|shall)\s+/i, category: "instruction_override", riskWeight: 1 },
  { pattern: /your\s+new\s+(task|goal|objective|mission|purpose|directive)\s*(is|:)/i, category: "instruction_override", riskWeight: 2 },

  // Delimiter abuse — attempts to break out of context using special formatting
  { pattern: /```system/i, category: "delimiter_abuse", riskWeight: 3 },
  { pattern: /---\s*END\s*(OF\s+)?(SYSTEM|INSTRUCTIONS|CONTEXT|PROMPT)/i, category: "delimiter_abuse", riskWeight: 3 },
  { pattern: /\[SYSTEM\]/i, category: "delimiter_abuse", riskWeight: 2 },
  { pattern: /<\|im_start\|>\s*system/i, category: "delimiter_abuse", riskWeight: 3 },
  { pattern: /<\|system\|>/i, category: "delimiter_abuse", riskWeight: 3 },
  { pattern: /\{\{system\}\}/i, category: "delimiter_abuse", riskWeight: 2 },
  { pattern: /<<<\s*system/i, category: "delimiter_abuse", riskWeight: 2 },
  { pattern: /###\s*system\s*:/i, category: "delimiter_abuse", riskWeight: 2 },
];

// ---------------------------------------------------------------------------
// Risk levels
// ---------------------------------------------------------------------------

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface InjectionDetectionResult {
  safe: boolean;
  risk: RiskLevel;
  detected: string[];
  categories: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect prompt injection patterns in user content.
 *
 * Risk levels:
 * - none: 0 matches (safe)
 * - low: 1-2 matches (suspicious but possibly legitimate)
 * - medium: 3-4 matches (likely injection attempt)
 * - high: 5+ matches OR role_reversal + data_extraction combo
 *
 * @param content - The user input to check
 */
export function detectPromptInjection(content: string): InjectionDetectionResult {
  if (!content || content.trim().length === 0) {
    return { safe: true, risk: "none", detected: [], categories: {} };
  }

  const detected: string[] = [];
  const categories: Record<string, number> = {};

  for (const { pattern, category, riskWeight } of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      const matchStr = content.match(pattern)?.[0] || pattern.source;
      detected.push(`[${category}] ${matchStr.slice(0, 80)}`);
      categories[category] = (categories[category] || 0) + riskWeight;
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
    }
  }

  const totalWeight = Object.values(categories).reduce((sum, w) => sum + w, 0);

  // Determine risk level
  let risk: RiskLevel = "none";
  if (detected.length === 0) {
    risk = "none";
  } else if (detected.length <= 2) {
    risk = "low";
  } else if (detected.length <= 4) {
    risk = "medium";
  } else {
    risk = "high";
  }

  // Elevated risk for role_reversal + data_extraction combo
  if (
    (categories.role_reversal || 0) > 0 &&
    (categories.data_extraction || 0) > 0
  ) {
    risk = risk === "none" ? "high" : risk === "low" ? "medium" : "high";
  }

  return {
    safe: risk === "none" || risk === "low",
    risk,
    detected,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize user input by stripping dangerous characters and normalizing whitespace.
 *
 * - Removes null bytes (can break strings)
 * - Removes control characters (except newline, tab)
 * - Normalizes unicode whitespace to regular spaces
 * - Collapses multiple newlines (max 3 consecutive)
 * - Trims leading/trailing whitespace
 *
 * @param input - The raw user input
 * @returns The sanitized string
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return input;

  let sanitized = input;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Remove control characters except \n, \r, \t
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Normalize unicode whitespace (non-breaking space, em-space, etc.) to regular space
  sanitized = sanitized.replace(
    /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g,
    " ",
  );

  // Collapse multiple newlines to max 3 consecutive
  sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n");

  // Collapse multiple spaces (preserve newlines)
  sanitized = sanitized.replace(/[^\S\n]{2,}/g, " ");

  // Trim leading/trailing whitespace
  sanitized = sanitized.trim();

  return sanitized;
}
