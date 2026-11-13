import Link from "next/link";
import {
  Plus, Download, Headset, Phone, MessageCircle, AlarmClock, Flame,
  TrendingUp, CheckCircle2, Calendar, Sparkles, Edit3,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  fdate, fdatetime, inr0, todayIST,
  LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, LEAD_TEMP_LABEL,
} from "@/lib/format";
import { propertyOptions, unitOptions, sp1, uuidParam } from "@/server/common";
import {
  Card, CardHeader, CardBody, PageHeader, LinkButton, Button, Table, THead, Th, Td, Tr,
  StatusBadge, Badge, EmptyState, Select, Input, Tabs, Stat, DemoBadge,
} from "@/components/ui/core";
import { AutoSubmit } from "@/components/ui/forms";
import { QuickStatusModal, CompleteReminderButtons, CsvImportModal, ConvertLeadModal } from "@/components/lead-form";
import { WhatsAppHubModal, QuickWhatsAppGroupButton } from "@/components/whatsapp-hub";
import { updateLeadStatus, completeReminder, importLeadsCsv, convertLeadToBooking } from "./actions";

export const metadata = { title: "Leads & CRM" };
const PAGE = 50;

type LeadRow = {
  id: string;
  lead_code: string;
  guest_name: string;
  guest_phone: string;
  guest_whatsapp: string | null;
  guest_email: string | null;
  guest_city: string | null;
  source: string;
  source_detail: string | null;
  status: string;
  temperature: string;
  property_id: string | null;
  prop_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  check_in: string | null;
  check_out: string | null;
  adults: number;
  children: number;
  rooms_needed: number;
  budget: string | null;
  quoted_amount: string | null;
  special_requests: string | null;
  notes: string | null;
  lost_reason: string | null;
  next_follow_up_at: string | null;
  follow_up_date: string | null;
  follow_up_note: string | null;
  reminder_completed: boolean;
  assigned_name: string | null;
  converted_booking_id: string | null;
  booking_code: string | null;
  is_demo: boolean;
  created_at: string;
};

