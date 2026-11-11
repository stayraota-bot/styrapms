import { ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { Input, Select } from "@/components/ui/core";
import { saveVendor } from "@/app/(app)/vendors/actions";

export function VendorForm({ vendor, properties, linked = [] }: { vendor?: Record<string, unknown>; properties: { id: string; name: string }[]; linked?: string[] }) {
  const v = (k: string) => String(vendor?.[k] ?? "");
  return (
    <ActionForm action={saveVendor} className="grid sm:grid-cols-2 gap-4">
      {vendor && <input type="hidden" name="id" value={v("id")} />}
      <Field name="name" label="Vendor name" required className="sm:col-span-2"><Input name="name" defaultValue={v("name")} /></Field>
      <Field name="phone" label="Phone"><Input name="phone" defaultValue={v("phone")} /></Field>
      <Field name="email" label="Email"><Input name="email" defaultValue={v("email")} /></Field>
      <Field name="gstin" label="GST number"><Input name="gstin" defaultValue={v("gstin")} className="uppercase" maxLength={15} /></Field>
      <Field name="category" label="Category"><Input name="category" defaultValue={v("category")} placeholder="e.g. Groceries, Plumbing" /></Field>
      <Field name="address" label="Address" className="sm:col-span-2"><Input name="address" defaultValue={v("address")} /></Field>
      <Field name="is_active" label="Status"><Select name="is_active" defaultValue={vendor && !vendor.is_active ? "false" : "true"}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>
      <div className="sm:col-span-2"><p className="text-[13px] font-medium mb-1.5">Associated properties</p><div className="flex flex-wrap gap-3">{properties.map((p) =>
        <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="properties[]" value={p.id} defaultChecked={linked.includes(p.id)} className="accent-brand-700 size-4" />{p.name}</label>)}</div></div>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{vendor ? "Save vendor" : "Add vendor"}</SubmitButton></div>
    </ActionForm>
  );
}
