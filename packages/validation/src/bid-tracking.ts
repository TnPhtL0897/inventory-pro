// =============================================================================
// Bid Tracking - Validation schemas
// =============================================================================

import { z } from "zod";

export const bidContractDashboardSchema = z.object({
  totalContracts: z.number().int().nonnegative(),
  activeContracts: z.number().int().nonnegative(),
  expiring30Days: z.number().int().nonnegative(),
  expiring60Days: z.number().int().nonnegative(),
  expiring90Days: z.number().int().nonnegative(),
  totalContractValue: z.number(),
  totalUsedValue: z.number(),
  totalRemainingValue: z.number(),
  avgUsagePercent: z.number().min(0).max(1),
});

export type BidContractDashboard = z.infer<typeof bidContractDashboardSchema>;

export const bidContractExpiringSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierName: z.string(),
  endDate: z.string(),
  daysUntilExpiry: z.number().int(),
  alertLevel: z.enum(["INFO", "WARNING", "CRITICAL", "EXPIRED"]),
  totalContractValue: z.number(),
  usedValue: z.number(),
  remainingValue: z.number(),
  usagePercent: z.number().min(0).max(1),
  message: z.string(),
});

export type BidContractExpiring = z.infer<typeof bidContractExpiringSchema>;
