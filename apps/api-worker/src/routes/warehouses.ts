/**
 * Warehouses CRUD
 *
 * Khoa XN: type=RECEIVING (kho chẵn) hoặc ISSUE (kho lẻ).
 * productGroup: HOA_CHAT_SINH_PHAM (HC-SP) hoặc VAT_TU_Y_TE (VTYT).
 */

import { Hono } from "hono";
import { eq, and, type SQL } from "drizzle-orm";

import { warehouses } from "../db/schema";
import {
  listWarehousesQuery,
  createWarehouseRequest,
  updateWarehouseRequest,
} from "../validators/warehouse";
import { NotFoundError } from "../errors";
import { requireRole, listRows, getRowById, softDeleteRow, checkUnique } from "./_helpers";
import type { AppContext } from "../types";

export const warehousesRoute = new Hono<AppContext>();

warehousesRoute.get("/", async (c) => {
  const q = listWarehousesQuery.parse(c.req.query());
  const filters: SQL[] = [];
  if (q.branchId) filters.push(eq(warehouses.branchId, q.branchId));
  if (q.type) filters.push(eq(warehouses.type, q.type));
  if (q.status) filters.push(eq(warehouses.status, q.status));
  if (q.productGroup) filters.push(eq(warehouses.productGroup, q.productGroup));
  if (q.isActive !== undefined) filters.push(eq(warehouses.isActive, q.isActive));

  const result = await listRows(c, warehouses, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    searchColumns: [warehouses.name, warehouses.code],
    extraFilters: filters,
    orderBy: warehouses.code,
  });
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

warehousesRoute.get("/:id", async (c) => {
  const data = await getRowById(c, warehouses, c.req.param("id"));
  return c.json({ success: true, data, requestId: c.get("requestId") });
});

warehousesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createWarehouseRequest.parse(await c.req.json());
  const user = c.get("user")!;
  await checkUnique(c, warehouses, warehouses.code, body.code);
  const db = c.get("db")!;
  const [created] = await db
    .insert(warehouses)
    .values({ tenantId: user.tenantId, ...body })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

warehousesRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const body = updateWarehouseRequest.parse(await c.req.json());
  if (body.code) await checkUnique(c, warehouses, warehouses.code, body.code, id);
  const user = c.get("user")!;
  const db = c.get("db")!;
  const [updated] = await db
    .update(warehouses)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Warehouse", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

warehousesRoute.delete("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  await softDeleteRow(c, warehouses, c.req.param("id"));
  return c.json({ success: true, data: { id: c.req.param("id"), archived: true }, requestId: c.get("requestId") });
});
