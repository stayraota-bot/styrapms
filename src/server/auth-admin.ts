import "server-only";
import { env } from "@/lib/env";
import { sysSql } from "@/lib/db";
import { supabaseAdmin } from "@/lib/storage";

/** Identity-provider operations. Only ever called after the caller is verified as Super Admin. */
export const authAdmin = {
  async create(email: string, password: string | null, fullName: string): Promise<{ id: string; invited: boolean }> {
    if (env.authMode === "local") {
      if (!password) throw Object.assign(new Error("Email invitations need Supabase Auth. Set a password instead (local mode)."), { code: "P0001" });
      const [u] = await sysSql<{ id: string }[]>`insert into auth.users(email, encrypted_password, raw_user_meta_data) values (${email}, crypt(${password}, gen_salt('bf')), ${sysSql.json({ full_name: fullName })}) returning id`;
      return { id: u.id, invited: false };
    }
    const admin = supabaseAdmin();
    if (password) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error) throw Object.assign(new Error(error.message), { code: "P0001" });
      return { id: data.user.id, invited: false };
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${env.appUrl}/auth/callback?next=/reset-password`, data: { full_name: fullName } });
    if (error) throw Object.assign(new Error(error.message), { code: "P0001" });
    return { id: data.user.id, invited: true };
  },
  async setPassword(id: string, password: string) {
    if (env.authMode === "local") { await sysSql`update auth.users set encrypted_password = crypt(${password}, gen_salt('bf')) where id = ${id}`; return; }
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
    if (error) throw Object.assign(new Error(error.message), { code: "P0001" });
  },
  async sendReset(email: string) {
    if (env.authMode === "local") throw Object.assign(new Error("Reset emails need Supabase Auth. Set a temporary password instead."), { code: "P0001" });
    const { error } = await supabaseAdmin().auth.resetPasswordForEmail(email, { redirectTo: `${env.appUrl}/auth/callback?next=/reset-password` });
    if (error) throw Object.assign(new Error(error.message), { code: "P0001" });
  },
  async setBanned(id: string, banned: boolean) {
    if (env.authMode === "local") { await sysSql`update auth.users set banned_until = ${banned ? sysSql`'infinity'::timestamptz` : null} where id = ${id}`; return; }
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: banned ? "876000h" : "none" });
    if (error) throw Object.assign(new Error(error.message), { code: "P0001" });
  },
};
