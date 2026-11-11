"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { withUser, sysSql } from "@/lib/db";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { ROLES } from "@/lib/permissions";
import { authAdmin } from "@/server/auth-admin";

const pw = z.string().min(10, "At least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number");
const Base = {
  full_name: zf.text("Full name", 2), phone: zf.optText(), role: z.enum(ROLES), all_properties: zf.bool(),
  properties: z.array(z.string().uuid()).optional(), owner_id: zf.optUuid(),
};
const CreateSchema = z.object({ ...Base, email: z.string().trim().toLowerCase().email("Enter a valid email"), method: z.enum(["password", "invite"]),
  password: z.preprocess((v) => (v === "" ? undefined : v), pw.optional()) })
  .refine((v) => v.method === "invite" || v.password, { message: "Set an initial password", path: ["password"] })
  .refine((v) => v.role !== "owner" || v.owner_id, { message: "Link the owner record", path: ["owner_id"] });

async function assign(uid: string, adminId: string, d: { role: string; all_properties: boolean; properties?: string[]; owner_id?: string }) {
  await withUser(adminId, async (tx) => {
    await tx`delete from user_property_access where user_id = ${uid}`;
    if (d.role !== "owner" && !d.all_properties) for (const p of d.properties ?? []) await tx`insert into user_property_access(user_id, property_id, granted_by) values (${uid}, ${p}, ${adminId})`;
    if (d.role === "owner" && d.owner_id) {
      await tx`update owners set profile_id = null where profile_id = ${uid} and id <> ${d.owner_id}`;
      const r = await tx`update owners set profile_id = ${uid} where id = ${d.owner_id} and (profile_id is null or profile_id = ${uid})`;
      if (!r.count) throw Object.assign(new Error("That owner already has a portal login."), { code: "P0001" });
    }
  });
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole(["super_admin"]);
  const p = parse(CreateSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    const [exists] = await sysSql`select 1 from profiles where lower(email) = ${d.email}`;
    if (exists) throw Object.assign(new Error("A user with this email already exists."), { code: "P0001" });
    const { id, invited } = await authAdmin.create(d.email, d.method === "password" ? d.password! : null, d.full_name);
    await withUser(admin.id, (tx) => tx`insert into profiles(id, email, full_name, phone, role, all_properties, created_by) values (${id}, ${d.email}, ${d.full_name}, ${d.phone ?? null}, ${d.role}, ${d.role !== "owner" && d.all_properties}, ${admin.id})`);
    await assign(id, admin.id, d);
    revalidatePath("/users");
    return { message: invited ? `Invitation sent to ${d.email}` : "User created — share the login ID and temporary password securely", redirectTo: `/users/${id}` };
  });
}

const UpdateSchema = z.object({ id: zf.uuid("user"), ...Base }).refine((v) => v.role !== "owner" || v.owner_id, { message: "Link the owner record", path: ["owner_id"] });
export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole(["super_admin"]);
  const p = parse(UpdateSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await withUser(admin.id, (tx) => tx`update profiles set full_name = ${d.full_name}, phone = ${d.phone ?? null}, role = ${d.role}, all_properties = ${d.role !== "owner" && d.all_properties} where id = ${d.id}`);
    await assign(d.id, admin.id, d);
    revalidatePath(`/users/${d.id}`);
    return { message: "Access updated" };
  });
}

export async function setActive(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole(["super_admin"]);
  const id = String(fd.get("id")); const active = fd.get("active") === "true";
  return attempt(async () => {
    await withUser(admin.id, (tx) => tx`update profiles set is_active = ${active} where id = ${id}`);
    await authAdmin.setBanned(id, !active);
    await sysSql`insert into login_history(user_id, event) values (${id}, ${active ? "reactivated" : "deactivated"})`;
    revalidatePath(`/users/${id}`);
    return { message: active ? "User reactivated" : "User deactivated — all access revoked immediately" };
  });
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole(["super_admin"]);
  const id = String(fd.get("id")); const mode = String(fd.get("mode"));
  return attempt(async () => {
    const [u] = await sysSql<{ email: string }[]>`select email from profiles where id = ${id}`;
    if (!u) throw Object.assign(new Error("User not found"), { code: "P0001" });
    if (mode === "email") await authAdmin.sendReset(u.email);
    else {
      const r = pw.safeParse(String(fd.get("password") ?? ""));
      if (!r.success) throw Object.assign(new Error(r.error.issues[0].message), { code: "P0001" });
      await authAdmin.setPassword(id, r.data);
    }
    await sysSql`insert into login_history(user_id, email, event) values (${id}, ${u.email}, 'password_reset')`;
    await withUser(admin.id, (tx) => tx`insert into notifications(user_id, type, title, body, severity) values (${admin.id}, 'security', 'Password reset', ${"Password reset for " + u.email}, 'info')`);
    return { message: mode === "email" ? "Reset link emailed" : "Temporary password set" };
  });
}
