import { z } from "zod";

const uuid = z.string().uuid();

export const listCategoriesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  parentId: uuid.optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export const createCategoryRequest = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  parentId: uuid.optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCategoryRequest = createCategoryRequest.partial();

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>;
export type CreateCategoryRequest = z.infer<typeof createCategoryRequest>;
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequest>;
