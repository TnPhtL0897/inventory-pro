"use client";
// @ts-nocheck


import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGoodsReceiptSchema, type CreateGoodsReceiptInput } from "@inventorypro/validation/goods-receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useParties } from "@/features/parties/api";
import { useProducts } from "@/features/products/api";
import { useWarehouses } from "@/features/warehouses/api";
import { useCreateGrn, useUpdateGrn, type GoodsReceipt } from "./api";
import { Plus, Trash2, Loader2 } from "lucide-react";

function uuid() {
  return crypto.randomUUID();
}

interface GrnFormProps {
  initial?: GoodsReceipt;
  defaultPoId?: string;
  onSuccess?: (g: GoodsReceipt) => void;
  onCancel?: () => void;
}

export function GrnForm({ initial, onSuccess, onCancel }: GrnFormProps) {
  const isEdit = !!initial;
  const create = useCreateGrn();
  const update = useUpdateGrn();

  const form = useForm<any>({
    resolver: zodResolver(createGoodsReceiptSchema) as never,
    defaultValues: {
      branch_id: initial?.branchId ?? "",
      purchase_order_id: initial?.purchaseOrderId ?? null,
      party_id: initial?.partyId ?? "",
      warehouse_id: initial?.warehouseId ?? "",
      receipt_date: initial?.receiptDate?.split("T")[0] ?? new Date().toISOString().slice(0, 10),
      supplier_invoice_no: initial?.supplierInvoiceNo ?? "",
      supplier_invoice_date: initial?.supplierInvoiceDate?.split("T")[0] ?? null,
      notes: initial?.notes ?? "",
      lines: [{
        po_line_id: null, product_id: "", unit_id: "", location_id: "",
        quantity: 1, unit_cost: 0, batch_no: "", serial_no: "", expiry_date: null, notes: "",
      }],
      idempotency_keys: [uuid()],
    } as any,
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const keys = useFieldArray({ control: form.control, name: "idempotencyKeys" });

  const { data: partiesData } = useParties({ pageSize: 200, partyType: "SUPPLIER" });
  const { data: productsData } = useProducts({ pageSize: 200 });
  const { data: warehousesData } = useWarehouses({ pageSize: 100 });

  const parties = partiesData?.items ?? [];
  const products = productsData?.items ?? [];
  // Business rule: GRN chỉ cho phép kho chẵn (RECEIVING).
  const warehouses = (warehousesData?.items ?? []).filter((w) => (w as { type?: string }).type === "RECEIVING");

  const onSubmit = form.handleSubmit(async (values) => {
    const clean = {
      ...values,
      supplierInvoiceNo: values.supplierInvoiceNo || null,
      supplierInvoiceDate: values.supplierInvoiceDate || null,
      notes: values.notes || null,
      purchaseOrderId: values.purchaseOrderId || null,
    };
    if (isEdit && initial) {
      const result = await update.mutateAsync({ id: initial.id, input: clean });
      onSuccess?.(result);
    } else {
      const result = await create.mutateAsync(clean);
      onSuccess?.(result);
    }
  });

  const isPending = create.isPending || update.isPending;
  const grandTotal = (form.watch("lines") ?? []).reduce((s, l) => s + l.quantity * l.unitCost, 0);

  const addLine = () => {
    lines.append({
      poLineId: null, productId: "", unitId: "", locationId: "",
      quantity: 1, unitCost: 0, batchNo: "", serialNo: "", expiryDate: null, notes: "",
    });
    keys.append(uuid());
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="NCC" required>
          <select {...form.register("party_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">-- Chọn --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </Field>
        <Field label="Kho" required>
          <select {...form.register("warehouse_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">-- Chọn --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
        </Field>
        <Field label="Ngày nhận" required>
          <Input type="date" {...form.register("receipt_date")} />
        </Field>
        <Field label="Số HĐ NCC">
          <Input {...form.register("supplier_invoice_no")} />
        </Field>
        <Field label="Ngày HĐ NCC">
          <Input type="date" {...form.register("supplier_invoice_date")} />
        </Field>
        <Field label="PO liên quan">
          <Input {...form.register("purchase_order_id")} placeholder="PO UUID (optional)" />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Dòng hàng</h3>
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="mr-1 h-3 w-3" /> Thêm dòng
          </Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Sản phẩm</th>
                <th className="px-2 py-2 text-left">Đơn vị (UUID)</th>
                <th className="px-2 py-2 text-left">Vị trí (UUID)</th>
                <th className="px-2 py-2 text-right">SL</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2 text-left">Lô</th>
                <th className="px-2 py-2 text-left">HSD</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.fields.map((field, i) => {
                const q = form.watch(`lines.${i}.quantity`);
                const p = form.watch(`lines.${i}.unitCost`);
                return (
                  <tr key={field.id} className="border-t">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1">
                      <select {...form.register(`lines.${i}.product_id` as const)} className="h-9 w-full min-w-[160px] rounded border border-input bg-background px-2 text-sm">
                        <option value="">-- SP --</option>
                        {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.sku} — {pr.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1"><Input {...form.register(`lines.${i}.unit_id` as const)} className="h-9 w-32" /></td>
                    <td className="px-2 py-1"><Input {...form.register(`lines.${i}.location_id` as const)} className="h-9 w-32" /></td>
                    <td className="px-2 py-1"><Input type="number" step="0.01" min={0} {...form.register(`lines.${i}.quantity` as const, { valueAsNumber: true })} className="h-9 w-20 text-right" /></td>
                    <td className="px-2 py-1"><Input type="number" step="0.01" min={0} {...form.register(`lines.${i}.unitCost` as const, { valueAsNumber: true })} className="h-9 w-28 text-right" /></td>
                    <td className="px-2 py-1"><Input {...form.register(`lines.${i}.batch_no` as const)} className="h-9 w-24" /></td>
                    <td className="px-2 py-1"><Input type="date" {...form.register(`lines.${i}.expiry_date` as const)} className="h-9 w-32" /></td>
                    <td className="px-2 py-1 text-right tabular-nums">{(q * p).toLocaleString("vi-VN")}</td>
                    <td className="px-2 py-1 text-right">
                      {lines.fields.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => { lines.remove(i); keys.remove(i); }}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td colSpan={8} className="px-2 py-2 text-right font-semibold">Tổng:</td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">{grandTotal.toLocaleString("vi-VN")}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Field label="Ghi chú">
        <Textarea {...form.register("notes")} rows={2} />
      </Field>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="w-full sm:w-auto">Hủy</Button>}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Cập nhật" : "Tạo phiếu nhập"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label} {required && <span className="text-red-600">*</span>}</Label>
      {children}
    </div>
  );
}
