"use client";
// @ts-nocheck


import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPurchaseOrderSchema,
  type CreatePurchaseOrderInput,
} from "@inventorypro/validation/purchase-order";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useParties } from "@/features/parties/api";
import { useProducts } from "@/features/products/api";
import { useBranches } from "@/features/branches/api";
import { useActiveBidContractsLookup, type BidContractLookup } from "@/features/bid-contracts/api";
import { useCreatePo, useUpdatePo, type PurchaseOrder } from "./api";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useEffect } from "react";

interface PoFormProps {
  initial?: PurchaseOrder;
  onSuccess?: (po: PurchaseOrder) => void;
  onCancel?: () => void;
}

export function PoForm({ initial, onSuccess, onCancel }: PoFormProps) {
  const isEdit = !!initial;
  const create = useCreatePo();
  const update = useUpdatePo();

  const form = useForm<CreatePurchaseOrderInput>({
    resolver: zodResolver(createPurchaseOrderSchema) as never,
    defaultValues: {
      branch_id: initial?.branchId ?? "",
      party_id: initial?.partyId ?? "",
      order_date: initial?.orderDate?.split("T")[0] ?? new Date().toISOString().slice(0, 10),
      expected_date: initial?.expectedDate?.split("T")[0] ?? null,
      currency: initial?.currency ?? "VND",
      exchange_rate: initial?.exchangeRate ?? 1,
      discount_amount: initial?.discountAmount ?? 0,
      shipping_amount: initial?.shippingAmount ?? 0,
      payment_terms: initial?.paymentTerms ?? 0,
      shipping_address: initial?.shippingAddress ?? "",
      notes: initial?.notes ?? "",
      internal_notes: initial?.internalNotes ?? "",
      // ⭐ BẮT BUỘC: HĐ thầu
      bid_contract_id: initial?.bidContractId ?? "",
      bid_lot_id: initial?.bidLotId ?? null,
      lines: initial?.lineCount
        ? // Lấy lines từ initial; hiện tại ListPoDto không có lines chi tiết → cần fetch detail
          []
        : [{ product_id: "", unit_id: "", quantity: 1, unit_price: 0, discount_pct: 0, tax_pct: 0, notes: "" }],
    } as any,
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });

  // Fetch detail để có lines khi edit
  useEffect(() => {
    if (initial && initial.lineCount > 0) {
      fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"}/api/v1/purchase-orders/${initial.id}`, {
        headers: { Authorization: `Bearer ${(window as any).__supabase_token ?? ""}` },
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success && res.data) {
            form.reset({
              branch_id: res.data.branchId,
              party_id: res.data.partyId,
              order_date: res.data.orderDate.split("T")[0],
              expected_date: res.data.expectedDate?.split("T")[0] ?? null,
              currency: res.data.currency,
              exchange_rate: res.data.exchangeRate,
              discount_amount: res.data.discountAmount,
              shipping_amount: res.data.shippingAmount,
              payment_terms: res.data.paymentTerms,
              shipping_address: res.data.shippingAddress ?? "",
              notes: res.data.notes ?? "",
              internal_notes: res.data.internalNotes ?? "",
              lines: (res.data.lines ?? []).map((l: any) => ({
                product_id: l.productId,
                unit_id: l.unitId,
                quantity: l.quantity,
                unit_price: l.unitPrice,
                discount_pct: l.discountPct,
                tax_pct: l.taxPct,
                notes: l.notes ?? "",
              })),
            } as any);
          }
        })
        .catch(() => {/* ignore */});
    }
  }, [initial, form]);

  const { data: partiesData } = useParties({ pageSize: 200, partyType: "SUPPLIER" });
  const { data: productsData } = useProducts({ pageSize: 200 });
  const { data: activeContracts } = useActiveBidContractsLookup();

  // ⭐ Khi user chọn HĐ thầu → auto-fill party_id + bid_lot_id
  const selectedContractId = form.watch("bid_contract_id");
  useEffect(() => {
    if (!selectedContractId || !activeContracts) return;
    const contract = activeContracts.find((c) => c.id === selectedContractId);
    if (contract) {
      form.setValue("party_id", contract.winningPartyId);
      form.setValue("bid_lot_id", contract.bidLotId);
    }
  }, [selectedContractId, activeContracts, form]);

  // Tính giá trị còn lại của HĐ đang chọn để hiển thị cảnh báo
  const selectedContract: BidContractLookup | undefined = activeContracts?.find(
    (c) => c.id === selectedContractId
  );
  const { data: branchesData } = useBranches({ pageSize: 100 });

  const parties = partiesData?.items ?? [];
  const products = productsData?.items ?? [];
  const branches = branchesData?.items ?? [];

  const onSubmit = form.handleSubmit(async (values) => {
    // Convert form (snake_case per zod schema) → API (camelCase per api.ts interface)
    const v = values as any;
    const clean = {
      branchId: v.branch_id,
      partyId: v.party_id,
      orderDate: v.order_date,
      expectedDate: v.expected_date || null,
      currency: v.currency,
      exchangeRate: v.exchange_rate,
      discountAmount: v.discount_amount,
      shippingAmount: v.shipping_amount,
      paymentTerms: v.payment_terms,
      shippingAddress: v.shipping_address || null,
      notes: v.notes || null,
      internalNotes: v.internal_notes || null,
      // ⭐ BẮT BUỘC: HĐ thầu
      bidContractId: v.bid_contract_id,
      bidLotId: v.bid_lot_id || null,
      lines: (v.lines ?? []).map((l: any) => ({
        productId: l.product_id,
        unitId: l.unit_id,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        discountPct: Number(l.discount_pct ?? 0),
        taxPct: Number(l.tax_pct ?? 0),
        notes: l.notes || null,
      })),
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
  const lineTotal = (i: number) => {
    const l = form.watch(`lines.${i}`) as any;
    if (!l) return 0;
    const q = Number(l.quantity ?? 0);
    const p = Number(l.unit_price ?? 0);
    const d = Number(l.discount_pct ?? 0);
    const t = Number(l.tax_pct ?? 0);
    return q * p * (1 - d / 100) * (1 + t / 100);
  };
  const grandTotal = (form.watch("lines") ?? []).reduce(
    (sum, _, i) => sum + lineTotal(i),
    0,
  );
  const finalTotal = grandTotal - (form.watch("discount_amount") ?? 0) + (form.watch("shipping_amount") ?? 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Chi nhánh" required className="md:col-span-2">
          <select {...form.register("branch_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">-- Chọn chi nhánh --</option>
            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
        </Field>

        <Field label="Ngày đặt" required>
          <Input type="date" {...form.register("order_date")} />
        </Field>

        <Field label="Ngày dự kiến">
          <Input type="date" {...form.register("expected_date")} />
        </Field>

        <Field label="Nhà cung cấp" required className="md:col-span-2">
          <select {...form.register("party_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">-- Chọn NCC --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </Field>

        <Field label="Phí vận chuyển">
          <Input type="number" min={0} {...form.register("payment_terms", { valueAsNumber: true })} />
        </Field>

        <Field label="Tiền tệ">
          <Input {...form.register("currency")} maxLength={3} />
        </Field>

        {/* ⭐ HĐ THẦU - BẮT BUỘC cho mỗi PO */}
        <Field label="HĐ thầu" required className="md:col-span-4">
          <select
            {...form.register("bid_contract_id")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={isEdit}
          >
            <option value="">-- Chọn hợp đồng thầu --</option>
            {(activeContracts ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.contractNo} — {c.winningPartyName} — Còn {c.remainingValue.toLocaleString("vi-VN")} / {c.contractValue.toLocaleString("vi-VN")} VNĐ
                {c.daysToExpiry < 30 && c.daysToExpiry > 0 ? ` ⚠ hết hạn sau ${c.daysToExpiry} ngày` : ""}
              </option>
            ))}
          </select>
          {form.formState.errors.bid_contract_id && (
            <p className="text-sm text-red-600 mt-1">{(form.formState.errors.bid_contract_id as any).message}</p>
          )}
          {selectedContract && (
            <div className="mt-2 rounded-md bg-blue-50 p-2 text-xs text-blue-900">
              <strong>{selectedContract.contractNo}</strong> · NCC: {selectedContract.winningPartyName} · Lô: {selectedContract.lotName ?? ""}
              <br />
              Giá trị: {selectedContract.contractValue.toLocaleString("vi-VN")} VNĐ ·
              Đã dùng: {selectedContract.usedValue.toLocaleString("vi-VN")} ·
              Còn lại: <strong>{selectedContract.remainingValue.toLocaleString("vi-VN")} VNĐ</strong>
              <br />
              Hạn HĐ: {selectedContract.contractStartDate} → {selectedContract.contractEndDate} (
              {selectedContract.daysToExpiry > 0 ? `còn ${selectedContract.daysToExpiry} ngày` : "đã hết hạn"})
            </div>
          )}
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Dòng hàng</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              lines.append({ product_id: "", unit_id: "", quantity: 1, unit_price: 0, discount_pct: 0, tax_pct: 0, notes: "" } as any)
            }
          >
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
                <th className="px-2 py-2 text-right">SL</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2 text-right">%CK</th>
                <th className="px-2 py-2 text-right">%VAT</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.fields.map((field, i) => (
                <tr key={field.id} className="border-t">
                  <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1">
                    <select
                      {...form.register(`lines.${i}.product_id` as const)}
                      className="h-9 w-full min-w-[180px] rounded border border-input bg-background px-2 text-sm"
                    >
                      <option value="">-- SP --</option>
                      {products.map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      {...form.register(`lines.${i}.unit_id` as const)}
                      placeholder="UUID đơn vị"
                      className="h-9 min-w-[120px]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} {...form.register(`lines.${i}.quantity` as const, { valueAsNumber: true })} className="h-9 w-24 text-right" />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} {...form.register(`lines.${i}.unit_price` as const, { valueAsNumber: true })} className="h-9 w-28 text-right" />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} max={100} {...form.register(`lines.${i}.discount_pct` as const, { valueAsNumber: true })} className="h-9 w-16 text-right" />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} max={100} {...form.register(`lines.${i}.tax_pct` as const, { valueAsNumber: true })} className="h-9 w-16 text-right" />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{lineTotal(i).toLocaleString("vi-VN")}</td>
                  <td className="px-2 py-1 text-right">
                    {lines.fields.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => lines.remove(i)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Địa chỉ giao hàng">
          <Textarea {...form.register("shipping_address")} rows={2} />
        </Field>
        <Field label="Ghi chú">
          <Textarea {...form.register("notes")} rows={2} />
        </Field>
        <Field label="Ghi chú nội bộ">
          <Textarea {...form.register("internal_notes")} rows={2} />
        </Field>
        <div className="space-y-2 text-right text-sm">
          <div className="flex justify-end gap-4">
            <span className="text-muted-foreground">Tạm tính:</span>
            <span className="font-medium w-32 tabular-nums">{grandTotal.toLocaleString("vi-VN")}</span>
          </div>
          <div className="flex justify-end items-center gap-2">
            <span className="text-muted-foreground">Chiết khấu:</span>
            <Input type="number" step="0.01" {...form.register("discount_amount", { valueAsNumber: true })} className="h-9 w-32 text-right" />
          </div>
          <div className="flex justify-end items-center gap-2">
            <span className="text-muted-foreground">Phí ship:</span>
            <Input type="number" step="0.01" {...form.register("shipping_amount", { valueAsNumber: true })} className="h-9 w-32 text-right" />
          </div>
          <div className="flex justify-end gap-4 border-t pt-2 text-base">
            <span className="font-semibold">Tổng cộng:</span>
            <span className="font-bold w-32 tabular-nums">{finalTotal.toLocaleString("vi-VN")}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="w-full sm:w-auto">Hủy</Button>}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Cập nhật" : "Tạo đơn mua hàng"}
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
