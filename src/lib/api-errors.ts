// ---------------------------------------------------------------------------
// Phase 7C: Centralized API Error Handler
// ---------------------------------------------------------------------------
// Standardizes all API route error responses. Replaces the scattered
// try/catch + console.error + Response.json patterns.
//
// Usage:
//   import { apiError, apiSuccess, withErrorHandler, ApiError } from "@/lib/api-errors"
//
//   export async function GET(req) {
//     return withErrorHandler(async () => {
//       const data = await fetchData();
//       return apiSuccess(data);
//     });
//   }
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Custom API Error class with HTTP status codes
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(resource: string, id?: string) {
    return new ApiError(404, `${resource}${id ? ` "${id}"` : ""} not found`, "NOT_FOUND");
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Unauthorized — valid API key required") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, message, "FORBIDDEN");
  }

  static conflict(message: string) {
    return new ApiError(409, message, "CONFLICT");
  }

  static rateLimited(message = "Too many requests — please try again later") {
    return new ApiError(429, message, "RATE_LIMITED");
  }

  static internal(message = "Internal server error", details?: Record<string, unknown>) {
    return new ApiError(500, message, "INTERNAL_ERROR", details);
  }

  static serviceUnavailable(message = "Service temporarily unavailable") {
    return new ApiError(503, message, "SERVICE_UNAVAILABLE");
  }
}

// ---------------------------------------------------------------------------
// Standard response helpers
// ---------------------------------------------------------------------------

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Return a success JSON response.
 */
export function apiSuccess<T>(data: T, status = 200) {
  return Response.json({ success: true, data } as SuccessResponse<T>, { status });
}

/**
 * Return an error JSON response.
 */
export function apiErrorResponse(
  status: number,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
) {
  return Response.json(
    { success: false, error: message, code, details } as ErrorResponse,
    { status },
  );
}

/**
 * Wrap an API route handler with standardized error handling.
 * Catches ApiError, Error, and unknown errors, returning appropriate responses.
 */
export function withErrorHandler<T extends Response>(
  handler: () => Promise<T>,
  context = "API",
): Promise<Response> {
  return handler().catch((error: unknown) => {
    if (error instanceof ApiError) {
      logger.error(context, error.message, { code: error.code, status: error.statusCode });
      return apiErrorResponse(error.statusCode, error.message, error.code, error.details);
    }

    if (error instanceof Error) {
      logger.error(context, error.message, { stack: error.stack?.slice(0, 200) });
      return apiErrorResponse(500, error.message);
    }

    logger.error(context, "Unknown error occurred", { error: String(error) });
    return apiErrorResponse(500, "Internal server error");
  });
}

// ---------------------------------------------------------------------------
// Validation helper — safe JSON body parsing
// ---------------------------------------------------------------------------

/**
 * Safely parse a JSON request body with validation.
 * Returns parsed data or throws ApiError.
 */
export async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw ApiError.badRequest("Invalid JSON body");
  }
}

/**
 * Require specific fields from a parsed body. Returns early 400 if missing.
 */
export function requireFields(body: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length > 0) {
    throw ApiError.badRequest(`Missing required fields: ${missing.join(", ")}`);
  }
}
