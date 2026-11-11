"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { saveUpload, isRealFile } from "@/lib/storage";
import { can } from "@/lib/permissions";

const METHODS = ["cash", "upi", "bank_transfer", "card", "ota_collection", "cheque", "other"] as const;
const deny = () => Object.assign(new Error("You don't have permission to do this."), { code: "42501" });

const Schema = z.object({
  property_id: zf.uuid("a property"), booking_id: zf.optUuid(), category_id: zf.uuid("a category"), vendor_id: zf.optUuid(),
  description: zf.text("Description"), amount: zf.money("Amount", { positive: true }), gst_amount: zf.money("GST"),
  bill_date: zf.date("Bill date"), due_date: zf.optDate(), bill_number: zf.optText(),
  paid_now: z.enum(["unpaid", "paid"]), payment_method: z.enum(METHODS).optional().or(z.literal("").transform(() => undefined)),
  paid_by: z.enum(["stayra", "owner", "property_cash", "vendor_credit"]),
  scope: z.enum(["booking", "property", "shared"]), bearer: z.enum(["pool", "owner", "stayra"]), is_deductible: zf.bool(),
  notes: zf.optText(), recurring: z.enum(["", "monthly", "quarterly", "yearly"]).optional(), idem: zf.text("Form key"),
}).refine((v) => v.scope !== "booking" || v.booking_id, { message: "Choose the booking", path: ["booking_id"] })
  .refine((v) => v.paid_now === "unpaid" || v.payment_method, { message: "Select payment method", path: ["payment_method"] })
  .refine((v) => !v.due_date || v.due_date >= v.bill_date, { message: "Due date must be on/after bill date", path: ["due_date"] });

export async function createExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(Schema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  const file = fd.get("bill");
  return attempt(async () => {
    const id = await db(async (tx, u) => {
      if (!can.addExpense(u.role)) throw deny();
      const [dup] = await tx<{ id: string }[]>`select id from expenses where idempotency_key = ${d.idem}`;
      if (dup) return dup.id;
      const total = d.amount + d.gst_amount;
      const [e] = await tx<{ id: string }[]>`insert into expenses(property_id, booking_id, category_id, vendor_id, description, amount, gst_amount, bill_date, due_date, bill_number,
          paid_amount, payment_method, paid_by, scope, bearer, is_deductible, notes, idempotency_key, created_by, approval_status)
        values (${d.property_id}, ${d.booking_id ?? null}, ${d.category_id}, ${d.vendor_id ?? null}, ${d.description}, ${d.amount}, ${d.gst_amount}, ${d.bill_date}, ${d.due_date ?? null}, ${d.bill_number ?? null},
          0, ${d.payment_method ?? null}, ${d.paid_by}, ${d.scope}, ${d.bearer}, ${d.is_deductible}, ${d.notes ?? null}, ${d.idem}, ${u.id}, 'pending') returning id`;
      if (d.paid_now === "paid") await tx`insert into expense_payments(expense_id, amount, paid_on, method, reference, created_by) values (${e.id}, ${total}, ${d.bill_date}, ${d.payment_method!}, ${d.bill_number ?? null}, ${u.id})`;
      if (isRealFile(file)) {
        const docId = await saveUpload(tx, { file, entityType: "expense", entityId: e.id, propertyId: d.property_id, userId: u.id });
        await tx`update expenses set document_id = ${docId} where id = ${e.id}`;
      }
      if (d.recurring) {
        const [y, m] = d.bill_date.split("-").map(Number);
        const step = d.recurring === "monthly" ? 1 : d.recurring === "quarterly" ? 3 : 12;
        const next = new Date(Date.UTC(y, m - 1 + step, Math.min(Number(d.bill_date.slice(8)), 28))).toISOString().slice(0, 10);
        await tx`insert into recurring_expenses(property_id, category_id, vendor_id, description, amount, gst_amount, frequency, day_of_month, next_run_date, bearer, is_deductible, created_by)
          values (${d.property_id}, ${d.category_id}, ${d.vendor_id ?? null}, ${d.description}, ${d.amount}, ${d.gst_amount}, ${d.recurring}, ${Math.min(Number(d.bill_date.slice(8)), 28)}, ${next}, ${d.bearer}, ${d.is_deductible}, ${u.id})`;
      }
      return e.id;
    });
    revalidatePath("/expenses");
    return { message: d.scope === "shared" ? "Expense saved — now split it between properties" : "Expense submitted for approval", redirectTo: `/expenses/${id}` };
  });
}

