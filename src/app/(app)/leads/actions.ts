"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { can } from "@/lib/permissions";
import { LEAD_STATUS_LABEL } from "@/lib/format";

const LEAD_SOURCES = [
  "whatsapp", "phone_call", "instagram", "facebook", "website", "google",
  "airbnb_inquiry", "makemytrip_inquiry", "referral", "repeat_guest", "travel_agent", "walk_in", "other",
] as const;

const LEAD_STATUSES = [
  "new", "contacted", "quoted", "follow_up", "negotiation", "won", "lost",
] as const;

const LEAD_TEMPS = ["hot", "warm", "cold"] as const;
const LEAD_ACTIVITY_TYPES = ["note", "call", "whatsapp", "email", "quote_sent", "status_change", "reminder_set", "converted"] as const;
const METHODS = ["cash", "upi", "bank_transfer", "card", "ota_collection", "cheque", "other"] as const;

const deny = (m = "You don't have permission to manage leads.") => Object.assign(new Error(m), { code: "42501" });
const bad = (m: string) => Object.assign(new Error(m), { code: "P0001" });

const optMoney = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(String(v).replace(/[,₹\s]/g, ""))),
    z.number({ error: `${label} must be a number` }).finite().min(0, `${label} cannot be negative`).optional(),
  );

function toFollowUpTimestamptz(date?: string, time?: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "11:00";
  return `${date}T${t}:00+05:30`;
}

const LeadSchema = z.object({
  guest_name: zf.text("Guest name", 2),
  guest_phone: z.string({ error: "Phone number is required" }).trim().regex(/^[+\d\s-]{8,16}$/, "Enter a valid phone number"),
  guest_whatsapp: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().regex(/^[+\d\s-]{8,16}$/, "Enter a valid WhatsApp number").optional()),
  guest_email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().email("Enter a valid email").optional()),
  guest_city: zf.optText(),
  source: z.enum(LEAD_SOURCES),
  source_detail: zf.optText(),
  status: z.enum(LEAD_STATUSES).default("new"),
  temperature: z.enum(LEAD_TEMPS).default("warm"),
  property_id: zf.optUuid(),
  unit_id: zf.optUuid(),
  check_in: zf.optDate(),
  check_out: zf.optDate(),
  adults: z.preprocess((v) => (v === "" || v === undefined ? 2 : Number(v)), z.number().int().min(1).default(2)),
  children: z.preprocess((v) => (v === "" || v === undefined ? 0 : Number(v)), z.number().int().min(0).default(0)),
  rooms_needed: z.preprocess((v) => (v === "" || v === undefined ? 1 : Number(v)), z.number().int().min(1).default(1)),
  budget: optMoney("Budget"),
  quoted_amount: optMoney("Quoted amount"),
  special_requests: zf.optText(),
  notes: zf.optText(),
  lost_reason: zf.optText(),
  follow_up_date: zf.optDate(),
  follow_up_time: zf.optText(),
  follow_up_note: zf.optText(),
  assigned_to: zf.optUuid(),
  quick_modal: zf.optText(),
}).refine((v) => !v.check_in || !v.check_out || v.check_out > v.check_in, {
  message: "Check-out must be after check-in",
  path: ["check_out"],
});

