import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Phone, MessageCircle, Mail, AlarmClock, Calendar, Edit3,
  CheckCircle2, Sparkles, Clock, Send, FileText, ArrowRight, Users,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  fdate, fdatetime, inr, todayIST, addDays, daysBetween,
  LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, LEAD_TEMP_LABEL, LEAD_ACTIVITY_LABEL,
} from "@/lib/format";
import { propertyOptions, unitOptions, staffOptions, uuidParam } from "@/server/common";
import {
  Card, CardHeader, CardBody, PageHeader, Button, LinkButton,
  StatusBadge, Badge, KV, Input, Select, Textarea, Alert, DemoBadge,
} from "@/components/ui/core";
import { ActionForm, Field, SubmitButton, Modal } from "@/components/ui/forms";
import {
  LeadForm, QuickStatusModal, CompleteReminderButtons, ConvertLeadModal,
} from "@/components/lead-form";
import {
  WhatsAppHubModal, QuickWhatsAppGroupButton,
} from "@/components/whatsapp-hub";
import {
  updateLead, updateLeadStatus, addLeadActivity,
  scheduleFollowUp, completeReminder, convertLeadToBooking,
} from "../actions";

export const metadata = { title: "Lead Details — CRM" };

const cleanPhone = (p: string) => p.replace(/[^\d]/g, "").replace(/^0+/, "");
const waHref = (p: string, guest: string, code: string) => {
  const digits = cleanPhone(p);
  const intl = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(`Hi ${guest}, greetings from STAYRA! Following up regarding your stay inquiry (${code}).`);
  return `https://wa.me/${intl}?text=${text}`;
};

