// =============================================================================
// Party (NCC/KH) schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export const partyTypeSchema = z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]);
export type PartyTypeInput = z.infer<typeof partyTypeSchema>;

export const partyStatusSchema = z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]);
export type PartyStatusInput = z.infer<typeof partyStatusSchema>;

// -----------------------------------------------------------------------------
// Create / Update
// -----------------------------------------------------------------------------
export const createPartySchema = z.object({
  party_type: partyTypeSchema.default("SUPPLIER"),
  code: z
    .string()
    .trim()
    .min(1, "Mã đối tác không được trống")
    .max(50)
    .regex(/^[A-Z0-9_\-.À-ỹ]+$/i, "Mã chỉ chứa chữ, số, _, -, ."),
  name: z.string().trim().min(1, "Tên đối tác không được trống").max(200),
  tax_code: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => undefined)),
  contact_name: z.string().trim().max(200).optional().nullable(),
  contact_email: z.string().trim().email("Email không hợp lệ").max(200).optional().nullable(),
  contact_phone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().max(100).default("VN"),
  payment_terms: z.coerce.number().int().nonnegative().default(0),
  credit_limit: z.coerce.number().nonnegative().default(0),
  bank_account: z.string().trim().max(50).optional().nullable(),
  bank_name: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updatePartySchema = createPartySchema.partial().extend({
  status: partyStatusSchema.optional(),
});

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;

// -----------------------------------------------------------------------------
// List query
// -----------------------------------------------------------------------------
export const partyListQuerySchema = listQuerySchema.extend({
  search: z.string().trim().optional(),
  party_type: partyTypeSchema.optional(),
  status: partyStatusSchema.optional(),
});

// -----------------------------------------------------------------------------
// SupplierProduct (mapping NCC ↔ Product)
// -----------------------------------------------------------------------------
export const createSupplierProductSchema = z.object({
  party_id: uuidSchema,
  product_id: uuidSchema,
  supplier_sku: z.string().trim().max(100).optional().nullable(),
  cost_price: z.coerce.number().nonnegative().default(0),
  min_order_qty: z.coerce.number().positive().default(1),
  lead_time_days: z.coerce.number().int().nonnegative().default(7),
  is_preferred: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;