export async function createLead(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(LeadSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  const followUpAt = toFollowUpTimestamptz(d.follow_up_date, d.follow_up_time);

  return attempt(async () => {
    const id = await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      const [lead] = await tx<{ id: string; lead_code: string }[]>`
        insert into leads (
          guest_name, guest_phone, guest_whatsapp, guest_email, guest_city,
          source, source_detail, status, temperature, property_id, unit_id,
          check_in, check_out, adults, children, rooms_needed,
          budget, quoted_amount, special_requests, notes, lost_reason,
          next_follow_up_at, follow_up_note, assigned_to, created_by
        ) values (
          ${d.guest_name}, ${d.guest_phone}, ${d.guest_whatsapp ?? d.guest_phone}, ${d.guest_email ?? null}, ${d.guest_city ?? null},
          ${d.source}, ${d.source_detail ?? null}, ${d.status}, ${d.temperature}, ${d.property_id ?? null}, ${d.unit_id ?? null},
          ${d.check_in ?? null}, ${d.check_out ?? null}, ${d.adults}, ${d.children}, ${d.rooms_needed},
          ${d.budget ?? null}, ${d.quoted_amount ?? null}, ${d.special_requests ?? null}, ${d.notes ?? null}, ${d.lost_reason ?? null},
          ${followUpAt}, ${d.follow_up_note ?? null}, ${d.assigned_to ?? u.id}, ${u.id}
        ) returning id, lead_code`;

      await tx`
        insert into lead_activities (lead_id, activity_type, summary, new_status, quoted_amount, follow_up_at, created_by, created_by_name)
        values (
          ${lead.id}, 'note',
          ${d.notes ? `Lead created: ${d.notes}` : `Lead ${lead.lead_code} created (${LEAD_STATUS_LABEL[d.status] ?? d.status})`},
          ${d.status}, ${d.quoted_amount ?? null}, ${followUpAt}, ${u.id}, ${u.fullName}
        )`;
      return lead.id;
    });
    revalidatePath("/leads");
    revalidatePath("/");
    return d.quick_modal
      ? { message: "Lead added to CRM" }
      : { message: "Lead created", redirectTo: `/leads/${id}` };
  });
}

const UpdateLeadSchema = LeadSchema.extend({
  id: zf.uuid("lead"),
});

export async function updateLead(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(UpdateLeadSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  const followUpAt = toFollowUpTimestamptz(d.follow_up_date, d.follow_up_time);

  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      const [old] = await tx<{ status: string; quoted_amount: string | null }[]>`select status::text, quoted_amount from leads where id = ${d.id}`;
      if (!old) throw deny();

      await tx`
        update leads set
          guest_name = ${d.guest_name},
          guest_phone = ${d.guest_phone},
          guest_whatsapp = ${d.guest_whatsapp ?? null},
          guest_email = ${d.guest_email ?? null},
          guest_city = ${d.guest_city ?? null},
          source = ${d.source},
          source_detail = ${d.source_detail ?? null},
          status = ${d.status},
          temperature = ${d.temperature},
          property_id = ${d.property_id ?? null},
          unit_id = ${d.unit_id ?? null},
          check_in = ${d.check_in ?? null},
          check_out = ${d.check_out ?? null},
          adults = ${d.adults},
          children = ${d.children},
          rooms_needed = ${d.rooms_needed},
          budget = ${d.budget ?? null},
          quoted_amount = ${d.quoted_amount ?? null},
          special_requests = ${d.special_requests ?? null},
          notes = ${d.notes ?? null},
          lost_reason = ${d.lost_reason ?? null},
          next_follow_up_at = ${followUpAt},
          follow_up_note = ${d.follow_up_note ?? null},
          assigned_to = ${d.assigned_to ?? null}
        where id = ${d.id}`;

      if (old.status !== d.status) {
        await tx`
          insert into lead_activities (lead_id, activity_type, summary, old_status, new_status, quoted_amount, follow_up_at, created_by, created_by_name)
          values (
            ${d.id}, 'status_change',
            ${`Status updated from ${LEAD_STATUS_LABEL[old.status] ?? old.status} to ${LEAD_STATUS_LABEL[d.status] ?? d.status}` + (d.lost_reason && d.status === "lost" ? ` (${d.lost_reason})` : "")},
            ${old.status}, ${d.status}, ${d.quoted_amount ?? null}, ${followUpAt}, ${u.id}, ${u.fullName}
          )`;
      }
    });
    revalidatePath(`/leads/${d.id}`);
    revalidatePath("/leads");
    revalidatePath("/");
    return { message: "Lead updated" };
  });
}

