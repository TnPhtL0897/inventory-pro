// =============================================================================
// Product / Category / Unit schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export const productTypeSchema = z.enum([
  "GOODS",
  "SERVICE",
  "RAW_MATERIAL",
  "FINISHED_GOOD",
  "CONSUMABLE",
]);
export type ProductTypeInput = z.infer<typeof productTypeSchema>;

export const productStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export type ProductStatusInput = z.infer<typeof productStatusSchema>;

export const unitTypeSchema = z.enum([
  "COUNT",
  "WEIGHT",
  "VOLUME",
  "LENGTH",
  "AREA",
  "TIME",
]);
export type UnitTypeInput = z.infer<typeof unitTypeSchema>;

// -----------------------------------------------------------------------------
// Category
// -----------------------------------------------------------------------------
export const createCategorySchema = z.object({
  parent_id: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1, "Tên danh mục không được trống").max(200),
  code: z.string().trim().min(1, "Mã danh mục không được trống").max(50),
  description: z.string().trim().max(1000).optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryListQuerySchema = listQuerySchema.extend({
  parent_id: uuidSchema.optional(),
  is_active: z.coerce.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// -----------------------------------------------------------------------------
// Unit of Measure
// -----------------------------------------------------------------------------
export const createUnitSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Mã đơn vị không được trống")
    .max(20)
    .regex(/^[A-Z0-9_À-ỹ]+$/, "Mã chỉ chứa chữ hoa, số, gạch dưới"),
  name: z.string().trim().min(1, "Tên đơn vị không được trống").max(100),
  unit_type: unitTypeSchema.default("COUNT"),
  is_active: z.boolean().default(true),
});

export const updateUnitSchema = createUnitSchema.partial();

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

// -----------------------------------------------------------------------------
// Product
// -----------------------------------------------------------------------------
const numericString = (schema: z.ZodNumber) =>
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        ctx.addIssue({ code: "custom", message: "Số không hợp lệ" });
        return z.NEVER;
      }
      return v;
    }
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Số không hợp lệ" });
      return z.NEVER;
    }
    return n;
  }).pipe(schema);

const createProductBaseSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU không được trống")
    .max(50)
    .regex(/^[A-Z0-9\-_.]+$/i, "SKU chỉ chứa chữ, số, gạch ngang, gạch dưới, chấm"),
  barcode: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Tên sản phẩm không được trống").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  category_id: uuidSchema.optional().nullable(),
  base_unit_id: uuidSchema,
  product_type: productTypeSchema.default("GOODS"),
  cost_price: numericString(z.number().nonnegative("Giá vốn phải >= 0")).default(0),
  sell_price: numericString(z.number().nonnegative("Giá bán phải >= 0")).default(0),
  min_stock: numericString(z.number().nonnegative("Tồn tối thiểu phải >= 0")).default(0),
  max_stock: numericString(z.number().nonnegative()).optional().nullable(),
  is_batch_tracked: z.boolean().default(false),
  is_serial_tracked: z.boolean().default(false),
  is_expiry_tracked: z.boolean().default(false),
  weight: numericString(z.number().nonnegative()).optional().nullable(),
  volume: numericString(z.number().nonnegative()).optional().nullable(),
  attributes: z.record(z.unknown()).default({}),
  image_url: z.string().url().optional().nullable().or(z.literal("").transform(() => undefined)),
  status: productStatusSchema.default("ACTIVE"),
});

export const createProductSchema = createProductBaseSchema.refine(
  (v) => v.max_stock == null || v.max_stock >= v.min_stock,
  { message: "Tồn tối đa phải >= tồn tối thiểu", path: ["max_stock"] },
);

export const updateProductSchema = createProductBaseSchema.partial();

export const productListQuerySchema = listQuerySchema.extend({
  category_id: uuidSchema.optional(),
  status: productStatusSchema.optional(),
  product_type: productTypeSchema.optional(),
  is_active: z.coerce.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// -----------------------------------------------------------------------------
// Product Unit (conversion)
// -----------------------------------------------------------------------------
export const createProductUnitSchema = z.object({
  unit_id: uuidSchema,
  factor: numericString(z.number().positive("Hệ số quy đổi phải > 0")),
  is_purchase: z.boolean().default(false),
  is_sale: z.boolean().default(false),
  barcode: z.string().trim().max(50).optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateProductUnitSchema = createProductUnitSchema.partial();

export type CreateProductUnitInput = z.infer<typeof createProductUnitSchema>;
export type UpdateProductUnitInput = z.infer<typeof updateProductUnitSchema>;
