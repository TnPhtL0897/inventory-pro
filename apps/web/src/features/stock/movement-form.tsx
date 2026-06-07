"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordMovementSchema, type RecordMovementInput } from "@inventorypro/validation/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordMovement, MOVEMENT_LABELS, type StockMovementType } from "./api";
import { useProducts } from "@/features/products/api";
import { useWarehouses, useWarehouseLocations, useBranchesAll } from "@/features/warehouses/api";
import { useUnitsAll } from "@/features/products/api";
import { Loader2 } from "lucide-react";

interface MovementFormProps {
  defaultType?: StockMovementType;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const MOVEMENT_TYPES: StockMovementType[] = ["IN", "OUT", "ADJUST_IN", "ADJUST_OUT", "RETURN_IN", "RETURN_OUT"];

export function MovementForm({ defaultType = "IN", onSuccess, onCancel }: MovementFormProps) {
  const record = useRecordMovement();
  const { data: branches } = useBranchesAll();
  const { data: products } = useProducts({ pageSize: 200 });
  const { data: units } = useUnitsAll();
  const { data: warehouses } = useWarehouses({ pageSize: 200 });

  const form = useForm<Omit<RecordMovementInput, "idempotency_key">>({
    resolver: zodResolver(recordMovementSchema.omit({ idempotency_key: true })) as never,
    defaultValues: {
      branch_id: "",
      warehouse_id: "",
      location_id: "",
      product_id: "",
      unit_id: "",
      movement_type: defaultType,
      quantity: 1,
      unit_cost: null,
      notes: "",
      batch_no: "",
      serial_no: "",
      expiry_date: null,
    },
  });

  const warehouseId = form.watch("warehouse_id");
  const movementType = form.watch("movement_type");
  const { data: locations } = useWarehouseLocations(warehouseId || undefined);

  // Business rule: filter warehouses theo movement_type
  // - IN/RETURN_IN/ADJUST_IN/TRANSFER_IN → chỉ kho chẵn (RECEIVING)
  // - OUT/RETURN_OUT/ADJUST_OUT/TRANSFER_OUT → chỉ kho lẻ (ISSUE)
  const incomingTypes = ["IN", "RETURN_IN", "ADJUST_IN", "TRANSFER_IN"] as const;
  const expectedType = incomingTypes.includes(movementType as typeof incomingTypes[number]) ? "RECEIVING" : "ISSUE";

  // Khi user đổi movement_type làm kho đang chọn không còn hợp lệ → clear
  React.useEffect(() => {
    if (!warehouseId) return;
    const selected = (warehouses?.items ?? []).find((w) => w.id === warehouseId);
    if (selected && (selected as { type?: string }).type !== expectedType) {
      form.setValue("warehouse_id", "");
      form.setValue("location_id", "");
    }
  }, [movementType, warehouseId, warehouses, expectedType, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const clean = {
      ...values,
      unit_cost: values.unit_cost ?? null,
      notes: values.notes || null,
      batch_no: values.batch_no || null,
      serial_no: values.serial_no || null,
      expiry_date: values.expiry_date || null,
    };
    await record.mutateAsync(clean as unknown as Parameters<typeof record.mutateAsync>[0]);
    onSuccess?.();
  });

  const isPending = record.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Loại movement" required>
          <Select
            value={form.watch("movement_type")}
            onValueChange={(v) => form.setValue("movement_type", v as StockMovementType)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOVEMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{MOVEMENT_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Chi nhánh" required error={form.formState.errors.branch_id?.message}>
          <Select
            value={form.watch("branch_id") ?? ""}
            onValueChange={(v) => form.setValue("branch_id", v)}
          >
            <SelectTrigger><SelectValue placeholder="Chọn chi nhánh" /></SelectTrigger>
            <SelectContent>
              {(branches?.items ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Kho" required error={form.formState.errors.warehouse_id?.message}>
          <Select
            value={form.watch("warehouse_id") ?? ""}
            onValueChange={(v) => {
              form.setValue("warehouse_id", v);
              form.setValue("location_id", "");
            }}
          >
            <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
            <SelectContent>
              {(warehouses?.items ?? [])
                .filter((w) => w.status === "ACTIVE" && (w as { type?: string }).type === expectedType)
                .map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {expectedType === "RECEIVING"
              ? "Movement nhập → chỉ hiển thị kho chẵn (RECEIVING)."
              : "Movement xuất → chỉ hiển thị kho lẻ (ISSUE)."}
          </p>
        </Field>

        <Field label="Vị trí" required error={form.formState.errors.location_id?.message}>
          <Select
            value={form.watch("location_id") ?? ""}
            onValueChange={(v) => form.setValue("location_id", v)}
            disabled={!warehouseId}
          >
            <SelectTrigger><SelectValue placeholder={warehouseId ? "Chọn vị trí" : "Chọn kho trước"} /></SelectTrigger>
            <SelectContent>
              {(locations?.items ?? []).filter((l) => l.status === "ACTIVE").map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Vật tư" required className="md:col-span-2" error={form.formState.errors.product_id?.message}>
          <Select
            value={form.watch("product_id") ?? ""}
            onValueChange={(v) => form.setValue("product_id", v)}
          >
            <SelectTrigger><SelectValue placeholder="Chọn vật tư" /></SelectTrigger>
            <SelectContent>
              {(products?.items ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Đơn vị" required error={form.formState.errors.unit_id?.message}>
          <Select
            value={form.watch("unit_id") ?? ""}
            onValueChange={(v) => form.setValue("unit_id", v)}
          >
            <SelectTrigger><SelectValue placeholder="Đơn vị" /></SelectTrigger>
            <SelectContent>
              {(units?.items ?? []).filter((u) => u.isActive).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Số lượng" required error={form.formState.errors.quantity?.message}>
          <Input type="number" min={0.0001} step="0.0001" {...form.register("quantity", { valueAsNumber: true })} />
        </Field>

        <Field label="Đơn giá (chỉ IN/ADJUST_IN)">
          <Input type="number" min={0} step="0.01" {...form.register("unit_cost", { valueAsNumber: true })} />
        </Field>

        <Field label="Lô (batch)">
          <Input {...form.register("batch_no")} placeholder="BATCH-001" />
        </Field>

        <Field label="Serial">
          <Input {...form.register("serial_no")} placeholder="SN-..." />
        </Field>

        <Field label="HSD (yyyy-mm-dd)">
          <Input type="date" {...form.register("expiry_date")} />
        </Field>

        <Field label="Ghi chú" className="md:col-span-2">
          <Textarea {...form.register("notes")} rows={2} />
        </Field>
      </div>

      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        <strong>⚠ Idempotency:</strong> Mỗi lần submit sinh UUID mới, retry an toàn cùng key sẽ trả về kết quả cũ.
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="w-full sm:w-auto">Hủy</Button>
        )}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Ghi movement
        </Button>
      </div>
    </form>
  );
}

function Field({
  label, required, className, children, error,
}: { label: string; required?: boolean; className?: string; children: React.ReactNode; error?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label} {required && <span className="text-red-600">*</span>}</Label>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
