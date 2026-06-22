/**
 * Drizzle schema: locations table (vị trí trong kho)
 */

import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    zone: text("zone"), // A/B/C...
    rack: text("rack"),
    shelf: text("shelf"),
    bin: text("bin"),
    capacityVolume: text("capacity_volume"),
    capacityWeight: text("capacity_weight"),
    isPickable: boolean("is_pickable").notNull().default(true),
    isReceivable: boolean("is_receivable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("locations_tenant_idx").on(t.tenantId),
    warehouseIdx: index("locations_warehouse_idx").on(t.tenantId, t.warehouseId),
  })
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
