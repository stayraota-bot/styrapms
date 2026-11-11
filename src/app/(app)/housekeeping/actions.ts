"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";

export async function setTaskStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const status = String(fd.get("status"));
  if (!["pending", "assigned", "in_progress", "done", "inspected"].includes(status)) return { error: "Invalid status", at: Date.now() };
  return attempt(async () => {
    await db(async (tx, u) => {
      if (status === "inspected" && u.role === "housekeeping") throw Object.assign(new Error("Inspection must be signed off by a supervisor."), { code: "42501" });
      const r = await tx`update housekeeping_tasks set status = ${status}, assigned_to = coalesce(assigned_to, ${u.role === "housekeeping" ? u.id : null}) where id = ${id}`;
      if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" });
    });
    revalidatePath("/housekeeping");
    return { message: status === "done" ? "Marked clean — room is ready" : status === "in_progress" ? "Cleaning started" : "Updated" };
  });
}
export async function createTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(z.object({ unit_id: zf.uuid("a room"), task_type: z.enum(["room_cleaning", "checkout_cleaning", "inspection", "deep_cleaning"]), assigned_to: zf.optUuid(), due_date: zf.date("Due date"), notes: zf.optText() }), fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db((tx) => tx`insert into housekeeping_tasks(property_id, unit_id, task_type, assigned_to, due_date, notes, status)
      select property_id, id, ${d.task_type}, ${d.assigned_to ?? null}, ${d.due_date}, ${d.notes ?? null}, ${d.assigned_to ? "assigned" : "pending"} from property_units where id = ${d.unit_id}`);
    revalidatePath("/housekeeping");
    return { message: "Task created" };
  });
}
