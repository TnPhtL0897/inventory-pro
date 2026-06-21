import { z } from "zod";

export const listUnitsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createUnitRequest = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateUnitRequest = createUnitRequest.partial();

export type ListUnitsQuery = z.infer<typeof listUnitsQuery>;
export type CreateUnitRequest = z.infer<typeof createUnitRequest>;
export type UpdateUnitRequest = z.infer<typeof updateUnitRequest>;
