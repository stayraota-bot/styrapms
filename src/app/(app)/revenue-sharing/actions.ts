"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { saveUpload, isRealFile } from "@/lib/storage";

const Schema = z.object({
  property_id: zf.uuid("property"),
  stayra_pct: z.preprocess((v) => (v === "" ? undefined : Number(v)), z.number({ error: "Enter STAYRA %" }).min(0, "Must be 0–100").max(100, "Must be 0–100")
    .refine((x) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-9, "Max 2 decimals")),
  owner_pct: z.preprocess((v) => Number(v), z.number()),
  effective_from: zf.date("Effective date"), agreement_end_date: zf.optDate(),
  settlement_frequency: z.enum(["booking", "weekly", "monthly", "quarterly", "custom"]),
  expense_policy: z.enum(["all_approved", "selected_categories", "booking_specific_only", "property_level_only"]),
  include_unpaid_expenses: zf.bool(), shared_allocation_method: z.enum(["equal", "by_units", "manual"]), notes: zf.optText(),
  categories: z.array(z.string().uuid()).optional(),
}).refine((v) => Math.round((v.stayra_pct + v.owner_pct) * 100) === 10000, { message: "STAYRA % + Owner % must equal 100%", path: ["owner_pct"] })
  .refine((v) => v.expense_policy !== "selected_categories" || (v.categories?.length ?? 0) > 0, { message: "Select at least one category", path: ["expense_policy"] })
  .refine((v) => !v.agreement_end_date || v.agreement_end_date >= v.effective_from, { message: "End must be after effective date", path: ["agreement_end_date"] });

export async function saveAgreement(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(Schema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      if (u.role !== "super_admin") throw Object.assign(new Error("Only Super Admin can configure revenue sharing."), { code: "42501" });
      const file = fd.get("document");
      const docId = isRealFile(file) ? await saveUpload(tx, { file, entityType: "agreement", entityId: d.property_id, propertyId: d.property_id, userId: u.id }) : null;
      await tx`select create_agreement(${d.property_id}, ${d.stayra_pct}, ${d.effective_from}, ${d.settlement_frequency}, ${d.expense_policy}, ${d.include_unpaid_expenses},
        ${d.categories ?? []}::uuid[], ${d.agreement_end_date ?? null}, ${d.shared_allocation_method}, ${d.notes ?? null}, ${docId})`;
    });
    revalidatePath("/revenue-sharing");
    return { message: "New agreement version saved. Past settlements are unchanged." };
  });
}
