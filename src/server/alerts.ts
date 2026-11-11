import "server-only";
import type { Tx } from "@/lib/db";
import { addDays, fdate, todayIST } from "@/lib/format";

export type AlertItem = { severity: "critical" | "warning" | "info"; type: string; title: string; detail: string; href: string; date?: string };

/** Operational & financial risk alerts for the dashboard and calendar (RLS-scoped). */
export async function getAlerts(tx: Tx, opts: { propertyId?: string | null; withFinance: boolean; days?: number }): Promise<AlertItem[]> {
  const t = todayIST();
  const pid = opts.propertyId ?? null;
  const horizon = addDays(t, opts.days ?? 30);
  const out: AlertItem[] = [];

  const conflicts = await tx<{ id: string; booking_code: string; unit: string; prop: string; check_in: string; other: string }[]>`
    select b.id, b.booking_code, u.name unit, p.name prop, b.check_in, o.booking_code other
    from bookings b join bookings o on o.unit_id = b.unit_id and o.id <> b.id and o.status in ('confirmed','checked_in')
      and daterange(o.check_in, o.check_out) && daterange(b.check_in, b.check_out)
    join property_units u on u.id = b.unit_id join properties p on p.id = b.property_id
    where b.status = 'pending' and b.check_out > ${t}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid)
    order by b.check_in limit 20`;
  for (const c of conflicts) out.push({ severity: "critical", type: "Booking conflict", title: `${c.booking_code} overlaps ${c.other}`, detail: `${c.prop} · ${c.unit} · from ${fdate(c.check_in)}`, href: `/bookings/${c.id}`, date: c.check_in });

  const unconfirmed = await tx<{ id: string; booking_code: string; guest: string; prop: string; check_in: string }[]>`
    select b.id, b.booking_code, g.full_name guest, p.name prop, b.check_in from bookings b join guests g on g.id = b.guest_id join properties p on p.id = b.property_id
    where b.status = 'pending' and b.check_in between ${t}::date and ${addDays(t, 7)}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid)
    order by b.check_in limit 20`;
  for (const u of unconfirmed) out.push({ severity: "warning", type: "Unconfirmed booking", title: `${u.booking_code} · ${u.guest}`, detail: `${u.prop} · arrives ${fdate(u.check_in, false)}`, href: `/bookings/${u.id}`, date: u.check_in });

  const notReady = await tx<{ id: string; booking_code: string; unit: string; prop: string; readiness: string; check_in: string }[]>`
    select b.id, b.booking_code, u.name unit, p.name prop, u.readiness::text readiness, b.check_in
    from bookings b join property_units u on u.id = b.unit_id join properties p on p.id = b.property_id
    where b.status in ('confirmed','pending') and b.check_in between ${t}::date and ${addDays(t, 1)}::date and u.readiness <> 'ready'
      and (${pid}::uuid is null or b.property_id = ${pid}::uuid) order by b.check_in limit 20`;
  for (const r of notReady) out.push({ severity: r.readiness === "out_of_order" ? "critical" : "warning", type: "Room not ready", title: `${r.unit} is ${r.readiness.replace("_", " ")}`, detail: `${r.prop} · ${r.booking_code} arrives ${r.check_in === t ? "today" : "tomorrow"}`, href: `/housekeeping`, date: r.check_in });

  const tickets = await tx<{ ticket_code: string; title: string; priority: string; prop: string }[]>`
    select m.ticket_code, m.title, m.priority::text, p.name prop from maintenance_tickets m join properties p on p.id = m.property_id
    where m.status in ('open','assigned','in_progress') and m.priority in ('critical','high') and (${pid}::uuid is null or m.property_id = ${pid}::uuid)
    order by m.priority desc, m.created_at limit 10`;
  for (const m of tickets) out.push({ severity: m.priority === "critical" ? "critical" : "warning", type: "Maintenance", title: `${m.ticket_code} · ${m.title}`, detail: `${m.prop} · ${m.priority} priority`, href: `/maintenance` });

  const [hk] = await tx<{ n: number }[]>`select count(*)::int n from housekeeping_tasks where status in ('pending','assigned','in_progress') and due_date <= ${t}::date and (${pid}::uuid is null or property_id = ${pid}::uuid)`;
  if (hk?.n) out.push({ severity: "info", type: "Housekeeping", title: `${hk.n} cleaning task${hk.n > 1 ? "s" : ""} pending`, detail: "Due today or overdue", href: "/housekeeping" });

  if (opts.withFinance) {
    const unpaid = await tx<{ id: string; booking_code: string; guest: string; check_in: string; balance_due: string; prop: string }[]>`
      select b.id, b.booking_code, g.full_name guest, b.check_in, f.balance_due, p.name prop
      from bookings b join booking_financials f on f.booking_id = b.id join guests g on g.id = b.guest_id join properties p on p.id = b.property_id
      where b.status in ('confirmed','checked_in') and b.check_in <= ${addDays(t, 3)}::date and f.net_paid = 0 and f.balance_due > 0
        and (${pid}::uuid is null or b.property_id = ${pid}::uuid) order by b.check_in limit 15`;
    for (const u of unpaid) out.push({ severity: "warning", type: "Pending guest payment", title: `${u.booking_code} · ${u.guest} — nothing paid`, detail: `${u.prop} · ₹${Number(u.balance_due).toLocaleString("en-IN")} due · ${fdate(u.check_in, false)}`, href: `/bookings/${u.id}`, date: u.check_in });
  }

  const demand = await tx<{ property_id: string; prop: string; first: string; last: string; reason: string; n: number }[]>`
    select p.id property_id, p.name prop, min(d.day)::text first, max(d.day)::text last, min(d.reason) reason, count(*)::int n
    from properties p cross join lateral high_demand_dates(p.id, ${t}::date, ${horizon}::date) d
    where p.status = 'active' and (${pid}::uuid is null or p.id = ${pid}::uuid) group by p.id, p.name, d.reason order by min(d.day) limit 6`;
  for (const d of demand) out.push({ severity: "info", type: "High demand", title: `${d.reason}`, detail: `${d.prop} · ${fdate(d.first, false)}${d.n > 1 ? ` → ${fdate(d.last, false)}` : ""} — review rates`, href: `/calendar?property=${d.property_id}&month=${d.first.slice(0, 7)}`, date: d.first });

  const vacant = await tx<{ unit: string; prop: string; property_id: string; nights: number; first: string }[]>`
    with days as (select generate_series(${t}::date, ${addDays(t, 13)}::date, interval '1 day')::date d),
    free as (select u.id, u.name unit, p.name prop, p.id property_id, d.d from property_units u join properties p on p.id = u.property_id cross join days d
      where u.is_active and p.status = 'active' and (${pid}::uuid is null or p.id = ${pid}::uuid)
        and not exists (select 1 from bookings b where b.unit_id = u.id and b.status in ('confirmed','checked_in','pending') and d.d >= b.check_in and d.d < b.check_out)
        and not exists (select 1 from blocked_dates x where x.is_active and x.property_id = p.id and (x.unit_id is null or x.unit_id = u.id) and d.d >= x.start_date and d.d < x.end_date))
    select unit, prop, property_id, count(*)::int nights, min(d)::text first from free group by id, unit, prop, property_id
    having count(*) >= (select (app.setting('alerts.vacancy_days', '5'::jsonb))::text::int) order by count(*) desc limit 5`;
  for (const v of vacant) out.push({ severity: "info", type: "Vacant period", title: `${v.unit} empty ${v.nights} of next 14 nights`, detail: `${v.prop} · from ${fdate(v.first, false)} — consider a promotion`, href: `/calendar?property=${v.property_id}&view=rooms` });

  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
