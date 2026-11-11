"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { saveUpload, isRealFile } from "@/lib/storage";
import { can } from "@/lib/permissions";

const SOURCES = ["direct", "airbnb", "booking_com", "makemytrip", "goibibo", "agoda", "expedia", "walk_in", "travel_agent", "corporate", "other"] as const;
const METHODS = ["cash", "upi", "bank_transfer", "card", "ota_collection", "cheque", "other"] as const;
const deny = (m = "You don't have permission to do this.") => Object.assign(new Error(m), { code: "42501" });
const bad = (m: string) => Object.assign(new Error(m), { code: "P0001" });

const BookingSchema = z.object({
  property_id: zf.uuid("a property"), unit_id: zf.uuid("a room"),
  guest_name: zf.text("Guest name", 2),
  guest_phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[+\d\s-]{8,15}$/, "Enter a valid phone").optional()),
  guest_email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email("Enter a valid email").optional()),
  adults: zf.int("Adults", 1), children: zf.int("Children", 0),
  check_in: zf.date("Check-in"), check_out: zf.date("Check-out"),
  source: z.enum(SOURCES), source_reference: zf.optText(),
  room_amount: zf.money("Room amount"), discount: zf.money("Discount"), tax_amount: zf.money("Taxes"), ota_commission: zf.money("OTA commission"),
  ota_collects_payment: zf.bool(), status: z.enum(["confirmed", "pending"]), notes: zf.optText(),
  advance: zf.money("Advance"), advance_method: z.enum(METHODS).optional().or(z.literal("").transform(() => undefined)),
  idem: zf.optText(),
}).refine((v) => v.check_out > v.check_in, { message: "Check-out must be after check-in", path: ["check_out"] })
  .refine((v) => v.discount <= v.room_amount, { message: "Discount cannot exceed room amount", path: ["discount"] })
  .refine((v) => !v.advance || v.advance_method, { message: "Select how the advance was paid", path: ["advance_method"] })
  .refine((v) => v.advance <= v.room_amount - v.discount + v.tax_amount, { message: "Advance cannot exceed the booking total", path: ["advance"] });

export async function createBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(BookingSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    const id = await db(async (tx, u) => {
      if (!can.manageBookings(u.role)) throw deny();
      const [unit] = await tx<{ max_guests: number }[]>`select max_guests from property_units where id = ${d.unit_id} and property_id = ${d.property_id}`;
      if (!unit) throw bad("Select a room of the chosen property.");
      if (d.adults + d.children > unit.max_guests + 2) throw bad(`This room allows ${unit.max_guests} guests (+2 extra beds at most).`);
      let guestId: string | undefined;
      if (d.guest_phone) [{ id: guestId } = { id: undefined as unknown as string }] = await tx<{ id: string }[]>`select id from guests where phone = ${d.guest_phone} and lower(full_name) = lower(${d.guest_name}) limit 1`;
      if (!guestId) [{ id: guestId }] = await tx<{ id: string }[]>`insert into guests(full_name, phone, email, created_by) values (${d.guest_name}, ${d.guest_phone ?? null}, ${d.guest_email ?? null}, ${u.id}) returning id`;
      const [b] = await tx<{ id: string }[]>`insert into bookings(property_id, unit_id, guest_id, adults, children, check_in, check_out, source, source_reference, room_amount, discount, tax_amount,
          ota_commission, ota_collects_payment, status, notes, created_by)
        values (${d.property_id}, ${d.unit_id}, ${guestId}, ${d.adults}, ${d.children}, ${d.check_in}, ${d.check_out}, ${d.source}, ${d.source_reference ?? null}, ${d.room_amount}, ${d.discount},
          ${d.tax_amount}, ${d.ota_commission}, ${d.ota_collects_payment}, ${d.status}, ${d.notes ?? null}, ${u.id}) returning id`;
      if (d.advance > 0) {
        if (!can.recordGuestPayment(u.role)) throw deny("You can create bookings but not record payments. Leave advance empty.");
        await tx`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, received_by, idempotency_key, created_by)
          values (${b.id}, ${d.property_id}, 'advance', ${d.advance}, ${d.advance_method!}, ${d.advance_method === "ota_collection" ? "ota" : "property"}, ${u.fullName}, ${d.idem ?? null}, ${u.id})`;
      }
      return b.id;
    });
    revalidatePath("/bookings"); revalidatePath("/calendar");
    return { message: "Booking created", redirectTo: `/bookings/${id}` };
  });
}

