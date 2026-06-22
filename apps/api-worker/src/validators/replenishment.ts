import { z } from "zod";

export const runReplenishmentRequest = z.object({
  fiscalMonth: z.coerce.number().int().min(1).max(12),
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  asOfDate: z.string().date().optional(),
  saveAsPurchaseRequest: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type RunReplenishmentRequest = z.infer<typeof runReplenishmentRequest>;
