/**
 * Locations CRUD (vị trí trong kho)
 */

import { Hono } from "hono";
import { eq, and, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { locations } from "../db/schema";
import {
  listLocationsQuery,
  createLocationRequest,
  updateLocationRequest,
} from "../validators/location";
import { NotFoundError } from "../errors";
import { requireRole, listRows, getRowById, softDeleteRow, checkUnique } from "./_helpers";
import type { AppContext } from "../types";

export const locationsRoute = new Hono<AppContext>();

locationsRoute.get("/", async (c) => {
  const q = listLocationsQuery.parse(c.req.query());
  const filters: SQL[] = [];
  if (q.branchId) filters.push(eq(locations.branchId, q.branchId));
  if (q.warehouseId) filters.push(eq(locations.warehouseId, q.warehouseId));
  if (q.zone) filters.push(eq(locations.zone, q.zone));
  if (q.isActive !== undefined) filters.push(eq(locations.isActive, q.isActive));

  const result = await listRows(c, locations, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    searchColumns: [locations.name, locations.code],
    extraFilters: filters,
    orderBy: locations.sortOrder,
  });
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

locationsRoute.get("/:id", async (c) => {
  const data = await getRowById(c, locations, c.req.param("id"));
  return c.json({ success: true, data, requestId: c.get("requestId") });
});

locationsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createLocationRequest.parse(await c.req.json());
  const user = c.get("user")!;
  // Check unique code within warehouse
  await checkUnique(c, locations, locations.code, body.code);
  const db = getDb(c.env.DATABASE_URL);
  const [created] = await db
    .insert(locations)
    .values({ tenantId: user.tenantId, ...body })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

locationsRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const id = c.req.param("id");
  const body = updateLocationRequest.parse(await c.req.json());
  if (body.code) await checkUnique(c, locations, locations.code, body.code, id);
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const [updated] = await db
    .update(locations)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(locations.id, id), eq(locations.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Location", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

locationsRoute.delete("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  await softDeleteRow(c, locations, c.req.param("id"));
  return c.json({ success: true, data: { id: c.req.param("id"), archived: true }, requestId: c.get("requestId") });
});
