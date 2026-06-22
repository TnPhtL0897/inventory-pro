/**
 * Parties (NCC/khách hàng) CRUD
 */

import { Hono } from "hono";
import { eq, and, type SQL } from "drizzle-orm";

import { parties } from "../db/schema";
import {
  listPartiesQuery,
  createPartyRequest,
  updatePartyRequest,
} from "../validators/party";
import { NotFoundError } from "../errors";
import { requireRole, listRows, getRowById, softDeleteRow, checkUnique } from "./_helpers";
import type { AppContext } from "../types";

export const partiesRoute = new Hono<AppContext>();

partiesRoute.get("/", async (c) => {
  const q = listPartiesQuery.parse(c.req.query());
  const filters: SQL[] = [];
  if (q.partyType) filters.push(eq(parties.partyType, q.partyType));
  if (q.status) filters.push(eq(parties.status, q.status));
  if (q.isActive !== undefined) filters.push(eq(parties.isActive, q.isActive));

  const result = await listRows(c, parties, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    searchColumns: [parties.name, parties.code, parties.taxCode],
    extraFilters: filters,
    orderBy: parties.name,
  });
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

partiesRoute.get("/:id", async (c) => {
  const data = await getRowById(c, parties, c.req.param("id"));
  return c.json({ success: true, data, requestId: c.get("requestId") });
});

partiesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createPartyRequest.parse(await c.req.json());
  const user = c.get("user")!;
  await checkUnique(c, parties, parties.code, body.code);
  const db = c.get("db")!;
  const [created] = await db
    .insert(parties)
    .values({
      tenantId: user.tenantId,
      ...body,
      creditLimit: String(body.creditLimit),
      createdBy: user.id,
    })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

partiesRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const body = updatePartyRequest.parse(await c.req.json());
  if (body.code) await checkUnique(c, parties, parties.code, body.code, id);
  const user = c.get("user")!;
  const db = c.get("db")!;

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    updateSet[k] = k === "creditLimit" && v !== null ? String(v) : v;
  }

  const [updated] = await db
    .update(parties)
    .set(updateSet)
    .where(and(eq(parties.id, id), eq(parties.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("Party", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

partiesRoute.delete("/:id", requireRole("ADMIN"), async (c) => {
  await softDeleteRow(c, parties, c.req.param("id"));
  return c.json({ success: true, data: { id: c.req.param("id"), archived: true }, requestId: c.get("requestId") });
});
