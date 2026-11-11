import Link from "next/link";
import * as I from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { inr0, inrShort, n, todayIST, fdate } from "@/lib/format";
import { resolveRange, propertyPL, sumPL, monthlySeries } from "@/server/analytics";
import { getAlerts } from "@/server/alerts";
import { propertyOptions, uuidParam, sp1 } from "@/server/common";
import { Card, CardHeader, CardBody, Stat, PageHeader, LinkButton, Badge, EmptyState, cn } from "@/components/ui/core";
import { PeriodFilter } from "@/components/filters";
import { RevenueExpenseChart, NetLineChart, OccupancyChart, PropertyBarChart, Donut, SimpleBars } from "@/components/charts";
import { SOURCE_LABEL } from "@/lib/format";
import { AlertsPanel } from "@/components/alerts-panel";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const r = resolveRange({ range: sp1(sp.range), from: sp1(sp.from), to: sp1(sp.to) });
  const pid = uuidParam(sp.property);
  const fin = can.viewFinance(user.role);
  const t = todayIST();
  const q = `range=${r.key}&from=${r.from}&to=${r.to}${pid ? `&property=${pid}` : ""}`;

  const data = await withUser(user.id, async (tx) => {
    const props = await propertyOptions(tx);
    const [ops] = await tx<{ active: number; units: number; bookings: number; arrivals: number; departures: number; occupied: number; in_house: number; hk: number; tickets: number }[]>`
      select (select count(*)::int from properties where status = 'active' and (${pid}::uuid is null or id = ${pid}::uuid)) active,
        (select count(*)::int from property_units u join properties p on p.id = u.property_id where u.is_active and p.status = 'active' and (${pid}::uuid is null or p.id = ${pid}::uuid)) units,
        (select count(*)::int from bookings where status not in ('cancelled','no_show') and check_in between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) bookings,
        (select count(*)::int from bookings where status in ('confirmed','pending','checked_in') and check_in = ${t}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) arrivals,
        (select count(*)::int from bookings where status in ('checked_in','checked_out','confirmed') and check_out = ${t}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) departures,
        (select count(distinct unit_id)::int from bookings where status in ('confirmed','checked_in') and check_in <= ${t}::date and check_out > ${t}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) occupied,
        (select count(*)::int from bookings where status = 'checked_in' and (${pid}::uuid is null or property_id = ${pid}::uuid)) in_house,
        (select count(*)::int from housekeeping_tasks where status in ('pending','assigned','in_progress') and due_date <= ${t}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)) hk,
        (select count(*)::int from maintenance_tickets where status in ('open','assigned','in_progress') and (${pid}::uuid is null or property_id = ${pid}::uuid)) tickets`;
    if (!fin) return { props, ops, alerts: await getAlerts(tx, { propertyId: pid, withFinance: false }) };
    const pl = await propertyPL(tx, r.from, r.to, pid);
    const series = await monthlySeries(tx, 6, pid);
    const [money] = await tx<{ owner_payable: string; guest_outstanding: string; pending_n: number; pending_amt: string }[]>`
      select (select coalesce(sum(owner_share - owner_borne_recoveries - payments_made), 0) from settlements where status in ('approved','partially_paid') and (${pid}::uuid is null or property_id = ${pid}::uuid)) owner_payable,
        (select coalesce(sum(f.balance_due), 0) from booking_financials f join bookings b on b.id = f.booking_id
           where f.balance_due > 0 and b.status in ('checked_in','checked_out','confirmed') and b.check_in <= ${t}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid)) guest_outstanding,
        (select count(*)::int from expenses where status = 'active' and approval_status = 'pending' and (${pid}::uuid is null or property_id = ${pid}::uuid)) pending_n,
        (select coalesce(sum(total_amount), 0) from expenses where status = 'active' and approval_status = 'pending' and (${pid}::uuid is null or property_id = ${pid}::uuid)) pending_amt`;
    const sources = await tx<{ source: string; amount: string; n: number }[]>`
      select source::text, sum(room_amount - discount) amount, count(*)::int n from bookings
      where status not in ('cancelled','no_show') and check_in between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)
      group by 1 order by 2 desc`;
    const aging = await tx<{ bucket: string; amount: string }[]>`
      select bucket, sum(balance_due) amount from (
        select f.balance_due, case when b.check_in > ${t}::date then 'Upcoming' when ${t}::date - b.check_out <= 0 then 'In-house'
          when ${t}::date - b.check_out <= 7 then '1–7 days' when ${t}::date - b.check_out <= 30 then '8–30 days' else '30+ days' end bucket
        from booking_financials f join bookings b on b.id = f.booking_id
        where f.balance_due > 0 and b.status in ('confirmed','checked_in','checked_out') and b.check_in <= ${t}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid)) x
      group by bucket`;
    return { props, ops, pl, series, money, sources, aging, alerts: await getAlerts(tx, { propertyId: pid, withFinance: true }) };
  });

  const { ops, alerts } = data;
  const occ = ops.units ? Math.round((100 * ops.occupied) / ops.units) : 0;
  const tot = "pl" in data && data.pl ? sumPL(data.pl) : null;

  return (
    <>
      <PageHeader title={`Good ${greeting()}, ${user.fullName.split(" ")[0]}`} description={`Overview of ${pid ? data.props.find((p) => p.id === pid)?.name : "all properties"} · ${r.label}`}
        actions={<PeriodFilter range={r.key} from={r.from} to={r.to} property={pid ?? ""} properties={data.props} />} />

      <QuickActions role={user.role} />

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-4">
        <Stat label="Active properties" value={n(ops.active)} href="/properties" icon={<I.Building2 />} />
        <Stat label="Rooms / units" value={n(ops.units)} href="/properties" icon={<I.BedDouble />} />
        <Stat label="Bookings (arrivals in period)" value={n(ops.bookings)} href={`/bookings?from=${r.from}&to=${r.to}${pid ? `&property=${pid}` : ""}`} icon={<I.BookOpenCheck />} />
        <Stat label="Today's check-ins" value={n(ops.arrivals)} href={`/bookings?view=arrivals${pid ? `&property=${pid}` : ""}`} icon={<I.LogIn />} sub={fdate(t)} />
        <Stat label="Today's check-outs" value={n(ops.departures)} href={`/bookings?view=departures${pid ? `&property=${pid}` : ""}`} icon={<I.LogOut />} sub={`${ops.in_house} guests in-house`} />
        <Stat label="Current occupancy" value={`${occ}%`} href={`/calendar${pid ? `?property=${pid}` : ""}`} icon={<I.Gauge />} sub={`${ops.occupied} of ${ops.units} occupied tonight`} />
      </section>

      {tot && "money" in data && data.money && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Stat label="Booking revenue (completed stays)" value={inr0(tot.booking_revenue + tot.cancellation_income)} href={`/reports?tab=pl&${q}`} icon={<I.IndianRupee />} sub={`${tot.stays} stays · excl. GST`} />
          <Stat label="Additional income" value={inr0(tot.additional_income)} href={`/income?${q}`} icon={<I.UtensilsCrossed />} sub="F&B, laundry, activities…" />
          <Stat label="Expenses (deductible)" value={inr0(tot.deductible_expenses + tot.expense_adjustments)} href={`/expenses?${q}`} icon={<I.Receipt />} sub={`${inr0(tot.total_expenses)} total recorded`} />
          <Stat label="Net distributable revenue" value={inr0(tot.net_distributable)} href={`/reports?tab=pl&${q}`} icon={<I.Scale />} tone="brand" sub="Revenue − approved deductible expenses" />
          <Stat label="STAYRA earnings" value={inr0(tot.stayra_share)} href={`/reports?tab=stayra&${q}`} icon={<I.Landmark />} sub="As per each property's agreement" />
          <Stat label="Owner payables (approved, unpaid)" value={inr0(data.money.owner_payable)} href="/settlements?status=outstanding" icon={<I.HandCoins />} sub={`${inr0(tot.owner_share)} owner entitlement this period`} />
          <Stat label="Outstanding guest payments" value={inr0(data.money.guest_outstanding)} href="/bookings?payment=outstanding" icon={<I.Wallet />} tone={Number(data.money.guest_outstanding) > 0 ? "warn" : "default"} sub="Arrived / in-house / departed" />
          <Stat label="Pending expense approvals" value={n(data.money.pending_n)} href="/expenses?approval=pending" icon={<I.ClipboardCheck />} tone={data.money.pending_n ? "warn" : "default"} sub={`${inr0(data.money.pending_amt)} awaiting review`} />
        </section>
      )}

      <div className="grid xl:grid-cols-3 gap-4 sm:gap-6">
        <div className="xl:col-span-2 space-y-4 sm:space-y-6">
          {"series" in data && data.series ? (
            <>
              <Card><CardHeader title="Revenue vs expenses" description="Last 6 months · earned basis" /><CardBody>
                <RevenueExpenseChart data={data.series.map((s) => ({ month: s.month, revenue: Number(s.revenue), expenses: Number(s.expenses) }))} /></CardBody></Card>
              <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                <Card><CardHeader title="Monthly net revenue" description="Net distributable and STAYRA share" /><CardBody>
                  <NetLineChart data={data.series.map((s) => ({ month: s.month, net: Number(s.net), stayra: Number(s.stayra) }))} /></CardBody></Card>
                <Card><CardHeader title="Occupancy trend" description="Room-nights sold ÷ available" /><CardBody>
                  <OccupancyChart data={data.series.map((s) => ({ month: s.month, occupancy: Number(s.occupancy) }))} /></CardBody></Card>
              </div>
              <Card><CardHeader title="Property-wise performance" description={r.label} action={<Link href={`/reports?tab=compare&${q}`} className="text-xs text-brand-700 hover:underline">Compare →</Link>} /><CardBody>
                {data.pl!.length ? <PropertyBarChart data={data.pl!.map((p) => ({ name: p.name.replace("STAYRA ", ""), revenue: Number(p.gross_revenue), net: Number(p.net_distributable) }))} />
                  : <EmptyState title="No properties yet" />}</CardBody></Card>
              <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                <Card><CardHeader title="Booking source breakdown" description="Room revenue by channel" /><CardBody>
                  {data.sources!.length ? <Donut data={data.sources!.slice(0, 6).map((s) => ({ name: SOURCE_LABEL[s.source] ?? s.source, value: Number(s.amount) }))} />
                    : <EmptyState title="No bookings in this period" />}</CardBody></Card>
                <Card><CardHeader title="Outstanding guest payments" description="By age since check-out" /><CardBody>
                  <SimpleBars color="#b5654a" data={["In-house", "1–7 days", "8–30 days", "30+ days"].map((b) => ({ name: b, value: Number(data.aging!.find((a) => a.bucket === b)?.amount ?? 0) }))} /></CardBody></Card>
              </div>
            </>
          ) : (
            <Card><CardHeader title="Today at a glance" /><CardBody className="grid sm:grid-cols-3 gap-4">
              <Stat label="Pending housekeeping" value={n(ops.hk)} href="/housekeeping" icon={<I.Sparkles />} />
              <Stat label="Open maintenance tickets" value={n(ops.tickets)} href="/maintenance" icon={<I.Wrench />} />
              <Stat label="Guests in-house" value={n(ops.in_house)} href={can.viewBookings(user.role) ? "/bookings?status=checked_in" : "/housekeeping"} icon={<I.Users />} />
            </CardBody></Card>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6">
          {tot && (
            <Card><CardHeader title="Revenue split" description={`${r.label} · after deductible expenses`} /><CardBody>
              <Donut data={[{ name: "Owner share", value: Math.max(0, tot.owner_share) }, { name: "STAYRA share", value: Math.max(0, tot.stayra_share) }]}
                colors={["#7cb396", "#1b4b37"]} center={inrShort(tot.net_distributable)} centerLabel="Net distributable" />
            </CardBody></Card>
          )}
          <AlertsPanel alerts={alerts} />
        </div>
      </div>
    </>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function QuickActions({ role }: { role: Parameters<typeof can.addProperty>[0] }) {
  const acts = [
    can.addProperty(role) && { href: "/properties/new", label: "Add Property", icon: <I.Building2 /> },
    can.manageBookings(role) && { href: "/bookings/new", label: "Add Booking", icon: <I.CalendarPlus /> },
    can.addExpense(role) && { href: "/expenses/new", label: "Add Expense", icon: <I.Receipt /> },
    can.addIncome(role) && { href: "/income?new=1", label: "Add Income", icon: <I.ArrowDownToLine /> },
    can.recordGuestPayment(role) && { href: "/bookings?payment=outstanding", label: "Add Payment", icon: <I.Wallet /> },
    can.blockDates(role) && { href: "/calendar?block=1", label: "Block Dates", icon: <I.CalendarX2 /> },
    can.maintenance(role) && { href: "/maintenance?new=1", label: "Maintenance Ticket", icon: <I.Wrench /> },
    can.generateSettlement(role) && { href: "/settlements?new=1", label: "Generate Settlement", icon: <I.HandCoins /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];
  if (!acts.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 mb-5 -mx-1 px-1">
      {acts.map((a) => <LinkButton key={a.href} href={a.href} variant="secondary" size="sm" className="shrink-0">{a.icon}{a.label}</LinkButton>)}
    </div>
  );
}

