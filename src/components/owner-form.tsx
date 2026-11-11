import { ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { Input, Textarea } from "@/components/ui/core";
import { saveOwner } from "@/app/(app)/owners/actions";

export function OwnerForm({ owner }: { owner?: Record<string, unknown> }) {
  const v = (k: string) => String(owner?.[k] ?? "");
  return (
    <ActionForm action={saveOwner} className="grid sm:grid-cols-2 gap-4">
      {owner && <input type="hidden" name="id" value={v("id")} />}
      <Field name="full_name" label="Owner name" required className="sm:col-span-2"><Input name="full_name" defaultValue={v("full_name")} /></Field>
      <Field name="phone" label="Phone"><Input name="phone" type="tel" defaultValue={v("phone")} /></Field>
      <Field name="email" label="Email"><Input name="email" type="email" defaultValue={v("email")} /></Field>
      <Field name="address" label="Address" className="sm:col-span-2"><Input name="address" defaultValue={v("address")} /></Field>
      <Field name="pan" label="PAN"><Input name="pan" defaultValue={v("pan")} className="uppercase" /></Field>
      <Field name="upi_id" label="UPI ID"><Input name="upi_id" defaultValue={v("upi_id")} /></Field>
      <Field name="bank_account_name" label="Bank account name"><Input name="bank_account_name" defaultValue={v("bank_account_name")} /></Field>
      <Field name="bank_account_number" label="Account number"><Input name="bank_account_number" defaultValue={v("bank_account_number")} /></Field>
      <Field name="bank_ifsc" label="IFSC"><Input name="bank_ifsc" defaultValue={v("bank_ifsc")} className="uppercase" /></Field>
      <Field name="notes" label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={v("notes")} /></Field>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{owner ? "Save owner" : "Add owner"}</SubmitButton></div>
    </ActionForm>
  );
}
