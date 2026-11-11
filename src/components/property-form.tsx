import { ActionForm, Field, SubmitButton, FormActions } from "@/components/ui/forms";
import { Card, CardBody, CardHeader, Input, Select, Textarea, LinkButton } from "@/components/ui/core";
import type { ActionState } from "@/lib/action";
import { todayIST } from "@/lib/format";

export const CATEGORY_LABEL: Record<string, string> = { hotel: "Hotel", resort: "Resort", villa: "Villa", homestay: "Homestay", serviced_apartment: "Serviced Apartment", guest_house: "Guest House", hostel: "Hostel", other: "Other" };

type P = Record<string, string | number | null | undefined>;
export function PropertyForm({ action, owners, managers, property, isNew }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; owners: { id: string; full_name: string }[]; managers: { id: string; full_name: string }[]; property?: P; isNew?: boolean;
}) {
  const v = (k: string) => (property?.[k] ?? "") as string;
  return (
    <ActionForm action={action} className="space-y-6">
      {property?.id && <input type="hidden" name="id" value={String(property.id)} />}
      <Card><CardHeader title="Property details" /><CardBody className="grid sm:grid-cols-2 gap-4">
        <Field name="name" label="Property name" required className="sm:col-span-2"><Input name="name" defaultValue={v("name")} placeholder="e.g. STAYRA Lake House" /></Field>
        <Field name="category" label="Category" required><Select name="category" defaultValue={v("category") || "villa"}>{Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field name="status" label="Operational status" required><Select name="status" defaultValue={v("status") || "active"}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <Field name="address" label="Address" className="sm:col-span-2"><Input name="address" defaultValue={v("address")} /></Field>
        <Field name="city" label="City" required><Input name="city" defaultValue={v("city")} /></Field>
        <Field name="state" label="State" required><Input name="state" defaultValue={v("state") || "Maharashtra"} /></Field>
        <Field name="pincode" label="PIN code"><Input name="pincode" defaultValue={v("pincode")} inputMode="numeric" /></Field>
        <Field name="location_url" label="Location link" hint="Google Maps link"><Input name="location_url" defaultValue={v("location_url")} placeholder="https://maps.google.com/…" /></Field>
        <Field name="guest_capacity" label="Guest capacity"><Input name="guest_capacity" type="number" min={0} defaultValue={v("guest_capacity")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field name="check_in_time" label="Check-in time" required><Input name="check_in_time" type="time" defaultValue={String(v("check_in_time") || "14:00").slice(0, 5)} /></Field>
          <Field name="check_out_time" label="Check-out time" required><Input name="check_out_time" type="time" defaultValue={String(v("check_out_time") || "11:00").slice(0, 5)} /></Field>
        </div>
        <Field name="description" label="Notes / description" className="sm:col-span-2"><Textarea name="description" defaultValue={v("description")} /></Field>
        <Field name="photo" label="Cover photograph" hint="JPG/PNG/WEBP, up to 10 MB"><Input name="photo" type="file" accept="image/*" className="py-1.5" /></Field>
      </CardBody></Card>

      <Card><CardHeader title="Owner & management" description="Need a new owner? Add them first under Owners." action={<LinkButton href="/owners?new=1" variant="link" size="sm">+ Add owner</LinkButton>} /><CardBody className="grid sm:grid-cols-2 gap-4">
        <Field name="owner_id" label="Property owner" required><Select name="owner_id" defaultValue={v("owner_id")}><option value="">Select owner…</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</Select></Field>
        <Field name="manager_id" label="Assigned property manager" hint="Gets access to this property automatically"><Select name="manager_id" defaultValue={v("manager_id")}><option value="">— None —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Field>
        <Field name="agreement_start" label="Agreement start date"><Input name="agreement_start" type="date" defaultValue={v("agreement_start")} /></Field>
        <Field name="agreement_end" label="Agreement end date"><Input name="agreement_end" type="date" defaultValue={v("agreement_end")} /></Field>
      </CardBody></Card>

      {isNew && (
        <>
          <Card><CardHeader title="Revenue-sharing agreement" description="Calculated on net distributable revenue (after approved deductible expenses). You can change terms later — history is preserved." /><CardBody className="grid sm:grid-cols-3 gap-4">
            <Field name="stayra_pct" label="STAYRA share %" required hint="Owner gets the remainder (total = 100%)"><Input name="stayra_pct" type="number" step="0.01" min={0} max={100} defaultValue="40" /></Field>
            <Field name="effective_from" label="Effective from" required><Input name="effective_from" type="date" defaultValue={todayIST().slice(0, 8) + "01"} /></Field>
            <Field name="agreement_file" label="Agreement document" hint="PDF or image"><Input name="agreement_file" type="file" accept="application/pdf,image/*" className="py-1.5" /></Field>
          </CardBody></Card>
          <Card><CardHeader title="Rooms / units" description="One per line: Name | Category | Max guests | Base rate. You can add more later." /><CardBody>
            <Field name="rooms"><Textarea name="rooms" rows={5} className="font-mono text-xs" placeholder={"Room 101 | Deluxe | 2 | 4500\nRoom 102 | Deluxe | 2 | 4500\nFamily Suite | Suite | 4 | 8000"} /></Field>
          </CardBody></Card>
        </>
      )}
      <FormActions>
        <LinkButton href={property?.id ? `/properties/${property.id}` : "/properties"} variant="secondary">Cancel</LinkButton>
        <SubmitButton>{isNew ? "Create property" : "Save changes"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
