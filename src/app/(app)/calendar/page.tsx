import Link from "next/link";
import * as I from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { addDays, fdate, monthBounds, todayIST, daysBetween } from "@/lib/format";
import { getAlerts } from "@/server/alerts";
import { propertyOptions, unitOptions, sp1, uuidParam } from "@/server/common";
import { Card, CardHeader, CardBody, PageHeader, LinkButton, Button, Input, Select, Tabs, cn, StatusBadge, Badge } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, AutoSubmit, ConfirmAction } from "@/components/ui/forms";
import { AlertsPanel } from "@/components/alerts-panel";
import { blockDates, unblock, addDemandRule } from "./actions";

export const metadata = { title: "Calendar" };
type B = { id: string; booking_code: string; unit_id: string; property_id: string; check_in: string; check_out: string; status: string; guest: string; conflict: boolean };
type Blk = { id: string; property_id: string; unit_id: string | null; start_date: string; end_date: string; reason: string; notes: string | null; prop: string; unit: string | null };

const BAR: Record<string, string> = {
  confirmed: "bg-brand-600 text-white", checked_in: "bg-sky-600 text-white", checked_out: "bg-sky-200 text-sky-900", pending: "bg-orange-400 text-white", conflict: "bg-red-600 text-white ring-2 ring-red-300",
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "operations", "auditor"]);
  const sp = await searchParams;
  const t = todayIST();
  const view = (["month", "rooms", "week", "day"].includes(sp.view ?? "") ? sp.view : "month") as "month" | "rooms" | "week" | "day";
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : t.slice(0, 7);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : t;
  const { start: mStart, end: mEnd } = monthBounds(`${month}-01`);
  const weekStart = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  const [from, to] = view === "week" ? [weekStart, addDays(weekStart, 6)] : view === "day" ? [date, date] : [mStart, mEnd];

  const data = await withUser(u.id, async (tx) => {
    const props = await propertyOptions(tx);
    const pid = uuidParam(sp.property) ?? (props.length === 1 ? props[0].id : null);
    const units = (await unitOptions(tx)).filter((x) => !pid || x.property_id === pid);
    const bookings = await tx<B[]>`
      select b.id, b.booking_code, b.unit_id, b.property_id, b.check_in, b.check_out, b.status::text, g.full_name guest,
        exists (select 1 from bookings o where o.unit_id = b.unit_id and o.id <> b.id and o.status in ('confirmed','checked_in','pending') and b.status in ('pending','confirmed','checked_in')
          and daterange(o.check_in, o.check_out) && daterange(b.check_in, b.check_out) and (b.status = 'pending' or o.status = 'pending')) conflict
      from bookings b join guests g on g.id = b.guest_id
      where b.status not in ('cancelled','no_show') and b.check_in <= ${to}::date and b.check_out > ${from}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid)
      order by b.check_in`;
    const blocks = await tx<Blk[]>`select x.id, x.property_id, x.unit_id, x.start_date, x.end_date, x.reason::text, x.notes, p.name prop, un.name unit
      from blocked_dates x join properties p on p.id = x.property_id left join property_units un on un.id = x.unit_id
      where x.is_active and x.start_date <= ${to}::date and x.end_date > ${from}::date and (${pid}::uuid is null or x.property_id = ${pid}::uuid) order by x.start_date`;
    const demand = await tx<{ day: string; reason: string }[]>`
      select d.day::text, min(d.reason) reason from properties p cross join lateral high_demand_dates(p.id, ${from}::date, ${to}::date) d
      where p.status = 'active' and (${pid}::uuid is null or p.id = ${pid}::uuid) group by d.day`;
    const alerts = await getAlerts(tx, { propertyId: pid, withFinance: can.viewFinance(u.role) });
    return { props, pid, units, bookings, blocks, demand, alerts };
  });
  const { props, pid, units, bookings, blocks } = data;
  const demand = new Map(data.demand.map((d) => [d.day, d.reason]));
  const days: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const isBlocked = (unitId: string | null, propId: string, day: string) => blocks.some((b) => b.property_id === propId && (!b.unit_id || !unitId || b.unit_id === unitId) && day >= b.start_date && day < b.end_date);
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ view, month, date, property: pid ?? "", ...o }).filter(([, v]) => v)).toString();
  const prevMonth = monthBounds(addDays(mStart, -1)).start.slice(0, 7), nextMonth = addDays(mEnd, 1).slice(0, 7);
  const nav = view === "month" || view === "rooms" ? { prev: qs({ month: prevMonth }), next: qs({ month: nextMonth }), today: qs({ month: t.slice(0, 7), date: t }), label: new Date(`${mStart}T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) }
    : view === "week" ? { prev: qs({ date: addDays(weekStart, -7) }), next: qs({ date: addDays(weekStart, 7) }), today: qs({ date: t }), label: `${fdate(from, false)} – ${fdate(to)}` }
    : { prev: qs({ date: addDays(date, -1) }), next: qs({ date: addDays(date, 1) }), today: qs({ date: t }), label: fdate(date) };
  const canBook = can.manageBookings(u.role);
  const propName = (id: string) => props.find((p) => p.id === id)?.name.replace("STAYRA ", "") ?? "";

  return (
    <>
      <PageHeader title={`Calendar${pid ? ` – ${propName(pid)}` : " – All properties"}`} description="Bookings, blocks and high-demand dates. Click an empty cell to book."
        actions={<>
          {can.blockDates(u.role) && <Modal title="Block dates" defaultOpen={sp.block === "1"} trigger={<Button variant="secondary"><I.CalendarX2 />Block dates</Button>}>
            <ActionForm action={blockDates} className="grid sm:grid-cols-2 gap-4">
              <Field name="property_id" label="Property" required className="sm:col-span-2"><Select name="property_id" defaultValue={pid ?? ""}><option value="">Select…</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field name="unit_id" label="Room" hint="Leave empty to block the whole property" className="sm:col-span-2"><Select name="unit_id" defaultValue=""><option value="">Whole property</option>{(pid ? units : []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
              <Field name="start_date" label="From" required><Input type="date" name="start_date" defaultValue={t} /></Field>
              <Field name="end_date" label="Until (first free day)" required><Input type="date" name="end_date" defaultValue={addDays(t, 1)} /></Field>
              <Field name="reason" label="Reason" required><Select name="reason"><option value="maintenance">Maintenance</option><option value="owner_use">Owner use</option><option value="renovation">Renovation</option><option value="closure">Temporary closure</option><option value="other">Other</option></Select></Field>
              <Field name="notes" label="Notes"><Input name="notes" /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Block dates</SubmitButton></div>
            </ActionForm></Modal>}
          {["super_admin", "admin"].includes(u.role) && <Modal title="Mark high-demand dates" description="Only explicit designations or historical occupancy mark dates as high demand." trigger={<Button variant="secondary"><I.Flame />High demand</Button>}>
            <ActionForm action={addDemandRule} className="grid sm:grid-cols-2 gap-4">
              <Field name="name" label="Name" required className="sm:col-span-2"><Input name="name" placeholder="e.g. Diwali weekend, Marathon" /></Field>
              <Field name="property_id" label="Property"><Select name="property_id" defaultValue={pid ?? ""}><option value="">All properties</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field name="kind" label="Type"><Select name="kind"><option value="event">Local event</option><option value="season">Season</option><option value="manual">Manual</option></Select></Field>
              <Field name="start_date" label="From" required><Input type="date" name="start_date" /></Field>
              <Field name="end_date" label="To (inclusive)" required><Input type="date" name="end_date" /></Field>
              <Field name="notes" label="Notes / data source" className="sm:col-span-2"><Input name="notes" /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
            </ActionForm></Modal>}
          {canBook && <LinkButton href={`/bookings/new${pid ? `?property=${pid}` : ""}`}><I.Plus />Add Booking</LinkButton>}
        </>} />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <LinkButton href={nav.prev} variant="secondary" size="icon" aria-label="Previous"><I.ChevronLeft /></LinkButton>
          <LinkButton href={nav.today} variant="secondary" size="sm">Today</LinkButton>
          <LinkButton href={nav.next} variant="secondary" size="icon" aria-label="Next"><I.ChevronRight /></LinkButton>
          <h2 className="font-semibold text-lg ml-2">{nav.label}</h2>
        </div>
        <AutoSubmit className="flex gap-2"><input type="hidden" name="view" value={view} /><input type="hidden" name="month" value={month} /><input type="hidden" name="date" value={date} />
          {props.length > 1 && <Select name="property" defaultValue={pid ?? ""} className="w-auto min-w-48"><option value="">All properties (combined)</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
        </AutoSubmit>
      </div>
      <Tabs active={view} tabs={[{ key: "month", label: "Month", href: qs({ view: "month" }) }, { key: "rooms", label: "Room-wise", href: qs({ view: "rooms" }) }, { key: "week", label: "Week", href: qs({ view: "week" }) }, { key: "day", label: "Day", href: qs({ view: "day" }) }]} />
      <Legend />

      <div className="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="min-w-0">
          {view === "month" && (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-7 border-b border-line bg-gray-50/70">{DOW.map((d) => <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted text-center">{d}</div>)}</div>
              <div className="grid grid-cols-7">
                {Array.from({ length: (new Date(`${mStart}T00:00:00Z`).getUTCDay() + 6) % 7 }).map((_, i) => <div key={`e${i}`} className="min-h-24 sm:min-h-28 border-b border-r border-line bg-gray-50/40" />)}
                {days.map((day) => {
                  const inHouse = bookings.filter((b) => b.check_in <= day && b.check_out > day);
                  const arrivals = bookings.filter((b) => b.check_in === day).length, departures = bookings.filter((b) => b.check_out === day).length;
                  const conflict = inHouse.some((b) => b.conflict);
                  const blocked = units.length > 0 && units.every((x) => isBlocked(x.id, x.property_id, day));
                  const someBlocked = units.some((x) => isBlocked(x.id, x.property_id, day));
                  const hd = demand.get(day);
                  const occ = units.length ? inHouse.filter((b) => b.status !== "pending").length / units.length : 0;
                  return (
                    <Link key={day} href={qs({ view: "day", date: day })} title={hd ? `High demand: ${hd}` : undefined}
                      className={cn("min-h-24 sm:min-h-28 border-b border-r border-line p-1.5 sm:p-2 text-xs flex flex-col gap-1 hover:bg-brand-50/50 transition relative",
                        hd && "bg-amber-50", blocked && "bg-violet-50", conflict && "bg-red-50", day === t && "ring-2 ring-inset ring-brand-500")}>
                      <div className="flex justify-between items-center"><span className={cn("font-semibold", day === t && "text-brand-700")}>{Number(day.slice(8))}</span>
                        {hd && <I.Flame className="size-3.5 text-amber-500" />}</div>
                      {units.length <= 2 ? inHouse.slice(0, 2).map((b) => <span key={b.id} className={cn("truncate rounded px-1.5 py-0.5 text-[10.5px]", BAR[b.conflict ? "conflict" : b.status])}>{b.guest.split(" ")[0]}</span>)
                        : inHouse.length > 0 && <div className="mt-auto"><div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${Math.min(100, occ * 100)}%` }} /></div>
                          <p className="text-[10.5px] text-muted mt-0.5 hidden sm:block">{inHouse.length}/{units.length} booked</p></div>}
                      <div className="flex gap-1 flex-wrap">
                        {arrivals > 0 && <span className="rounded bg-sky-100 text-sky-800 px-1 text-[10px]">↓{arrivals}</span>}
                        {departures > 0 && <span className="rounded bg-sky-50 text-sky-700 px-1 text-[10px]">↑{departures}</span>}
                        {someBlocked && <span className="rounded bg-violet-100 text-violet-800 px-1 text-[10px]">Blocked</span>}
                        {conflict && <span className="rounded bg-red-100 text-red-800 px-1 text-[10px]">Conflict</span>}
                      </div>
                    </Link>);
                })}
              </div>
            </Card>
          )}

          {(view === "rooms" || view === "week") && (
            <Card className="overflow-x-auto scrollbar-thin">
              <div className="min-w-max">
                <div className="grid sticky top-0 bg-white z-10 border-b border-line" style={{ gridTemplateColumns: `160px repeat(${days.length}, ${view === "week" ? 110 : 42}px)` }}>
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase text-muted sticky left-0 bg-white">Room</div>
                  {days.map((d) => { const hd = demand.get(d); const dow = DOW[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]; return (
                    <div key={d} title={hd} className={cn("text-center py-1.5 text-[11px] border-l border-line/60", hd && "bg-amber-100 text-amber-900", d === t && "bg-brand-100 text-brand-900 font-semibold")}>
                      <div className="text-muted">{view === "week" ? dow : dow[0]}</div><div className="font-medium">{Number(d.slice(8))}</div></div>); })}
                </div>
                {units.length === 0 && <p className="p-6 text-sm text-muted">No rooms.</p>}
                {units.map((un, idx) => {
                  const showHeader = !pid && (idx === 0 || units[idx - 1].property_id !== un.property_id);
                  const rowBookings = bookings.filter((b) => b.unit_id === un.id);
                  return (
                    <div key={un.id}>
                      {showHeader && <div className="px-3 py-1.5 bg-brand-50 text-xs font-semibold text-brand-800 border-b border-line sticky left-0">{propName(un.property_id)}</div>}
                      <div className="grid relative border-b border-line/70 h-11" style={{ gridTemplateColumns: `160px repeat(${days.length}, ${view === "week" ? 110 : 42}px)` }}>
                        <div className="px-3 flex flex-col justify-center sticky left-0 bg-white z-[5] border-r border-line"><span className="text-sm font-medium truncate">{un.name}</span><span className="text-[10.5px] text-muted truncate">{un.room_category}</span></div>
                        {days.map((d, i) => {
                          const blocked = isBlocked(un.id, un.property_id, d);
                          return canBook && !blocked && d >= t
                            ? <Link key={d} href={`/bookings/new?property=${un.property_id}&unit=${un.id}&check_in=${d}&check_out=${addDays(d, 1)}`} aria-label={`Book ${un.name} on ${d}`}
                                className={cn("border-l border-line/50 hover:bg-brand-50", demand.get(d) && "bg-amber-50/60")} style={{ gridColumn: i + 2, gridRow: 1 }} />
                            : <div key={d} className={cn("border-l border-line/50", blocked ? "bg-violet-200/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,.5)_4px,rgba(255,255,255,.5)_8px)]" : d < t ? "bg-gray-50/60" : "")} style={{ gridColumn: i + 2, gridRow: 1 }} title={blocked ? "Blocked" : undefined} />;
                        })}
                        {rowBookings.map((b) => {
                          const s = Math.max(0, daysBetween(from, b.check_in)), e = Math.min(days.length, daysBetween(from, b.check_out));
                          if (e <= s) return null;
                          return (
                            <Link key={b.id} href={`/bookings/${b.id}`} title={`${b.booking_code} · ${b.guest} · ${fdate(b.check_in, false)} → ${fdate(b.check_out, false)} · ${b.status}`}
                              className={cn("z-[2] my-1.5 mx-0.5 rounded-md px-2 text-[11px] font-medium flex items-center truncate shadow-sm hover:brightness-110", BAR[b.conflict ? "conflict" : b.status], b.conflict && b.status === "pending" && "translate-y-1.5 opacity-90")}
                              style={{ gridColumn: `${s + 2} / ${e + 2}`, gridRow: 1 }}>
                              {b.check_in >= from && <I.LogIn className="size-3 mr-1 shrink-0 opacity-80" />}{b.guest}
                            </Link>);
                        })}
                      </div>
                    </div>);
                })}
              </div>
            </Card>
          )}

          {view === "day" && <DayView date={date} units={units} bookings={bookings} blocked={(id, p) => isBlocked(id, p, date)} propName={propName} pid={pid} canBook={canBook} />}

          {blocks.length > 0 && (
            <Card className="mt-6"><CardHeader title="Blocked dates in view" />
              <ul className="divide-y divide-line border-t border-line">{blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm gap-3">
                  <span><Badge tone="purple">{b.reason.replace("_", " ")}</Badge> <span className="font-medium ml-1">{b.prop.replace("STAYRA ", "")}{b.unit ? ` · ${b.unit}` : " · whole property"}</span>
                    <span className="text-muted"> · {fdate(b.start_date, false)} → {fdate(b.end_date, false)}{b.notes ? ` · ${b.notes}` : ""}</span></span>
                  {can.blockDates(u.role) && <ConfirmAction action={unblock} hidden={{ id: b.id }} label="Remove" title="Remove this block?" variant="ghost" />}
                </li>))}</ul>
            </Card>
          )}
        </div>
        <AlertsPanel alerts={data.alerts} compact />
      </div>
    </>
  );
}

