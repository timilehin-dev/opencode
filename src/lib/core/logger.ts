// ---------------------------------------------------------------------------
// Phase 7C: Structured Logger
// ---------------------------------------------------------------------------
// Replaces scattered console.error/console.warn with a centralized,
// structured logging system. Supports log levels, context tagging,
// and optional persistence to the agent_activity table.
//
// Usage: import { logger } from "@/lib/core/logger"
//   logger.info("workflow", "Execution started", { workflowId, steps })
//   logger.error("db", "Query failed", { error: err.message })
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

// Log level priority (higher = more important)
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level from env (default: "info")
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || "info";

class Logger {
  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
  }

  private format(entry: LogEntry): string {
    const ts = entry.timestamp;
    const lvl = entry.level.toUpperCase().padEnd(5);
    const ctx = entry.context.padEnd(20);
    let msg = `[${ts}] ${lvl} [${ctx}] ${entry.message}`;
    if (entry.durationMs !== undefined) {
      msg += ` (${entry.durationMs}ms)`;
    }
    if (entry.data && Object.keys(entry.data).length > 0) {
      msg += ` ${JSON.stringify(entry.data)}`;
    }
    return msg;
  }

  private output(level: LogLevel, entry: LogEntry) {
    if (!this.shouldLog(level)) return;
    const formatted = this.format(entry);
    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  }

  /**
   * Log a debug message (only shown when LOG_LEVEL=debug).
   */
  debug(context: string, message: string, data?: Record<string, unknown>) {
    this.output("debug", {
      timestamp: new Date().toISOString(),
      level: "debug",
      context,
      message,
      data,
    });
  }

  /**
   * Log an info message.
   */
  info(context: string, message: string, data?: Record<string, unknown>) {
    this.output("info", {
      timestamp: new Date().toISOString(),
      level: "info",
      context,
      message,
      data,
    });
  }

  /**
   * Log a warning message.
   */
  warn(context: string, message: string, data?: Record<string, unknown>) {
    this.output("warn", {
      timestamp: new Date().toISOString(),
      level: "warn",
      context,
      message,
      data,
    });
  }

  /**
   * Log an error message.
   */
  error(context: string, message: string, data?: Record<string, unknown>) {
    this.output("error", {
      timestamp: new Date().toISOString(),
      level: "error",
      context,
      message,
      data,
    });
  }

  /**
   * Create a timer for measuring operation duration.
   * Usage: const timer = logger.timer("workflow"); ... timer.end("Planned workflow");
   */
  timer(context: string): { end: (message: string, data?: Record<string, unknown>) => void } {
    const start = Date.now();
    return {
      end: (message: string, data?: Record<string, unknown>) => {
        this.info(context, message, { ...data, durationMs: Date.now() - start });
      },
    };
  }

  /**
   * Wrap an async function with timing and error logging.
   * Usage: const result = await logger.measure("db", () => pool.query(...))
   */
  async measure<T>(context: string, fn: () => Promise<T>, label = "Operation"): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.info(context, `${label} completed`, { durationMs: Date.now() - start });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error(context, `${label} failed`, { durationMs, error: errorMsg });
      throw err;
    }
  }
}

// Singleton logger instance
export const logger = new Logger();

/**
 * Convenience re-exports for tree-shaking:
 *   import { logInfo, logError } from "@/lib/core/logger"
 */
export const logDebug = logger.debug.bind(logger);
export const logInfo = logger.info.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logError = logger.error.bind(logger);