const PIPELINE_STEPS = ["new", "contacted", "quoted", "follow_up", "negotiation", "won"] as const;

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "operations", "accountant", "auditor"]);
  const { id } = await params;
  if (!uuidParam(id)) notFound();

  const t = todayIST();
  const canManage = can.manageLeads(u.role);
  const canBook = can.manageBookings(u.role);
  const canPay = can.recordGuestPayment(u.role);

  const data = await withUser(u.id, async (tx) => {
    const [lead] = await tx<{
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
      follow_up_time: string | null;
      follow_up_note: string | null;
      reminder_completed: boolean;
      last_contacted_at: string | null;
      assigned_to: string | null;
      assigned_name: string | null;
      converted_booking_id: string | null;
      booking_code: string | null;
      converted_at: string | null;
      is_demo: boolean;
      created_at: string;
      updated_at: string;
    }[]>`
      select l.id, l.lead_code, l.guest_name, l.guest_phone, l.guest_whatsapp, l.guest_email, l.guest_city,
        l.source::text, l.source_detail, l.status::text, l.temperature::text,
        l.property_id, p.name prop_name, l.unit_id, un.name unit_name,
        l.check_in::text, l.check_out::text, l.adults, l.children, l.rooms_needed,
        l.budget, l.quoted_amount, l.special_requests, l.notes, l.lost_reason,
        l.next_follow_up_at::text,
        (l.next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date::text follow_up_date,
        to_char(l.next_follow_up_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') follow_up_time,
        l.follow_up_note, l.reminder_completed, l.last_contacted_at::text,
        l.assigned_to, pr.full_name assigned_name,
        l.converted_booking_id, b.booking_code, l.converted_at::text,
        l.is_demo, l.created_at::text, l.updated_at::text
      from leads l
      left join properties p on p.id = l.property_id
      left join property_units un on un.id = l.unit_id
      left join profiles pr on pr.id = l.assigned_to
      left join bookings b on b.id = l.converted_booking_id
      where l.id = ${id}`;

    if (!lead) return null;

    const activities = await tx<{
      id: string;
      activity_type: string;
      summary: string;
      old_status: string | null;
      new_status: string | null;
      quoted_amount: string | null;
      follow_up_at: string | null;
      created_by_name: string | null;
      created_at: string;
    }[]>`
      select id, activity_type::text, summary, old_status::text, new_status::text,
        quoted_amount, follow_up_at::text, created_by_name, created_at::text
      from lead_activities
      where lead_id = ${id}
      order by created_at desc`;

    return {
      lead,
      activities,
      props: (await propertyOptions(tx)).filter((p) => p.status === "active" || p.status === "onboarding"),
      units: await unitOptions(tx),
      staff: await staffOptions(tx),
    };
  });

  if (!data) notFound();
  const { lead, activities, props, units, staff } = data;
  const nights = lead.check_in && lead.check_out ? daysBetween(lead.check_in, lead.check_out) : 0;
  const hasActiveReminder = !!lead.next_follow_up_at && !lead.reminder_completed && lead.status !== "won" && lead.status !== "lost";
  const isOverdue = hasActiveReminder && (lead.follow_up_date ?? "") < t;
  const isDueToday = hasActiveReminder && lead.follow_up_date === t;
  const stepIdx = PIPELINE_STEPS.indexOf(lead.status as (typeof PIPELINE_STEPS)[number]);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/leads", label: "Leads & CRM" }}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{lead.guest_name}</span>
            <span className="text-base font-normal text-muted">{lead.lead_code}</span>
            <StatusBadge status={lead.status} label={LEAD_STATUS_LABEL[lead.status]} />
            <StatusBadge status={lead.temperature} label={LEAD_TEMP_LABEL[lead.temperature]} />
            <DemoBadge show={lead.is_demo} />
          </span>
        }
        description={`${LEAD_SOURCE_LABEL[lead.source] ?? lead.source}${lead.source_detail ? ` (${lead.source_detail})` : ""} · Created ${fdatetime(lead.created_at)}${lead.assigned_name ? ` · Assigned to ${lead.assigned_name}` : ""}`}
        actions={
          <>
            <QuickWhatsAppGroupButton lead={lead} />
            <WhatsAppHubModal lead={lead} />
            <a
              href={`tel:${lead.guest_phone}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 h-10 text-sm font-medium text-ink hover:bg-sand-50 shadow-sm"
            >
              <Phone className="size-4 text-brand-700" />Call
            </a>
            {canManage && (
              <QuickStatusModal
                lead={lead}
                action={updateLeadStatus}
                trigger={
                  <Button type="button" variant="secondary">
                    <Edit3 />Update Stage
                  </Button>
                }
              />
            )}
            {canManage && (
              <Modal
                wide
                title={`Edit Lead ${lead.lead_code}`}
                description="Modify guest details, property preferences, quoted tariff, or follow-up reminder."
                trigger={
                  <Button type="button" variant="secondary">
                    Edit Details
                  </Button>
                }
              >
                <LeadForm
                  action={updateLead}
                  properties={props}
                  units={units}
                  staff={staff}
                  quickModal
                  initial={{
                    id: lead.id,
                    guest_name: lead.guest_name,
                    guest_phone: lead.guest_phone,
                    guest_whatsapp: lead.guest_whatsapp,
                    guest_email: lead.guest_email,
                    guest_city: lead.guest_city,
                    source: lead.source,
                    source_detail: lead.source_detail,
                    status: lead.status,
                    temperature: lead.temperature,
                    property_id: lead.property_id,
                    unit_id: lead.unit_id,
                    check_in: lead.check_in,
                    check_out: lead.check_out,
                    adults: lead.adults,
                    children: lead.children,
                    rooms_needed: lead.rooms_needed,
                    budget: lead.budget,
                    quoted_amount: lead.quoted_amount,
                    special_requests: lead.special_requests,
                    notes: lead.notes,
                    lost_reason: lead.lost_reason,
                    follow_up_date: lead.follow_up_date,
                    follow_up_time: lead.follow_up_time,
                    follow_up_note: lead.follow_up_note,
                    assigned_to: lead.assigned_to,
                  }}
                />
              </Modal>
            )}
            {canBook && !lead.converted_booking_id && lead.status !== "lost" && (
              <ConvertLeadModal
                lead={lead}
                properties={props}
                units={units}
                canPay={canPay}
                action={convertLeadToBooking}
              />
            )}
          </>
        }
      />

      {/* Pipeline Stage Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 flex-1">
            {PIPELINE_STEPS.map((st, idx) => {
              const active = lead.status === st;
              const passed = stepIdx >= idx && lead.status !== "lost";
              return (
                <ActionForm key={st} action={updateLeadStatus}>
                  <input type="hidden" name="id" value={lead.id} />
                  <input type="hidden" name="status" value={st} />
                  <button
                    type="submit"
                    disabled={!canManage || active}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium border transition ${
                      active
                        ? "bg-brand-700 text-white border-brand-700 shadow-sm"
                        : passed
                        ? "bg-brand-50 text-brand-900 border-brand-200 hover:bg-brand-100"
                        : "bg-gray-50 text-muted border-line hover:bg-gray-100"
                    }`}
                  >
                    <div className="text-[10px] uppercase opacity-75">Step {idx + 1}</div>
                    <div className="truncate font-semibold">{LEAD_STATUS_LABEL[st]}</div>
                  </button>
                </ActionForm>
              );
            })}
          </div>
          {lead.status === "lost" && (
            <Badge tone="red" className="px-3 py-1.5 text-xs">
              Marked Lost {lead.lost_reason ? `— ${lead.lost_reason}` : ""}
            </Badge>
          )}
        </div>
      </Card>

      {lead.converted_booking_id && (
        <Alert tone="green" title={`Converted to Booking ${lead.booking_code ?? ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
            <span>This inquiry was won and converted into a confirmed property booking on {fdatetime(lead.converted_at)}.</span>
            <LinkButton href={`/bookings/${lead.converted_booking_id}`} size="sm" variant="primary">
              View Booking {lead.booking_code} <ArrowRight className="size-3.5" />
            </LinkButton>
          </div>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Columns: WhatsApp Hub + Follow-up Reminder + Log Activity + Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* WhatsApp Communications Card */}
          <Card className="border-emerald-200 bg-emerald-50/20">
            <CardHeader
              title={
                <span className="flex items-center gap-2 text-emerald-900 font-semibold">
                  <MessageCircle className="size-4 text-emerald-700" />
                  <span>WhatsApp Team Group & Customer Automation Hub</span>
                </span>
              }
              description="Post lead alerts into your common staff WhatsApp Group, or send quotes, follow-ups, and upselling messages directly to the customer in 1 click."
              action={<WhatsAppHubModal lead={lead} />}
            />
            <CardBody className="pt-0">
              <div className="grid sm:grid-cols-2 gap-2.5">
                <div className="rounded-lg bg-white border border-line p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Users className="size-3.5 text-emerald-700" />1. Common Team Group
                    </span>
                    <Badge tone="green">Staff Alert</Badge>
                  </div>
                  <p className="text-[11.5px] text-muted">
                    Broadcasts complete lead card (guest contact, stay dates, pax, quote & PMS link) into your WhatsApp staff group.
                  </p>
                  <div className="pt-1">
                    <QuickWhatsAppGroupButton lead={lead} />
                  </div>
                </div>

                <div className="rounded-lg bg-white border border-line p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-brand-700" />2. Customer Messages
                    </span>
                    <Badge tone="blue">Direct to Guest</Badge>
                  </div>
                  <p className="text-[11.5px] text-muted">
                    Pre-filled templates: Quote & greeting, gentle follow-up, high demand urgency, 50% advance UPI, BBQ & meals upsell.
                  </p>
                  <div className="pt-1">
                    <WhatsAppHubModal
                      lead={lead}
                      trigger={
                        <Button type="button" size="sm" variant="secondary" className="h-7 text-xs">
                          Open Message Templates →
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Follow-up Reminder Card */}
          <Card className={isOverdue ? "border-red-300 bg-red-50/20" : isDueToday ? "border-amber-300 bg-amber-50/20" : ""}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <AlarmClock className={`size-4 ${isOverdue ? "text-red-600" : isDueToday ? "text-amber-600" : "text-brand-700"}`} />
                  <span>Follow-up Reminder</span>
                  {hasActiveReminder && (
                    <Badge tone={isOverdue ? "red" : isDueToday ? "amber" : "blue"}>
                      {isOverdue ? "Overdue" : isDueToday ? "Due Today" : "Scheduled"}
                    </Badge>
                  )}
                </span>
              }
              description="Never miss a guest call or payment follow-up."
              action={hasActiveReminder && canManage ? <CompleteReminderButtons leadId={lead.id} action={completeReminder} /> : null}
            />
            <CardBody className="space-y-4">
              {hasActiveReminder ? (
                <div className="rounded-lg bg-white border border-line p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      Due: {fdatetime(lead.next_follow_up_at)}
                    </div>
                    <div className="text-sm text-muted mt-0.5">
                      {lead.follow_up_note || "Follow up with guest regarding quotation & booking confirmation"}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {lead.reminder_completed
                    ? "Previous follow-up reminder was completed. Schedule the next follow-up below if needed."
                    : "No active follow-up reminder scheduled for this lead."}
                </p>
              )}

              {canManage && lead.status !== "won" && lead.status !== "lost" && (
                <ActionForm action={scheduleFollowUp} className="grid sm:grid-cols-4 gap-3 pt-2 border-t border-line items-end">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <Field name="follow_up_date" label="Reminder date" required>
                    <Input type="date" name="follow_up_date" defaultValue={lead.follow_up_date ?? addDays(t, 1)} />
                  </Field>
                  <Field name="follow_up_time" label="Time (IST)">
                    <Input type="time" name="follow_up_time" defaultValue={lead.follow_up_time ?? "11:00"} />
                  </Field>
                  <Field name="follow_up_note" label="What to follow up on" required className="sm:col-span-2">
                    <div className="flex gap-2">
                      <Input name="follow_up_note" defaultValue={lead.follow_up_note ?? ""} placeholder="e.g. Call at 5 PM for UPI advance" />
                      <SubmitButton className="shrink-0">
                        <Clock className="size-4" />Set Reminder
                      </SubmitButton>
                    </div>
                  </Field>
                </ActionForm>
              )}
            </CardBody>
          </Card>

          {/* Log Call / WhatsApp / Quote / Activity */}
          {canManage && (
            <Card>
              <CardHeader
                title="Log Call, WhatsApp, Quote or Note"
                description="Record every guest touchpoint and optionally update the pipeline stage or next follow-up."
              />
              <CardBody>
                <ActionForm action={addLeadActivity} resetOnSuccess className="space-y-4">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Field name="activity_type" label="Interaction type" required>
                      <Select name="activity_type" defaultValue="call">
                        <option value="call">Phone Call</option>
                        <option value="whatsapp">WhatsApp Message</option>
                        <option value="quote_sent">Quote / Tariff Sent</option>
                        <option value="email">Email</option>
                        <option value="note">Internal Note</option>
                      </Select>
                    </Field>
                    <Field name="new_status" label="Update stage (optional)">
                      <Select name="new_status" defaultValue="">
                        <option value="">Keep current ({LEAD_STATUS_LABEL[lead.status]})</option>
                        {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field name="quoted_amount" label="Updated quote (₹, optional)">
                      <Input name="quoted_amount" inputMode="decimal" defaultValue={lead.quoted_amount ?? ""} placeholder="e.g. 24000" />
                    </Field>
                  </div>
                  <Field name="summary" label="Call / Conversation summary" required>
                    <Textarea
                      name="summary"
                      rows={3}
                      placeholder="e.g. Spoke with guest, shared Mountain Retreat 3-night package at ₹24,000 + GST. Guest will confirm by tomorrow evening."
                    />
                  </Field>
                  <div className="grid sm:grid-cols-3 gap-3 pt-1">
                    <Field name="follow_up_date" label="Next follow-up date (optional)">
                      <Input type="date" name="follow_up_date" />
                    </Field>
                    <Field name="follow_up_time" label="Follow-up time">
                      <Input type="time" name="follow_up_time" defaultValue="11:00" />
                    </Field>
                    <Field name="follow_up_note" label="Follow-up agenda">
                      <Input name="follow_up_note" placeholder="e.g. Follow up on advance payment" />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <SubmitButton pendingText="Logging…">
                      <Send className="size-4" />Log Activity
                    </SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader
              title={`Activity & Call Timeline (${activities.length})`}
              description="Complete chronological history of calls, quotes, status changes, and reminders."
            />
            <CardBody>
              {activities.length === 0 ? (
                <p className="text-sm text-muted">No activities logged yet.</p>
              ) : (
                <ol className="relative border-l border-line ml-3 space-y-5">
                  {activities.map((a) => (
                    <li key={a.id} className="ml-5">
                      <span className="absolute -left-2.5 mt-1 size-5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 grid place-items-center text-[10px] font-bold">
                        •
                      </span>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={a.activity_type === "converted" ? "green" : a.activity_type === "quote_sent" ? "purple" : a.activity_type === "reminder_set" ? "amber" : "blue"}>
                            {LEAD_ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}
                          </Badge>
                          {a.new_status && (
                            <span className="text-xs text-muted">
                              {a.old_status ? `${LEAD_STATUS_LABEL[a.old_status] ?? a.old_status} → ` : ""}
                              <strong className="text-ink">{LEAD_STATUS_LABEL[a.new_status] ?? a.new_status}</strong>
                            </span>
                          )}
                          {a.quoted_amount && (
                            <Badge tone="green">Quoted {inr(a.quoted_amount)}</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          {fdatetime(a.created_at)}{a.created_by_name ? ` · ${a.created_by_name}` : ""}
                        </span>
                      </div>
                      <p className="text-sm text-ink mt-1.5 whitespace-pre-wrap">{a.summary}</p>
                      {a.follow_up_at && (
                        <p className="text-xs text-amber-800 mt-1 inline-flex items-center gap-1">
                          <AlarmClock className="size-3" />Follow-up scheduled for {fdatetime(a.follow_up_at)}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Guest Profile & Stay Requirements */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Guest & Inquiry Details" />
            <CardBody>
              <KV
                cols={2}
                items={[
                  ["Guest Name", lead.guest_name],
                  ["Phone", <a key="p" href={`tel:${lead.guest_phone}`} className="text-brand-700 hover:underline">{lead.guest_phone}</a>],
                  ["WhatsApp", lead.guest_whatsapp || lead.guest_phone],
                  ["Email", lead.guest_email ? <a key="e" href={`mailto:${lead.guest_email}`} className="text-brand-700 hover:underline">{lead.guest_email}</a> : "—"],
                  ["City / Origin", lead.guest_city || "—"],
                  ["Source", `${LEAD_SOURCE_LABEL[lead.source] ?? lead.source}${lead.source_detail ? ` (${lead.source_detail})` : ""}`],
                  ["Assigned Staff", lead.assigned_name || "Unassigned"],
                  ["Last Contacted", fdatetime(lead.last_contacted_at)],
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stay Preferences & Pricing" />
            <CardBody className="space-y-4">
              <KV
                cols={2}
                items={[
                  ["Interested Property", lead.prop_name ? <Link key="pr" href={`/properties/${lead.property_id}`} className="text-brand-700 hover:underline">{lead.prop_name}</Link> : "Any property"],
                  ["Preferred Room", lead.unit_name || "Any unit"],
                  ["Check-in", fdate(lead.check_in)],
                  ["Check-out", fdate(lead.check_out)],
                  ["Duration", nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : "Flexible"],
                  ["Guests & Rooms", `${lead.adults} adult${lead.adults > 1 ? "s" : ""}${lead.children > 0 ? `, ${lead.children} child${lead.children > 1 ? "ren" : ""}` : ""} · ${lead.rooms_needed} room${lead.rooms_needed > 1 ? "s" : ""}`],
                  ["Guest Budget", lead.budget ? inr(lead.budget) : "—"],
                  ["Quoted Tariff", lead.quoted_amount ? <span key="q" className="text-brand-800 font-semibold">{inr(lead.quoted_amount)}</span> : "Not quoted yet"],
                ]}
              />
              {lead.special_requests && (
                <div className="pt-3 border-t border-line">
                  <p className="text-xs text-muted">Special Requests</p>
                  <p className="text-sm text-ink mt-0.5 whitespace-pre-wrap">{lead.special_requests}</p>
                </div>
              )}
              {lead.notes && (
                <div className="pt-3 border-t border-line">
                  <p className="text-xs text-muted">Conversation Notes</p>
                  <p className="text-sm text-ink mt-0.5 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
