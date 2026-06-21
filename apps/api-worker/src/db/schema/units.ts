/**
 * Drizzle schema: units_of_measure table
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const units = pgTable(
  "units_of_measure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("units_tenant_idx").on(t.tenantId),
    codeTenantIdx: index("units_code_tenant_idx").on(t.tenantId, t.code),
  })
);

export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
