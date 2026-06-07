"use client";
// @ts-nocheck


import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStockIssueSchema, type CreateStockIssueInput } from "@inventorypro/validation/stock-issue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useParties } from "@/features/parties/api";
import { useProducts } from "@/features/products/api";
import { useWarehouses } from "@/features/warehouses/api";
import { useCreateIssue, PURPOSE_LABELS, type IssuePurpose, type StockIssue } from "./api";
import { Plus, Trash2, Loader2 } from "lucide-react";

function uuid() { return crypto.randomUUID(); }

const PURPOSES: IssuePurpose[] = ["SALE", "INTERNAL_USE", "SCRAP", "SAMPLE", "GIFT"];

export function IssueForm({ initial, onSuccess, onCancel }: { initial?: StockIssue; onSuccess?: (i: StockIssue) => void; onCancel?: () => void }) {
  const create = useCreateIssue();

  const form = useForm<any>({
    resolver: zodResolver(createStockIssueSchema) as never,
    defaultValues: {
      branch_id: initial?.branchId ?? "",
      party_id: initial?.partyId ?? null,
      warehouse_id: initial?.warehouseId ?? "",
      purpose: (initial?.purpose as IssuePurpose) ?? "SALE",
      issue_date: initial?.issueDate?.split("T")[0] ?? new Date().toISOString().slice(0, 10),
      reference_no: initial?.referenceNo ?? "",
      notes: initial?.notes ?? "",
      lines: [{ product_id: "", unit_id: "", location_id: "", quantity: 1, unit_price: 0, batch_no: "", serial_no: "", expiry_date: null, notes: "" }],
      idempotency_keys: [uuid()],
    } as any,
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const keys = useFieldArray({ control: form.control, name: "idempotencyKeys" });

  const { data: partiesData } = useParties({ pageSize: 200, partyType: "CUSTOMER" });
  const { data: productsData } = useProducts({ pageSize: 200 });
  const { data: warehousesData } = useWarehouses({ pageSize: 100 });

  const parties = partiesData?.items ?? [];
  const products = productsData?.items ?? [];
  // Business rule: phiếu xuất chỉ cho phép kho lẻ (ISSUE).
  const warehouses = (warehousesData?.items ?? []).filter((w) => (w as { type?: string }).type === "ISSUE");

  const onSubmit = form.handleSubmit(async (values) => {
    const clean = {
      ...values,
      partyId: values.partyId || null,
      referenceNo: values.referenceNo || null,
      notes: values.notes || null,
    };
    const result = await create.mutateAsync(clean);
    onSuccess?.(result);
  });

  const grandTotal = (form.watch("lines") ?? []).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const addLine = () => {
    lines.append({ productId: "", unitId: "", locationId: "", quantity: 1, unitPrice: 0, batchNo: "", serialNo: "", expiryDate: null, notes: "" });
    keys.append(uuid());
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Mục đích" required>
          <Select value={form.watch("purpose")} onValueChange={(v) => form.setValue("purpose", v as IssuePurpose)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PURPOSES.map((p) => <SelectItem key={p} value={p}>{PURPOSE_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kho xuất" required>
          <select {...form.register("warehouse_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">-- Chọn kho --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
        </Field>
        <Field label="Ngày xuất" required>
          <Input type="date" {...form.register("issue_date")} />
        </Field>
        <Field label="Khách hàng (nếu bán)">
          <select {...form.register("party_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">-- Không --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </Field>
        <Field label="Số chứng từ" className="md:col-span-2">
          <Input {...form.register("reference_no")} placeholder="VD: HD-2026-0001" />
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
                <th className="px-2 py-2 text-left">Đơn vị</th>
                <th className="px-2 py-2 text-left">Vị trí</th>
                <th className="px-2 py-2 text-right">SL</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.fields.map((field, i) => {
                const q = form.watch(`lines.${i}.quantity`);
                const p = form.watch(`lines.${i}.unit_price`);
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
                    <td className="px-2 py-1"><Input type="number" step="0.01" min={0} {...form.register(`lines.${i}.unit_price` as const, { valueAsNumber: true })} className="h-9 w-28 text-right" /></td>
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
                <td colSpan={6} className="px-2 py-2 text-right font-semibold">Tổng:</td>
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
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending} className="w-full sm:w-auto">Hủy</Button>}
        <Button type="submit" disabled={create.isPending} className="w-full sm:w-auto">
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Tạo phiếu xuất
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
