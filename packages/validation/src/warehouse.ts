// =============================================================================
// Warehouse / Location schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export const warehouseStatusSchema = z.enum(["ACTIVE", "INACTIVE", "CLOSED"]);
export const warehouseTypeSchema = z.enum(["RECEIVING", "ISSUE"]);
export const locationStatusSchema = z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]);
export const locationTypeSchema = z.enum([
  "RECEIVING",
  "STORAGE",
  "PICKING",
  "PACKING",
  "SHIPPING",
  "QUARANTINE",
  "TRANSIT",
  "RETURN",
]);

// -----------------------------------------------------------------------------
// Warehouse
// -----------------------------------------------------------------------------
export const createWarehouseSchema = z.object({
  branch_id: uuidSchema,
  name: z.string().trim().min(1, "Tên kho không được trống").max(200),
  code: z
    .string()
    .trim()
    .min(1, "Mã kho không được trống")
    .max(50)
    .regex(/^[A-Z0-9\-_]+$/i, "Mã chỉ chứa chữ, số, gạch ngang, gạch dưới"),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  manager_id: uuidSchema.optional().nullable(),
  is_default: z.boolean().default(false),
  allow_negative: z.boolean().default(false),
  status: warehouseStatusSchema.default("ACTIVE"),
  type: warehouseTypeSchema.default("RECEIVING"),
  attributes: z.record(z.unknown()).default({}),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export const warehouseListQuerySchema = listQuerySchema.extend({
  branch_id: uuidSchema.optional(),
  status: warehouseStatusSchema.optional(),
  type: warehouseTypeSchema.optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

// -----------------------------------------------------------------------------
// Location
// -----------------------------------------------------------------------------
export const createLocationSchema = z
  .object({
    warehouse_id: uuidSchema,
    parent_id: uuidSchema.optional().nullable(),
    name: z.string().trim().min(1, "Tên vị trí không được trống").max(200),
    code: z
      .string()
      .trim()
      .min(1, "Mã vị trí không được trống")
      .max(80),
    barcode: z.string().trim().max(100).optional().nullable(),
    location_type: locationTypeSchema.default("STORAGE"),
    capacity_volume: z.number().nonnegative().optional().nullable(),
    capacity_weight: z.number().nonnegative().optional().nullable(),
    max_qty_hint: z.number().nonnegative().optional().nullable(),
    pick_sequence: z.number().int().min(0).default(0),
    is_pickable: z.boolean().default(true),
    status: locationStatusSchema.default("ACTIVE"),
    attributes: z.record(z.unknown()).default({}),
  });

export const updateLocationSchema = createLocationSchema.partial();

export const locationListQuerySchema = listQuerySchema.extend({
  warehouse_id: uuidSchema.optional(),
  parent_id: uuidSchema.optional(),
  location_type: locationTypeSchema.optional(),
  is_pickable: z.coerce.boolean().optional(),
  status: locationStatusSchema.optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
