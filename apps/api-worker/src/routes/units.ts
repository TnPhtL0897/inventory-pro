/**
 * Units (of measure) CRUD
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { units } from "../db/schema";
import {
  listUnitsQuery,
  createUnitRequest,
  updateUnitRequest,
} from "../validators/unit";
import { NotFoundError } from "../errors";
import { requireRole, listRows, getRowById, softDeleteRow, checkUnique } from "./_helpers";
import type { AppContext } from "../types";

export const unitsRoute = new Hono<AppContext>();

unitsRoute.get("/", async (c) => {
  const q = listUnitsQuery.parse(c.req.query());
  const result = await listRows(c, units, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    searchColumns: [units.name, units.code],
    extraFilters: q.isActive !== undefined ? [eq(units.isActive, q.isActive)] : [],
    orderBy: units.code,
  });
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

unitsRoute.get("/:id", async (c) => {
  const data = await getRowById(c, units, c.req.param("id"));
  return c.json({ success: true, data, requestId: c.get("requestId") });
});

unitsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createUnitRequest.parse(await c.req.json());
  const user = c.get("user")!;
  await checkUnique(c, units, units.code, body.code);
  const db = c.get("db")!;
  const [created] = await db
    .insert(units)
    .values({ tenantId: user.tenantId, ...body })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

unitsRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const body = updateUnitRequest.parse(await c.req.json());
  if (body.code) await checkUnique(c, units, units.code, body.code, id);
  const user = c.get("user")!;
  const db = c.get("db")!;
  const [updated] = await db
    .update(units)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(units.id, id), eq(units.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Unit", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

unitsRoute.delete("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  await softDeleteRow(c, units, c.req.param("id"));
  return c.json({ success: true, data: { id: c.req.param("id"), archived: true }, requestId: c.get("requestId") });
});
