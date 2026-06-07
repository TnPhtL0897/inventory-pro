"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProductSchema, type CreateProductInput } from "@inventorypro/validation/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateProduct, useUpdateProduct, useCategoriesAll, useUnitsAll, PRODUCT_TYPE_LABELS, type Product, type ProductType } from "./api";
import { Loader2 } from "lucide-react";

interface ProductFormProps {
  initial?: Product;
  onSuccess?: (p: Product) => void;
  onCancel?: () => void;
}

const PRODUCT_TYPES: ProductType[] = ["GOODS", "SERVICE", "RAW_MATERIAL", "FINISHED_GOOD", "CONSUMABLE"];

export function ProductForm({ initial, onSuccess, onCancel }: ProductFormProps) {
  const isEdit = !!initial;
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const { data: categories } = useCategoriesAll();
  const { data: units } = useUnitsAll();

  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema) as never,
    defaultValues: {
      sku: initial?.sku ?? "",
      barcode: initial?.barcode ?? "",
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      category_id: (initial?.categoryId as CreateProductInput["category_id"]) ?? null,
      base_unit_id: initial?.baseUnitId ?? "",
      product_type: (initial?.productType as ProductType) ?? "GOODS",
      cost_price: initial?.costPrice ?? 0,
      sell_price: initial?.sellPrice ?? 0,
      min_stock: initial?.minStock ?? 0,
      max_stock: initial?.maxStock ?? null,
      status: (initial?.status as CreateProductInput["status"]) ?? "ACTIVE",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const clean = {
      ...values,
      barcode: values.barcode || null,
      description: values.description || null,
      category_id: values.category_id || null,
      max_stock: values.max_stock ?? null,
    } as CreateProductInput;
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
        <Field label="Mã SKU" required error={form.formState.errors.sku?.message}>
          <Input {...form.register("sku")} disabled={isEdit} placeholder="VD: SP-001" />
        </Field>

        <Field label="Barcode" error={form.formState.errors.barcode?.message}>
          <Input {...form.register("barcode")} placeholder="893..." />
        </Field>

        <Field label="Tên vật tư" required className="md:col-span-2" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} placeholder="Bút bi xanh 0.5mm" />
        </Field>

        <Field label="Loại vật tư" required>
          <Select
            value={form.watch("product_type") ?? "GOODS"}
            onValueChange={(v) => form.setValue("product_type", v as ProductType)}
          >
            <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
            <SelectContent>
              {PRODUCT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Đơn vị gốc" required error={form.formState.errors.base_unit_id?.message}>
          <Select
            value={form.watch("base_unit_id") ?? ""}
            onValueChange={(v) => form.setValue("base_unit_id", v)}
          >
            <SelectTrigger><SelectValue placeholder="Chọn đơn vị" /></SelectTrigger>
            <SelectContent>
              {(units?.items ?? []).filter((u) => u.isActive).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Danh mục" className="md:col-span-2">
          <Select
            value={form.watch("category_id") ?? "__NONE__"}
            onValueChange={(v) => form.setValue("category_id", v === "__NONE__" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Không có" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__NONE__">— Không có —</SelectItem>
              {(categories?.items ?? []).filter((c) => c.isActive).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Giá vốn" error={form.formState.errors.cost_price?.message}>
          <Input type="number" min={0} step="0.01" {...form.register("cost_price", { valueAsNumber: true })} />
        </Field>

        <Field label="Giá bán" error={form.formState.errors.sell_price?.message}>
          <Input type="number" min={0} step="0.01" {...form.register("sell_price", { valueAsNumber: true })} />
        </Field>

        <Field label="Tồn tối thiểu" error={form.formState.errors.min_stock?.message}>
          <Input type="number" min={0} step="0.01" {...form.register("min_stock", { valueAsNumber: true })} />
        </Field>

        <Field label="Tồn tối đa" error={form.formState.errors.max_stock?.message}>
          <Input type="number" min={0} step="0.01" {...form.register("max_stock", { valueAsNumber: true })} />
        </Field>

        <Field label="Mô tả" className="md:col-span-2">
          <Textarea {...form.register("description")} rows={3} />
        </Field>

        <Field label="Trạng thái">
          <Select
            value={form.watch("status") ?? "ACTIVE"}
            onValueChange={(v) => form.setValue("status", v as CreateProductInput["status"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Đang dùng</SelectItem>
              <SelectItem value="INACTIVE">Ngưng</SelectItem>
              <SelectItem value="ARCHIVED">Lưu trữ</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="w-full sm:w-auto">
            Hủy
          </Button>
        )}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Cập nhật" : "Tạo vật tư"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
  error,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  error?: unknown;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>
        {label} {required && <span className="text-red-600">*</span>}
      </Label>
      {children}
      {error && <p className="text-sm text-red-600">{String((error as { message?: string })?.message ?? error)}</p>}
    </div>
  );
}
