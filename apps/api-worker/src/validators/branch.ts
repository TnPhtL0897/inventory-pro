import { z } from "zod";

const uuid = z.string().uuid();

export const listBranchesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createBranchRequest = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  taxCode: z.string().trim().max(20).optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateBranchRequest = createBranchRequest.partial();

export type ListBranchesQuery = z.infer<typeof listBranchesQuery>;
export type CreateBranchRequest = z.infer<typeof createBranchRequest>;
export type UpdateBranchRequest = z.infer<typeof updateBranchRequest>;
