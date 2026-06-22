/**
 * ConfirmDialog - Modal xác nhận hành động nguy hiểm
 * Thay thế browser native confirm() bằng dialog đẹp, accessible
 *
 * Usage:
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Xóa vật tư?"
 *     description="Hành động này không thể hoàn tác."
 *     variant="destructive"
 *     onConfirm={handleDelete}
 *     isLoading={isDeleting}
 *   />
 */

import * as React from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive" | "warning" | "info";

const VARIANT_CONFIG: Record<ConfirmVariant, {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  confirmClass: string;
}> = {
  default: {
    icon: Info,
    iconClass: "text-muted-foreground",
    confirmClass: "",
  },
  destructive: {
    icon: AlertTriangle,
    iconClass: "text-red-600",
    confirmClass: "bg-red-600 text-white hover:bg-red-700",
  },
  warning: {
    icon: AlertCircle,
    iconClass: "text-amber-600",
    confirmClass: "bg-amber-600 text-white hover:bg-amber-700",
  },
  info: {
    icon: Info,
    iconClass: "text-blue-600",
    confirmClass: "",
  },
};

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  showCancel?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  variant = "default",
  onConfirm,
  isLoading = false,
  showCancel = true,
}: ConfirmDialogProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn("shrink-0 mt-0.5", config.iconClass)}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-1.5">{description}</DialogDescription>
              )}
              {details && (
                <div className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {details}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          {showCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={variant === "destructive" || variant === "warning" ? "default" : "default"}
            className={cn(variant !== "default" && config.confirmClass)}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * useConfirm hook - Promise-based confirm dialog
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Xóa?",
 *     description: "...",
 *     variant: "destructive",
 *   });
 *   if (ok) doDelete();
 */
export function useConfirm() {
  const [state, setState] = React.useState<{
    open: boolean;
    opts: Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm"> | null;
    resolve: ((v: boolean) => void) | null;
  }>({ open: false, opts: null, resolve: null });

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm">) =>
      new Promise<boolean>((resolve) => {
        setState({ open: true, opts, resolve });
      }),
    []
  );

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open && state.resolve) state.resolve(false);
      setState((s) => ({ ...s, open: false, resolve: null, opts: null }));
    },
    [state.resolve]
  );

  const ConfirmHost = () => {
    if (!state.opts) return null;
    return (
      <ConfirmDialog
        open={state.open}
        onOpenChange={handleOpenChange}
        onConfirm={async () => {
          state.resolve?.(true);
          setState((s) => ({ ...s, open: false, resolve: null, opts: null }));
        }}
        {...state.opts}
      />
    );
  };

  return { confirm, ConfirmHost };
}
