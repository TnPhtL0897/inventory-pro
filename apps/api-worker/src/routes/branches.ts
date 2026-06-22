/**
 * Branches CRUD
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { branches } from "../db/schema";
import {
  listBranchesQuery,
  createBranchRequest,
  updateBranchRequest,
} from "../validators/branch";
import { NotFoundError } from "../errors";
import { requireRole, listRows, getRowById, softDeleteRow, checkUnique } from "./_helpers";
import type { AppContext } from "../types";

export const branchesRoute = new Hono<AppContext>();

branchesRoute.get("/", async (c) => {
  const q = listBranchesQuery.parse(c.req.query());
  const result = await listRows(c, branches, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    searchColumns: [branches.name, branches.code],
    extraFilters: q.isActive !== undefined ? [eq(branches.isActive, q.isActive)] : [],
    orderBy: branches.code,
  });
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

branchesRoute.get("/:id", async (c) => {
  const data = await getRowById(c, branches, c.req.param("id"));
  return c.json({ success: true, data, requestId: c.get("requestId") });
});

branchesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createBranchRequest.parse(await c.req.json());
  const user = c.get("user")!;
  await checkUnique(c, branches, branches.code, body.code);
  const db = c.get("db")!;
  const [created] = await db
    .insert(branches)
    .values({ tenantId: user.tenantId, ...body })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

branchesRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const body = updateBranchRequest.parse(await c.req.json());
  if (body.code) await checkUnique(c, branches, branches.code, body.code, id);
  const user = c.get("user")!;
  const db = c.get("db")!;
  const [updated] = await db
    .update(branches)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(branches.id, id), eq(branches.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Branch", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

branchesRoute.delete("/:id", requireRole("ADMIN"), async (c) => {
  await softDeleteRow(c, branches, c.req.param("id"));
  return c.json({ success: true, data: { id: c.req.param("id"), archived: true }, requestId: c.get("requestId") });
});
