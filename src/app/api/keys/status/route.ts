// ---------------------------------------------------------------------------
// Key Health Monitoring API — Check API key usage and health status
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

export async function GET() {
  try {
    // Fully dynamic imports to avoid client bundle issues
    const { getKeyRotationStats, getAllKeyHealth } = await import("@/lib/agent/agents");
    const { getQuickStats } = await import("@/lib/settings/key-manager");

    const stats = getKeyRotationStats();

    // Get health status for each key pool
    const aihubmixKeys: string[] = [];
    const aihubmixLabels: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const key = process.env[`AIHUBMIX_API_KEY_${i}`] || "";
      if (key) {
        aihubmixKeys.push(key);
        aihubmixLabels.push(`AIHUBMIX_API_KEY_${i}`);
      }
    }

    const ollamaKeys: string[] = [];
    const ollamaLabels: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const key = process.env[`OLLAMA_CLOUD_KEY_${i}`] || "";
      if (key) {
        ollamaKeys.push(key);
        ollamaLabels.push(`OLLAMA_CLOUD_KEY_${i}`);
      }
    }

    // Ops dedicated key
    const opsKey = process.env.OLLAMA_CLOUD_KEY_6 || "";

    const [aihubmixHealth, ollamaHealth] = await Promise.all([
      getAllKeyHealth(aihubmixKeys, "aihubmix", aihubmixLabels),
      getAllKeyHealth(ollamaKeys, "ollama", ollamaLabels),
    ]);

    const opsHealth = opsKey
      ? await getAllKeyHealth([opsKey], "ollama", ["OLLAMA_CLOUD_KEY_6 (Ops Agent)"])
      : [];

    const quickStats = getQuickStats();

    // Compute summary
    const aihubmixTotalUsed = aihubmixHealth.reduce((sum, h) => sum + h.tokens_used, 0);
    const ollamaTotalUsed = ollamaHealth.reduce((sum, h) => sum + h.tokens_used, 0);
    const aihubmixHealthyCount = aihubmixHealth.filter((h) => h.is_healthy).length;
    const ollamaHealthyCount = ollamaHealth.filter((h) => h.is_healthy).length;

    return ok({
      summary: {
        aihubmix: {
          total_keys: aihubmixHealth.length,
          healthy_keys: aihubmixHealthyCount,
          total_tokens_used: aihubmixTotalUsed,
          total_daily_limit: aihubmixHealth.length * 1_000_000,
          overall_percent: aihubmixHealth.length > 0
            ? Math.round((aihubmixTotalUsed / (aihubmixHealth.length * 1_000_000)) * 100)
            : 0,
        },
        ollama: {
          total_keys: ollamaHealth.length,
          healthy_keys: ollamaHealthyCount,
          total_tokens_used: ollamaTotalUsed,
        },
        ops: {
          key_configured: opsKey.length > 0,
          health: opsHealth.length > 0 ? opsHealth[0] : null,
        },
        cache: quickStats,
      },
      keys: {
        aihubmix: aihubmixHealth,
        ollama: ollamaHealth,
        ops: opsHealth,
      },
      rotation_stats: stats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
