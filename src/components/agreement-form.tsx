"use client";
import { useState } from "react";
import { ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { Input, Select, Textarea } from "@/components/ui/core";
import type { ActionState } from "@/lib/action";

export function AgreementForm({ action, propertyId, current, categories, minDate }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; propertyId: string; minDate: string;
  current?: { stayra_pct: string; settlement_frequency: string; expense_policy: string; include_unpaid_expenses: boolean; shared_allocation_method: string; deductible_category_ids: string[] };
  categories: { id: string; name: string; group_name: string }[];
}) {
  const [s, setS] = useState(current ? String(Number(current.stayra_pct)) : "40");
  const [policy, setPolicy] = useState(current?.expense_policy ?? "all_approved");
  const sv = Number(s); const valid = s !== "" && sv >= 0 && sv <= 100;
  const owner = valid ? Math.round((100 - sv) * 100) / 100 : NaN;
  const ex = { rev: 100000, exp: 25000 }; const net = ex.rev - ex.exp;
  return (
    <ActionForm action={action} className="space-y-5">
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="grid grid-cols-2 gap-4">
        <Field name="stayra_pct" label="STAYRA %" required><Input name="stayra_pct" type="number" step="0.01" min={0} max={100} value={s} onChange={(e) => setS(e.target.value)} className="text-lg font-semibold" /></Field>
        <Field name="owner_pct" label="Owner %" hint="Auto: 100 − STAYRA %"><Input name="owner_pct" value={Number.isNaN(owner) ? "" : String(owner)} readOnly className="text-lg font-semibold bg-gray-50" /></Field>
      </div>
      <div className={`rounded-lg px-4 py-3 text-sm ${valid ? "bg-brand-50 text-brand-900" : "bg-red-50 text-red-800"}`}>
        {valid ? <>Total = <b>100%</b>. Example: revenue ₹1,00,000 − deductible expenses ₹25,000 = net ₹75,000 → STAYRA <b>₹{(net * sv / 100).toLocaleString("en-IN")}</b> · Owner <b>₹{(net - Math.round(net * sv) / 100).toLocaleString("en-IN")}</b></> : "Enter a percentage between 0 and 100."}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field name="effective_from" label="Effective from" required hint={`Must be after ${minDate}`}><Input type="date" name="effective_from" min={minDate} /></Field>
        <Field name="agreement_end_date" label="Agreement end date"><Input type="date" name="agreement_end_date" /></Field>
        <Field name="settlement_frequency" label="Settlement frequency"><Select name="settlement_frequency" defaultValue={current?.settlement_frequency ?? "monthly"}><option value="booking">Booking-wise</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom</option></Select></Field>
        <Field name="shared_allocation_method" label="Shared expense allocation"><Select name="shared_allocation_method" defaultValue={current?.shared_allocation_method ?? "by_units"}><option value="by_units">By number of rooms</option><option value="equal">Equal split</option><option value="manual">Manual</option></Select></Field>
        <Field name="expense_policy" label="Expense deduction policy" className="sm:col-span-2"><Select name="expense_policy" value={policy} onChange={(e) => setPolicy(e.target.value)}>
          <option value="all_approved">Deduct all approved eligible expenses</option><option value="selected_categories">Deduct only selected categories</option>
          <option value="booking_specific_only">Deduct only booking-specific expenses</option><option value="property_level_only">Deduct property-level (and shared) expenses</option></Select></Field>
        {policy === "selected_categories" && <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto rounded-lg border border-line p-3">
          {categories.map((c) => <label key={c.id} className="flex items-center gap-2 text-xs"><input type="checkbox" name="categories[]" value={c.id} defaultChecked={current?.deductible_category_ids?.includes(c.id)} className="accent-brand-700" />{c.name}</label>)}</div>}
        <Field name="include_unpaid_expenses" label="Unpaid approved bills" className="sm:col-span-2"><Select name="include_unpaid_expenses" defaultValue={String(current?.include_unpaid_expenses ?? false)}><option value="false">Exclude until paid (shown separately, picked up later)</option><option value="true">Include when approved</option></Select></Field>
        <Field name="document" label="Agreement document"><Input type="file" name="document" accept="application/pdf,image/*" className="py-1.5" /></Field>
        <Field name="notes" label="Notes"><Textarea name="notes" rows={1} /></Field>
      </div>
      <p className="text-xs text-muted">Owner-borne and STAYRA-borne expenses are always excluded from the shared pool. Saving creates a new version; previous versions and completed settlements are never modified.</p>
      <div className="flex justify-end"><SubmitButton disabled={!valid}>Save new agreement version</SubmitButton></div>
    </ActionForm>
  );
}
