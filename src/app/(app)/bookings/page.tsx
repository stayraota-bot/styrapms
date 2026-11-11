import Link from "next/link";
import { Plus, BookOpen, Download } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, inr, todayIST, SOURCE_LABEL, addDays } from "@/lib/format";
import { propertyOptions, sp1, uuidParam } from "@/server/common";
import { Card, PageHeader, LinkButton, Table, THead, Th, Td, Tr, StatusBadge, EmptyState, Select, Input, Tabs, DemoBadge } from "@/components/ui/core";
import { AutoSubmit } from "@/components/ui/forms";

export const metadata = { title: "Bookings" };
const PAGE = 50;
type Row = { id: string; booking_code: string; guest: string; phone: string | null; prop: string; unit: string; check_in: string; check_out: string; nights: number; source: string; status: string;
  total_amount: string; amount_due: string; net_paid: string; balance_due: string; payment_status: string; is_demo: boolean };

export default async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "operations", "auditor"]);
  const sp = await searchParams;
  const t = todayIST();
  const view = sp1(sp.view) ?? "all";
  const pid = uuidParam(sp.property);
  const status = sp1(sp.status) ?? "";
  const source = sp1(sp.source) ?? "";
  const payment = sp1(sp.payment) ?? "";
  const q = (sp1(sp.q) ?? "").slice(0, 60);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const fin = can.viewFinance(u.role);

  const { rows, total, props } = await withUser(u.id, async (tx) => {
    const where = tx`
      (${pid}::uuid is null or b.property_id = ${pid}::uuid)
      and (${status} = '' or b.status::text = ${status})
      and (${source} = '' or b.source::text = ${source})
      and (${from} = '' or b.check_in >= ${from || t}::date) and (${to} = '' or b.check_in <= ${to || t}::date)
      and (${q} = '' or b.booking_code ilike ${"%" + q + "%"} or g.full_name ilike ${"%" + q + "%"} or g.phone ilike ${"%" + q + "%"} or b.source_reference ilike ${"%" + q + "%"})
      and (case ${view} when 'arrivals' then b.check_in = ${t}::date and b.status in ('confirmed','pending','checked_in')
                        when 'departures' then b.check_out = ${t}::date and b.status in ('checked_in','checked_out','confirmed')
                        when 'inhouse' then b.status = 'checked_in'
                        when 'upcoming' then b.check_in > ${t}::date and b.check_in <= ${addDays(t, 7)}::date and b.status in ('confirmed','pending')
                        else true end)
      and (${payment} = '' or (${payment} = 'outstanding' and f.balance_due > 0 and b.check_in <= ${t}::date and b.status in ('confirmed','checked_in','checked_out')))`;
    const rows = await tx<Row[]>`
      select b.id, b.booking_code, g.full_name guest, g.phone, p.name prop, un.name unit, b.check_in, b.check_out, b.nights, b.source::text, b.status::text, b.is_demo,
        b.total_amount, f.amount_due, f.net_paid, f.balance_due, f.payment_status
      from bookings b join guests g on g.id = b.guest_id join properties p on p.id = b.property_id join property_units un on un.id = b.unit_id
      join booking_financials f on f.booking_id = b.id
      where ${where}
      order by ${view === "all" && !payment && !from ? tx`b.check_in < ${t}::date, case when b.check_in >= ${t}::date then b.check_in end asc, b.check_in desc` : tx`b.check_in asc`}, b.booking_code limit ${PAGE} offset ${(page - 1) * PAGE}`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int n from bookings b join guests g on g.id = b.guest_id join booking_financials f on f.booking_id = b.id where ${where}`;
    return { rows, total: n, props: await propertyOptions(tx) };
  });
  const qs = (o: Record<string, string | number>) => "?" + new URLSearchParams(Object.entries({ view, property: pid ?? "", status, source, payment, q, from, to, ...o }).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, String(v)])).toString();
  const pages = Math.ceil(total / PAGE);
  return (
    <>
      <PageHeader title="Bookings" description={`${total} booking${total === 1 ? "" : "s"}${payment === "outstanding" ? " with outstanding guest balance" : ""}`}
        actions={<>
          {fin && <LinkButton href={`/api/export/bookings${qs({})}`} variant="secondary"><Download />Export</LinkButton>}
          {can.manageBookings(u.role) && <LinkButton href={`/bookings/new${pid ? `?property=${pid}` : ""}`}><Plus />Add Booking</LinkButton>}
        </>} />
      <Tabs active={payment ? "outstanding" : view} tabs={[
        { key: "all", label: "All", href: qs({ view: "all", payment: "", page: 1 }) },
        { key: "arrivals", label: "Today's arrivals", href: qs({ view: "arrivals", payment: "", page: 1 }) },
        { key: "departures", label: "Today's departures", href: qs({ view: "departures", payment: "", page: 1 }) },
        { key: "inhouse", label: "In-house", href: qs({ view: "inhouse", payment: "", page: 1 }) },
        { key: "upcoming", label: "Next 7 days", href: qs({ view: "upcoming", payment: "", page: 1 }) },
        ...(fin ? [{ key: "outstanding", label: "Outstanding payments", href: qs({ view: "all", payment: "outstanding", page: 1 }) }] : []),
      ]} />
      <AutoSubmit className="flex flex-wrap gap-2 mb-4">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="payment" value={payment} />
        <Input type="search" name="q" defaultValue={q} placeholder="Guest, phone, booking or OTA ref…" className="w-full sm:w-72" />
        {props.length > 1 && <Select name="property" defaultValue={pid ?? ""} className="w-auto"><option value="">All properties</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
        <Select name="status" defaultValue={status} className="w-auto"><option value="">Any status</option>{["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select>
        <Select name="source" defaultValue={source} className="w-auto"><option value="">Any source</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="Check-in from" title="Check-in from" />
        <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="Check-in to" title="Check-in to" />
      </AutoSubmit>

      <Card>
        {rows.length === 0 ? <EmptyState icon={<BookOpen />} title="No bookings match" description="Adjust the filters or add a booking." action={can.manageBookings(u.role) && <LinkButton href="/bookings/new"><Plus />Add Booking</LinkButton>} /> : (
          <>
            <div className="hidden md:block"><Table>
              <THead><tr><Th>Booking</Th><Th>Guest</Th><Th>Property / Room</Th><Th>Stay</Th><Th>Source</Th>{fin && <><Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Balance</Th><Th>Payment</Th></>}<Th>Status</Th></tr></THead>
              <tbody>{rows.map((r) => (
                <Tr key={r.id}>
                  <Td><Link href={`/bookings/${r.id}`} className="font-medium text-brand-700 hover:underline whitespace-nowrap">{r.booking_code}</Link> <DemoBadge show={r.is_demo} /></Td>
                  <Td><div className="font-medium">{r.guest}</div><div className="text-xs text-muted">{r.phone}</div></Td>
                  <Td><div>{r.prop.replace("STAYRA ", "")}</div><div className="text-xs text-muted">{r.unit}</div></Td>
                  <Td className="whitespace-nowrap">{fdate(r.check_in, false)} → {fdate(r.check_out, false)}<div className="text-xs text-muted">{r.nights} night{r.nights > 1 ? "s" : ""}</div></Td>
                  <Td>{SOURCE_LABEL[r.source]}</Td>
                  {fin && <><Td className="text-right tabular">{inr(r.amount_due)}</Td><Td className="text-right tabular">{inr(r.net_paid)}</Td>
                    <Td className={`text-right tabular ${Number(r.balance_due) > 0 ? "text-red-700 font-medium" : ""}`}>{inr(r.balance_due)}</Td><Td><StatusBadge status={r.payment_status} /></Td></>}
                  <Td><StatusBadge status={r.status} /></Td>
                </Tr>))}</tbody>
            </Table></div>
            <ul className="md:hidden divide-y divide-line">{rows.map((r) => (
              <li key={r.id}><Link href={`/bookings/${r.id}`} className="block px-4 py-3 active:bg-brand-50">
                <div className="flex justify-between gap-2"><span className="font-medium">{r.guest}</span><StatusBadge status={r.status} /></div>
                <div className="text-xs text-muted mt-0.5">{r.booking_code} · {r.prop.replace("STAYRA ", "")} · {r.unit}</div>
                <div className="flex justify-between text-sm mt-1"><span>{fdate(r.check_in, false)} → {fdate(r.check_out, false)}</span>
                  {fin && <span className={Number(r.balance_due) > 0 ? "text-red-700 font-medium tabular" : "text-muted tabular"}>{Number(r.balance_due) > 0 ? `Due ${inr(r.balance_due)}` : "Paid"}</span>}</div>
              </Link></li>))}</ul>
          </>
        )}
      </Card>
      {pages > 1 && <div className="flex items-center justify-between mt-4 text-sm"><span className="text-muted">Page {page} of {pages}</span><div className="flex gap-2">
        {page > 1 && <LinkButton variant="secondary" size="sm" href={qs({ page: page - 1 })}>← Previous</LinkButton>}
        {page < pages && <LinkButton variant="secondary" size="sm" href={qs({ page: page + 1 })}>Next →</LinkButton>}</div></div>}
    </>
  );
}
