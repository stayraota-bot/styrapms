import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { withUser, friendlyDbError } from "@/lib/db";
import { fdate, inr } from "@/lib/format";
import { uuidParam } from "@/server/common";
import { ITEM_LABEL, ITEM_ORDER } from "@/server/settlements";
import { Card, CardHeader, CardBody, PageHeader, Alert, Table, THead, Th, Td, Tr, LinkButton, Select } from "@/components/ui/core";
import { ActionForm, SubmitButton, Field } from "@/components/ui/forms";
import { generateSettlement } from "../actions";

export const metadata = { title: "Settlement preview" };
type Preview = Record<string, string | number> & { lines: { item_type: string; ref_id: string; item_date: string; description: string; amount: number; counted: boolean }[] };

export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "accountant"]);
  const sp = await searchParams;
  const pid = uuidParam(sp.property); const bid = uuidParam(sp.booking);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : null, to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : null;
  if (!pid || !from || !to) redirect("/settlements?new=1");
  const r = await withUser(u.id, async (tx) => {
    const [p] = await tx<{ name: string }[]>`select name from properties where id = ${pid}`;
    const bookings = await tx<{ id: string; booking_code: string; guest: string; check_out: string }[]>`select b.id, b.booking_code, g.full_name guest, b.check_out from bookings b join guests g on g.id = b.guest_id
      where b.property_id = ${pid} and b.status = 'checked_out' and b.check_out between ${from}::date and ${to}::date
        and not exists (select 1 from settlement_items si where si.ref_id = b.id and si.is_active and si.item_type = 'booking') order by b.check_out limit 200`;
    try {
      const [{ p: preview }] = await tx<{ p: Preview }[]>`select preview_settlement(${pid}, ${from}, ${to}, ${bid}) p`;
      return { name: p?.name, preview, bookings, error: null };
    } catch (e) { return { name: p?.name, preview: null, bookings, error: friendlyDbError(e) }; }
  });
  const pv = r.preview;
  return (
    <div className="max-w-5xl">
      <PageHeader back={{ href: "/settlements", label: "Settlements" }} title={`Preview · ${r.name}`} description={`${bid ? "Booking-wise" : "Period"} settlement · ${fdate(from)} – ${fdate(to)}`} />
      <form className="flex flex-wrap gap-2 mb-5 items-end"><input type="hidden" name="property" value={pid} /><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />
        <Field name="booking" label="Settlement mode"><Select name="booking" defaultValue={bid ?? ""} className="min-w-72"><option value="">Whole period (all unsettled items)</option>
          {r.bookings.map((b) => <option key={b.id} value={b.id}>Booking-wise: {b.booking_code} · {b.guest} · out {fdate(b.check_out, false)}</option>)}</Select></Field>
        <button className="h-10 px-4 rounded-lg border border-line bg-white text-sm">Update</button></form>
      {r.error && <Alert tone="red" title="Cannot calculate">{r.error}</Alert>}
      {pv && (<>
        <div className="grid md:grid-cols-4 gap-3 mb-5">
          {[["Eligible revenue", pv.gross_revenue], ["Deductible expenses", Number(pv.deductible_expenses) + Number(pv.expense_adjustments)], ["Net distributable", pv.net_distributable], [`Owner share (${Number(pv.owner_pct)}%)`, pv.owner_share]].map(([k, v]) =>
            <Card key={k as string} className="p-4"><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold tabular mt-1">{inr(v)}</p></Card>)}
        </div>
        <Card className="mb-5"><CardHeader title="Calculation" description={`Agreement v${pv.agreement_version} · STAYRA ${Number(pv.stayra_pct)}% / Owner ${Number(pv.owner_pct)}%`} /><CardBody className="text-sm space-y-1.5">
          {([["Booking revenue", pv.booking_revenue], ["Additional income", pv.additional_income], ["Revenue adjustments", pv.revenue_adjustments], ["Deductible expenses (incl. OTA commission)", `-${pv.deductible_expenses}`], ["Expense adjustments", `-${pv.expense_adjustments}`],
            ["Net distributable revenue", pv.net_distributable], [`STAYRA share ${Number(pv.stayra_pct)}%`, pv.stayra_share], [`Owner share ${Number(pv.owner_pct)}%`, pv.owner_share], ["Owner-borne recoveries", `-${pv.owner_borne_recoveries}`],
            ["Previous outstanding", pv.previous_outstanding], ["Final payable", pv.final_payable], ["Unpaid bills excluded (info)", pv.unpaid_expenses_excluded]] as [string, string | number][]).map(([k, v]) =>
            <p key={k} className={`flex justify-between ${["Net distributable revenue", "Final payable"].includes(k) ? "font-semibold border-t border-line pt-1.5" : ""}`}><span>{k}</span><span className="tabular">{String(v).startsWith("-") ? `− ${inr(String(v).slice(1))}` : inr(v)}</span></p>)}
          {Number(pv.net_distributable) < 0 && <Alert tone="amber" title="Net is negative">Expenses exceed revenue for this period. The owner share will be negative (carried as amount due from owner).</Alert>}
        </CardBody></Card>
        <Card className="mb-5"><CardHeader title={`${pv.lines.length} line items`} description="Includes late-entered items from earlier dates under the same agreement that were never settled." />
          <Table><THead><tr><Th>Type</Th><Th>Date</Th><Th>Description</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>{[...pv.lines].sort((a, b) => ITEM_ORDER.indexOf(a.item_type) - ITEM_ORDER.indexOf(b.item_type)).map((l, i) => <Tr key={i} className={l.counted ? "" : "text-muted"}><Td className="text-xs">{ITEM_LABEL[l.item_type]}</Td><Td className="text-xs whitespace-nowrap">{fdate(l.item_date)}</Td><Td className="text-xs">{l.description}</Td><Td className="text-right tabular text-xs">{inr(l.amount)}</Td></Tr>)}</tbody></Table>
        </Card>
        <ActionForm action={generateSettlement} className="flex justify-end gap-2">
          <input type="hidden" name="property_id" value={pid} /><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />{bid && <input type="hidden" name="booking_id" value={bid} />}
          <LinkButton href="/settlements" variant="secondary">Cancel</LinkButton><SubmitButton disabled={pv.lines.length === 0}>Generate draft settlement</SubmitButton>
        </ActionForm>
      </>)}
    </div>
  );
}
