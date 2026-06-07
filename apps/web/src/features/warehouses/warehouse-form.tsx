"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWarehouseSchema, type CreateWarehouseInput } from "@inventorypro/validation/warehouse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateWarehouse, useUpdateWarehouse, useBranchesAll, type Warehouse, type WarehouseStatus, type WarehouseType, WAREHOUSE_TYPE_LABELS } from "./api";
import { Loader2 } from "lucide-react";

interface WarehouseFormProps {
  initial?: Warehouse;
  onSuccess?: (w: Warehouse) => void;
  onCancel?: () => void;
}

export function WarehouseForm({ initial, onSuccess, onCancel }: WarehouseFormProps) {
  const isEdit = !!initial;
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const { data: branches } = useBranchesAll();

  const form = useForm<CreateWarehouseInput>({
    resolver: zodResolver(createWarehouseSchema) as never,
    defaultValues: {
      branch_id: initial?.branchId ?? "",
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      address: initial?.address ?? "",
      phone: initial?.phone ?? "",
      is_default: initial?.isDefault ?? false,
      allow_negative: initial?.allowNegative ?? false,
      status: (initial?.status as WarehouseStatus) ?? "ACTIVE",
      type: (initial?.type as WarehouseType) ?? "RECEIVING",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const clean = {
      ...values,
      address: values.address || null,
      phone: values.phone || null,
    } as CreateWarehouseInput;
    if (isEdit && initial) {
      const result = await update.mutateAsync({ id: initial.id, input: clean });
      onSuccess?.(result);
    } else {
      const result = await create.mutateAsync(clean);
      onSuccess?.(result);
    }
  });

  const isPending = create.isPending || update.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Chi nhánh" required error={form.formState.errors.branch_id?.message}>
          <Select
            value={form.watch("branch_id") ?? ""}
            onValueChange={(v) => form.setValue("branch_id", v)}
            disabled={isEdit}
          >
            <SelectTrigger><SelectValue placeholder="Chọn chi nhánh" /></SelectTrigger>
            <SelectContent>
              {(branches?.items ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Mã kho" required error={form.formState.errors.code?.message}>
          <Input {...form.register("code")} disabled={isEdit} placeholder="VD: WH-001" />
        </Field>

        <Field label="Tên kho" required className="md:col-span-2" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} placeholder="Kho tổng HCM" />
        </Field>

        <Field label="Điện thoại">
          <Input {...form.register("phone")} placeholder="028..." />
        </Field>

        <Field label="Trạng thái">
          <Select
            value={form.watch("status") ?? "ACTIVE"}
            onValueChange={(v) => form.setValue("status", v as WarehouseStatus)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Hoạt động</SelectItem>
              <SelectItem value="INACTIVE">Ngưng</SelectItem>
              <SelectItem value="CLOSED">Đã đóng</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Loại kho" required className="md:col-span-2">
          <Select
            value={form.watch("type") ?? "RECEIVING"}
            onValueChange={(v) => form.setValue("type", v as WarehouseType)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="RECEIVING">{WAREHOUSE_TYPE_LABELS.RECEIVING} — Nhận từ NCC qua GRN</SelectItem>
              <SelectItem value="ISSUE">{WAREHOUSE_TYPE_LABELS.ISSUE} — Xuất nội bộ qua phiếu xuất</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Kho chẵn chỉ nhận GRN, kho lẻ chỉ xuất Issue. Không thể thay đổi sau khi có phát sinh.
          </p>
        </Field>

        <Field label="Địa chỉ" className="md:col-span-2">
          <Textarea {...form.register("address")} rows={2} />
        </Field>

        <div className="md:col-span-2 flex gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("is_default")} className="h-4 w-4" />
            Kho mặc định của chi nhánh
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("allow_negative")} className="h-4 w-4" />
            Cho phép tồn kho âm
          </label>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="w-full sm:w-auto">Hủy</Button>
        )}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Cập nhật" : "Tạo kho"}
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
