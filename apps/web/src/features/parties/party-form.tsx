"use client";
// @ts-nocheck


import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPartySchema, updatePartySchema, type CreatePartyInput, type UpdatePartyInput } from "@inventorypro/validation/party";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateParty, useUpdateParty, type Party } from "./api";
import { Loader2 } from "lucide-react";

interface PartyFormProps {
  initial?: Party;
  onSuccess?: (p: Party) => void;
  onCancel?: () => void;
}

const partyTypeOptions = [
  { value: "SUPPLIER", label: "Nhà cung cấp" },
  { value: "CUSTOMER", label: "Khách hàng" },
  { value: "BOTH", label: "Cả hai" },
] as const;

export function PartyForm({ initial, onSuccess, onCancel }: PartyFormProps) {
  const isEdit = !!initial;
  const create = useCreateParty();
  const update = useUpdateParty();

  const form = useForm<any>({
    resolver: zodResolver(isEdit ? updatePartySchema : createPartySchema) as never,
    defaultValues: {
      party_type: (initial?.partyType as any) ?? "SUPPLIER",
      code: initial?.code ?? "",
      name: initial?.name ?? "",
      tax_code: initial?.taxCode ?? "",
      contact_name: initial?.contactName ?? "",
      contact_email: initial?.contactEmail ?? "",
      contact_phone: initial?.contactPhone ?? "",
      address: initial?.address ?? "",
      city: initial?.city ?? "",
      country: initial?.country ?? "VN",
      payment_terms: initial?.paymentTerms ?? 0,
      credit_limit: initial?.creditLimit ?? 0,
      bank_account: initial?.bankAccount ?? "",
      bank_name: initial?.bankName ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // Convert empty strings → undefined for optional fields
    const clean = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v === "" ? undefined : v]),
    ) as CreatePartyInput;

    if (isEdit && initial) {
      const result = await update.mutateAsync({ id: initial.id, input: clean as UpdatePartyInput });
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
        <Field label="Loại đối tác" required>
          <Select
            value={form.watch("party_type")}
            onValueChange={(v) => form.setValue("party_type", v as CreatePartyInput["party_type"])}
            disabled={isEdit}
          >
            <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
            <SelectContent>
              {partyTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.party_type && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.party_type?.message as any}</p>
          )}
        </Field>

        <Field label="Mã đối tác" required error={form.formState.errors.code?.message}>
          <Input {...form.register("code")} disabled={isEdit} placeholder="VD: NCC-001" />
        </Field>

        <Field label="Tên đối tác" required className="md:col-span-2" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} placeholder="Công ty TNHH ABC" />
        </Field>

        <Field label="Mã số thuế" error={form.formState.errors.taxCode?.message}>
          <Input {...form.register("tax_code")} placeholder="0123456789" />
        </Field>

        <Field label="Người liên hệ">
          <Input {...form.register("contact_name")} />
        </Field>

        <Field label="Email" error={form.formState.errors.contactEmail?.message}>
          <Input type="email" {...form.register("contact_email")} />
        </Field>

        <Field label="Số điện thoại">
          <Input {...form.register("contact_phone")} />
        </Field>

        <Field label="Địa chỉ" className="md:col-span-2">
          <Input {...form.register("address")} />
        </Field>

        <Field label="Thành phố">
          <Input {...form.register("city")} />
        </Field>

        <Field label="Quốc gia">
          <Input {...form.register("country")} />
        </Field>

        <Field label="Số ngày thanh toán" error={form.formState.errors.paymentTerms?.message}>
          <Input type="number" min={0} {...form.register("paymentTerms", { valueAsNumber: true })} />
        </Field>

        <Field label="Hạn mức công nợ" error={form.formState.errors.creditLimit?.message}>
          <Input type="number" min={0} step="0.01" {...form.register("creditLimit", { valueAsNumber: true })} />
        </Field>

        <Field label="Số tài khoản">
          <Input {...form.register("bank_account")} />
        </Field>

        <Field label="Ngân hàng">
          <Input {...form.register("bank_name")} />
        </Field>

        <Field label="Ghi chú" className="md:col-span-2">
          <Textarea {...form.register("notes")} />
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
          {isEdit ? "Cập nhật" : "Tạo đối tác"}
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
