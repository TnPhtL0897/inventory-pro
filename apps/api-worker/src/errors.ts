/**
 * Custom error classes + handler
 *
 * Throw 1 trong các class dưới trong handler. Error middleware sẽ tự convert
 * thành response JSON chuẩn với status code phù hợp.
 *
 * Ví dụ:
 *   if (!product) throw new NotFoundError("Product", id);
 *   if (!hasPermission) throw new ForbiddenError("Requires products.write");
 */

import type { Context } from "hono";
import type { AppContext } from "./types";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(404, "NOT_FOUND", msg);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(429, "RATE_LIMITED", message);
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error", details?: unknown) {
    super(500, "INTERNAL_ERROR", message, details);
  }
}

/**
 * Global error handler. Đăng ký qua app.onError(err, handler)
 * Tự động convert AppError → JSON response, các lỗi khác → 500.
 */
export function errorHandler(err: Error, c: Context<AppContext>) {
  const requestId = c.get("requestId");

  // AppError - đã có statusCode + code
  if (err instanceof AppError) {
    // Log server-side errors
    if (err.statusCode >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          request_id: requestId,
          code: err.code,
          message: err.message,
          stack: err.stack,
          path: c.req.path,
          method: c.req.method,
        })
      );
    }
    return c.json(
      {
        error: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500
    );
  }

  // ZodError - convert thành ValidationError
  if (err.name === "ZodError") {
    return c.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: (err as unknown as { issues: unknown }).issues,
        requestId,
      },
      400
    );
  }

  // Unknown error - log + 500
  console.error(
    JSON.stringify({
      level: "error",
      request_id: requestId,
      message: "Unhandled error",
      error: err.message,
      stack: err.stack,
      path: c.req.path,
      method: c.req.method,
    })
  );
  return c.json(
    {
      error: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId,
    },
    500
  );
}