const QuickStatusSchema = z.object({
  id: zf.uuid("lead"),
  status: z.enum(LEAD_STATUSES),
  temperature: z.enum(LEAD_TEMPS).optional(),
  quoted_amount: optMoney("Quoted amount"),
  lost_reason: zf.optText(),
  follow_up_date: zf.optDate(),
  follow_up_time: zf.optText(),
  follow_up_note: zf.optText(),
  note: zf.optText(),
});

export async function updateLeadStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(QuickStatusSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  const followUpAt = toFollowUpTimestamptz(d.follow_up_date, d.follow_up_time);

  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      const [old] = await tx<{ status: string; temperature: string; quoted_amount: string | null; next_follow_up_at: string | null; follow_up_note: string | null; lost_reason: string | null }[]>`
        select status::text, temperature::text, quoted_amount, next_follow_up_at::text, follow_up_note, lost_reason
        from leads where id = ${d.id} for update`;
      if (!old) throw deny();

      await tx`
        update leads set
          status = ${d.status},
          temperature = ${d.temperature ?? old.temperature},
          quoted_amount = ${d.quoted_amount !== undefined ? d.quoted_amount : old.quoted_amount},
          lost_reason = ${d.status === "lost" ? (d.lost_reason ?? old.lost_reason) : old.lost_reason},
          next_follow_up_at = ${followUpAt ?? (d.status === "won" || d.status === "lost" ? null : old.next_follow_up_at)},
          follow_up_note = ${d.follow_up_note !== undefined ? d.follow_up_note : old.follow_up_note}
        where id = ${d.id}`;

      const summaryParts = [`Status → ${LEAD_STATUS_LABEL[d.status] ?? d.status}`];
      if (d.quoted_amount !== undefined) summaryParts.push(`Quoted ₹${d.quoted_amount.toLocaleString("en-IN")}`);
      if (d.status === "lost" && d.lost_reason) summaryParts.push(`Reason: ${d.lost_reason}`);
      if (d.note) summaryParts.push(d.note);
      if (followUpAt && d.follow_up_note) summaryParts.push(`Next follow-up: ${d.follow_up_note}`);

      await tx`
        insert into lead_activities (lead_id, activity_type, summary, old_status, new_status, quoted_amount, follow_up_at, created_by, created_by_name)
        values (
          ${d.id}, 'status_change', ${summaryParts.join(" · ")},
          ${old.status}, ${d.status}, ${d.quoted_amount ?? null}, ${followUpAt}, ${u.id}, ${u.fullName}
        )`;
    });
    revalidatePath(`/leads/${d.id}`);
    revalidatePath("/leads");
    revalidatePath("/");
    return { message: `Status updated to ${LEAD_STATUS_LABEL[d.status] ?? d.status}` };
  });
}

const ActivitySchema = z.object({
  lead_id: zf.uuid("lead"),
  activity_type: z.enum(LEAD_ACTIVITY_TYPES).default("note"),
  summary: zf.text("Activity note / summary", 2),
  new_status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(LEAD_STATUSES).optional()),
  temperature: z.preprocess((v) => (v === "" ? undefined : v), z.enum(LEAD_TEMPS).optional()),
  quoted_amount: optMoney("Quoted amount"),
  follow_up_date: zf.optDate(),
  follow_up_time: zf.optText(),
  follow_up_note: zf.optText(),
});