const EditSchema = z.object({
  id: zf.uuid("booking"), unit_id: zf.uuid("a room"), adults: zf.int("Adults", 1), children: zf.int("Children", 0),
  check_in: zf.date("Check-in"), check_out: zf.date("Check-out"), source: z.enum(SOURCES), source_reference: zf.optText(),
  room_amount: zf.money("Room amount"), discount: zf.money("Discount"), tax_amount: zf.money("Taxes"), ota_commission: zf.money("OTA commission"),
  ota_collects_payment: zf.bool(), notes: zf.optText(),
}).refine((v) => v.check_out > v.check_in, { message: "Check-out must be after check-in", path: ["check_out"] });

export async function updateBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(EditSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx) => {
      const r = await tx`update bookings set unit_id = ${d.unit_id}, adults = ${d.adults}, children = ${d.children}, check_in = ${d.check_in}, check_out = ${d.check_out}, source = ${d.source},
        source_reference = ${d.source_reference ?? null}, room_amount = ${d.room_amount}, discount = ${d.discount}, tax_amount = ${d.tax_amount}, ota_commission = ${d.ota_commission},
        ota_collects_payment = ${d.ota_collects_payment}, notes = ${d.notes ?? null} where id = ${d.id} and status not in ('cancelled','no_show')`;
      if (!r.count) throw deny();
    });
    revalidatePath(`/bookings/${d.id}`);
    return { message: "Booking updated" };
  });
}

const TRANSITIONS: Record<string, string[]> = { confirm: ["pending"], check_in: ["confirmed"], check_out: ["checked_in"], cancel: ["pending", "confirmed"], no_show: ["confirmed", "pending"] };
const TARGET: Record<string, string> = { confirm: "confirmed", check_in: "checked_in", check_out: "checked_out", cancel: "cancelled", no_show: "no_show" };

export async function changeBookingStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const op = String(fd.get("op"));
  if (!TARGET[op]) return { error: "Unknown action", at: Date.now() };
  const charge = fd.get("cancellation_charge") ? Number(String(fd.get("cancellation_charge")).replace(/[,₹]/g, "")) : 0;
  const reason = String(fd.get("reason") ?? "").trim();
  if (!(charge >= 0)) return { error: "Enter a valid cancellation charge", fieldErrors: { cancellation_charge: "Invalid amount" }, at: Date.now() };
  if ((op === "cancel" || op === "no_show") && reason.length < 3) return { error: "Enter a reason", fieldErrors: { reason: "Required" }, at: Date.now() };
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageBookings(u.role)) throw deny();
      const [b] = await tx<{ status: string; check_in: string; room_amount: string; discount: string; tax_amount: string }[]>`select status::text, check_in, room_amount, discount, tax_amount from bookings where id = ${id} for update`;
      if (!b) throw deny();
      if (!TRANSITIONS[op].includes(b.status)) throw bad(`Cannot ${op.replace("_", " ")} a ${b.status.replace("_", " ")} booking.`);
      if (charge > Number(b.room_amount) - Number(b.discount) + Number(b.tax_amount)) throw bad("Cancellation charge cannot exceed the booking total.");
      if (op === "check_in") {
        const [unit] = await tx<{ readiness: string }[]>`select u.readiness::text from property_units u join bookings b on b.unit_id = u.id where b.id = ${id}`;
        if (unit?.readiness === "out_of_order") throw bad("Room is out of order. Move the guest to another room first.");
      }
      await tx`update bookings set status = ${TARGET[op]}, cancellation_charge = ${op === "cancel" || op === "no_show" ? charge : tx`cancellation_charge`},
        cancellation_reason = ${reason || null}, tax_amount = ${op === "cancel" || op === "no_show" ? 0 : tx`tax_amount`},
        ota_commission = ${op === "cancel" || op === "no_show" ? tx`least(ota_commission, ${charge})` : tx`ota_commission`} where id = ${id}`;
    });
    revalidatePath(`/bookings/${id}`); revalidatePath("/bookings"); revalidatePath("/calendar");
    return { message: { confirm: "Booking confirmed", check_in: "Guest checked in", check_out: "Guest checked out — cleaning task created", cancel: "Booking cancelled", no_show: "Marked as no-show" }[op] };
  });
}

