import { z } from "zod";

const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v));

export const listPartiesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  partyType: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createPartyRequest = z.object({
  partyType: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).default("SUPPLIER"),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  taxCode: z.string().trim().max(20).optional().nullable(),
  contactName: z.string().trim().max(100).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().max(50).default("VN"),
  paymentTerms: z.coerce.number().int().min(0).default(0),
  creditLimit: decimalString.default("0"),
  bankAccount: z.string().trim().max(50).optional().nullable(),
  bankName: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).default("ACTIVE"),
  attributes: z.string().default("{}"),
  isActive: z.boolean().default(true),
});

export const updatePartyRequest = createPartyRequest.partial();

export type ListPartiesQuery = z.infer<typeof listPartiesQuery>;
export type CreatePartyRequest = z.infer<typeof createPartyRequest>;
export type UpdatePartyRequest = z.infer<typeof updatePartyRequest>;