export async function addLeadActivity(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(ActivitySchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  const followUpAt = toFollowUpTimestamptz(d.follow_up_date, d.follow_up_time);

  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      const [old] = await tx<{ status: string; temperature: string; quoted_amount: string | null; next_follow_up_at: string | null; follow_up_note: string | null }[]>`
        select status::text, temperature::text, quoted_amount, next_follow_up_at::text, follow_up_note
        from leads where id = ${d.lead_id} for update`;
      if (!old) throw deny();

      const nextStatus = d.new_status ?? (old.status === "new" && ["call", "whatsapp", "email", "quote_sent"].includes(d.activity_type)
        ? (d.activity_type === "quote_sent" ? "quoted" : "contacted")
        : old.status);

      await tx`
        update leads set
          status = ${nextStatus},
          temperature = ${d.temperature ?? old.temperature},
          quoted_amount = ${d.quoted_amount !== undefined ? d.quoted_amount : old.quoted_amount},
          last_contacted_at = ${["call", "whatsapp", "email", "quote_sent"].includes(d.activity_type) ? tx`now()` : tx`last_contacted_at`},
          next_follow_up_at = ${followUpAt ?? old.next_follow_up_at},
          follow_up_note = ${d.follow_up_note ?? (followUpAt ? d.summary : old.follow_up_note)},
          reminder_completed = ${followUpAt ? false : tx`reminder_completed`}
        where id = ${d.lead_id}`;

      await tx`
        insert into lead_activities (lead_id, activity_type, summary, old_status, new_status, quoted_amount, follow_up_at, created_by, created_by_name)
        values (
          ${d.lead_id}, ${d.activity_type}, ${d.summary},
          ${old.status !== nextStatus ? old.status : null},
          ${old.status !== nextStatus ? nextStatus : null},
          ${d.quoted_amount ?? null}, ${followUpAt}, ${u.id}, ${u.fullName}
        )`;
    });
    revalidatePath(`/leads/${d.lead_id}`);
    revalidatePath("/leads");
    revalidatePath("/");
    return { message: "Activity logged" };
  });
}

const ReminderSchema = z.object({
  lead_id: zf.uuid("lead"),
  follow_up_date: zf.date("Follow-up date"),
  follow_up_time: zf.optText(),
  follow_up_note: zf.text("Reminder note", 2),
});

export async function scheduleFollowUp(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(ReminderSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  const followUpAt = toFollowUpTimestamptz(d.follow_up_date, d.follow_up_time)!;

  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      await tx`
        update leads set
          next_follow_up_at = ${followUpAt},
          follow_up_note = ${d.follow_up_note},
          reminder_completed = false,
          status = case when status = 'new' then 'follow_up'::lead_status else status end
        where id = ${d.lead_id}`;

      await tx`
        insert into lead_activities (lead_id, activity_type, summary, follow_up_at, created_by, created_by_name)
        values (${d.lead_id}, 'reminder_set', ${`Follow-up reminder set: ${d.follow_up_note}`}, ${followUpAt}, ${u.id}, ${u.fullName})`;
    });
    revalidatePath(`/leads/${d.lead_id}`);
    revalidatePath("/leads");
    revalidatePath("/");
    return { message: "Follow-up reminder scheduled" };
  });
}

export async function completeReminder(_: ActionState, fd: FormData): Promise<ActionState> {
  const leadId = String(fd.get("lead_id") ?? "");
  const op = String(fd.get("op") ?? "done"); // "done" | "snooze_1d" | "snooze_3d"
  const note = String(fd.get("note") ?? "").trim();

  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      if (op === "snooze_1d" || op === "snooze_3d") {
        const days = op === "snooze_1d" ? 1 : 3;
        const [updated] = await tx<{ next_follow_up_at: string }[]>`
          update leads set
            next_follow_up_at = coalesce(greatest(next_follow_up_at, now()), now()) + (${days} || ' days')::interval,
            reminder_completed = false
          where id = ${leadId}
          returning next_follow_up_at::text`;
        if (!updated) throw deny();
        await tx`
          insert into lead_activities (lead_id, activity_type, summary, follow_up_at, created_by, created_by_name)
          values (${leadId}, 'reminder_set', ${`Reminder snoozed by ${days} day${days > 1 ? "s" : ""}` + (note ? `: ${note}` : "")}, ${updated.next_follow_up_at}, ${u.id}, ${u.fullName})`;
      } else {
        await tx`
          update leads set
            reminder_completed = true,
            last_contacted_at = now()
          where id = ${leadId}`;
        await tx`
          insert into lead_activities (lead_id, activity_type, summary, created_by, created_by_name)
          values (${leadId}, 'call', ${note || "Follow-up reminder completed"}, ${u.id}, ${u.fullName})`;
      }
    });
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");
    return { message: op.startsWith("snooze") ? "Reminder snoozed" : "Follow-up marked complete" };
  });
}

