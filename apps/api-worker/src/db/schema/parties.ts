/**
 * Drizzle schema: parties (NCC/khách hàng)
 */

import { pgTable, uuid, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";

export const parties = pgTable(
  "parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    partyType: text("party_type").notNull().default("SUPPLIER"), // SUPPLIER | CUSTOMER | BOTH
    code: text("code").notNull(),
    name: text("name").notNull(),
    taxCode: text("tax_code"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    city: text("city"),
    country: text("country").notNull().default("VN"),
    paymentTerms: integer("payment_terms").notNull().default(0),
    creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }).notNull().default("0"),
    bankAccount: text("bank_account"),
    bankName: text("bank_name"),
    notes: text("notes"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE | BLOCKED
    attributes: text("attributes").notNull().default("{}"), // JSONB
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("parties_tenant_idx").on(t.tenantId),
    codeTenantIdx: index("parties_code_tenant_idx").on(t.tenantId, t.code),
  })
);

// Drizzle boolean needs to be imported
import { boolean } from "drizzle-orm/pg-core";

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
