"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { attempt, parse, zf, type ActionState } from "@/lib/action";

async function asAdmin<T>(fn: Parameters<typeof withUser<T>>[1]) { const u = await requireRole(["super_admin"]); return withUser(u.id, fn); }

export async function saveCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(z.object({ name: zf.text("Display name"), legal_name: zf.optText(), gstin: zf.optText(), address: zf.optText(), email: zf.optText(), phone: zf.optText(),
    threshold: z.preprocess(Number, z.number().min(50, "50–100").max(100, "50–100")), vacancy: z.preprocess(Number, z.number().int().min(2).max(14)) }), fd);
  if (!p.ok) return p.state;
  const { threshold, vacancy, ...company } = p.data;
  return attempt(async () => {
    await asAdmin(async (tx) => {
      await tx`insert into app_settings(key, value) values ('company', ${tx.json(company)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
      await tx`insert into app_settings(key, value) values ('demand.occupancy_threshold', ${tx.json(threshold / 100)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
      await tx`insert into app_settings(key, value) values ('alerts.vacancy_days', ${tx.json(vacancy)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
    });
    revalidatePath("/settings");
    return { message: "Settings saved" };
  });
}

export async function addCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(z.object({ kind: z.enum(["income", "expense"]), name: zf.text("Name", 2), group_name: z.enum(["Property", "Staff", "Maintenance", "Other"]).optional() }), fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await asAdmin((tx) => d.kind === "income"
      ? tx`insert into income_categories(code, name, sort_order) values (${d.name.toLowerCase().replace(/\W+/g, "_")}, ${d.name}, 100)`
      : tx`insert into expense_categories(group_name, name, sort_order) values (${d.group_name ?? "Other"}, ${d.name}, 100)`);
    revalidatePath("/settings");
    return { message: "Category added" };
  });
}

export async function toggleCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const kind = String(fd.get("kind"));
  return attempt(async () => {
    await asAdmin((tx) => kind === "income" ? tx`update income_categories set is_active = not is_active where id = ${id}` : tx`update expense_categories set is_active = not is_active where id = ${id}`);
    revalidatePath("/settings");
    return { message: "Category updated" };
  });
}

export async function toggleRecurring(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id"));
  return attempt(async () => { await asAdmin((tx) => tx`update recurring_expenses set is_active = not is_active where id = ${id}`); revalidatePath("/settings"); return { message: "Recurring bill updated" }; });
}

export async function runRecurring(): Promise<ActionState> {
  return attempt(async () => {
    const [{ n }] = await asAdmin((tx) => tx<{ n: number }[]>`select generate_recurring_expenses(current_date) n`);
    revalidatePath("/expenses");
    return { message: `${n} recurring bill(s) generated and sent for approval` };
  });
}
