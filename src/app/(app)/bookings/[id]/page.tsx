import Link from "next/link";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import * as I from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, fdatetime, inr, todayIST, SOURCE_LABEL, titleCase } from "@/lib/format";
import { unitOptions } from "@/server/common";
import { Card, CardHeader, CardBody, PageHeader, KV, StatusBadge, Table, THead, Th, Td, Tr, Badge, Button, Input, Select, Textarea, Alert, LinkButton, DemoBadge } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { changeBookingStatus, recordGuestPayment, reversePayment, addFolioCharge, updateBooking } from "../actions";

export const metadata = { title: "Booking details" };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "operations", "auditor"]);
  const { id } = await params;
  const fin = can.viewFinance(u.role);
  const d = await withUser(u.id, async (tx) => {
    const [b] = await tx`select b.*, g.full_name guest, g.phone, g.email, g.city guest_city, p.name prop, p.check_in_time, p.check_out_time, un.name unit, un.room_category, un.readiness::text readiness,
        cr.full_name created_by_name
      from bookings b join guests g on g.id = b.guest_id join properties p on p.id = b.property_id join property_units un on un.id = b.unit_id left join profiles cr on cr.id = b.created_by
      where b.id = ${id}::uuid`;
    if (!b) return null;
    const [f] = fin ? await tx`select * from booking_financials where booking_id = ${id}::uuid` : [null];
    const ledger = fin ? await tx`select bp.*, o.entry_type::text orig_type, (select 1 from booking_payments r where r.reversal_of = bp.id) reversed
      from booking_payments bp left join booking_payments o on o.id = bp.reversal_of where bp.booking_id = ${id}::uuid order by bp.paid_at, bp.created_at` : [];
    const extras = fin ? await tx`select i.id, i.txn_code, c.name category, i.description, i.amount, i.txn_date, i.status::text from income i join income_categories c on c.id = i.category_id where i.booking_id = ${id}::uuid order by i.txn_date` : [];
    const expenses = fin ? await tx`select e.id, e.expense_code, c.name category, e.description, e.total_amount, e.approval_status::text, e.bearer::text from expenses e join expense_categories c on c.id = e.category_id where e.booking_id = ${id}::uuid and e.status = 'active'` : [];
    const settled = fin ? await tx`select s.id, s.settlement_code, s.status::text from settlement_items si join settlements s on s.id = si.settlement_id where si.ref_id = ${id}::uuid and si.is_active and si.item_type in ('booking','cancellation') limit 1` : [];
    const conflicts = await tx`select o.id, o.booking_code, o.status::text from bookings o where o.unit_id = ${b.unit_id} and o.id <> ${id}::uuid and o.status in ('pending','confirmed','checked_in')
      and daterange(o.check_in, o.check_out) && daterange(${b.check_in}::date, ${b.check_out}::date)`;
    const cats = await tx`select id, name from income_categories where is_active and code <> 'room' order by sort_order`;
    const units = (await unitOptions(tx)).filter((x) => x.property_id === b.property_id);
    return { b, f, ledger, extras, expenses, settled: settled[0], conflicts, cats, units };
  }).catch(() => null);
  if (!d) notFound();
  const { b, f } = d;
  const t = todayIST();
  const manage = can.manageBookings(u.role);
  const roomNet = Number(b.room_amount) - Number(b.discount);
  const extrasTotal = d.extras.filter((x) => x.status === "active").reduce((a, x) => a + Number(x.amount), 0);
  const expTotal = d.expenses.filter((e) => e.approval_status === "approved" && e.bearer === "pool").reduce((a, e) => a + Number(e.total_amount), 0) + Number(b.ota_commission);
  const cancelled = ["cancelled", "no_show"].includes(b.status);
  const incomeTotal = cancelled ? Number(b.cancellation_charge) : roomNet + extrasTotal;

  return (
    <>
      <PageHeader back={{ href: "/bookings", label: "Bookings" }}
        title={<span className="flex items-center gap-2 flex-wrap">Booking {b.booking_code} <StatusBadge status={b.status} />{f && <StatusBadge status={f.payment_status} />}<DemoBadge show={b.is_demo} /></span>}
        description={`${b.guest} · ${b.prop} · ${b.unit}`}
        actions={manage && <>
          {b.status === "pending" && <ConfirmAction action={changeBookingStatus} hidden={{ id, op: "confirm" }} label="Confirm" icon={<I.Check />} title="Confirm this booking?" description="The room will be blocked for these dates." size="md" variant="primary" />}
          {b.status === "confirmed" && b.check_in <= t && <ConfirmAction action={changeBookingStatus} hidden={{ id, op: "check_in" }} label="Check in" icon={<I.LogIn />} title={`Check in ${b.guest}?`} description={`Room ${b.unit} is currently ${b.readiness}.`} size="md" variant="primary" />}
          {b.status === "checked_in" && <ConfirmAction action={changeBookingStatus} hidden={{ id, op: "check_out" }} label="Check out" icon={<I.LogOut />} title={`Check out ${b.guest}?`} description={f && Number(f.balance_due) > 0 ? `Warning: ${inr(f.balance_due)} is still due from the guest.` : "A cleaning task will be created for the room."} size="md" variant="primary" />}
          {["pending", "confirmed"].includes(b.status) && (
            <Modal title="Cancel booking" trigger={<Button variant="outlineDanger"><I.X />Cancel</Button>}>
              <ActionForm action={changeBookingStatus} className="space-y-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="cancel" />
                <Field name="cancellation_charge" label="Cancellation charge (₹)" hint="Retained amount counts as revenue. Refund the rest from the payment ledger."><Input name="cancellation_charge" inputMode="decimal" defaultValue="0" /></Field>
                <Field name="reason" label="Reason" required><Textarea name="reason" /></Field>
                <div className="flex justify-end"><SubmitButton variant="danger">Cancel booking</SubmitButton></div></ActionForm></Modal>)}
          {["pending", "confirmed"].includes(b.status) && b.check_in <= t && <ConfirmAction action={changeBookingStatus} hidden={{ id, op: "no_show", cancellation_charge: "0" }} reason="Reason / notes" label="No-show" title="Mark as no-show?" size="md" />}
          {!cancelled && !d.settled && (
            <Modal title="Edit booking" wide trigger={<Button variant="secondary"><I.Pencil />Edit</Button>}>
              <ActionForm action={updateBooking} className="grid sm:grid-cols-2 gap-4"><input type="hidden" name="id" value={id} />
                <Field name="unit_id" label="Room"><Select name="unit_id" defaultValue={b.unit_id}>{d.units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field name="source" label="Source"><Select name="source" defaultValue={b.source}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field name="check_in" label="Check-in"><Input type="date" name="check_in" defaultValue={b.check_in} /></Field>
                <Field name="check_out" label="Check-out"><Input type="date" name="check_out" defaultValue={b.check_out} /></Field>
                <Field name="adults" label="Adults"><Input type="number" name="adults" defaultValue={b.adults} /></Field>
                <Field name="children" label="Children"><Input type="number" name="children" defaultValue={b.children} /></Field>
                <Field name="room_amount" label="Room amount"><Input name="room_amount" defaultValue={b.room_amount} /></Field>
                <Field name="discount" label="Discount"><Input name="discount" defaultValue={b.discount} /></Field>
                <Field name="tax_amount" label="Taxes"><Input name="tax_amount" defaultValue={b.tax_amount} /></Field>
                <Field name="ota_commission" label="OTA commission"><Input name="ota_commission" defaultValue={b.ota_commission} /></Field>
                <Field name="source_reference" label="Source reference"><Input name="source_reference" defaultValue={b.source_reference ?? ""} /></Field>
                <Field name="ota_collects_payment" label="Collected by"><Select name="ota_collects_payment" defaultValue={String(b.ota_collects_payment)}><option value="false">Property / STAYRA</option><option value="true">OTA</option></Select></Field>
                <Field name="notes" label="Internal notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={b.notes ?? ""} /></Field>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save changes</SubmitButton></div></ActionForm></Modal>)}
        </>} />

      {d.conflicts.length > 0 && <div className="mb-5"><Alert tone="red" title="Booking conflict">This room has overlapping bookings: {d.conflicts.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link className="underline" href={`/bookings/${c.id}`}>{c.booking_code}</Link> ({c.status})</span>)}. Confirmed bookings can never overlap — move one of them to another room.</Alert></div>}
      {d.settled && <div className="mb-5"><Alert tone="blue" title="Included in an owner settlement">Financial fields are locked (settlement <Link className="underline" href={`/settlements/${d.settled.id}`}>{d.settled.settlement_code}</Link>, {d.settled.status}). Use an adjustment entry for corrections.</Alert></div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader title="Stay & guest" /><CardBody>
          <KV cols={3} items={[["Booking ID", b.booking_code], ["Property", <Link key="p" href={`/properties/${b.property_id}`} className="text-brand-700 hover:underline">{b.prop}</Link>], ["Room / unit", `${b.unit} · ${b.room_category}`],
            ["Check-in", `${fdate(b.check_in)} · ${String(b.check_in_time).slice(0, 5)}`], ["Check-out", `${fdate(b.check_out)} · ${String(b.check_out_time).slice(0, 5)}`], ["Nights", b.nights],
            ["Guest", b.guest], ["Phone", b.phone ? <a key="t" href={`tel:${b.phone}`} className="text-brand-700">{b.phone}</a> : "—"], ["Email", b.email ?? "—"],
            ["Adults / Children", `${b.adults} / ${b.children}`], ["Source", `${SOURCE_LABEL[b.source]}${b.source_reference ? ` · ${b.source_reference}` : ""}`], ["Booked on", fdatetime(b.booked_at)],
            ["Room readiness", <StatusBadge key="r" status={b.readiness} />], ["Created by", b.created_by_name ?? "—"], ["Cancellation", b.cancellation_reason ?? "—"]]} />
          {b.notes && <div className="mt-5 rounded-lg bg-sand-50 border border-sand-200 px-4 py-3 text-sm"><span className="text-xs text-muted block">Internal notes</span>{b.notes}</div>}
        </CardBody></Card>

        {f && <Card><CardHeader title="Guest balance" /><CardBody className="space-y-2 text-sm">
          <Row k="Room amount" v={inr(b.room_amount)} /><Row k="Discount" v={`− ${inr(b.discount)}`} /><Row k="Taxes (GST)" v={inr(b.tax_amount)} />
          <Row k="Folio extras" v={inr(f.extras_total)} />
          {cancelled && <Row k="Cancellation charge" v={inr(b.cancellation_charge)} />}
          <div className="border-t border-line pt-2"><Row k="Amount due" v={inr(f.amount_due)} strong /></div>
          <Row k="Received" v={inr(f.received)} /><Row k="Refunded / reversed" v={`− ${inr(Number(f.refunded) + Number(f.reversed))}`} />
          <div className={`rounded-lg px-3 py-2 mt-2 ${Number(f.balance_due) > 0 ? "bg-red-50 text-red-800" : "bg-brand-50 text-brand-800"}`}><Row k={Number(f.balance_due) >= 0 ? "Balance due" : "Overpaid (refund due)"} v={inr(Math.abs(Number(f.balance_due)))} strong /></div>
          {Number(f.ota_collected) > 0 && <p className="text-xs text-muted pt-1">{inr(f.ota_collected)} collected by the OTA — counted as collected once recorded here.</p>}
        </CardBody></Card>}
      </div>

      {fin && <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Card><CardHeader title="Income (this booking)" action={can.addIncome(u.role) && !cancelled && (
          <Modal title="Add charge to guest folio" trigger={<Button size="sm" variant="secondary"><I.Plus />Add charge</Button>}>
            <ActionForm action={addFolioCharge} className="grid sm:grid-cols-2 gap-4"><input type="hidden" name="booking_id" value={id} />
              <Field name="category_id" label="Category" required><Select name="category_id">{d.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field name="amount" label="Amount (₹)" required><Input name="amount" inputMode="decimal" /></Field>
              <Field name="description" label="Description" required className="sm:col-span-2"><Input name="description" placeholder="e.g. Dinner for 4" /></Field>
              <Field name="txn_date" label="Date" required><Input type="date" name="txn_date" defaultValue={t} /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Add charge</SubmitButton></div></ActionForm></Modal>)} />
          <Table><tbody>
            {cancelled ? <Tr><Td>Cancellation / no-show charge</Td><Td className="text-right tabular">{inr(b.cancellation_charge)}</Td></Tr>
              : <Tr><Td>Room booking (net of discount, excl. GST)</Td><Td className="text-right tabular">{inr(roomNet)}</Td></Tr>}
            {d.extras.map((x) => <Tr key={x.id}><Td className={x.status === "void" ? "line-through text-muted" : ""}>{x.category} · {x.description} <span className="text-xs text-muted">{fdate(x.txn_date, false)}</span></Td><Td className="text-right tabular">{inr(x.amount)}</Td></Tr>)}
            <Tr className="bg-brand-50/50 font-semibold"><Td>Total income</Td><Td className="text-right tabular">{inr(incomeTotal)}</Td></Tr>
          </tbody></Table>
        </Card>
        <Card><CardHeader title="Expenses (this booking)" description="Booking-specific approved expenses + OTA commission" action={can.addExpense(u.role) && <LinkButton href={`/expenses/new?property=${b.property_id}&booking=${id}`} size="sm" variant="secondary"><I.Plus />Add expense</LinkButton>} />
          <Table><tbody>
            {Number(b.ota_commission) > 0 && <Tr><Td>OTA commission ({SOURCE_LABEL[b.source]})</Td><Td className="text-right tabular">{inr(b.ota_commission)}</Td></Tr>}
            {d.expenses.map((e) => <Tr key={e.id}><Td><Link href={`/expenses/${e.id}`} className="hover:text-brand-700">{e.category} · {e.description}</Link> {e.approval_status !== "approved" && <StatusBadge status={e.approval_status} />}</Td><Td className="text-right tabular">{inr(e.total_amount)}</Td></Tr>)}
            {d.expenses.length === 0 && Number(b.ota_commission) === 0 && <Tr><Td className="text-muted" colSpan={2}>No booking-specific expenses</Td></Tr>}
            <Tr className="bg-red-50/50 font-semibold"><Td>Total expenses</Td><Td className="text-right tabular">{inr(expTotal)}</Td></Tr>
          </tbody></Table>
          <div className="mx-5 my-4 rounded-lg bg-brand-800 text-white px-4 py-3 flex justify-between"><span>Net revenue (this booking)</span><span className="font-semibold tabular">{inr(incomeTotal - expTotal)}</span></div>
          <p className="px-5 pb-4 text-xs text-muted -mt-2">Property-level costs (salaries, utilities…) are deducted in the monthly settlement.</p>
        </Card>
      </div>}

      {fin && <Card className="mt-6"><CardHeader title="Payment ledger" description="Entries are never edited or deleted — mistakes are reversed."
        action={can.recordGuestPayment(u.role) && (
          <Modal title="Record payment / refund" wide trigger={<Button size="sm"><I.Wallet />Record payment</Button>}>
            <ActionForm action={recordGuestPayment} className="grid sm:grid-cols-2 gap-4"><input type="hidden" name="booking_id" value={id} /><input type="hidden" name="idem" value={randomUUID()} />
              <Field name="entry_type" label="Type" required><Select name="entry_type" defaultValue={Number(f?.net_paid ?? 0) > 0 ? "partial" : "advance"}><option value="advance">Advance</option><option value="partial">Partial payment</option><option value="full">Full / final payment</option><option value="refund">Refund to guest</option></Select></Field>
              <Field name="amount" label="Amount (₹)" required hint={f && Number(f.balance_due) > 0 ? `Balance due ${inr(f.balance_due)}` : undefined}><Input name="amount" inputMode="decimal" defaultValue={f && Number(f.balance_due) > 0 ? String(f.balance_due) : ""} /></Field>
              <Field name="method" label="Method" required><Select name="method" defaultValue="upi"><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="ota_collection">OTA collection</option><option value="cheque">Cheque</option><option value="other">Other</option></Select></Field>
              <Field name="collected_by" label="Collected by" required><Select name="collected_by" defaultValue={b.ota_collects_payment ? "ota" : "property"}><option value="property">Property</option><option value="stayra">STAYRA</option><option value="ota">OTA</option></Select></Field>
              <Field name="paid_at" label="Date" required><Input type="date" name="paid_at" defaultValue={t} max={t} /></Field>
              <Field name="reference" label="Reference / UTR"><Input name="reference" /></Field>
              <Field name="receipt" label="Receipt (optional)"><Input type="file" name="receipt" accept="image/*,application/pdf" className="py-1.5" /></Field>
              <Field name="reduces_revenue" label="For refunds">
                <Select name="reduces_revenue" defaultValue="false"><option value="false">Only returns cash</option><option value="true">Also reduces revenue (creates adjustment)</option></Select></Field>
              <Field name="notes" label="Notes" className="sm:col-span-2"><Input name="notes" /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save entry</SubmitButton></div></ActionForm></Modal>)} />
        {d.ledger.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">No payments recorded yet.</p> : (
          <Table><THead><tr><Th>Date</Th><Th>Type</Th><Th>Method</Th><Th>Collected by</Th><Th>Reference</Th><Th>Received by</Th><Th className="text-right">Amount</Th><Th /></tr></THead>
            <tbody>{d.ledger.map((p) => {
              const sign = p.entry_type === "refund" || (p.entry_type === "reversal" && p.orig_type !== "refund") ? "−" : "+";
              return (
                <Tr key={p.id} className={p.reversed ? "opacity-50" : ""}>
                  <Td className="whitespace-nowrap">{fdate(p.paid_at)}</Td><Td><Badge tone={p.entry_type === "refund" ? "orange" : p.entry_type === "reversal" ? "gray" : "green"}>{titleCase(p.entry_type)}</Badge>{p.reversed && <span className="text-xs text-muted ml-1">(reversed)</span>}</Td>
                  <Td>{titleCase(p.method)}</Td><Td className="capitalize">{p.collected_by}</Td><Td className="text-xs">{p.reference ?? p.notes ?? "—"}{p.document_id && <a href={`/api/files/${p.document_id}`} target="_blank" className="ml-2 text-brand-700"><I.Paperclip className="inline size-3.5" /></a>}</Td>
                  <Td className="text-xs text-muted">{p.received_by ?? "—"}</Td>
                  <Td className={`text-right tabular font-medium ${sign === "−" ? "text-red-700" : ""}`}>{sign} {inr(p.amount)}</Td>
                  <Td className="text-right">{can.manageFinance(u.role) && p.entry_type !== "reversal" && !p.reversed &&
                    <ConfirmAction action={reversePayment} hidden={{ payment_id: p.id, booking_id: id }} reason="Why is this entry wrong?" label="Reverse" title="Reverse this ledger entry?" description="A reversal entry is added; the original stays in the ledger for audit." variant="ghost" />}</Td>
                </Tr>);
            })}</tbody></Table>)}
      </Card>}
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : ""}`}><span className={strong ? "" : "text-muted"}>{k}</span><span className="tabular">{v}</span></div>;
}
