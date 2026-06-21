/**
 * EmptyState component
 * Hiển thị khi table/list rỗng với icon, message, và CTA
 *
 * Usage:
 *   <EmptyState
 *     icon="package"
 *     title="Chưa có vật tư nào"
 *     description="Bắt đầu bằng cách tạo sản phẩm đầu tiên"
 *     actionLabel="Thêm vật tư"
 *     onAction={() => setOpen(true)}
 *   />
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Package, Warehouse, Users, Building2, FileText, ClipboardList,
  Truck, ShoppingCart, PackageOpen, AlertCircle, Inbox, Search,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  package: Package,
  warehouse: Warehouse,
  users: Users,
  building: Building2,
  file: FileText,
  clipboard: ClipboardList,
  truck: Truck,
  cart: ShoppingCart,
  inbox: Inbox,
  search: Search,
  alert: AlertCircle,
};

export interface EmptyStateProps {
  icon?: keyof typeof ICON_MAP | LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon = "package",
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  secondaryLabel,
  onSecondary,
  className,
  size = "md",
}: EmptyStateProps) {
  const Icon = typeof icon === "string" ? (ICON_MAP[icon] ?? Package) : icon;
  const sizeClasses = {
    sm: { wrapper: "py-8", icon: "h-10 w-10", title: "text-base" },
    md: { wrapper: "py-14", icon: "h-14 w-14", title: "text-lg" },
    lg: { wrapper: "py-20", icon: "h-20 w-20", title: "text-xl" },
  }[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizeClasses.wrapper,
        className
      )}
    >
      <div
        className={cn(
          "rounded-full bg-muted/50 p-4 text-muted-foreground/70",
          "ring-1 ring-border/50"
        )}
      >
        <Icon className={sizeClasses.icon} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className={cn("mt-4 font-semibold text-foreground", sizeClasses.title)}>
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {(actionLabel || secondaryLabel) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && (onAction || actionHref) && (
            <Button
              type="button"
              onClick={onAction}
              {...(actionHref && !onAction ? { asChild: true } : {})}
            >
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button type="button" variant="ghost" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * EmptyStateWithAction - variant dùng cho table/list pages
 * Pre-configured với patterns phổ biến
 */

export const EmptyStatePresets = {
  noProducts: {
    icon: "package" as const,
    title: "Chưa có vật tư nào",
    description: "Bắt đầu bằng cách thêm sản phẩm đầu tiên vào hệ thống",
  },
  noWarehouses: {
    icon: "warehouse" as const,
    title: "Chưa có kho nào",
    description: "Tạo kho chẵn (nhận hàng từ NCC) hoặc kho lẻ (sử dụng nội bộ)",
  },
  noParties: {
    icon: "building" as const,
    title: "Chưa có đối tác nào",
    description: "Thêm nhà cung cấp hoặc khách hàng để bắt đầu giao dịch",
  },
  noSearchResults: {
    icon: "search" as const,
    title: "Không tìm thấy kết quả",
    description: "Thử thay đổi từ khóa hoặc bộ lọc",
  },
  noLots: {
    icon: "clipboard" as const,
    title: "Chưa có lô hàng nào",
    description: "Tạo lô hàng khi nhập kho để theo dõi hạn sử dụng",
  },
  noStock: {
    icon: "package" as const,
    title: "Kho đang trống",
    description: "Nhập kho hoặc chuyển kho từ chi nhánh khác để bắt đầu",
  },
  noGRN: {
    icon: "inbox" as const,
    title: "Chưa có phiếu nhập kho",
    description: "Tạo phiếu nhập kho từ đơn đặt hàng hoặc nhập trực tiếp",
  },
  noPO: {
    icon: "cart" as const,
    title: "Chưa có đơn đặt hàng",
    description: "Tạo đơn đặt hàng gửi nhà cung cấp",
  },
  noTransfers: {
    icon: "truck" as const,
    title: "Chưa có phiếu chuyển kho",
    description: "Chuyển hàng giữa các kho nội bộ",
  },
  noStockTakes: {
    icon: "clipboard" as const,
    title: "Chưa có phiếu kiểm kê",
    description: "Tạo phiếu kiểm kê định kỳ để đối chiếu tồn kho",
  },
  noReplenishment: {
    icon: "cart" as const,
    title: "Chưa có đợt dự trù",
    description: "Chạy dự trù cuối tháng để tạo phiếu đề nghị mua hàng",
  },
};
