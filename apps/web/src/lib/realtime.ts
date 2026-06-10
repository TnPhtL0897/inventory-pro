// =============================================================================
// Realtime hooks for Supabase Postgres Changes
//
// Subscribes to `postgres_changes` events from a table. When the data changes
// (INSERT/UPDATE/DELETE), the hook fires the callback. The query is also
// re-fetched via react-query to update the UI automatically.
//
// Usage:
//   useRealtimeTable('stock_movements', { event: 'INSERT' }, ['stock-movements'])
//   useRealtimeStock() - domain-specific wrapper for stock movements
// =============================================================================
"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sb } from "./data-access";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type ChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface UseRealtimeTableOptions {
  event?: ChangeEvent;
  schema?: string;
  filter?: string; // PostgREST filter syntax, e.g. "tenant_id=eq.abc"
  queryKey?: readonly unknown[]; // react-query key to invalidate on change
  onChange?: (payload: RealtimePostgresChangesPayload<any>) => void;
  enabled?: boolean;
}

/**
 * Subscribe to a table's postgres_changes and invalidate a react-query cache
 * (or run a custom callback) on change.
 *
 * Returns the channel so caller can unsubscribe if needed.
 */
export function useRealtimeTable(
  table: string,
  options: UseRealtimeTableOptions = {},
): RealtimeChannel | null {
  const {
    event = "*",
    schema = "public",
    filter,
    queryKey,
    onChange,
    enabled = true,
  } = options;

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = sb()
      .channel(`${table}-${event}-${filter ?? "all"}`)
      .on(
        "postgres_changes" as any,
        { event, schema, table, ...(filter ? { filter } : {}) } as any,
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (onChange) onChange(payload);
          if (queryKey) {
            // Force refetch (don't just invalidate — also re-fetch immediately)
            queryClient.invalidateQueries({ queryKey });
          }
        },
      )
      .subscribe();

    return () => {
      sb().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, schema, filter, enabled]);
  return null;
}

// =============================================================================
// Domain-specific hooks
// =============================================================================

import { STOCK_QUERY_KEYS } from "./query-keys";

/**
 * Subscribe to stock_movements INSERT events. Invalidates all stock-related
 * queries (levels, movements history) so the UI auto-refreshes.
 */
export function useRealtimeStockMovements(enabled = true) {
  useRealtimeTable("stock_movements", {
    event: "INSERT",
    enabled,
    queryKey: STOCK_QUERY_KEYS.all,
    onChange: (payload) => {
      // Toast for new movements (only on warehouse that user can see)
      // No-op if user is not in warehouse page; react-query refetch handles UI
      const movement = (payload.new ?? {}) as {
        movement_type?: string;
        quantity?: number;
        product_id?: string;
      };
      if (movement.movement_type && movement.quantity) {
        // Use dynamic import to avoid circular deps
        import("sonner").then(({ toast }) => {
          const m = movement as any;
          const sign = ["IN", "TRANSFER_IN", "ADJUST_IN", "RETURN_IN"].includes(m.movement_type) ? "+" : "-";
          toast.info(`Stock movement: ${m.movement_type} ${sign}${m.quantity}`, {
            description: "Tự động cập nhật dashboard",
            duration: 3000,
          });
        }).catch(() => {});
      }
    },
  });
}

/**
 * Subscribe to purchase-orders changes (approval, post, cancel).
 * Invalidates PO list + dashboard counters.
 */
export function useRealtimePurchaseOrders(enabled = true) {
  useRealtimeTable("purchase_orders", {
    event: "UPDATE",
    enabled,
    queryKey: ["purchase-orders"],
    onChange: (payload) => {
      const oldStatus = (payload.old as any)?.status;
      const newStatus = (payload.new as any)?.status;
      if (oldStatus !== newStatus && newStatus) {
        import("sonner").then(({ toast }) => {
          toast.info(`PO ${(payload.new as any).po_number}: ${oldStatus} → ${newStatus}`, {
            duration: 3000,
          });
        }).catch(() => {});
      }
    },
  });
}

/**
 * Subscribe to goods-receipts + stock-issues + stock-transfers.
 * When a new doc is POSTED, invalidates related queries.
 */
export function useRealtimeStockDocuments(enabled = true) {
  // GRN
  useRealtimeTable("goods_receipts", {
    event: "UPDATE",
    enabled,
    queryKey: ["goods-receipts", "stock", "stock-levels", "dashboard"],
  });
  // Stock Issue
  useRealtimeTable("stock_issues", {
    event: "UPDATE",
    enabled,
    queryKey: ["stock-issues", "stock", "stock-levels", "dashboard"],
  });
  // Stock Transfer
  useRealtimeTable("stock_transfers", {
    event: "UPDATE",
    enabled,
    queryKey: ["stock-transfers", "stock", "stock-levels", "dashboard"],
  });
  // Stock Take
  useRealtimeTable("stock_takes", {
    event: "UPDATE",
    enabled,
    queryKey: ["stock-takes", "stock", "stock-levels", "dashboard"],
  });
}