const PaySchema = z.object({
  booking_id: zf.uuid("booking"), entry_type: z.enum(["advance", "partial", "full", "refund"]), amount: zf.money("Amount", { positive: true }),
  method: z.enum(METHODS), collected_by: z.enum(["property", "ota", "stayra"]), reference: zf.optText(), paid_at: zf.date("Date"), notes: zf.optText(),
  reduces_revenue: zf.bool(), idem: zf.text("Form key"),
});
export async function recordGuestPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(PaySchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.recordGuestPayment(u.role)) throw deny();
      const [dup] = await tx`select 1 from booking_payments where idempotency_key = ${d.idem}`;
      if (dup) return; // double submit → already recorded
      let docId: string | null = null;
      const file = fd.get("receipt");
      const [b] = await tx<{ property_id: string }[]>`select property_id from bookings where id = ${d.booking_id}`;
      if (!b) throw deny();
      if (isRealFile(file)) docId = await saveUpload(tx, { file, entityType: "booking", entityId: d.booking_id, propertyId: b.property_id, userId: u.id });
      await tx`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, reference, paid_at, received_by, notes, document_id, idempotency_key, created_by)
        values (${d.booking_id}, ${b.property_id}, ${d.entry_type}, ${d.amount}, ${d.method}, ${d.collected_by}, ${d.reference ?? null}, ${d.paid_at + "T12:00:00+05:30"}, ${u.fullName}, ${d.notes ?? null}, ${docId}, ${d.idem}, ${u.id})`;
      if (d.entry_type === "refund" && d.reduces_revenue) {
        if (!can.adjustments(u.role)) throw deny("Only Accountant / Super Admin can record a refund that reduces revenue.");
        await tx`insert into financial_adjustments(property_id, booking_id, adj_date, kind, amount, reason, created_by)
          values (${b.property_id}, ${d.booking_id}, ${d.paid_at}, 'revenue', ${-d.amount}, ${"Guest refund reduces revenue" + (d.notes ? ": " + d.notes : "")}, ${u.id})`;
      }
    });
    revalidatePath(`/bookings/${d.booking_id}`);
    return { message: d.entry_type === "refund" ? "Refund recorded" : "Payment recorded" };
  });
}

export async function reversePayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("payment_id")); const bookingId = String(fd.get("booking_id")); const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Explain why this entry is being reversed", fieldErrors: { reason: "At least 5 characters" }, at: Date.now() };
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageFinance(u.role)) throw deny("Only Admin / Accountant can reverse ledger entries.");
      await tx`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, reversal_of, notes, created_by)
        select booking_id, property_id, 'reversal', amount, method, collected_by, id, ${"Reversal: " + reason}, ${u.id} from booking_payments where id = ${id} and booking_id = ${bookingId}`;
    });
    revalidatePath(`/bookings/${bookingId}`);
    return { message: "Entry reversed (original kept for audit)" };
  });
}

const ChargeSchema = z.object({ booking_id: zf.uuid("booking"), category_id: zf.uuid("a category"), description: zf.text("Description"), amount: zf.money("Amount", { positive: true }), txn_date: zf.date("Date") });
export async function addFolioCharge(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(ChargeSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.addIncome(u.role)) throw deny();
      await tx`insert into income(property_id, booking_id, category_id, description, amount, txn_date, collection_status, received_by, created_by)
        select property_id, id, ${d.category_id}, ${d.description}, ${d.amount}, ${d.txn_date}, 'receivable', ${u.fullName}, ${u.id} from bookings where id = ${d.booking_id}`;
    });
    revalidatePath(`/bookings/${d.booking_id}`);
    return { message: "Charge added to guest folio" };
  });
}
