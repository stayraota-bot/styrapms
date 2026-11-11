"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { can } from "@/lib/permissions";

const BlockSchema = z.object({
  property_id: zf.uuid("a property"), unit_id: zf.optUuid(), start_date: zf.date("Start date"), end_date: zf.date("End date"),
  reason: z.enum(["maintenance", "owner_use", "renovation", "closure", "other"]), notes: zf.optText(),
}).refine((v) => v.end_date > v.start_date, { message: "End must be after start (end date is the first available day)", path: ["end_date"] });

export async function blockDates(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(BlockSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      if (!can.blockDates(u.role)) throw Object.assign(new Error("Not allowed"), { code: "42501" });
      await tx`insert into blocked_dates(property_id, unit_id, start_date, end_date, reason, notes, created_by) values (${d.property_id}, ${d.unit_id ?? null}, ${d.start_date}, ${d.end_date}, ${d.reason}, ${d.notes ?? null}, ${u.id})`;
    });
    revalidatePath("/calendar");
    return { message: "Dates blocked" };
  });
}

export async function unblock(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id"));
  return attempt(async () => {
    await db(async (tx) => { const r = await tx`update blocked_dates set is_active = false where id = ${id}`; if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" }); });
    revalidatePath("/calendar");
    return { message: "Block removed" };
  });
}

const DemandSchema = z.object({ property_id: zf.optUuid(), name: zf.text("Name"), kind: z.enum(["manual", "event", "season"]), start_date: zf.date("Start"), end_date: zf.date("End"), notes: zf.optText() })
  .refine((v) => v.end_date >= v.start_date, { message: "End must be on/after start", path: ["end_date"] });
export async function addDemandRule(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(DemandSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db((tx, u) => tx`insert into demand_rules(property_id, name, kind, start_date, end_date, notes, created_by) values (${d.property_id ?? null}, ${d.name}, ${d.kind}, ${d.start_date}, ${d.end_date}, ${d.notes ?? null}, ${u.id})`);
    revalidatePath("/calendar");
    return { message: "High-demand dates saved" };
  });
}
