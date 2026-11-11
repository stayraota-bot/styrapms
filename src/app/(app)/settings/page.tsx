import { Play } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { fdate, inr } from "@/lib/format";
import { Card, CardHeader, CardBody, PageHeader, Input, Select, Table, THead, Th, Td, Tr, Badge, Button, Alert } from "@/components/ui/core";
import { ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { saveCompany, addCategory, toggleCategory, toggleRecurring, runRecurring } from "./actions";

export const metadata = { title: "System settings" };
export default async function Settings() {
  const u = await requireRole(["super_admin"]);
  const d = await withUser(u.id, async (tx) => {
    const s = Object.fromEntries((await tx<{ key: string; value: unknown }[]>`select key, value from app_settings`).map((r) => [r.key, r.value]));
    return { s, inc: await tx`select * from income_categories order by sort_order, name`, exp: await tx`select * from expense_categories order by sort_order, name`,
      rec: await tx`select r.*, p.name prop, c.name category from recurring_expenses r join properties p on p.id = r.property_id join expense_categories c on c.id = r.category_id order by p.name`,
      demo: (await tx<{ demo: number; real: number }[]>`select count(*) filter (where is_demo)::int demo, count(*) filter (where not is_demo)::int real from properties`)[0] };
  });
  const c = (d.s.company ?? {}) as Record<string, string>;
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="System settings" description="Company profile, alert rules, categories and recurring bills." />
      {d.demo.demo > 0 && <Alert tone="amber" title="Demo data present">This database contains {d.demo.demo} clearly-labelled demo propert{d.demo.demo === 1 ? "y" : "ies"}. Use a separate Supabase project for production — demo data is never seeded into a database with real properties.</Alert>}
      <Card><CardHeader title="Company & rules" /><CardBody>
        <ActionForm action={saveCompany} className="grid sm:grid-cols-2 gap-4">
          <Field name="name" label="Display name" required><Input name="name" defaultValue={c.name} /></Field>
          <Field name="legal_name" label="Legal name (on statements)"><Input name="legal_name" defaultValue={c.legal_name} /></Field>
          <Field name="gstin" label="GSTIN"><Input name="gstin" defaultValue={c.gstin} /></Field>
          <Field name="email" label="Accounts email"><Input name="email" defaultValue={c.email} /></Field>
          <Field name="phone" label="Phone"><Input name="phone" defaultValue={c.phone} /></Field>
          <Field name="address" label="Address"><Input name="address" defaultValue={c.address} /></Field>
          <Field name="threshold" label="High-demand rule: last-year occupancy ≥ (%)" hint="Dates are flagged only from history or explicit designations"><Input name="threshold" type="number" defaultValue={Math.round(Number(d.s["demand.occupancy_threshold"] ?? 0.85) * 100)} /></Field>
          <Field name="vacancy" label="Vacancy alert: empty nights in next 14 days ≥"><Input name="vacancy" type="number" defaultValue={String(d.s["alerts.vacancy_days"] ?? 5)} /></Field>
          <p className="sm:col-span-2 text-xs text-muted">Currency: INR · Timezone: Asia/Kolkata · Auth: {env.authMode === "local" ? "Local development mode" : "Supabase Auth"}</p>
          <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save settings</SubmitButton></div>
        </ActionForm></CardBody></Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {(["income", "expense"] as const).map((kind) => (
          <Card key={kind}><CardHeader title={`${kind === "income" ? "Income" : "Expense"} categories`} />
            <CardBody><ActionForm action={addCategory} className="flex gap-2 mb-3" resetOnSuccess><input type="hidden" name="kind" value={kind} />
              <Input name="name" placeholder="New category" className="flex-1" />{kind === "expense" && <Select name="group_name" className="w-36"><option>Property</option><option>Staff</option><option>Maintenance</option><option>Other</option></Select>}
              <SubmitButton size="md">Add</SubmitButton></ActionForm>
              <div className="max-h-80 overflow-y-auto divide-y divide-line border border-line rounded-lg">{(kind === "income" ? d.inc : d.exp).map((x) => (
                <div key={x.id} className="flex items-center justify-between px-3 py-1.5 text-sm"><span className={x.is_active ? "" : "text-muted line-through"}>{x.name}{x.group_name && <span className="text-xs text-muted ml-1.5">{x.group_name}</span>}</span>
                  <ActionForm action={toggleCategory}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="kind" value={kind} /><SubmitButton variant="ghost" size="sm" pendingText="…">{x.is_active ? "Disable" : "Enable"}</SubmitButton></ActionForm></div>))}</div>
            </CardBody></Card>))}
      </div>

      <Card><CardHeader title="Recurring bills" description="Generated automatically every day (Vercel Cron) into the approval queue" action={<ConfirmAction action={runRecurring} label="Run now" icon={<Play />} title="Generate due recurring bills now?" variant="secondary" />} />
        <Table><THead><tr><Th>Property</Th><Th>Bill</Th><Th>Frequency</Th><Th className="text-right">Amount</Th><Th>Next</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>{d.rec.map((r) => <Tr key={r.id}><Td>{r.prop}</Td><Td>{r.category} · {r.description}</Td><Td className="capitalize">{r.frequency}</Td><Td className="text-right tabular">{inr(Number(r.amount) + Number(r.gst_amount))}</Td>
            <Td>{fdate(r.next_run_date)}</Td><Td>{r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Paused</Badge>}</Td>
            <Td><ActionForm action={toggleRecurring}><input type="hidden" name="id" value={r.id} /><SubmitButton variant="ghost" size="sm">{r.is_active ? "Pause" : "Resume"}</SubmitButton></ActionForm></Td></Tr>)}
            {d.rec.length === 0 && <Tr><Td colSpan={7} className="text-muted">Create one by ticking “Repeat this bill” when adding an expense.</Td></Tr>}</tbody></Table></Card>
    </div>
  );
}
