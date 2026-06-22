import { z } from "zod";

const uuid = z.string().uuid();

export const listLocationsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  branchId: uuid.optional(),
  warehouseId: uuid.optional(),
  zone: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createLocationRequest = z.object({
  branchId: uuid,
  warehouseId: uuid,
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  zone: z.string().trim().max(20).optional().nullable(),
  rack: z.string().trim().max(20).optional().nullable(),
  shelf: z.string().trim().max(20).optional().nullable(),
  bin: z.string().trim().max(20).optional().nullable(),
  capacityVolume: z.string().trim().max(50).optional().nullable(),
  capacityWeight: z.string().trim().max(50).optional().nullable(),
  isPickable: z.boolean().default(true),
  isReceivable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateLocationRequest = createLocationRequest.partial();

export type ListLocationsQuery = z.infer<typeof listLocationsQuery>;
export type CreateLocationRequest = z.infer<typeof createLocationRequest>;
export type UpdateLocationRequest = z.infer<typeof updateLocationRequest>;
