"use server";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { sysSql } from "@/lib/db";
import { issueLocalSession, supabaseServer, LOCAL_COOKIE, getCurrentUser } from "@/lib/auth/session";
import { ensureBootstrapped } from "@/server/bootstrap";
import type { ActionState } from "@/lib/action";

async function logEvent(userId: string | null, email: string, event: string) {
  const h = await headers();
  await sysSql`insert into login_history(user_id, email, event, ip, user_agent)
    values (${userId}, ${email}, ${event}, ${h.get("x-forwarded-for")?.split(",")[0] ?? null}, ${h.get("user-agent")?.slice(0, 250) ?? null})`;
}

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = LoginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!r.success) return { error: r.error.issues[0].message, at: Date.now() };
  const { email, password } = r.data;
  const fail = async (uid: string | null, msg = "Incorrect email or password.") => {
    try { await logEvent(uid, email, "failed_login"); } catch { /* ignore if DB not configured */ }
    return { error: msg, at: Date.now() };
  };

  let userId: string | null = null;
  let role = "operations";
  try {
    await ensureBootstrapped();
    const [localUser] = await sysSql<{ id: string }[]>`
      select id from auth.users
      where lower(email) = ${email}
        and encrypted_password = crypt(${password}, encrypted_password)
        and (banned_until is null or banned_until < now())
      limit 1`;
    if (localUser) {
      userId = localUser.id;
    } else if (env.authMode === "supabase") {
      const supabase = await supabaseServer();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) return fail(null, error?.status === 429 ? "Too many attempts. Please wait a minute." : undefined);
      userId = data.user.id;
    } else {
      return fail(null);
    }
    const [p] = await sysSql<{ is_active: boolean; role: string }[]>`select is_active, role from profiles where id = ${userId}`;
    if (!p || !p.is_active) {
      if (env.authMode !== "local") await (await supabaseServer()).auth.signOut();
      return fail(userId, "This account is deactivated. Contact your administrator.");
    }
    role = p.role;
    await issueLocalSession(userId);
    await sysSql`update profiles set last_login_at = now() where id = ${userId}`;
    await logEvent(userId, email, "login");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database connection is not configured.";
    return { error: msg, at: Date.now() };
  }
  const next = String(fd.get("next") ?? "");
  redirect(role === "owner" ? "/owner" : next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const u = await getCurrentUser();
  if (u) {
    try { await logEvent(u.id, u.email, "logout"); } catch { /* ignore */ }
  }
  (await cookies()).delete(LOCAL_COOKIE);
  if (env.authMode !== "local") {
    try { await (await supabaseServer()).auth.signOut(); } catch { /* ignore */ }
  }
  redirect("/login");
}

export async function forgotPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "Enter a valid email", fieldErrors: { email: "Enter a valid email" }, at: Date.now() };
  if (env.authMode === "local") return { ok: true, message: "Local mode: ask a Super Admin to reset your password from User Management.", at: Date.now() };
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.appUrl}/auth/callback?next=/reset-password` });
  const [u] = await sysSql<{ id: string }[]>`select id from profiles where lower(email) = ${email}`;
  if (u) await logEvent(u.id, email, "password_reset");
  // Same answer whether or not the account exists (prevents email enumeration).
  return { ok: true, message: "If an account exists for this email, a reset link has been sent.", at: Date.now() };
}

const PasswordSchema = z.object({
  password: z.string().min(10, "Use at least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export async function setNewPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = PasswordSchema.safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!r.success) return { error: r.error.issues[0].message, fieldErrors: Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])), at: Date.now() };
  const u = await getCurrentUser();
  if (!u) return { error: "Your reset link has expired. Request a new one.", at: Date.now() };
  if (env.authMode === "local") await sysSql`update auth.users set encrypted_password = crypt(${r.data.password}, gen_salt('bf')) where id = ${u.id}`;
  else {
    const { error } = await (await supabaseServer()).auth.updateUser({ password: r.data.password });
    if (error) return { error: error.message, at: Date.now() };
  }
  return { ok: true, message: "Password updated.", redirectTo: u.role === "owner" ? "/owner" : "/", at: Date.now() };
}
