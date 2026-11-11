"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";

const Schema = z.object({
  id: zf.optUuid(), full_name: zf.text("Owner name", 2),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email("Enter a valid email").optional()),
  phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[+\d\s-]{8,15}$/, "Enter a valid phone").optional()),
  address: zf.optText(), pan: z.preprocess((v) => (v === "" ? undefined : String(v).toUpperCase()), z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN format: ABCDE1234F").optional()),
  bank_account_name: zf.optText(), bank_account_number: zf.optText(),
  bank_ifsc: z.preprocess((v) => (v === "" ? undefined : String(v).toUpperCase()), z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC format: ABCD0123456").optional()),
  upi_id: zf.optText(), notes: zf.optText(),
});

export async function saveOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(Schema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    const id = await db(async (tx) => {
      if (d.id) {
        const r = await tx`update owners set full_name = ${d.full_name}, email = ${d.email ?? null}, phone = ${d.phone ?? null}, address = ${d.address ?? null}, pan = ${d.pan ?? null},
          bank_account_name = ${d.bank_account_name ?? null}, bank_account_number = ${d.bank_account_number ?? null}, bank_ifsc = ${d.bank_ifsc ?? null}, upi_id = ${d.upi_id ?? null}, notes = ${d.notes ?? null}
          where id = ${d.id}`;
        if (!r.count) throw Object.assign(new Error("Not allowed"), { code: "42501" });
        return d.id;
      }
      const [r] = await tx<{ id: string }[]>`insert into owners(full_name, email, phone, address, pan, bank_account_name, bank_account_number, bank_ifsc, upi_id, notes)
        values (${d.full_name}, ${d.email ?? null}, ${d.phone ?? null}, ${d.address ?? null}, ${d.pan ?? null}, ${d.bank_account_name ?? null}, ${d.bank_account_number ?? null}, ${d.bank_ifsc ?? null}, ${d.upi_id ?? null}, ${d.notes ?? null}) returning id`;
      return r.id;
    });
    revalidatePath("/owners");
    return { message: d.id ? "Owner updated" : "Owner added", redirectTo: d.id ? undefined : `/owners/${id}` };
  });
}
