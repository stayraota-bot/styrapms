import Link from "next/link";
import { randomUUID } from "crypto";
import { Plus, ArrowDownToLine, Paperclip, Download } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, inr, todayIST, titleCase } from "@/lib/format";
import { resolveRange } from "@/server/analytics";
import { propertyOptions, sp1, uuidParam } from "@/server/common";
import { Card, PageHeader, Button, Table, THead, Th, Td, Tr, StatusBadge, EmptyState, Input, Select, Textarea, Stat, LinkButton, Tabs } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { PeriodFilter } from "@/components/filters";
import { addIncome, voidIncome, markCollected } from "./actions";

export const metadata = { title: "Income" };
export default async function IncomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "auditor"]);
  const sp = await searchParams;
  const r = resolveRange({ range: sp.range, from: sp.from, to: sp.to });
  const pid = uuidParam(sp.property);
  const cat = uuidParam(sp.category);
  const coll = sp1(sp.collection) ?? "";
  const t = todayIST();
  const d = await withUser(u.id, async (tx) => {
    const rows = await tx`select i.*, c.name category, p.name prop, b.booking_code from income i join income_categories c on c.id = i.category_id join properties p on p.id = i.property_id
      left join bookings b on b.id = i.booking_id
      where i.txn_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or i.property_id = ${pid}::uuid) and (${cat}::uuid is null or i.category_id = ${cat}::uuid)
        and (${coll} = '' or (${coll} = 'void' and i.status = 'void') or (i.status = 'active' and i.collection_status::text = ${coll}))
      order by i.txn_date desc, i.created_at desc limit 300`;
    const [sum] = await tx<{ earned: string; collected: string; receivable: string; room: string; cash: string; guest_due: string; ota_pending: string }[]>`
      select
        (select coalesce(sum(amount),0) from income where status = 'active' and txn_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) earned,
        (select coalesce(sum(amount),0) from income where status = 'active' and booking_id is null and collection_status = 'collected' and txn_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) collected,
        (select coalesce(sum(amount),0) from income where status = 'active' and booking_id is null and collection_status = 'receivable' and (${pid}::uuid is null or property_id = ${pid}::uuid)) receivable,
        (select coalesce(sum(room_amount - discount + cancellation_charge * 0),0) from bookings where status = 'checked_out' and check_out between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) room,
        (select coalesce(sum(case when entry_type in ('advance','partial','full') then amount when entry_type = 'refund' then -amount else 0 end),0) from booking_payments
           where collected_by <> 'ota' and paid_at::date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) cash,
        (select coalesce(sum(f.balance_due),0) from booking_financials f join bookings b on b.id = f.booking_id where f.balance_due > 0 and b.status in ('checked_in','checked_out') and (${pid}::uuid is null or b.property_id = ${pid}::uuid)) guest_due,
        (select coalesce(sum(amount),0) from booking_payments where collected_by = 'ota' and entry_type in ('advance','partial','full') and paid_at::date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) ota_pending`;
    return { rows, sum, props: await propertyOptions(tx), cats: await tx<{ id: string; name: string }[]>`select id, name from income_categories where is_active order by sort_order` };
  });
  const canAdd = can.addIncome(u.role);
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ range: r.key, from: r.from, to: r.to, property: pid ?? "", category: cat ?? "", collection: coll, ...o }).filter(([, v]) => v)).toString();
  return (
    <>
      <PageHeader title="Income" description="Room revenue comes from bookings automatically. Record food, laundry, activities and other income here."
        actions={<>
          <LinkButton href={`/api/export/income${qs({})}`} variant="secondary"><Download />Export</LinkButton>
          {canAdd && <Modal title="Add income" wide defaultOpen={sp.new === "1"} trigger={<Button><Plus />Add Income</Button>}>
            <ActionForm action={addIncome} className="grid sm:grid-cols-2 gap-4" resetOnSuccess>
              <input type="hidden" name="idem" value={randomUUID()} />
              <Field name="property_id" label="Property" required><Select name="property_id" defaultValue={pid ?? ""}><option value="">Select…</option>{d.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field name="booking_code" label="Booking ID (optional)" hint="e.g. BK-001234 — adds to the guest folio"><Input name="booking_code" className="uppercase" /></Field>
              <Field name="category_id" label="Category" required><Select name="category_id">{d.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field name="amount" label="Amount (₹)" required><Input name="amount" inputMode="decimal" /></Field>
              <Field name="description" label="Description" required className="sm:col-span-2"><Input name="description" /></Field>
              <Field name="txn_date" label="Date" required><Input type="date" name="txn_date" defaultValue={t} max={t} /></Field>
              <Field name="collection_status" label="Status" required><Select name="collection_status"><option value="collected">Collected</option><option value="receivable">Receivable (not yet collected)</option></Select></Field>
              <Field name="payment_mode" label="Payment mode" required><Select name="payment_mode"><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="ota_collection">OTA collection</option><option value="cheque">Cheque</option><option value="other">Other</option></Select></Field>
              <Field name="payment_reference" label="Payment reference"><Input name="payment_reference" /></Field>
              <Field name="received_by" label="Received by"><Input name="received_by" placeholder={u.fullName} /></Field>
              <Field name="receipt" label="Receipt upload"><Input type="file" name="receipt" accept="image/*,application/pdf" className="py-1.5" /></Field>
              <Field name="notes" label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save income</SubmitButton></div>
            </ActionForm></Modal>}
        </>} />
      <div className="mb-4"><PeriodFilter range={r.key} from={r.from} to={r.to} property={pid ?? ""} properties={d.props}
        extra={<Select name="category" defaultValue={cat ?? ""} className="w-auto"><option value="">All categories</option>{d.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Revenue earned" value={inr(Number(d.sum.room) + Number(d.sum.earned))} sub={`Rooms ${inr(d.sum.room)} + other ${inr(d.sum.earned)}`} />
        <Stat label="Revenue collected (cash in)" value={inr(Number(d.sum.cash) + Number(d.sum.collected))} sub="Guest payments + collected income" />
        <Stat label="Revenue receivable" value={inr(Number(d.sum.guest_due) + Number(d.sum.receivable))} tone="warn" sub="Guest balances + receivable income" href="/bookings?payment=outstanding" />
        <Stat label="Collected by OTAs" value={inr(d.sum.ota_pending)} sub="Only counted once recorded" />
      </div>
      <Tabs active={coll || "all"} tabs={[{ key: "all", label: "All", href: qs({ collection: "" }) }, { key: "collected", label: "Collected", href: qs({ collection: "collected" }) }, { key: "receivable", label: "Receivable", href: qs({ collection: "receivable" }) }, { key: "void", label: "Voided", href: qs({ collection: "void" }) }]} />
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={<ArrowDownToLine />} title="No income in this period" description="Food, laundry, activities and other income will appear here." /> : (
          <Table><THead><tr><Th>Date</Th><Th>Transaction</Th><Th>Property</Th><Th>Category</Th><Th>Description</Th><Th>Mode</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>{d.rows.map((i) => (
              <Tr key={i.id} className={i.status === "void" ? "opacity-50" : ""}>
                <Td className="whitespace-nowrap">{fdate(i.txn_date)}</Td>
                <Td className="whitespace-nowrap"><span className="font-medium">{i.txn_code}</span>{i.booking_code && <Link href={`/bookings/${i.booking_id}`} className="block text-xs text-brand-700 hover:underline">{i.booking_code}</Link>}</Td>
                <Td>{i.prop.replace("STAYRA ", "")}</Td><Td>{i.category}</Td>
                <Td className="max-w-56 truncate" title={i.void_reason ?? i.description}>{i.description}{i.document_id && <a href={`/api/files/${i.document_id}`} target="_blank" className="ml-1 text-brand-700"><Paperclip className="inline size-3.5" /></a>}</Td>
                <Td className="text-xs">{titleCase(i.payment_mode)}</Td>
                <Td className="text-right tabular font-medium">{inr(i.amount)}</Td>
                <Td>{i.status === "void" ? <StatusBadge status="void" /> : i.booking_id ? <StatusBadge status="collected" label="On folio" /> : <StatusBadge status={i.collection_status} />}</Td>
                <Td className="text-right whitespace-nowrap">{i.status === "active" && can.manageFinance(u.role) && <>
                  {i.collection_status === "receivable" && !i.booking_id && <ConfirmAction action={markCollected} hidden={{ id: i.id }} label="Collected" title="Mark as collected?" variant="ghost" />}
                  <ConfirmAction action={voidIncome} hidden={{ id: i.id }} reason="Reason for voiding" label="Void" title={`Void ${i.txn_code}?`} description="The record stays visible for audit but is excluded from all totals." variant="ghost" confirmLabel="Void" />
                </>}</Td>
              </Tr>))}</tbody></Table>)}
      </Card>
    </>
  );
}
