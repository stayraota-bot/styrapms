"use client";
import { useState } from "react";
import { ActionForm, Field, SubmitButton, FormActions } from "@/components/ui/forms";
import { Card, CardBody, CardHeader, Input, Select, LinkButton } from "@/components/ui/core";
import { ROLES, ROLE_LABEL, ROLE_DESCRIPTION, type Role } from "@/lib/permissions";
import type { ActionState } from "@/lib/action";

export function UserForm({ action, properties, owners, user, assigned = [], linkedOwner, defaults = {} }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; properties: { id: string; name: string }[]; owners: { id: string; full_name: string; taken: boolean }[];
  user?: { id: string; email: string; full_name: string; phone: string | null; role: Role; all_properties: boolean }; assigned?: string[]; linkedOwner?: string | null; defaults?: { role?: string; owner?: string };
}) {
  const [role, setRole] = useState<Role>(user?.role ?? (defaults.role as Role) ?? "property_manager");
  const [all, setAll] = useState(user?.all_properties ?? false);
  const [method, setMethod] = useState("password");
  return (
    <ActionForm action={action} className="space-y-6">
      {user && <input type="hidden" name="id" value={user.id} />}
      <Card><CardHeader title="Login ID" /><CardBody className="grid sm:grid-cols-2 gap-4">
        <Field name="full_name" label="Full name" required><Input name="full_name" defaultValue={user?.full_name} /></Field>
        <Field name="email" label="Email (login ID)" required={!user}><Input name="email" type="email" defaultValue={user?.email} disabled={!!user} /></Field>
        <Field name="phone" label="Phone"><Input name="phone" defaultValue={user?.phone ?? ""} /></Field>
        {!user && <Field name="method" label="How will they sign in?"><Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}><option value="password">Set a temporary password now</option><option value="invite">Email an invitation link</option></Select></Field>}
        {!user && method === "password" && <Field name="password" label="Temporary password" hint="10+ characters with a letter and a number. Ask them to change it."><Input name="password" type="text" autoComplete="off" /></Field>}
      </CardBody></Card>
      <Card><CardHeader title="Role" description={ROLE_DESCRIPTION[role]} /><CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {ROLES.map((r) => <label key={r} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer ${role === r ? "border-brand-600 bg-brand-50" : "border-line"}`}>
          <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-brand-700" />{ROLE_LABEL[r]}</label>)}
      </CardBody></Card>
      {role === "owner" ? (
        <Card><CardHeader title="Owner record" description="Owners only ever see properties linked to their owner record." /><CardBody>
          <Field name="owner_id" label="Linked owner" required><Select name="owner_id" defaultValue={linkedOwner ?? defaults.owner ?? ""}><option value="">Select owner…</option>
            {owners.map((o) => <option key={o.id} value={o.id} disabled={o.taken && o.id !== linkedOwner}>{o.full_name}{o.taken && o.id !== linkedOwner ? " (has login)" : ""}</option>)}</Select></Field>
        </CardBody></Card>
      ) : role !== "super_admin" && (
        <Card><CardHeader title="Property access" description="The user can never see properties outside this list (enforced in the database)." /><CardBody className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="all_properties" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-brand-700 size-4" />All properties (current and future)</label>
          {!all && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{properties.map((p) => <label key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <input type="checkbox" name="properties[]" value={p.id} defaultChecked={assigned.includes(p.id)} className="accent-brand-700 size-4" />{p.name}</label>)}</div>}
        </CardBody></Card>
      )}
      <FormActions><LinkButton href="/users" variant="secondary">Cancel</LinkButton><SubmitButton>{user ? "Save access" : "Create user"}</SubmitButton></FormActions>
    </ActionForm>
  );
}
