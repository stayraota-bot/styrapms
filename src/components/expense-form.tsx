"use client";
import { useState } from "react";
import { ActionForm, Field, SubmitButton, FormActions } from "@/components/ui/forms";
import { Card, CardBody, CardHeader, Input, Select, Textarea, LinkButton } from "@/components/ui/core";
import type { ActionState } from "@/lib/action";

type Opt = { id: string; name: string };
export function ExpenseForm({ action, properties, categories, vendors, bookings, defaults, idem, today }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; properties: Opt[]; categories: (Opt & { group_name: string })[]; vendors: Opt[];
  bookings: { id: string; label: string; property_id: string }[]; defaults: { property?: string; booking?: string }; idem: string; today: string;
}) {
  const [pid, setPid] = useState(defaults.property ?? (properties.length === 1 ? properties[0].id : ""));
  const [scope, setScope] = useState(defaults.booking ? "booking" : "property");
  const [bearer, setBearer] = useState("pool");
  const [paid, setPaid] = useState("paid");
  const [amt, setAmt] = useState(""); const [gst, setGst] = useState("");
  const total = Number(amt || 0) + Number(gst || 0);
  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="idem" value={idem} />
      <Card><CardHeader title="Bill" /><CardBody className="grid sm:grid-cols-2 gap-4">
        <Field name="property_id" label="Property" required><Select name="property_id" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Select…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field name="category_id" label="Category" required><Select name="category_id" defaultValue=""><option value="">Select…</option>
          {["Property", "Staff", "Maintenance", "Other"].map((g) => <optgroup key={g} label={g}>{categories.filter((c) => c.group_name === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</Select></Field>
        <Field name="description" label="Description" required className="sm:col-span-2"><Input name="description" placeholder="e.g. Monthly ration from Sahyadri Provisions" /></Field>
        <Field name="vendor_id" label="Vendor" hint="Add new vendors under Vendors"><Select name="vendor_id" defaultValue=""><option value="">— No vendor —</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field name="bill_number" label="Bill / invoice number"><Input name="bill_number" /></Field>
        <Field name="amount" label="Amount before GST (₹)" required><Input name="amount" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field name="gst_amount" label="GST amount (₹)" hint="If applicable"><Input name="gst_amount" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} placeholder="0" /></Field>
        <Field name="bill_date" label="Bill date" required><Input type="date" name="bill_date" defaultValue={today} max={today} /></Field>
        <Field name="due_date" label="Due date"><Input type="date" name="due_date" /></Field>
        <div className="sm:col-span-2 rounded-lg bg-brand-50 border border-brand-100 px-4 py-2.5 flex justify-between"><span className="text-sm text-muted">Bill total</span><span className="font-semibold tabular">₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
        <Field name="bill" label="Upload bill / receipt" hint="Photo or PDF, up to 10 MB" className="sm:col-span-2"><Input type="file" name="bill" accept="image/*,application/pdf" capture="environment" className="py-1.5" /></Field>
      </CardBody></Card>

      <Card><CardHeader title="Payment" /><CardBody className="grid sm:grid-cols-3 gap-4">
        <Field name="paid_now" label="Payment status" required><Select name="paid_now" value={paid} onChange={(e) => setPaid(e.target.value)}><option value="paid">Paid</option><option value="unpaid">Unpaid (pay later)</option></Select></Field>
        {paid === "paid" && <Field name="payment_method" label="Payment method" required><Select name="payment_method" defaultValue="upi"><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option></Select></Field>}
        <Field name="paid_by" label="Paid by" required><Select name="paid_by" defaultValue="stayra"><option value="stayra">STAYRA</option><option value="property_cash">Property petty cash</option><option value="owner">Owner directly</option><option value="vendor_credit">Vendor credit</option></Select></Field>
      </CardBody></Card>

      <Card><CardHeader title="Classification" description="Decides whether and how this bill is deducted before revenue sharing." /><CardBody className="grid sm:grid-cols-3 gap-4">
        <Field name="scope" label="Applies to" required><Select name="scope" value={scope} onChange={(e) => setScope(e.target.value)}><option value="property">Property-level</option><option value="booking">Booking-specific</option><option value="shared">Shared between properties</option></Select></Field>
        {scope === "booking" && <Field name="booking_id" label="Booking" required><Select name="booking_id" defaultValue={defaults.booking ?? ""}><option value="">Select…</option>{bookings.filter((b) => b.property_id === pid).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></Field>}
        <Field name="bearer" label="Borne by" required hint={bearer === "owner" ? "Recovered from owner's share if STAYRA paid" : bearer === "stayra" ? "STAYRA's own cost — never deducted" : "Shared cost pool"}>
          <Select name="bearer" value={bearer} onChange={(e) => setBearer(e.target.value)}><option value="pool">Shared pool (both)</option><option value="owner">Owner-borne</option><option value="stayra">STAYRA-borne</option></Select></Field>
        <Field name="is_deductible" label="Deductible before sharing?" required><Select name="is_deductible" defaultValue="true" disabled={bearer !== "pool"}><option value="true">Deductible</option><option value="false">Non-deductible</option></Select></Field>
        <Field name="recurring" label="Repeat this bill"><Select name="recurring" defaultValue=""><option value="">No</option><option value="monthly">Every month</option><option value="quarterly">Every quarter</option><option value="yearly">Every year</option></Select></Field>
      </CardBody></Card>
      {bearer !== "pool" && <input type="hidden" name="is_deductible" value="false" />}
      <Card><CardBody className="pt-5"><Field name="notes" label="Notes"><Textarea name="notes" rows={2} /></Field></CardBody></Card>
      <FormActions><LinkButton href="/expenses" variant="secondary">Cancel</LinkButton><SubmitButton>Submit expense</SubmitButton></FormActions>
    </ActionForm>
  );
}
