/**
 * Categories CRUD
 */

import { Hono } from "hono";
import { eq, and, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { categories } from "../db/schema";
import {
  listCategoriesQuery,
  createCategoryRequest,
  updateCategoryRequest,
} from "../validators/category";
import { NotFoundError } from "../errors";
import { requireRole, listRows, getRowById, softDeleteRow, checkUnique } from "./_helpers";
import type { AppContext } from "../types";

export const categoriesRoute = new Hono<AppContext>();

categoriesRoute.get("/", async (c) => {
  const q = listCategoriesQuery.parse(c.req.query());
  const filters: SQL[] = [];
  if (q.parentId != null) filters.push(eq(categories.parentId, q.parentId));
  if (q.isActive !== undefined) filters.push(eq(categories.isActive, q.isActive));

  const result = await listRows(c, categories, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    searchColumns: [categories.name, categories.code],
    extraFilters: filters,
    orderBy: categories.sortOrder,
  });
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

categoriesRoute.get("/:id", async (c) => {
  const data = await getRowById(c, categories, c.req.param("id"));
  return c.json({ success: true, data, requestId: c.get("requestId") });
});

categoriesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createCategoryRequest.parse(await c.req.json());
  const user = c.get("user")!;
  await checkUnique(c, categories, categories.code, body.code);
  const db = getDb(c.env.DATABASE_URL);
  const [created] = await db
    .insert(categories)
    .values({ tenantId: user.tenantId, ...body })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

categoriesRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const body = updateCategoryRequest.parse(await c.req.json());
  if (body.code) await checkUnique(c, categories, categories.code, body.code, id);
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const [updated] = await db
    .update(categories)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(categories.id, id), eq(categories.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Category", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

categoriesRoute.delete("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  await softDeleteRow(c, categories, c.req.param("id"));
  return c.json({ success: true, data: { id: c.req.param("id"), archived: true }, requestId: c.get("requestId") });
});
