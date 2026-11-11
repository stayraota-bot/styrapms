"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { saveUpload, isRealFile } from "@/lib/storage";
import { can } from "@/lib/permissions";

const METHODS = ["cash", "upi", "bank_transfer", "card", "ota_collection", "cheque", "other"] as const;
const Schema = z.object({
  property_id: zf.uuid("a property"), booking_code: zf.optText(), category_id: zf.uuid("a category"), description: zf.text("Description"),
  amount: zf.money("Amount", { positive: true }), txn_date: zf.date("Date"), payment_mode: z.enum(METHODS), payment_reference: zf.optText(),
  received_by: zf.optText(), collection_status: z.enum(["collected", "receivable"]), notes: zf.optText(), idem: zf.text("Form key"),
});

export async function addIncome(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(Schema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.addIncome(u.role)) throw Object.assign(new Error("Not allowed"), { code: "42501" });
      const [dup] = await tx`select 1 from income where idempotency_key = ${d.idem}`;
      if (dup) return;
      let bookingId: string | null = null;
      if (d.booking_code) {
        const [b] = await tx<{ id: string }[]>`select id from bookings where upper(booking_code) = upper(${d.booking_code}) and property_id = ${d.property_id}`;
        if (!b) throw Object.assign(new Error(`Booking ${d.booking_code} not found in this property`), { code: "P0001" });
        bookingId = b.id;
      }
      const file = fd.get("receipt");
      const docId = isRealFile(file) ? await saveUpload(tx, { file, entityType: "income", propertyId: d.property_id, userId: u.id }) : null;
      await tx`insert into income(property_id, booking_id, category_id, description, amount, txn_date, payment_mode, payment_reference, received_by, collection_status, notes, document_id, idempotency_key, created_by)
        values (${d.property_id}, ${bookingId}, ${d.category_id}, ${d.description}, ${d.amount}, ${d.txn_date}, ${d.payment_mode}, ${d.payment_reference ?? null}, ${d.received_by ?? u.fullName},
          ${d.collection_status}, ${d.notes ?? null}, ${docId}, ${d.idem}, ${u.id})`;
    });
    revalidatePath("/income");
    return { message: "Income recorded" };
  });
}

export async function voidIncome(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Give a reason (min 5 characters)", fieldErrors: { reason: "Required" }, at: Date.now() };
  return attempt(async () => {
    await db(async (tx) => { const r = await tx`update income set status = 'void', void_reason = ${reason} where id = ${id} and status = 'active'`; if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" }); });
    revalidatePath("/income");
    return { message: "Income voided (kept for audit)" };
  });
}

export async function markCollected(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id"));
  return attempt(async () => {
    await db(async (tx) => { const r = await tx`update income set collection_status = 'collected', collected_at = now() where id = ${id} and collection_status = 'receivable'`; if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" }); });
    revalidatePath("/income");
    return { message: "Marked as collected" };
  });
}
