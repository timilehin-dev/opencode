// ---------------------------------------------------------------------------
// Phase 7C: Environment Variable Validation
// ---------------------------------------------------------------------------
// Centralized validation of all required and optional environment variables.
// Called at build time and startup to fail fast on missing config.
//
// Usage:
//   import { validateEnv, getEnvInfo } from "@/lib/core/env-validation"
//   // Call once at app startup
//   const envStatus = validateEnv();
// ---------------------------------------------------------------------------

export interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  isSet: boolean;
  masked?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  vars: EnvVar[];
}

/**
 * Mask a secret value for display (show first 4 + last 4 chars).
 */
function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Define all environment variables the application uses.
 */
function getEnvDefinitions(): Array<{ name: string; required: boolean; description: string }> {
  return [
    // Core database
    { name: "SUPABASE_DB_URL", required: true, description: "PostgreSQL connection string (direct connection)" },

    // Supabase client (optional — app works without it)
    { name: "NEXT_PUBLIC_SUPABASE_URL", required: false, description: "Supabase project URL" },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: false, description: "Supabase anonymous key" },

    // LLM providers
    { name: "OLLAMA_CLOUD_KEY_1", required: true, description: "Ollama Cloud API key (Gemma 4)" },
    { name: "OLLAMA_BASE_URL", required: true, description: "Ollama API base URL" },
    { name: "AIHUBMIX_API_KEY_1", required: false, description: "AIHubMix API key (legacy — not used, all agents on Ollama Gemma 4)" },

    // App
    { name: "NEXT_PUBLIC_BASE_URL", required: false, description: "Public base URL of the app" },

    // Security
    { name: "API_SECRET", required: false, description: "API secret for mutating endpoints (optional — dev mode if unset)" },
    { name: "CRON_SECRET", required: false, description: "Secret for Vercel Cron endpoints" },

    // Logging
    { name: "LOG_LEVEL", required: false, description: "Minimum log level (debug|info|warn|error)" },

    // Google
    { name: "GOOGLE_CLIENT_ID", required: false, description: "Google OAuth client ID" },
    { name: "GOOGLE_CLIENT_SECRET", required: false, description: "Google OAuth client secret" },
    { name: "GOOGLE_REFRESH_TOKEN", required: false, description: "Google OAuth refresh token" },

    // GitHub
    { name: "GITHUB_PAT", required: false, description: "GitHub personal access token (GITHUB_PAT)" },
    { name: "GITHUB_REPO_OWNER", required: false, description: "GitHub repository owner" },
    { name: "GITHUB_REPO_NAME", required: false, description: "GitHub repository name" },

    // Vercel
    { name: "VERCEL_API_TOKEN", required: false, description: "Vercel API token" },
    { name: "VERCEL_TEAM_ID", required: false, description: "Vercel team ID" },
  ];
}

/**
 * Validate all environment variables.
 * Returns validation result with errors and warnings.
 */
export function validateEnv(): EnvValidationResult {
  const definitions = getEnvDefinitions();
  const errors: string[] = [];
  const warnings: string[] = [];
  const vars: EnvVar[] = [];

  for (const def of definitions) {
    const value = process.env[def.name];
    const isSet = !!value && value.trim().length > 0;

    const envVar: EnvVar = {
      name: def.name,
      required: def.required,
      description: def.description,
      isSet,
      masked: isSet && value ? maskValue(value) : undefined,
    };
    vars.push(envVar);

    if (def.required && !isSet) {
      errors.push(`${def.name}: ${def.description} — REQUIRED but not set`);
    } else if (!isSet) {
      warnings.push(`${def.name}: ${def.description} — not set (optional)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    vars,
  };
}

/**
 * Get a summary of environment configuration for health checks.
 * Does NOT expose actual secret values.
 */
export function getEnvInfo(): { required: { name: string; set: boolean }[]; optional: { name: string; set: boolean }[] } {
  const definitions = getEnvDefinitions();
  return {
    required: definitions
      .filter((d) => d.required)
      .map((d) => ({ name: d.name, set: !!process.env[d.name] })),
    optional: definitions
      .filter((d) => !d.required)
      .map((d) => ({ name: d.name, set: !!process.env[d.name] })),
  };
}

/**
 * Check if the app has minimum required configuration to function.
 */
export function hasMinimumConfig(): boolean {
  const required = ["SUPABASE_DB_URL", "OLLAMA_CLOUD_KEY_1", "OLLAMA_BASE_URL"];
  return required.every((name) => !!process.env[name]?.trim());
}
