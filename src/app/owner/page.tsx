import Link from "next/link";
import { Download, Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdate, inr, inr0, monthBounds, todayIST, titleCase } from "@/lib/format";
import { propertyPL, monthlySeries, resolveRange } from "@/server/analytics";
import { Card, CardHeader, CardBody, PageHeader, Stat, Table, THead, Th, Td, Tr, StatusBadge, LinkButton, EmptyState, Badge } from "@/components/ui/core";
import { RevenueExpenseChart, Donut } from "@/components/charts";

export const metadata = { title: "Owner portal" };
export default async function OwnerHome() {
  const u = await requireUser();
  const t = todayIST();
  const fy = resolveRange({ range: "this_year" });
  const { start, end } = monthBounds(t);
  const d = await withUser(u.id, async (tx) => ({
    props: await tx`select p.id, p.name, p.city, p.category::text, a.stayra_pct, a.owner_pct, (select count(*)::int from property_units x where x.property_id = p.id and x.is_active) units
      from properties p left join lateral (select stayra_pct, owner_pct from revenue_share_agreements r where r.property_id = p.id and r.effective_from <= current_date order by effective_from desc limit 1) a on true
      where p.status <> 'archived' order by p.name`,
    month: await propertyPL(tx, start, end),
    ytd: await propertyPL(tx, fy.from, fy.to),
    series: await monthlySeries(tx, 6),
    statements: await tx`select s.id, s.settlement_code, p.name prop, s.period_start, s.period_end, s.status::text, s.net_distributable, s.owner_share, s.owner_borne_recoveries, s.payments_made, s.final_payable
      from settlements s join properties p on p.id = s.property_id order by s.period_end desc limit 24`,
    payments: await tx`select sp.paid_on, sp.amount, sp.method::text, sp.reference, s.settlement_code from settlement_payments sp join settlements s on s.id = sp.settlement_id order by sp.paid_on desc limit 12`,
    bookings: await tx`select b.booking_code, p.name prop, split_part(g.full_name, ' ', 1) guest, b.check_in, b.check_out, b.nights, b.source::text, b.status::text, b.room_amount - b.discount net
      from bookings b join properties p on p.id = b.property_id join guests g on g.id = b.guest_id where b.check_in >= ${start}::date - 30 and b.status <> 'cancelled' order by b.check_in desc limit 15`,
    expenses: await tx`select c.group_name, sum(al.amount) amt from expenses e join expense_allocations al on al.expense_id = e.id join expense_categories c on c.id = e.category_id
      where e.status = 'active' and e.approval_status = 'approved' and e.bearer = 'pool' and e.is_deductible and e.bill_date between ${fy.from}::date and ${fy.to}::date group by 1`,
  }));
  const sum = (rows: typeof d.month, k: string) => rows.reduce((a, r) => a + Number((r as unknown as Record<string, string>)[k] ?? 0), 0);
  const entitled = d.statements.filter((s) => s.status !== "draft").reduce((a, s) => a + Number(s.owner_share) - Number(s.owner_borne_recoveries), 0);
  const received = d.statements.reduce((a, s) => a + Number(s.payments_made), 0);
  return (
    <>
      <PageHeader title={`Welcome, ${u.fullName.split(" ")[0]}`} description="Performance, revenue sharing and settlements for your properties. Figures are read-only." />
      {d.props.length === 0 ? <Card><EmptyState icon={<Building2 />} title="No properties linked yet" description="Contact STAYRA to link your properties." /></Card> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Revenue this month" value={inr0(sum(d.month, "gross_revenue"))} sub={`Occupancy ${sum(d.month, "available_nights") ? Math.round(100 * sum(d.month, "nights_sold") / sum(d.month, "available_nights")) : 0}%`} />
        <Stat label="Your share this month (accrued)" value={inr0(sum(d.month, "owner_share"))} sub="Before settlement approval" />
        <Stat label="Payments received (all time)" value={inr0(received)} sub={`of ${inr0(entitled)} approved entitlement`} />
        <Stat label="Currently payable to you" value={inr0(entitled - received)} tone="brand" />
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">{d.props.map((p) => { const m = d.month.find((x) => x.property_id === p.id); const y = d.ytd.find((x) => x.property_id === p.id); return (
        <Card key={p.id}><CardHeader title={p.name} description={`${p.city} · ${titleCase(p.category)} · ${p.units} rooms`} action={<Badge tone="green">You {Number(p.owner_pct)}% · STAYRA {Number(p.stayra_pct)}%</Badge>} />
          <CardBody className="text-sm space-y-1.5">
            <p className="flex justify-between"><span className="text-muted">This month revenue</span><span className="tabular">{inr(m?.gross_revenue)}</span></p>
            <p className="flex justify-between"><span className="text-muted">Eligible expenses</span><span className="tabular">− {inr(Number(m?.deductible_expenses ?? 0) + Number(m?.expense_adjustments ?? 0))}</span></p>
            <p className="flex justify-between font-medium"><span>Net distributable</span><span className="tabular">{inr(m?.net_distributable)}</span></p>
            <p className="flex justify-between"><span className="text-muted">Your share ({Number(p.owner_pct)}%)</span><span className="tabular text-brand-700 font-semibold">{inr(m?.owner_share)}</span></p>
            <p className="flex justify-between text-xs text-muted pt-2 border-t border-line"><span>FY to date: revenue {inr0(y?.gross_revenue)}</span><span>ADR {inr0(m?.adr)}</span></p>
          </CardBody></Card>); })}</div>
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2"><CardHeader title="Revenue vs eligible expenses" description="Last 6 months" /><CardBody><RevenueExpenseChart data={d.series.map((s) => ({ month: s.month, revenue: Number(s.revenue), expenses: Number(s.expenses) }))} /></CardBody></Card>
        <Card><CardHeader title="Eligible expenses (FY)" description="Deducted before sharing" /><CardBody><Donut data={d.expenses.map((e) => ({ name: e.group_name, value: Number(e.amt) }))} /></CardBody></Card>
      </div>
      <Card className="mb-6"><CardHeader title="Settlement statements" description="Approved statements can be downloaded as PDF" />
        {d.statements.length === 0 ? <EmptyState title="No approved statements yet" /> : (
        <Table><THead><tr><Th>Statement</Th><Th>Property</Th><Th>Period</Th><Th className="text-right">Net distributable</Th><Th className="text-right">Your share</Th><Th className="text-right">Paid</Th><Th className="text-right">Payable</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>{d.statements.map((s) => <Tr key={s.id}><Td><Link href={`/owner/settlements/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.settlement_code}</Link></Td><Td>{s.prop.replace("STAYRA ", "")}</Td>
            <Td className="whitespace-nowrap">{fdate(s.period_start, false)} – {fdate(s.period_end)}</Td><Td className="text-right tabular">{inr(s.net_distributable)}</Td><Td className="text-right tabular">{inr(s.owner_share)}</Td>
            <Td className="text-right tabular">{inr(s.payments_made)}</Td><Td className="text-right tabular font-medium">{inr(s.final_payable)}</Td><Td><StatusBadge status={s.status} /></Td>
            <Td><LinkButton href={`/api/settlements/${s.id}/pdf`} size="sm" variant="ghost" prefetch={false}><Download />PDF</LinkButton></Td></Tr>)}</tbody></Table>)}
      </Card>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card><CardHeader title="Payments received" /><Table><THead><tr><Th>Date</Th><Th>Statement</Th><Th>Method</Th><Th className="text-right">Amount</Th></tr></THead>
          <tbody>{d.payments.map((p, i) => <Tr key={i}><Td>{fdate(p.paid_on)}</Td><Td>{p.settlement_code}</Td><Td>{titleCase(p.method)} <span className="text-xs text-muted">{p.reference}</span></Td><Td className="text-right tabular font-medium">{inr(p.amount)}</Td></Tr>)}
            {d.payments.length === 0 && <Tr><Td colSpan={4} className="text-muted">No payments yet</Td></Tr>}</tbody></Table></Card>
        <Card><CardHeader title="Recent bookings" description="Booking performance (guest details withheld)" /><Table><THead><tr><Th>Booking</Th><Th>Stay</Th><Th className="text-right">Room revenue</Th><Th>Status</Th></tr></THead>
          <tbody>{d.bookings.map((b) => <Tr key={b.booking_code}><Td className="text-xs">{b.booking_code}<div className="text-muted">{b.prop.replace("STAYRA ", "")}</div></Td><Td className="text-xs whitespace-nowrap">{fdate(b.check_in, false)} → {fdate(b.check_out, false)} · {b.nights}n</Td>
            <Td className="text-right tabular text-sm">{inr(b.net)}</Td><Td><StatusBadge status={b.status} /></Td></Tr>)}</tbody></Table></Card>
      </div></>}
    </>
  );
}
