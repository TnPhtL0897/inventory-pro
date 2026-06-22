import { z } from "zod";

const uuid = z.string().uuid();

export const listWarehousesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  branchId: uuid.optional(),
  type: z.enum(["RECEIVING", "ISSUE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"]).optional(),
  productGroup: z.enum(["HOA_CHAT_SINH_PHAM", "VAT_TU_Y_TE"]).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createWarehouseRequest = z.object({
  branchId: uuid,
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  managerId: uuid.optional().nullable(),
  isDefault: z.boolean().default(false),
  allowNegative: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"]).default("ACTIVE"),
  type: z.enum(["RECEIVING", "ISSUE"]).default("RECEIVING"),
  attributes: z.string().default("{}"),
  // Khoa XN
  productGroup: z.enum(["HOA_CHAT_SINH_PHAM", "VAT_TU_Y_TE"]).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateWarehouseRequest = createWarehouseRequest.partial();

export type ListWarehousesQuery = z.infer<typeof listWarehousesQuery>;
export type CreateWarehouseRequest = z.infer<typeof createWarehouseRequest>;
export type UpdateWarehouseRequest = z.infer<typeof updateWarehouseRequest>;
