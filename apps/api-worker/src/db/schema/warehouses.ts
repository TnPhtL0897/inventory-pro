/**
 * Drizzle schema: warehouses table
 *
 * Branch-scoped (tenantId + branchId). Type: RECEIVING (kho chẵn) | ISSUE (kho lẻ).
 * Khoa XN extension: productGroup (HOA_CHAT_SINH_PHAM | VAT_TU_Y_TE).
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    managerId: uuid("manager_id"),
    isDefault: boolean("is_default").notNull().default(false),
    allowNegative: boolean("allow_negative").notNull().default(false),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE | CLOSED
    type: text("type").notNull().default("RECEIVING"), // RECEIVING | ISSUE
    attributes: text("attributes").notNull().default("{}"), // JSONB
    // Khoa XN extensions
    productGroup: text("product_group"), // HOA_CHAT_SINH_PHAM | VAT_TU_Y_TE
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("warehouses_tenant_idx").on(t.tenantId),
    branchIdx: index("warehouses_branch_idx").on(t.tenantId, t.branchId),
    codeTenantIdx: index("warehouses_code_tenant_idx").on(t.tenantId, t.code),
  })
);

export type Warehouse = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
