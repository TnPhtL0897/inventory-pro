/**
 * Zod validation schemas cho Product module
 *
 * - listProductsQuery: validate query params (page, pageSize, search, ...)
 * - createProductRequest: validate body cho POST /products
 * - updateProductRequest: validate body cho PUT /products/:id
 *
 * Match shape với frontend types (apps/web/src/features/products/api.ts)
 */

import { z } from "zod";

const uuid = z.string().uuid();
const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v));

export const listProductsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  categoryId: uuid.optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  productGroup: z
    .enum(["HOA_CHAT_SINH_PHAM", "VAT_TU_Y_TE", ""])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  isActive: z.coerce.boolean().optional(),
});

export const createProductRequest = z.object({
  sku: z.string().trim().min(1).max(50),
  barcode: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: uuid.optional().nullable(),
  baseUnitId: uuid,
  productType: z
    .enum(["GOODS", "SERVICE", "RAW_MATERIAL", "FINISHED_GOOD", "CONSUMABLE"])
    .default("GOODS"),
  costPrice: decimalString.default("0"),
  sellPrice: decimalString.default("0"),
  minStock: decimalString.default("0"),
  maxStock: decimalString.optional().nullable(),
  isBatchTracked: z.boolean().default(false),
  isSerialTracked: z.boolean().default(false),
  isExpiryTracked: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  imageUrl: z.string().url().optional().nullable(),
  // Khoa XN
  productGroup: z
    .enum(["HOA_CHAT_SINH_PHAM", "VAT_TU_Y_TE"])
    .optional()
    .nullable(),
  productSubtype: z.string().trim().max(50).optional().nullable(),
  openVialStabilityDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  storageCondition: z
    .enum(["ROOM_TEMP", "REFRIGERATED", "FROZEN"])
    .optional()
    .nullable(),
});

export const updateProductRequest = createProductRequest.partial();

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type CreateProductRequest = z.infer<typeof createProductRequest>;
export type UpdateProductRequest = z.infer<typeof updateProductRequest>;