const cleanPhone = (p: string) => p.replace(/[^\d]/g, "").replace(/^0+/, "");
const waHref = (p: string, guest: string, code: string) => {
  const digits = cleanPhone(p);
  const intl = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(`Hi ${guest}, greetings from STAYRA! Following up regarding your stay inquiry (${code}).`);
  return `https://wa.me/${intl}?text=${text}`;
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "operations", "accountant", "auditor"]);
  const sp = await searchParams;
  const t = todayIST();
  const view = sp1(sp.view) ?? "table"; // "table" | "kanban" | "reminders" | "hot" | "mine"
  const pid = uuidParam(sp.property);
  const status = sp1(sp.status) ?? "";
  const source = sp1(sp.source) ?? "";
  const temperature = sp1(sp.temperature) ?? "";
  const q = (sp1(sp.q) ?? "").slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);
  const canManage = can.manageLeads(u.role);
  const canBook = can.manageBookings(u.role);
  const canPay = can.recordGuestPayment(u.role);

  const { rows, total, stats, props, units } = await withUser(u.id, async (tx) => {
    const where = tx`
      (${pid}::uuid is null or l.property_id = ${pid}::uuid)
      and (${status} = '' or l.status::text = ${status})
      and (${source} = '' or l.source::text = ${source})
      and (${temperature} = '' or l.temperature::text = ${temperature})
      and (${q} = '' or l.lead_code ilike ${"%" + q + "%"} or l.guest_name ilike ${"%" + q + "%"} or l.guest_phone ilike ${"%" + q + "%"} or coalesce(l.guest_city, '') ilike ${"%" + q + "%"} or coalesce(l.notes, '') ilike ${"%" + q + "%"})
      and (case ${view}
            when 'reminders' then not l.reminder_completed and l.status not in ('won','lost') and l.next_follow_up_at is not null
            when 'hot' then l.temperature = 'hot' and l.status not in ('won','lost')
            when 'mine' then l.assigned_to = ${u.id}::uuid
            else true end)`;

    const limit = view === "kanban" || view === "reminders" ? 250 : PAGE;
    const offset = view === "kanban" || view === "reminders" ? 0 : (page - 1) * PAGE;

    const rows = await tx<LeadRow[]>`
      select l.id, l.lead_code, l.guest_name, l.guest_phone, l.guest_whatsapp, l.guest_email, l.guest_city,
        l.source::text, l.source_detail, l.status::text, l.temperature::text,
        l.property_id, p.name prop_name, l.unit_id, un.name unit_name,
        l.check_in::text, l.check_out::text, l.adults, l.children, l.rooms_needed,
        l.budget, l.quoted_amount, l.special_requests, l.notes, l.lost_reason,
        l.next_follow_up_at::text,
        (l.next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date::text follow_up_date,
        l.follow_up_note, l.reminder_completed,
        pr.full_name assigned_name, l.converted_booking_id, b.booking_code,
        l.is_demo, l.created_at::text
      from leads l
      left join properties p on p.id = l.property_id
      left join property_units un on un.id = l.unit_id
      left join profiles pr on pr.id = l.assigned_to
      left join bookings b on b.id = l.converted_booking_id
      where ${where}
      order by
        case when ${view} = 'reminders' then l.next_follow_up_at end asc nulls last,
        case when l.status not in ('won','lost') and not l.reminder_completed and (l.next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date <= ${t}::date then 0 else 1 end asc,
        l.created_at desc
      limit ${limit} offset ${offset}`;

    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int n from leads l where ${where}`;

    const [st] = await tx<{
      active_count: number;
      hot_count: number;
      pipeline_value: string;
      due_reminders: number;
      overdue_reminders: number;
      won_count: number;
      total_closed_or_open: number;
    }[]>`
      select
        count(*) filter (where status not in ('won','lost'))::int active_count,
        count(*) filter (where status not in ('won','lost') and temperature = 'hot')::int hot_count,
        coalesce(sum(coalesce(quoted_amount, budget, 0)) filter (where status not in ('won','lost')), 0)::text pipeline_value,
        count(*) filter (where not reminder_completed and status not in ('won','lost') and next_follow_up_at is not null and (next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date <= ${t}::date)::int due_reminders,
        count(*) filter (where not reminder_completed and status not in ('won','lost') and next_follow_up_at is not null and (next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date < ${t}::date)::int overdue_reminders,
        count(*) filter (where status = 'won')::int won_count,
        count(*)::int total_closed_or_open
      from leads
      where (${pid}::uuid is null or property_id = ${pid}::uuid)`;

    return {
      rows,
      total: n,
      stats: st,
      props: (await propertyOptions(tx)).filter((p) => p.status === "active" || p.status === "onboarding"),
      units: await unitOptions(tx),
    };
  });

  const qs = (o: Record<string, string | number>) =>
    "?" +
    new URLSearchParams(
      Object.entries({ view, property: pid ?? "", status, source, temperature, q, ...o })
        .filter(([, v]) => v !== "" && v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ).toString();

  const pages = Math.ceil(total / PAGE);
  const convRate = stats.total_closed_or_open > 0 ? Math.round((stats.won_count / stats.total_closed_or_open) * 100) : 0;

  const renderReminderBadge = (r: LeadRow) => {
    if (!r.next_follow_up_at || r.reminder_completed || r.status === "won" || r.status === "lost") {
      return <span className="text-xs text-muted">—</span>;
    }
    const fDate = r.follow_up_date ?? r.next_follow_up_at.slice(0, 10);
    const isOverdue = fDate < t;
    const isToday = fDate === t;
    return (
      <div className="space-y-1">
        <Badge tone={isOverdue ? "red" : isToday ? "amber" : "blue"}>
          <AlarmClock className="size-3" />
          {isOverdue ? `Overdue · ${fdate(fDate, false)}` : isToday ? "Due Today" : fdate(fDate, false)}
        </Badge>
        {r.follow_up_note && <p className="text-xs text-muted line-clamp-1 max-w-48" title={r.follow_up_note}>{r.follow_up_note}</p>}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Leads & CRM"
        description="Track guest inquiries, manage pipeline stages, schedule follow-up reminders, and convert won leads into bookings."
        actions={
          <>
            <LinkButton href={`/api/export/leads${qs({ format: "xlsx" })}`} variant="secondary">
              <Download />Export Excel
            </LinkButton>
            <LinkButton href={`/api/export/leads${qs({ format: "csv" })}`} variant="secondary">
              <Download />CSV
            </LinkButton>
            {canManage && <CsvImportModal action={importLeadsCsv} properties={props} />}
            {canManage && (
              <LinkButton href={`/leads/new${pid ? `?property=${pid}` : ""}`}>
                <Plus />Add Lead
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat
          label="Active Pipeline Leads"
          value={stats.active_count}
          sub={`${stats.hot_count} Hot 🔥 inquiries in pipeline`}
          icon={<Headset />}
          href={qs({ view: "table", status: "", page: 1 })}
        />
        <Stat
          label="Active Pipeline Value"
          value={inr0(stats.pipeline_value)}
          sub="Quoted tariff / guest budget"
          icon={<TrendingUp />}
          href={qs({ view: "kanban", page: 1 })}
        />
        <Stat
          label="Follow-ups Due / Overdue"
          value={stats.due_reminders}
          sub={stats.overdue_reminders > 0 ? `${stats.overdue_reminders} overdue — action needed` : "Scheduled for today or earlier"}
          icon={<AlarmClock />}
          tone={stats.overdue_reminders > 0 ? "danger" : stats.due_reminders > 0 ? "warn" : "default"}
          href={qs({ view: "reminders", status: "", page: 1 })}
        />
        <Stat
          label="Won / Converted Bookings"
          value={`${stats.won_count} (${convRate}%)`}
          sub={`Out of ${stats.total_closed_or_open} total inquiries`}
          icon={<CheckCircle2 />}
          tone="brand"
          href={qs({ view: "table", status: "won", page: 1 })}
        />
      </div>

      <Tabs
        active={view}
        tabs={[
          { key: "table", label: `All Leads (${total})`, href: qs({ view: "table", page: 1 }) },
          { key: "kanban", label: "Kanban Pipeline Board", href: qs({ view: "kanban", status: "", page: 1 }) },
          {
            key: "reminders",
            label: (
              <span className="inline-flex items-center gap-1.5">
                Follow-up Reminders
                {stats.due_reminders > 0 && (
                  <span className="rounded-full bg-amber-600 text-white text-[10px] font-semibold px-1.5 py-0.2">
                    {stats.due_reminders}
                  </span>
                )}
              </span>
            ),
            href: qs({ view: "reminders", status: "", page: 1 }),
          },
          { key: "hot", label: `Hot Leads 🔥 (${stats.hot_count})`, href: qs({ view: "hot", status: "", page: 1 }) },
          { key: "mine", label: "Assigned to Me", href: qs({ view: "mine", page: 1 }) },
        ]}
      />

      <AutoSubmit className="flex flex-wrap gap-2 mb-4">
        <input type="hidden" name="view" value={view} />
        <Input type="search" name="q" defaultValue={q} placeholder="Search guest name, phone, city, lead code…" className="w-full sm:w-72" />
        {props.length > 1 && (
          <Select name="property" defaultValue={pid ?? ""} className="w-auto">
            <option value="">All properties</option>
            {props.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        )}
        {view !== "kanban" && (
          <Select name="status" defaultValue={status} className="w-auto">
            <option value="">Any pipeline stage</option>
            {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        )}
        <Select name="temperature" defaultValue={temperature} className="w-auto">
          <option value="">Any priority</option>
          {Object.entries(LEAD_TEMP_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select name="source" defaultValue={source} className="w-auto">
          <option value="">Any source</option>
          {Object.entries(LEAD_SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </AutoSubmit>

      {view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
          {(["new", "contacted", "quoted", "follow_up", "negotiation", "won"] as const).map((stKey) => {
            const colLeads = rows.filter((r) => r.status === stKey);
            const colTotal = colLeads.reduce((acc, r) => acc + Number(r.quoted_amount ?? r.budget ?? 0), 0);
            return (
              <div key={stKey} className="rounded-xl bg-gray-50/90 border border-line p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={stKey} label={LEAD_STATUS_LABEL[stKey]} />
                    <span className="text-xs font-semibold text-muted">({colLeads.length})</span>
                  </div>
                  {colTotal > 0 && <span className="text-[11px] font-medium text-muted tabular">{inr0(colTotal)}</span>}
                </div>
                <div className="space-y-2.5 max-h-[70dvh] overflow-y-auto pr-0.5 scrollbar-thin">
                  {colLeads.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line bg-white/60 py-8 text-center text-xs text-muted">
                      No leads in {LEAD_STATUS_LABEL[stKey]}
                    </div>
                  ) : (
                    colLeads.map((r) => (
                      <Card key={r.id} className="p-3 space-y-2 hover:border-brand-300 transition">
                        <div className="flex items-start justify-between gap-1.5">
                          <div>
                            <Link href={`/leads/${r.id}`} className="font-semibold text-sm text-ink hover:text-brand-700 hover:underline block">
                              {r.guest_name}
                            </Link>
                            <span className="text-[11px] text-muted">{r.lead_code} · {LEAD_SOURCE_LABEL[r.source] ?? r.source}</span>
                          </div>
                          <StatusBadge status={r.temperature} label={LEAD_TEMP_LABEL[r.temperature]} />
                        </div>
                        {r.prop_name && (
                          <div className="text-xs text-ink font-medium">
                            {r.prop_name.replace("STAYRA ", "")}
                            {r.unit_name ? <span className="text-muted font-normal"> · {r.unit_name}</span> : null}
                          </div>
                        )}
                        {r.check_in && (
                          <div className="text-xs text-muted flex items-center gap-1">
                            <Calendar className="size-3 shrink-0" />
                            {fdate(r.check_in, false)} → {fdate(r.check_out, false)} ({r.adults + r.children} pax)
                          </div>
                        )}
                        {(r.quoted_amount || r.budget) && (
                          <div className="text-xs font-semibold text-brand-800 tabular">
                            {r.quoted_amount ? `Quoted: ${inr0(r.quoted_amount)}` : `Budget: ${inr0(r.budget)}`}
                          </div>
                        )}
                        {r.next_follow_up_at && !r.reminder_completed && r.status !== "won" && (
                          <div className="pt-1">{renderReminderBadge(r)}</div>
                        )}
                        <div className="flex items-center justify-between gap-1 pt-2 border-t border-line/70">
                          <div className="flex items-center gap-1">
                            <a
                              href={`tel:${r.guest_phone}`}
                              className="rounded-md p-1 text-muted hover:bg-gray-100 hover:text-ink"
                              title={`Call ${r.guest_phone}`}
                            >
                              <Phone className="size-3.5" />
                            </a>
                            <WhatsAppHubModal
                              lead={r}
                              trigger={
                                <button
                                  type="button"
                                  className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50"
                                  title="Open WhatsApp templates (Quote, Follow-ups, Upsell, Group)"
                                >
                                  <MessageCircle className="size-3.5" />
                                </button>
                              }
                            />
                            <QuickWhatsAppGroupButton lead={r} />
                          </div>
                          <div className="flex items-center gap-1">
                            {canManage && (
                              <QuickStatusModal
                                lead={r}
                                action={updateLeadStatus}
                                trigger={
                                  <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-[11px]">
                                    <Edit3 className="size-3" />Stage
                                  </Button>
                                }
                              />
                            )}
                            {canBook && !r.converted_booking_id && r.status !== "lost" && (
                              <ConvertLeadModal
                                lead={r}
                                properties={props}
                                units={units}
                                canPay={canPay}
                                action={convertLeadToBooking}
                                trigger={
                                  <Button type="button" size="sm" variant="soft" className="h-7 px-2 text-[11px]" title="Convert to Booking">
                                    <Sparkles className="size-3" />Book
                                  </Button>
                                }
                              />
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "reminders" ? (
        <div className="space-y-6">
          {(["overdue", "today", "upcoming"] as const).map((bucket) => {
            const list = rows.filter((r) => {
              const d = r.follow_up_date ?? (r.next_follow_up_at ? r.next_follow_up_at.slice(0, 10) : "");
              if (!d) return false;
              if (bucket === "overdue") return d < t;
              if (bucket === "today") return d === t;
              return d > t;
            });
            const meta = {
              overdue: { title: `Overdue Follow-ups (${list.length})`, desc: "Leads whose scheduled follow-up date has passed.", tone: "text-red-700" },
              today: { title: `Due Today — ${fdate(t)} (${list.length})`, desc: "Leads scheduled for a call or WhatsApp follow-up today.", tone: "text-amber-800" },
              upcoming: { title: `Upcoming Follow-ups (${list.length})`, desc: "Scheduled for future dates.", tone: "text-brand-800" },
            }[bucket];
            return (
              <Card key={bucket}>
                <CardHeader title={<span className={meta.tone}>{meta.title}</span>} description={meta.desc} />
                <CardBody className="pt-0">
                  {list.length === 0 ? (
                    <p className="text-sm text-muted py-4">No {bucket} follow-up reminders.</p>
                  ) : (
                    <div className="divide-y divide-line">
                      {list.map((r) => (
                        <div key={r.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/leads/${r.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">
                                {r.guest_name}
                              </Link>
                              <span className="text-xs text-muted">{r.lead_code}</span>
                              <StatusBadge status={r.status} label={LEAD_STATUS_LABEL[r.status]} />
                              <StatusBadge status={r.temperature} label={LEAD_TEMP_LABEL[r.temperature]} />
                              {r.prop_name && <Badge tone="gray">{r.prop_name.replace("STAYRA ", "")}</Badge>}
                            </div>
                            <p className="text-sm text-ink font-medium">
                              <AlarmClock className="size-3.5 inline mr-1 text-amber-600" />
                              {fdatetime(r.next_follow_up_at)} — {r.follow_up_note || "Scheduled follow-up call"}
                            </p>
                            <div className="text-xs text-muted flex flex-wrap gap-3">
                              <span>Phone: {r.guest_phone}</span>
                              {r.check_in && <span>Stay: {fdate(r.check_in, false)} → {fdate(r.check_out, false)}</span>}
                              {r.quoted_amount && <span>Quoted: {inr0(r.quoted_amount)}</span>}
                              {r.assigned_name && <span>Assigned: {r.assigned_name}</span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`tel:${r.guest_phone}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50"
                            >
                              <Phone className="size-3.5" />Call
                            </a>
                            <WhatsAppHubModal lead={r} />
                            <QuickWhatsAppGroupButton lead={r} />
                            {canManage && <CompleteReminderButtons leadId={r.id} action={completeReminder} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Headset />}
              title="No leads match your filters"
              description="Add a new guest inquiry or import leads via CSV."
              action={canManage && <LinkButton href="/leads/new"><Plus />Add Lead</LinkButton>}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <tr>
                      <Th>Lead / Guest</Th>
                      <Th>Contact</Th>
                      <Th>Property & Stay</Th>
                      <Th>Source</Th>
                      <Th className="text-right">Quote / Budget</Th>
                      <Th>Follow-up Reminder</Th>
                      <Th>Priority</Th>
                      <Th>Stage</Th>
                      <Th className="text-right">Quick Actions</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => (
                      <Tr key={r.id}>
                        <Td>
                          <Link href={`/leads/${r.id}`} className="font-semibold text-brand-700 hover:underline block">
                            {r.guest_name}
                          </Link>
                          <div className="text-xs text-muted flex items-center gap-1.5">
                            <span>{r.lead_code}</span>
                            {r.guest_city && <span>· {r.guest_city}</span>}
                            <DemoBadge show={r.is_demo} />
                          </div>
                        </Td>
                        <Td>
                          <div className="text-sm font-medium whitespace-nowrap">{r.guest_phone}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <a href={`tel:${r.guest_phone}`} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-0.5">
                              <Phone className="size-3" />Call
                            </a>
                            <WhatsAppHubModal
                              lead={r}
                              trigger={
                                <button
                                  type="button"
                                  className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                >
                                  <MessageCircle className="size-3" />WhatsApp Hub
                                </button>
                              }
                            />
                            <QuickWhatsAppGroupButton lead={r} />
                          </div>
                        </Td>
                        <Td>
                          <div className="font-medium">{r.prop_name ? r.prop_name.replace("STAYRA ", "") : <span className="text-muted">Any property</span>}</div>
                          <div className="text-xs text-muted">
                            {r.check_in ? `${fdate(r.check_in, false)} → ${fdate(r.check_out, false)}` : "Dates flexible"}
                            {` · ${r.adults + r.children} guest${r.adults + r.children > 1 ? "s" : ""}`}
                          </div>
                        </Td>
                        <Td>
                          <div>{LEAD_SOURCE_LABEL[r.source] ?? r.source}</div>
                          {r.assigned_name && <div className="text-xs text-muted">Owner: {r.assigned_name}</div>}
                        </Td>
                        <Td className="text-right tabular">
                          {r.quoted_amount ? (
                            <div>
                              <div className="font-semibold text-ink">{inr0(r.quoted_amount)}</div>
                              {r.budget && <div className="text-[11px] text-muted">Budget {inr0(r.budget)}</div>}
                            </div>
                          ) : r.budget ? (
                            <span className="text-muted">Budget {inr0(r.budget)}</span>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>{renderReminderBadge(r)}</Td>
                        <Td>
                          <StatusBadge status={r.temperature} label={LEAD_TEMP_LABEL[r.temperature]} />
                        </Td>
                        <Td>
                          <div className="space-y-1">
                            <StatusBadge status={r.status} label={LEAD_STATUS_LABEL[r.status]} />
                            {r.booking_code && r.converted_booking_id && (
                              <div>
                                <Link href={`/bookings/${r.converted_booking_id}`} className="text-xs font-medium text-brand-700 hover:underline">
                                  → {r.booking_code}
                                </Link>
                              </div>
                            )}
                          </div>
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <WhatsAppHubModal lead={r} />
                            {canManage && (
                              <QuickStatusModal
                                lead={r}
                                action={updateLeadStatus}
                                trigger={
                                  <Button type="button" size="sm" variant="secondary">
                                    <Edit3 className="size-3.5" />Update
                                  </Button>
                                }
                              />
                            )}
                            {canBook && !r.converted_booking_id && r.status !== "lost" && (
                              <ConvertLeadModal
                                lead={r}
                                properties={props}
                                units={units}
                                canPay={canPay}
                                action={convertLeadToBooking}
                                trigger={
                                  <Button type="button" size="sm" variant="soft">
                                    <Sparkles className="size-3.5" />Convert
                                  </Button>
                                }
                              />
                            )}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <ul className="md:hidden divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/leads/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                          {r.guest_name}
                        </Link>
                        <div className="text-xs text-muted">{r.lead_code} · {r.guest_phone}</div>
                      </div>
                      <div className="flex gap-1">
                        <StatusBadge status={r.temperature} label={LEAD_TEMP_LABEL[r.temperature]} />
                        <StatusBadge status={r.status} label={LEAD_STATUS_LABEL[r.status]} />
                      </div>
                    </div>
                    <div className="text-xs text-muted">
                      {r.prop_name ? r.prop_name.replace("STAYRA ", "") : "Any property"} ·{" "}
                      {r.check_in ? `${fdate(r.check_in, false)} → ${fdate(r.check_out, false)}` : "Flexible dates"}
                      {r.quoted_amount ? ` · Quoted ${inr0(r.quoted_amount)}` : ""}
                    </div>
                    {r.next_follow_up_at && !r.reminder_completed && <div>{renderReminderBadge(r)}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {view === "table" && pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <LinkButton variant="secondary" size="sm" href={qs({ page: page - 1 })}>← Previous</LinkButton>}
            {page < pages && <LinkButton variant="secondary" size="sm" href={qs({ page: page + 1 })}>Next →</LinkButton>}
          </div>
        </div>
      )}
    </>
  );
}
