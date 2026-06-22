/**
 * Products module - CRUD endpoints
 *
 * Endpoints:
 *   GET    /api/v1/products            - List (paginated, filter)
 *   GET    /api/v1/products/:id        - Get by ID
 *   POST   /api/v1/products            - Create
 *   PUT    /api/v1/products/:id        - Update
 *   DELETE /api/v1/products/:id        - Delete (or archive if has stock)
 *
 * Conventions (áp dụng cho tất cả module):
 * - Tenant isolation: luôn filter theo tenantId từ JWT
 * - Validation: Zod schemas ở validators/*.ts
 * - Errors: throw AppError subclasses, error handler converts to JSON
 * - Response: { data, success, requestId }
 *
 * Đây là TEMPLATE cho 21 module còn lại (warehouses, stock, lots, ...).
 * Copy file này, đổi table name + DTO, giữ nguyên pattern.
 */

import { Hono } from "hono";
import { eq, and, sql, ilike, or, type SQL } from "drizzle-orm";

import { products } from "../db/schema";
import {
  listProductsQuery,
  createProductRequest,
  updateProductRequest,
} from "../validators/product";
import {
  NotFoundError,
  ConflictError,
} from "../errors";
import { requireRole } from "../middleware/auth";
import type { AppContext, PaginatedResult } from "../types";

export const productsRoute = new Hono<AppContext>();

// =============================================================================
// GET / - List products (paginated, filter)
// =============================================================================
productsRoute.get("/", async (c) => {
  const query = listProductsQuery.parse(c.req.query());
  const user = c.get("user")!; // requireAuth ensures this
  const db = c.get("db")!;

  // Build WHERE conditions
  const conditions: SQL[] = [eq(products.tenantId, user.tenantId)];

  if (query.search) {
    const s = `%${query.search.toLowerCase()}%`;
    conditions.push(
      or(
        ilike(products.name, s),
        ilike(products.sku, s),
        ilike(products.barcode, s)
      )!
    );
  }
  if (query.categoryId) {
    conditions.push(eq(products.categoryId, query.categoryId));
  }
  if (query.status) {
    conditions.push(eq(products.status, query.status));
  }
  if (query.productGroup) {
    conditions.push(eq(products.productGroup, query.productGroup));
  }
  if (query.isActive !== undefined) {
    conditions.push(eq(products.isActive, query.isActive));
  }

  const whereClause = and(...conditions);

  // Count total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(whereClause);

  // Fetch page
  const offset = (query.page - 1) * query.pageSize;
  const items = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(products.name)
    .limit(query.pageSize)
    .offset(offset);

  const result: PaginatedResult<typeof products.$inferSelect> = {
    items,
    total: Number(count),
    page: query.page,
    pageSize: query.pageSize,
  };

  return c.json({
    success: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// =============================================================================
// GET /:id - Get product by ID
// =============================================================================
productsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db")!;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
    .limit(1);

  if (!product) {
    throw new NotFoundError("Product", id);
  }

  return c.json({
    success: true,
    data: product,
    requestId: c.get("requestId"),
  });
});

// =============================================================================
// POST / - Create product (requires products.write or ADMIN)
// =============================================================================
productsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createProductRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = c.get("db")!;

  // Check SKU uniqueness
  const [existingSku] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.tenantId, user.tenantId), eq(products.sku, body.sku)))
    .limit(1);

  if (existingSku) {
    throw new ConflictError(`SKU '${body.sku}' already exists`);
  }

  // Check barcode uniqueness (nếu có)
  if (body.barcode) {
    const [existingBarcode] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.tenantId, user.tenantId),
          eq(products.barcode, body.barcode)
        )
      )
      .limit(1);

    if (existingBarcode) {
      throw new ConflictError(`Barcode '${body.barcode}' already exists`);
    }
  }

  // Insert (convert numeric fields: number → string for Drizzle)
  const [created] = await db
    .insert(products)
    .values({
      tenantId: user.tenantId,
      sku: body.sku,
      barcode: body.barcode ?? null,
      name: body.name,
      description: body.description ?? null,
      categoryId: body.categoryId ?? null,
      baseUnitId: body.baseUnitId,
      productType: body.productType,
      costPrice: String(body.costPrice),
      sellPrice: String(body.sellPrice),
      minStock: String(body.minStock),
      maxStock: body.maxStock != null ? String(body.maxStock) : null,
      isBatchTracked: body.isBatchTracked,
      isSerialTracked: body.isSerialTracked,
      isExpiryTracked: body.isExpiryTracked,
      status: body.status,
      imageUrl: body.imageUrl ?? null,
      productGroup: body.productGroup ?? null,
      productSubtype: body.productSubtype ?? null,
      openVialStabilityDays:
        body.openVialStabilityDays != null
          ? String(body.openVialStabilityDays)
          : null,
      storageCondition: body.storageCondition ?? null,
      createdBy: user.id,
    })
    .returning();

  return c.json(
    {
      success: true,
      data: created,
      requestId: c.get("requestId"),
    },
    201
  );
});

// =============================================================================
// PUT /:id - Update product
// =============================================================================
productsRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const id = c.req.param("id");
  const body = updateProductRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = c.get("db")!;

  // Check exists
  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Product", id);
  }

  // Check SKU conflict (nếu đổi SKU)
  if (body.sku && body.sku !== existing.sku) {
    const [conflict] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.tenantId, user.tenantId),
          eq(products.sku, body.sku)
        )
      )
      .limit(1);

    if (conflict) {
      throw new ConflictError(`SKU '${body.sku}' already exists`);
    }
  }

  // Update (build set object, convert numeric fields)
  const updateSet: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (
      ["costPrice", "sellPrice", "minStock", "maxStock", "openVialStabilityDays"].includes(
        key
      ) &&
      value !== null
    ) {
      updateSet[key] = String(value);
    } else {
      updateSet[key] = value;
    }
  }

  const [updated] = await db
    .update(products)
    .set(updateSet)
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
    .returning();

  return c.json({
    success: true,
    data: updated,
    requestId: c.get("requestId"),
  });
});

// =============================================================================
// DELETE /:id - Delete (or archive if has stock)
// =============================================================================
productsRoute.delete("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db")!;

  // Check exists
  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Product", id);
  }

  // Soft delete: archive thay vì hard delete (an toàn hơn)
  await db
    .update(products)
    .set({
      status: "ARCHIVED",
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)));

  return c.json(
    {
      success: true,
      data: { id, archived: true },
      requestId: c.get("requestId"),
    },
    200
  );
});
