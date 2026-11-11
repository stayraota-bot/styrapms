"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { saveUpload, isRealFile } from "@/lib/storage";

const Schema = z.object({
  property_id: zf.uuid("a property"), unit_id: zf.optUuid(), category: zf.text("Issue category"), title: zf.text("Issue", 3), description: zf.optText(),
  priority: z.enum(["low", "medium", "high", "critical"]), assigned_to: zf.optUuid(), expected_completion: zf.optDate(), blocks_room: zf.bool(),
});
export async function createTicket(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(Schema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      const file = fd.get("photo");
      const doc = isRealFile(file) ? await saveUpload(tx, { file, entityType: "ticket", propertyId: d.property_id, userId: u.id }) : null;
      await tx`insert into maintenance_tickets(property_id, unit_id, category, title, description, priority, assigned_to, expected_completion, blocks_room, photo_document_id, reported_by)
        values (${d.property_id}, ${d.unit_id ?? null}, ${d.category}, ${d.title}, ${d.description ?? null}, ${d.priority}, ${d.assigned_to ?? null}, ${d.expected_completion ?? null}, ${d.blocks_room}, ${doc}, ${u.id})`;
    });
    revalidatePath("/maintenance");
    return { message: "Maintenance ticket raised" };
  });
}
export async function updateTicket(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(z.object({ id: zf.uuid("ticket"), status: z.enum(["open", "assigned", "in_progress", "resolved", "closed"]), assigned_to: zf.optUuid(), priority: z.enum(["low", "medium", "high", "critical"]), expected_completion: zf.optDate() }), fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx) => { const r = await tx`update maintenance_tickets set status = ${d.status}, assigned_to = ${d.assigned_to ?? null}, priority = ${d.priority}, expected_completion = ${d.expected_completion ?? null} where id = ${d.id}`; if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" }); });
    revalidatePath("/maintenance");
    return { message: "Ticket updated" };
  });
}
