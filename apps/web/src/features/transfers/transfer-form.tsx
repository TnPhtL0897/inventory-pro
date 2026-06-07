"use client";

import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranchesAll } from "@/features/warehouses/api";
import { useWarehouses, useWarehouseLocations } from "@/features/warehouses/api";
import { useProducts, useUnitsAll } from "@/features/products/api";
import { useCreateTransfer, type CreateTransferInput, type CreateTransferLineInput } from "./api";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface TransferFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

function genUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type LineDraft = Omit<CreateTransferLineInput, "idempotencyKey"> & { key: string; idempotencyKey: string };

export function TransferForm({ onSuccess, onCancel }: TransferFormProps) {
  const create = useCreateTransfer();
  const { data: branches } = useBranchesAll();
  const { data: warehouses } = useWarehouses({ pageSize: 200 });
  const { data: products } = useProducts({ pageSize: 200 });
  const { data: units } = useUnitsAll();

  const form = useForm<{
    fromBranchId: string;
    fromWarehouseId: string;
    toBranchId: string;
    toWarehouseId: string;
    transferDate: string;
    expectedReceiptDate: string;
    notes: string;
    lines: LineDraft[];
  }>({
    defaultValues: {
      fromBranchId: "",
      fromWarehouseId: "",
      toBranchId: "",
      toWarehouseId: "",
      transferDate: new Date().toISOString().slice(0, 10),
      expectedReceiptDate: "",
      notes: "",
      lines: [{ key: genUuid(), productId: "", unitId: "", fromLocationId: "", toLocationId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const fromWhId = form.watch("fromWarehouseId");
  const toWhId = form.watch("toWarehouseId");
  const { data: fromLocations } = useWarehouseLocations(fromWhId || undefined);
  const { data: toLocations } = useWarehouseLocations(toWhId || undefined);

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.lines.length === 0) {
      alert("Phải có ít nhất 1 dòng");
      return;
    }
    const input: CreateTransferInput = {
      fromBranchId: values.fromBranchId,
      fromWarehouseId: values.fromWarehouseId,
      toBranchId: values.toBranchId,
      toWarehouseId: values.toWarehouseId,
      transferDate: values.transferDate,
      expectedReceiptDate: values.expectedReceiptDate || null,
      notes: values.notes || null,
      lines: values.lines.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        fromLocationId: l.fromLocationId,
        toLocationId: l.toLocationId,
        quantity: Number(l.quantity),
        batchNo: l.batchNo || null,
        serialNo: l.serialNo || null,
        expiryDate: l.expiryDate || null,
        notes: l.notes || null,
        idempotencyKey: l.idempotencyKey,
      })),
    };
    await create.mutateAsync(input);
    onSuccess?.();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Chi nhánh nguồn" required>
          <Select value={form.watch("fromBranchId")} onValueChange={(v) => form.setValue("fromBranchId", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn chi nhánh" /></SelectTrigger>
            <SelectContent>
              {(branches?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kho nguồn" required>
          <Select value={form.watch("fromWarehouseId")} onValueChange={(v) => { form.setValue("fromWarehouseId", v); form.setValue("fromBranchId", warehouses?.items.find(w => w.id === v)?.branchId ?? form.watch("fromBranchId")); }}>
            <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
            <SelectContent>
              {(warehouses?.items ?? []).filter((w) => w.status === "ACTIVE" && (w as { type?: string }).type === "ISSUE").map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Chi nhánh đích" required>
          <Select value={form.watch("toBranchId")} onValueChange={(v) => form.setValue("toBranchId", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn chi nhánh" /></SelectTrigger>
            <SelectContent>
              {(branches?.items ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kho đích" required>
          <Select value={form.watch("toWarehouseId")} onValueChange={(v) => { form.setValue("toWarehouseId", v); form.setValue("toBranchId", warehouses?.items.find(w => w.id === v)?.branchId ?? form.watch("toBranchId")); }}>
            <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
            <SelectContent>
              {(warehouses?.items ?? []).filter((w) => w.status === "ACTIVE" && w.id !== form.watch("fromWarehouseId") && (w as { type?: string }).type === "RECEIVING").map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ngày chuyển" required>
          <Input type="date" {...form.register("transferDate", { required: true })} />
        </Field>
        <Field label="Ngày dự kiến nhận">
          <Input type="date" {...form.register("expectedReceiptDate")} />
        </Field>
        <Field label="Ghi chú" className="md:col-span-2">
          <Textarea {...form.register("notes")} rows={2} />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Dòng chuyển kho</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => append({ key: genUuid(), productId: "", unitId: "", fromLocationId: "", toLocationId: "", quantity: 1, idempotencyKey: genUuid() } as LineDraft)}>
            <Plus className="h-4 w-4 mr-1" /> Thêm dòng
          </Button>
        </div>

        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-left font-medium">Vật tư</th>
                <th className="px-2 py-2 text-left font-medium">Đơn vị</th>
                <th className="px-2 py-2 text-left font-medium">VT nguồn</th>
                <th className="px-2 py-2 text-left font-medium">VT đích</th>
                <th className="px-2 py-2 text-right font-medium">SL</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => (
                <tr key={field.key} className="border-t">
                  <td className="px-2 py-2 text-center text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <Select value={form.watch(`lines.${idx}.productId`)} onValueChange={(v) => form.setValue(`lines.${idx}.productId`, v)}>
                      <SelectTrigger className="min-w-[200px]"><SelectValue placeholder="Chọn SP" /></SelectTrigger>
                      <SelectContent>
                        {(products?.items ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Select value={form.watch(`lines.${idx}.unitId`)} onValueChange={(v) => form.setValue(`lines.${idx}.unitId`, v)}>
                      <SelectTrigger className="min-w-[100px]"><SelectValue placeholder="ĐV" /></SelectTrigger>
                      <SelectContent>
                        {(units?.items ?? []).filter((u) => u.isActive).map((u) => <SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Select value={form.watch(`lines.${idx}.fromLocationId`)} onValueChange={(v) => form.setValue(`lines.${idx}.fromLocationId`, v)} disabled={!fromWhId}>
                      <SelectTrigger className="min-w-[140px]"><SelectValue placeholder={fromWhId ? "VT nguồn" : "Chọn kho"} /></SelectTrigger>
                      <SelectContent>
                        {(fromLocations?.items ?? []).filter((l) => l.status === "ACTIVE").map((l) => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Select value={form.watch(`lines.${idx}.toLocationId`)} onValueChange={(v) => form.setValue(`lines.${idx}.toLocationId`, v)} disabled={!toWhId}>
                      <SelectTrigger className="min-w-[140px]"><SelectValue placeholder={toWhId ? "VT đích" : "Chọn kho"} /></SelectTrigger>
                      <SelectContent>
                        {(toLocations?.items ?? []).filter((l) => l.status === "ACTIVE").map((l) => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" min={0.0001} step="0.0001" className="w-24 text-right" {...form.register(`lines.${idx}.quantity`, { valueAsNumber: true })} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(idx)} disabled={fields.length === 1}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending} className="w-full sm:w-auto">Hủy</Button>}
        <Button type="submit" disabled={create.isPending} className="w-full sm:w-auto">
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Tạo phiếu chuyển
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
