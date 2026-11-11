import Link from "next/link";
import { HandCoins, Plus, Scale } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, inr, monthBounds, todayIST, addDays } from "@/lib/format";
import { propertyOptions, sp1, uuidParam } from "@/server/common";
import { Card, CardHeader, CardBody, PageHeader, Button, Table, THead, Th, Td, Tr, StatusBadge, EmptyState, Input, Select, Tabs, Textarea } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { addAdjustment } from "./actions";

export const metadata = { title: "Owner settlements" };
export default async function Settlements({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "accountant", "auditor"]);
  const sp = await searchParams;
  const status = sp1(sp.status) ?? "all";
  const pid = uuidParam(sp.property);
  const prev = monthBounds(addDays(monthBounds(todayIST()).start, -1));
  const d = await withUser(u.id, async (tx) => ({
    rows: await tx`select s.*, p.name prop, o.full_name owner from settlements s join properties p on p.id = s.property_id join owners o on o.id = s.owner_id
      where (${pid}::uuid is null or s.property_id = ${pid}::uuid)
        and (case ${status} when 'all' then s.status <> 'void' when 'outstanding' then s.status in ('approved','partially_paid') else s.status::text = ${status} end)
      order by s.period_end desc, p.name limit 200`,
    owners: await tx`select o.id, o.full_name, string_agg(distinct p.name, ', ') props,
        coalesce(sum(s.gross_revenue) filter (where s.status in ('approved','partially_paid','paid')),0) revenue,
        coalesce(sum(s.deductible_expenses + s.expense_adjustments) filter (where s.status in ('approved','partially_paid','paid')),0) expenses,
        coalesce(sum(s.net_distributable) filter (where s.status in ('approved','partially_paid','paid')),0) net,
        coalesce(sum(s.owner_share - s.owner_borne_recoveries) filter (where s.status in ('approved','partially_paid','paid')),0) entitlement,
        coalesce(sum(s.payments_made) filter (where s.status in ('approved','partially_paid','paid')),0) paid,
        coalesce(sum(s.owner_share - s.owner_borne_recoveries - s.payments_made) filter (where s.status in ('approved','partially_paid')),0) payable,
        string_agg(distinct (s.owner_pct::numeric)::text || '%', ' / ') pcts
      from owners o join properties p on p.owner_id = o.id left join settlements s on s.property_id = p.id and s.owner_id = o.id
      where p.status <> 'archived' group by o.id, o.full_name order by o.full_name`,
    props: await propertyOptions(tx),
  }));
  const gen = can.generateSettlement(u.role);
  const qs = (st: string) => `?status=${st}${pid ? `&property=${pid}` : ""}`;
  return (
    <>
      <PageHeader title="Owner settlements" description="Draft → Submitted → Approved → Partially paid → Paid. Approved settlements are locked."
        actions={gen && <>
          {can.adjustments(u.role) && <Modal title="Record adjustment / correction" description="Documented corrections are included in the next settlement of the property." trigger={<Button variant="secondary"><Scale />Adjustment</Button>}>
            <ActionForm action={addAdjustment} className="grid sm:grid-cols-2 gap-4">
              <Field name="property_id" label="Property" required className="sm:col-span-2"><Select name="property_id">{d.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field name="kind" label="Affects" required><Select name="kind"><option value="revenue">Revenue</option><option value="expense">Expenses</option></Select></Field>
              <Field name="direction" label="Direction" required><Select name="direction"><option value="decrease">Decrease</option><option value="increase">Increase</option></Select></Field>
              <Field name="amount" label="Amount (₹)" required><Input name="amount" inputMode="decimal" /></Field>
              <Field name="adj_date" label="Date" required><Input type="date" name="adj_date" defaultValue={todayIST()} /></Field>
              <Field name="reason" label="Reason / documentation" required className="sm:col-span-2"><Textarea name="reason" placeholder="e.g. Refund to guest BK-001234 after complaint; reference to approved settlement STL-00105" /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Record adjustment</SubmitButton></div></ActionForm></Modal>}
          <Modal title="Generate settlement" description="Preview the calculation before creating a draft." defaultOpen={sp.new === "1"} trigger={<Button><Plus />Generate Settlement</Button>}>
            <form action="/settlements/preview" className="grid sm:grid-cols-2 gap-4">
              <Field name="property" label="Property" required className="sm:col-span-2"><Select name="property" required>{d.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field name="from" label="Period from" required><Input type="date" name="from" defaultValue={prev.start} required /></Field>
              <Field name="to" label="Period to" required><Input type="date" name="to" defaultValue={prev.end} required /></Field>
              <p className="sm:col-span-2 text-xs text-muted">For booking-wise settlement, open a checked-out booking&apos;s preview from the next screen.</p>
              <div className="sm:col-span-2 flex justify-end"><Button type="submit">Preview calculation →</Button></div>
            </form></Modal>
        </>} />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">{d.owners.map((o) => (
        <Card key={o.id}><CardHeader title={<Link href={`/owners/${o.id}`} className="hover:text-brand-700">{o.full_name}</Link>} description={o.props} />
          <CardBody className="text-sm space-y-1.5">
            <p className="flex justify-between"><span className="text-muted">Total revenue</span><span className="tabular">{inr(o.revenue)}</span></p>
            <p className="flex justify-between"><span className="text-muted">Eligible expenses</span><span className="tabular">− {inr(o.expenses)}</span></p>
            <p className="flex justify-between"><span className="text-muted">Net distributable</span><span className="tabular">{inr(o.net)}</span></p>
            <p className="flex justify-between"><span className="text-muted">Owner % · entitlement</span><span className="tabular">{o.pcts ?? "—"} · {inr(o.entitlement)}</span></p>
            <p className="flex justify-between"><span className="text-muted">Payments made</span><span className="tabular">{inr(o.paid)}</span></p>
            <p className="flex justify-between font-semibold border-t border-line pt-2"><span>Current payable</span><span className="tabular text-brand-800">{inr(o.payable)}</span></p>
          </CardBody></Card>))}</div>

      <Tabs active={status} tabs={["all", "draft", "submitted", "outstanding", "paid", "void"].map((k) => ({ key: k, label: k === "outstanding" ? "Approved & unpaid" : k[0].toUpperCase() + k.slice(1), href: qs(k) }))} />
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={<HandCoins />} title="No settlements here" description="Generate a settlement for a property and period." /> : (
          <Table><THead><tr><Th>Settlement</Th><Th>Property / Owner</Th><Th>Period</Th><Th className="text-right">Revenue</Th><Th className="text-right">Net distributable</Th><Th className="text-right">STAYRA</Th><Th className="text-right">Owner</Th><Th className="text-right">Payable</Th><Th>Status</Th></tr></THead>
            <tbody>{d.rows.map((s) => (
              <Tr key={s.id}><Td><Link href={`/settlements/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.settlement_code}</Link><div className="text-xs text-muted">{s.mode === "booking" ? "Booking-wise" : "Period"} · {Number(s.stayra_pct)}/{Number(s.owner_pct)}</div></Td>
                <Td>{s.prop.replace("STAYRA ", "")}<div className="text-xs text-muted">{s.owner}</div></Td>
                <Td className="whitespace-nowrap">{fdate(s.period_start, false)} – {fdate(s.period_end)}</Td>
                <Td className="text-right tabular">{inr(s.gross_revenue)}</Td><Td className="text-right tabular">{inr(s.net_distributable)}</Td>
                <Td className="text-right tabular">{inr(s.stayra_share)}</Td><Td className="text-right tabular">{inr(s.owner_share)}</Td>
                <Td className="text-right tabular font-medium">{inr(s.final_payable)}</Td><Td><StatusBadge status={s.status} /></Td></Tr>))}</tbody></Table>)}
      </Card>
    </>
  );
}