export async function reviewExpenses(_: ActionState, fd: FormData): Promise<ActionState> {
  const ids = fd.getAll("ids").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const decision = String(fd.get("decision"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!ids.length) return { error: "Select at least one expense", at: Date.now() };
  if (decision === "rejected" && reason.length < 3) return { error: "Give a reason for rejection", fieldErrors: { reason: "Required" }, at: Date.now() };
  return attempt(async () => {
    const n = await db(async (tx, u) => {
      if (!can.approveExpense(u.role)) throw deny();
      const r = await tx`update expenses set approval_status = ${decision === "approved" ? "approved" : "rejected"}, rejection_reason = ${decision === "rejected" ? reason : null}
        where id = any(${ids}::uuid[]) and approval_status = 'pending' and status = 'active'`;
      return r.count;
    });
    revalidatePath("/expenses");
    return { message: `${n} expense${n === 1 ? "" : "s"} ${decision}` };
  });
}

const PaySchema = z.object({ expense_id: zf.uuid("expense"), amount: zf.money("Amount", { positive: true }), paid_on: zf.date("Date"), method: z.enum(METHODS), reference: zf.optText(), idem: zf.text("key") });
export async function payExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(PaySchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.manageFinance(u.role)) throw deny();
      await tx`insert into expense_payments(expense_id, amount, paid_on, method, reference, idempotency_key, created_by) values (${d.expense_id}, ${d.amount}, ${d.paid_on}, ${d.method}, ${d.reference ?? null}, ${d.idem}, ${u.id}) on conflict (idempotency_key) do nothing`;
    });
    revalidatePath(`/expenses/${d.expense_id}`);
    return { message: "Vendor payment recorded" };
  });
}

export async function voidExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Give a reason (min 5 characters)", fieldErrors: { reason: "Required" }, at: Date.now() };
  return attempt(async () => {
    await db(async (tx) => { const r = await tx`update expenses set status = 'void', void_reason = ${reason} where id = ${id} and status = 'active'`; if (!r.count) throw deny(); });
    revalidatePath(`/expenses/${id}`);
    return { message: "Expense voided (kept for audit)" };
  });
}

export async function allocateExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("expense_id"));
  const method = String(fd.get("method"));
  const props = fd.getAll("property_ids").map(String);
  const manual = props.map((p) => Number(String(fd.get(`amt_${p}`) ?? "0").replace(/[,₹]/g, "")));
  if (props.length < 2) return { error: "Select at least two properties", at: Date.now() };
  return attempt(async () => {
    await db((tx) => tx`select allocate_shared_expense(${id}, ${props}::uuid[], ${method}::allocation_method, ${method === "manual" ? manual : null}::numeric[])`);
    revalidatePath(`/expenses/${id}`);
    return { message: "Allocation saved" };
  });
}

export async function attachBill(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("expense_id")); const file = fd.get("bill");
  if (!isRealFile(file)) return { error: "Choose a file", at: Date.now() };
  return attempt(async () => {
    await db(async (tx, u) => {
      const [e] = await tx<{ property_id: string }[]>`select property_id from expenses where id = ${id}`;
      if (!e) throw deny();
      const docId = await saveUpload(tx, { file, entityType: "expense", entityId: id, propertyId: e.property_id, userId: u.id });
      await tx`update expenses set document_id = ${docId} where id = ${id}`;
    });
    revalidatePath(`/expenses/${id}`);
    return { message: "Bill uploaded" };
  });
}
