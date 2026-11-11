import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { createServerClient } from "@supabase/ssr";
import { env } from "../env";
import { sysSql, withUser, type Tx } from "../db";
import type { Role } from "../permissions";

export const LOCAL_COOKIE = "stayra_session";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  allProperties: boolean;
  /** Properties this user may access (resolved server-side; RLS enforces the same rules). */
  propertyIds: string[];
  ownerId: string | null;
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}

function secretKey() { return new TextEncoder().encode(env.authSecret); }

export async function issueLocalSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("12h").sign(secretKey());
  (await cookies()).set(LOCAL_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
}

async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(LOCAL_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey());
      if (typeof payload.sub === "string") return payload.sub;
    } catch { /* fall through */ }
  }
  if (env.authMode === "local") return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser(); // verifies the JWT with Supabase Auth
  return data.user?.id ?? null;
}

/** The signed-in, active user — or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const uid = await sessionUserId();
  if (!uid) return null;
  const [p] = await sysSql<{ id: string; email: string; full_name: string; role: Role; all_properties: boolean; is_active: boolean }[]>`
    select id, email, full_name, role, all_properties, is_active from profiles where id = ${uid}`;
  if (!p || !p.is_active) return null;
  const props = await withUser(uid, (tx) => tx<{ id: string }[]>`select id from properties order by name`);
  const [owner] = p.role === "owner" ? await sysSql<{ id: string }[]>`select id from owners where profile_id = ${uid}` : [];
  return {
    id: p.id, email: p.email, fullName: p.full_name, role: p.role, allProperties: p.all_properties,
    propertyIds: props.map((r) => r.id), ownerId: owner?.id ?? null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect(u.role === "owner" ? "/owner" : "/?denied=1");
  return u;
}

/** Run a callback as the current user with RLS enforced. */
export async function db<T>(fn: (tx: Tx, user: CurrentUser) => Promise<T>): Promise<T> {
  const u = await requireUser();
  return withUser(u.id, (tx) => fn(tx, u));
}
