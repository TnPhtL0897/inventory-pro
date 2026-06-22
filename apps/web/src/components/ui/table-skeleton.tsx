/**
 * TableSkeleton - Loading skeleton cho table
 * Thay thế spinner quay, UX tốt hơn
 *
 * Usage:
 *   {isLoading ? <TableSkeleton rows={5} cols={6} /> : <Table ... />}
 */

import * as React from "react";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
  showHeader?: boolean;
  showSearch?: boolean;
  showFilters?: boolean;
}

export function TableSkeleton({
  rows = 8,
  cols = 5,
  className,
  showHeader = true,
  showSearch = false,
  showFilters = false,
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1 max-w-sm" />
          <Skeleton className="h-10 w-24" />
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        {/* Header row */}
        {showHeader && (
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-4 flex-1"
                style={{ maxWidth: `${100 / cols}%` }}
              />
            ))}
          </div>
        )}

        {/* Data rows */}
        <div>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="flex items-center gap-2 border-b px-4 py-3.5 last:border-b-0"
            >
              {Array.from({ length: cols }).map((_, colIdx) => (
                <Skeleton
                  key={colIdx}
                  className={cn(
                    "h-4 flex-1",
                    colIdx === 0 && "h-5 w-8 rounded-full" // First col: avatar/icon
                  )}
                  style={{ maxWidth: `${100 / cols}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-48" />
      </div>
    </div>
  );
}