function Legend() {
  const items: [string, string][] = [["bg-brand-600", "Confirmed"], ["bg-sky-600", "Checked in / out"], ["bg-gray-200", "Available"], ["bg-red-600", "Conflict"], ["bg-orange-400", "Pending"], ["bg-violet-300", "Blocked"], ["bg-amber-200", "High demand"]];
  return <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-muted">{items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={cn("size-3 rounded", c)} />{l}</span>)}</div>;
}

function DayView({ date, units, bookings, blocked, propName, pid, canBook }: { date: string; units: { id: string; name: string; property_id: string; room_category: string }[]; bookings: B[]; blocked: (u: string, p: string) => boolean; propName: (id: string) => string; pid: string | null; canBook: boolean }) {
  return (
    <Card><CardHeader title={`Room status · ${fdate(date)}`} description="Arrivals, departures and in-house guests" />
      <ul className="divide-y divide-line border-t border-line">{units.map((un) => {
        const stay = bookings.find((b) => b.unit_id === un.id && b.check_in <= date && b.check_out > date && b.status !== "pending");
        const arr = bookings.find((b) => b.unit_id === un.id && b.check_in === date);
        const dep = bookings.find((b) => b.unit_id === un.id && b.check_out === date);
        const blk = blocked(un.id, un.property_id);
        return (
          <li key={un.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="w-40 shrink-0"><span className="font-medium block">{un.name}</span><span className="text-xs text-muted">{!pid ? propName(un.property_id) : un.room_category}</span></span>
            <span className="flex-1 flex flex-wrap gap-2 items-center">
              {dep && <Link href={`/bookings/${dep.id}`}><Badge tone="blue"><I.LogOut className="size-3" />Departs: {dep.guest}</Badge></Link>}
              {arr && <Link href={`/bookings/${arr.id}`}><Badge tone={arr.status === "pending" ? "orange" : "green"}><I.LogIn className="size-3" />Arrives: {arr.guest}</Badge></Link>}
              {stay && stay !== arr && <Link href={`/bookings/${stay.id}`}><StatusBadge status={stay.status} label={`In-house: ${stay.guest}`} /></Link>}
              {blk && <Badge tone="purple">Blocked</Badge>}
              {!stay && !arr && !blk && <span className="text-muted text-xs">Available</span>}
            </span>
            {canBook && !stay && !blk && <LinkButton href={`/bookings/new?property=${un.property_id}&unit=${un.id}&check_in=${date}&check_out=${addDays(date, 1)}`} size="sm" variant="soft">Book</LinkButton>}
          </li>);
      })}</ul>
    </Card>
  );
}
