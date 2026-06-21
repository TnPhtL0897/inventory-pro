/**
 * CRUD route helpers - giảm boilerplate cho 21 module
 *
 * Cung cấp factory functions cho List, GetById, Create, Update, Delete
 * với tenant isolation + soft delete built-in.
 */

import type { Context } from "hono";
import { eq, and, ilike, or, sql, type SQL } from "drizzle-orm";

import { NotFoundError, ConflictError } from "../errors";
import { requireRole } from "../middleware/auth";
import type { AppContext, PaginatedResult, AuthUser } from "../types";
import type { PgTable, AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Build tenant WHERE clause. Tất cả queries đều phải filter theo tenant.
 */
export function tenantWhere<T extends PgTable & { tenantId: AnyPgColumn }>(
  table: T,
  user: AuthUser
): SQL {
  return eq(table.tenantId, user.tenantId);
}

/**
 * List endpoint factory. List rows có filter theo search + soft-delete aware.
 *
 * @param table - Drizzle table
 * @param user - Auth user (đã require auth)
 * @param options - searchColumns: các columns cho LIKE search
 *                  extraFilters: function build WHERE từ query
 *                  orderBy: column để ORDER BY (default: name)
 */
export async function listRows<
  T extends PgTable & {
    id: AnyPgColumn;
    tenantId: AnyPgColumn;
    isActive?: AnyPgColumn;
  },
>(
  c: Context<AppContext>,
  table: T,
  options: {
    page: number;
    pageSize: number;
    search?: string | undefined;
    searchColumns?: AnyPgColumn[];
    extraFilters?: SQL[];
    orderBy?: AnyPgColumn;
  }
) {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const conditions: SQL[] = [eq(table.tenantId, user.tenantId)];

  if (options.search && options.searchColumns?.length) {
    const s = `%${options.search.toLowerCase()}%`;
    const orClauses = options.searchColumns.map((col) => ilike(col, s));
    conditions.push(or(...orClauses)!);
  }

  if (options.extraFilters) {
    conditions.push(...options.extraFilters);
  }

  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(whereClause);

  const offset = (options.page - 1) * options.pageSize;
  const items = await db
    .select()
    .from(table)
    .where(whereClause)
    .orderBy(options.orderBy ?? table.id)
    .limit(options.pageSize)
    .offset(offset);

  const result: PaginatedResult<unknown> = {
    items,
    total: Number(count),
    page: options.page,
    pageSize: options.pageSize,
  };
  return result;
}

/**
 * Get by ID with tenant scope. Throw NotFoundError nếu không tìm thấy.
 */
export async function getRowById<
  T extends PgTable & { id: AnyPgColumn; tenantId: AnyPgColumn },
>(
  c: Context<AppContext>,
  table: T,
  id: string
) {
  const user = c.get("user")!;
  const db = c.get("db")!;

  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.tenantId, user.tenantId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Row", id);
  }
  return row;
}

/**
 * Soft delete (set isActive=false). Throw NotFoundError nếu không tồn tại.
 */
export async function softDeleteRow<
  T extends PgTable & {
    id: AnyPgColumn;
    tenantId: AnyPgColumn;
    isActive: AnyPgColumn;
    updatedAt?: AnyPgColumn;
  },
>(c: Context<AppContext>, table: T, id: string) {
  const user = c.get("user")!;
  const db = c.get("db")!;

  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.tenantId, user.tenantId)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Row", id);
  }

  await db
    .update(table)
    .set({ isActive: false, updatedAt: new Date() } as Record<string, unknown>)
    .where(and(eq(table.id, id), eq(table.tenantId, user.tenantId)));
}

/**
 * Check unique code/field. Throw ConflictError nếu đã tồn tại.
 */
export async function checkUnique<
  T extends PgTable & { id: AnyPgColumn; tenantId: AnyPgColumn },
>(
  c: Context<AppContext>,
  table: T,
  column: AnyPgColumn,
  value: string,
  excludeId?: string
) {
  const user = c.get("user")!;
  const db = c.get("db")!;

  const conditions = [
    eq(table.tenantId, user.tenantId),
    eq(column, value),
  ];
  if (excludeId) {
    const idCol = table.id;
    const ne = sql`${idCol} != ${excludeId}`;
    conditions.push(ne as SQL);
  }

  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new ConflictError(`Value '${value}' already exists`);
  }
}

// Re-export requireRole for convenience
export { requireRole };
