"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";

export async function generateSettlement(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(z.object({ property_id: zf.uuid("property"), from: zf.date("From"), to: zf.date("To"), booking_id: zf.optUuid(), notes: zf.optText() }), fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    const id = await db(async (tx) => (await tx<{ id: string }[]>`select generate_settlement(${d.property_id}, ${d.from}, ${d.to}, ${d.booking_id ?? null}, ${d.notes ?? null}) as id`)[0].id);
    revalidatePath("/settlements");
    return { message: "Draft settlement generated", redirectTo: `/settlements/${id}` };
  });
}

export async function transition(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const to = String(fd.get("to")); const reason = String(fd.get("reason") ?? "").trim() || null;
  if (!["submitted", "approved", "draft", "void"].includes(to)) return { error: "Invalid action", at: Date.now() };
  return attempt(async () => {
    await db((tx) => tx`select transition_settlement(${id}, ${to}::settlement_status, ${reason})`);
    revalidatePath(`/settlements/${id}`); revalidatePath("/settlements");
    return { message: { submitted: "Submitted for approval", approved: "Settlement approved and locked", draft: "Returned to draft", void: "Settlement voided — items released" }[to] };
  });
}

const PaySchema = z.object({ id: zf.uuid("settlement"), amount: zf.money("Amount", { positive: true }), paid_on: zf.date("Date"),
  method: z.enum(["bank_transfer", "upi", "cash", "cheque", "other", "card", "ota_collection"]), reference: zf.optText(), notes: zf.optText(), idem: zf.text("key") });
export async function payOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(PaySchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db((tx) => tx`select record_settlement_payment(${d.id}, ${d.amount}, ${d.paid_on}, ${d.method}, ${d.reference ?? null}, ${d.notes ?? null}, ${d.idem})`);
    revalidatePath(`/settlements/${d.id}`);
    return { message: "Owner payment recorded" };
  });
}

const AdjSchema = z.object({ property_id: zf.uuid("property"), kind: z.enum(["revenue", "expense"]), direction: z.enum(["increase", "decrease"]), amount: zf.money("Amount", { positive: true }),
  adj_date: zf.date("Date"), reason: zf.text("Reason", 5), related_settlement_id: zf.optUuid() });
export async function addAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(AdjSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db((tx, u) => tx`insert into financial_adjustments(property_id, adj_date, kind, amount, reason, related_settlement_id, created_by)
      values (${d.property_id}, ${d.adj_date}, ${d.kind}, ${d.direction === "increase" ? d.amount : -d.amount}, ${d.reason}, ${d.related_settlement_id ?? null}, ${u.id})`);
    revalidatePath("/settlements");
    return { message: "Adjustment recorded — it will be included in the next settlement" };
  });
}
