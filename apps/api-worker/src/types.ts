/**
 * Shared types for Cloudflare Worker
 */

import type { MiddlewareHandler } from "hono/types";

export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  DATABASE_URL: string;
  LOG_LEVEL: string;
};

export type AuthUser = {
  id: string;
  tenantId: string;
  roleCodes: string[];
  branchIds: string[];
  email?: string;
  fullName?: string;
};

export type AppVariables = {
  requestId: string;
  user?: AuthUser;
  db?: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof import("./db/schema")>;
};

export type AppContext = {
  Bindings: Bindings;
  Variables: AppVariables;
};

/**
 * Paginated response wrapper
 */
export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * API response wrapper (matches .NET ApiResponse<T>)
 */
export type ApiResponse<T> = {
  data: T;
  success: true;
  requestId?: string;
};

/**
 * API error response
 */
export type ApiError = {
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
};
