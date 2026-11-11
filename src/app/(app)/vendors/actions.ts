"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";

const Schema = z.object({
  id: zf.optUuid(), name: zf.text("Vendor name", 2), phone: zf.optText(), email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email("Enter a valid email").optional()),
  address: zf.optText(), category: zf.optText(), is_active: zf.bool(),
  gstin: z.preprocess((v) => (v === "" ? undefined : String(v).toUpperCase()), z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN (15 characters)").optional()),
  properties: z.array(z.string().uuid()).optional(),
});
export async function saveVendor(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(Schema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    const id = await db(async (tx) => {
      let vid = d.id;
      if (vid) { const r = await tx`update vendors set name = ${d.name}, phone = ${d.phone ?? null}, email = ${d.email ?? null}, address = ${d.address ?? null}, gstin = ${d.gstin ?? null}, category = ${d.category ?? null}, is_active = ${d.is_active} where id = ${vid}`; if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" }); }
      else [{ id: vid }] = await tx<{ id: string }[]>`insert into vendors(name, phone, email, address, gstin, category) values (${d.name}, ${d.phone ?? null}, ${d.email ?? null}, ${d.address ?? null}, ${d.gstin ?? null}, ${d.category ?? null}) returning id`;
      await tx`delete from vendor_properties where vendor_id = ${vid!}`;
      for (const p of d.properties ?? []) await tx`insert into vendor_properties values (${vid!}, ${p}) on conflict do nothing`;
      return vid!;
    });
    revalidatePath("/vendors");
    return { message: d.id ? "Vendor updated" : "Vendor added", redirectTo: d.id ? undefined : `/vendors/${id}` };
  });
}
