"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchesAll } from "@/features/warehouses/api";
import { useWarehouses } from "@/features/warehouses/api";
import { useCreateStockTake, type CreateStockTakeInput } from "./api";
import { Loader2 } from "lucide-react";

interface StockTakeFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function StockTakeForm({ onSuccess, onCancel }: StockTakeFormProps) {
  const create = useCreateStockTake();
  const { data: branches } = useBranchesAll();
  const { data: warehouses } = useWarehouses({ pageSize: 200 });
  const [scope, setScope] = useState<"ALL" | "SELECTED">("ALL");

  const form = useForm<CreateStockTakeInput>({
    defaultValues: {
      branchId: "",
      warehouseId: "",
      stockTakeDate: new Date().toISOString().slice(0, 10),
      notes: "",
      lines: null,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await create.mutateAsync({
      ...values,
      notes: values.notes || null,
      lines: scope === "ALL" ? null : (values.lines ?? []),
    });
    onSuccess?.();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
        <strong>Lưu ý:</strong> Khi tạo phiếu, hệ thống sẽ tự <strong>snapshot</strong> tồn kho hiện tại trong kho này (theo từng SKU + vị trí + lô/serial). User sẽ nhập số đếm thực tế, variance sẽ sinh ADJUST movements khi chốt.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Chi nhánh" required>
          <Select value={form.watch("branchId")} onValueChange={(v) => form.setValue("branchId", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn chi nhánh" /></SelectTrigger>
            <SelectContent>
              {(branches?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kho kiểm kê" required>
          <Select value={form.watch("warehouseId")} onValueChange={(v) => {
            form.setValue("warehouseId", v);
            const wh = warehouses?.items.find((w) => w.id === v);
            if (wh) form.setValue("branchId", wh.branchId);
          }}>
            <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
            <SelectContent>
              {(warehouses?.items ?? []).filter((w) => w.status === "ACTIVE").map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ngày kiểm kê" required>
          <Input type="date" {...form.register("stockTakeDate", { required: true })} />
        </Field>
        <Field label="Phạm vi">
          <Select value={scope} onValueChange={(v) => setScope(v as "ALL" | "SELECTED")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toàn bộ tồn kho trong kho</SelectItem>
              <SelectItem value="SELECTED">Chỉ các SKU chỉ định (nâng cao)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ghi chú" className="md:col-span-2">
          <Textarea {...form.register("notes")} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending} className="w-full sm:w-auto">Hủy</Button>}
        <Button type="submit" disabled={create.isPending} className="w-full sm:w-auto">
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Tạo phiếu & snapshot
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label} {required && <span className="text-red-600">*</span>}</Label>
      {children}
    </div>
  );
}