const ConvertSchema = z.object({
  lead_id: zf.uuid("lead"),
  property_id: zf.uuid("a property"),
  unit_id: zf.uuid("a room"),
  check_in: zf.date("Check-in"),
  check_out: zf.date("Check-out"),
  adults: zf.int("Adults", 1),
  children: zf.int("Children", 0),
  room_amount: zf.money("Room amount", { positive: true }),
  discount: zf.money("Discount"),
  tax_amount: zf.money("Taxes"),
  ota_commission: zf.money("OTA commission"),
  status: z.enum(["confirmed", "pending"]),
  advance: zf.money("Advance"),
  advance_method: z.enum(METHODS).optional().or(z.literal("").transform(() => undefined)),
  notes: zf.optText(),
}).refine((v) => v.check_out > v.check_in, { message: "Check-out must be after check-in", path: ["check_out"] })
  .refine((v) => v.discount <= v.room_amount, { message: "Discount cannot exceed room amount", path: ["discount"] })
  .refine((v) => !v.advance || v.advance_method, { message: "Select how the advance was paid", path: ["advance_method"] })
  .refine((v) => v.advance <= v.room_amount - v.discount + v.tax_amount, { message: "Advance cannot exceed the booking total", path: ["advance"] });

const LEAD_TO_BOOKING_SOURCE: Record<string, string> = {
  whatsapp: "direct",
  phone_call: "direct",
  instagram: "direct",
  facebook: "direct",
  website: "direct",
  google: "direct",
  airbnb_inquiry: "airbnb",
  makemytrip_inquiry: "makemytrip",
  referral: "direct",
  repeat_guest: "direct",
  travel_agent: "travel_agent",
  walk_in: "walk_in",
  other: "other",
};

export async function convertLeadToBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(ConvertSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;

  return attempt(async () => {
    const bookingId = await db(async (tx, u) => {
      if (!can.manageBookings(u.role)) throw deny("You don't have permission to create bookings.");
      const [lead] = await tx<{ id: string; lead_code: string; guest_name: string; guest_phone: string; guest_email: string | null; source: string; status: string; converted_booking_id: string | null }[]>`
        select id, lead_code, guest_name, guest_phone, guest_email, source::text, status::text, converted_booking_id
        from leads where id = ${d.lead_id} for update`;
      if (!lead) throw deny();
      if (lead.converted_booking_id) throw bad("This lead has already been converted to a booking.");

      const [unit] = await tx<{ max_guests: number }[]>`select max_guests from property_units where id = ${d.unit_id} and property_id = ${d.property_id}`;
      if (!unit) throw bad("Select a room belonging to the chosen property.");
      if (d.adults + d.children > unit.max_guests + 2) throw bad(`This room allows ${unit.max_guests} guests (+2 extra beds at most).`);

      let guestId: string | undefined;
      if (lead.guest_phone) {
        const [g] = await tx<{ id: string }[]>`select id from guests where phone = ${lead.guest_phone} and lower(full_name) = lower(${lead.guest_name}) limit 1`;
        guestId = g?.id;
      }
      if (!guestId) {
        const [g] = await tx<{ id: string }[]>`
          insert into guests(full_name, phone, email, created_by)
          values (${lead.guest_name}, ${lead.guest_phone}, ${lead.guest_email ?? null}, ${u.id})
          returning id`;
        guestId = g.id;
      }

      const bSource = LEAD_TO_BOOKING_SOURCE[lead.source] ?? "direct";
      const [booking] = await tx<{ id: string; booking_code: string }[]>`
        insert into bookings(
          property_id, unit_id, guest_id, adults, children, check_in, check_out,
          source, source_reference, room_amount, discount, tax_amount,
          ota_commission, ota_collects_payment, status, notes, created_by
        ) values (
          ${d.property_id}, ${d.unit_id}, ${guestId}, ${d.adults}, ${d.children}, ${d.check_in}, ${d.check_out},
          ${bSource}, ${lead.lead_code}, ${d.room_amount}, ${d.discount}, ${d.tax_amount},
          ${d.ota_commission}, false, ${d.status}, ${d.notes ?? `Converted from CRM Lead ${lead.lead_code}`}, ${u.id}
        ) returning id, booking_code`;

      if (d.advance > 0) {
        if (!can.recordGuestPayment(u.role)) throw deny("You can create bookings but not record advance payments. Leave advance empty.");
        await tx`
          insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, received_by, idempotency_key, created_by)
          values (${booking.id}, ${d.property_id}, 'advance', ${d.advance}, ${d.advance_method!}, ${d.advance_method === "ota_collection" ? "ota" : "property"}, ${u.fullName}, ${`lead-conv-${lead.id}`}, ${u.id})`;
      }

      await tx`
        update leads set
          status = 'won',
          property_id = ${d.property_id},
          unit_id = ${d.unit_id},
          check_in = ${d.check_in},
          check_out = ${d.check_out},
          quoted_amount = ${d.room_amount - d.discount},
          converted_booking_id = ${booking.id},
          converted_at = now(),
          reminder_completed = true
        where id = ${lead.id}`;

      await tx`
        insert into lead_activities (lead_id, activity_type, summary, old_status, new_status, quoted_amount, created_by, created_by_name)
        values (
          ${lead.id}, 'converted',
          ${`Converted to booking ${booking.booking_code} (₹${(d.room_amount - d.discount + d.tax_amount).toLocaleString("en-IN")})`},
          ${lead.status}, 'won', ${d.room_amount - d.discount}, ${u.id}, ${u.fullName}
        )`;

      return booking.id;
    });

    revalidatePath(`/leads/${d.lead_id}`);
    revalidatePath("/leads");
    revalidatePath("/bookings");
    revalidatePath("/calendar");
    revalidatePath("/");
    return { message: "Lead converted to booking!", redirectTo: `/bookings/${bookingId}` };
  });
}

function splitCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === "," || ch === "\t") && !inQuotes) {
      res.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  res.push(cur.trim());
  return res;
}

export async function importLeadsCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const defaultPropertyId = String(fd.get("property_id") ?? "").trim() || null;
  let text = String(fd.get("csv_text") ?? "").trim();
  const file = fd.get("csv_file");
  if (file instanceof File && file.size > 0) {
    text = (await file.text()).trim();
  }
  if (!text) return { error: "Upload a CSV file or paste CSV rows to import.", at: Date.now() };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "Include a header row and at least one lead row.", at: Date.now() };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));
  const idx = (names: string[]) => headers.findIndex((h) => names.includes(h));

  const iName = idx(["guest_name", "name", "full_name", "guest", "lead_name"]);
  const iPhone = idx(["guest_phone", "phone", "mobile", "contact", "phone_number", "whatsapp"]);
  if (iName === -1 || iPhone === -1) {
    return { error: "CSV must include 'guest_name' (or 'name') and 'guest_phone' (or 'phone') columns.", at: Date.now() };
  }
  const iWhatsapp = idx(["guest_whatsapp", "whatsapp", "whatsapp_number"]);
  const iEmail = idx(["guest_email", "email"]);
  const iCity = idx(["guest_city", "city", "location"]);
  const iSource = idx(["source", "lead_source", "channel"]);
  const iStatus = idx(["status", "lead_status", "stage"]);
  const iTemp = idx(["temperature", "priority", "rating"]);
  const iCheckIn = idx(["check_in", "checkin", "arrival"]);
  const iCheckOut = idx(["check_out", "checkout", "departure"]);
  const iAdults = idx(["adults", "guests", "pax"]);
  const iChildren = idx(["children", "kids"]);
  const iRooms = idx(["rooms_needed", "rooms"]);
  const iBudget = idx(["budget", "expected_budget"]);
  const iQuoted = idx(["quoted_amount", "quote", "quoted"]);
  const iFollowDate = idx(["next_follow_up_date", "follow_up_date", "followup_date", "reminder_date"]);
  const iFollowNote = idx(["follow_up_note", "followup_note", "reminder_note"]);
  const iNotes = idx(["notes", "remarks", "special_requests", "comment"]);

  return attempt(async () => {
    const count = await db(async (tx, u) => {
      if (!can.manageLeads(u.role)) throw deny();
      let imported = 0;
      for (let r = 1; r < lines.length; r++) {
        const cols = splitCsvLine(lines[r]);
        const name = cols[iName]?.trim();
        const phone = cols[iPhone]?.trim();
        if (!name || !phone) continue;

        const rawSource = (iSource >= 0 ? cols[iSource] : "")?.toLowerCase().replace(/\s+/g, "_") ?? "whatsapp";
        const source = (LEAD_SOURCES as readonly string[]).includes(rawSource) ? rawSource : "whatsapp";

        const rawStatus = (iStatus >= 0 ? cols[iStatus] : "")?.toLowerCase().replace(/\s+/g, "_") ?? "new";
        const status = (LEAD_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : "new";

        const rawTemp = (iTemp >= 0 ? cols[iTemp] : "")?.toLowerCase().trim() ?? "warm";
        const temperature = (LEAD_TEMPS as readonly string[]).includes(rawTemp) ? rawTemp : "warm";

        const ci = iCheckIn >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(cols[iCheckIn] ?? "") ? cols[iCheckIn] : null;
        const co = iCheckOut >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(cols[iCheckOut] ?? "") && (!ci || cols[iCheckOut] > ci) ? cols[iCheckOut] : null;
        const adults = Math.max(1, parseInt(iAdults >= 0 ? cols[iAdults] : "2", 10) || 2);
        const children = Math.max(0, parseInt(iChildren >= 0 ? cols[iChildren] : "0", 10) || 0);
        const rooms = Math.max(1, parseInt(iRooms >= 0 ? cols[iRooms] : "1", 10) || 1);
        const budget = iBudget >= 0 && cols[iBudget] ? Number(cols[iBudget].replace(/[,₹\s]/g, "")) || null : null;
        const quoted = iQuoted >= 0 && cols[iQuoted] ? Number(cols[iQuoted].replace(/[,₹\s]/g, "")) || null : null;
        const followDate = iFollowDate >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(cols[iFollowDate] ?? "") ? `${cols[iFollowDate]}T11:00:00+05:30` : null;
        const followNote = iFollowNote >= 0 ? cols[iFollowNote] || null : null;
        const notes = iNotes >= 0 ? cols[iNotes] || null : null;

        const [ins] = await tx<{ id: string }[]>`
          insert into leads (
            guest_name, guest_phone, guest_whatsapp, guest_email, guest_city,
            source, status, temperature, property_id, check_in, check_out,
            adults, children, rooms_needed, budget, quoted_amount,
            next_follow_up_at, follow_up_note, notes, assigned_to, created_by
          ) values (
            ${name}, ${phone}, ${iWhatsapp >= 0 && cols[iWhatsapp] ? cols[iWhatsapp] : phone},
            ${iEmail >= 0 && cols[iEmail] ? cols[iEmail] : null},
            ${iCity >= 0 && cols[iCity] ? cols[iCity] : null},
            ${source}, ${status}, ${temperature}, ${defaultPropertyId}, ${ci}, ${co},
            ${adults}, ${children}, ${rooms}, ${budget}, ${quoted},
            ${followDate}, ${followNote}, ${notes}, ${u.id}, ${u.id}
          ) returning id`;

        await tx`
          insert into lead_activities (lead_id, activity_type, summary, new_status, created_by, created_by_name)
          values (${ins.id}, 'note', 'Imported via CSV bulk upload', ${status}, ${u.id}, ${u.fullName})`;
        imported++;
      }
      if (imported === 0) throw bad("No valid rows found in CSV.");
      return imported;
    });
    revalidatePath("/leads");
    revalidatePath("/");
    return { message: `Imported ${count} lead${count === 1 ? "" : "s"} successfully` };
  });
}
