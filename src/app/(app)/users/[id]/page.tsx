import { notFound } from "next/navigation";
import { KeyRound, UserX, UserCheck, Mail } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { fdatetime, titleCase } from "@/lib/format";
import { propertyOptions } from "@/server/common";
import { Card, CardHeader, PageHeader, Table, THead, Th, Td, Tr, Badge, Button, Input } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { UserForm } from "@/components/user-form";
import { updateUser, setActive, resetPassword } from "../actions";

export const metadata = { title: "User" };
export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole(["super_admin"]);
  const { id } = await params;
  const d = await withUser(admin.id, async (tx) => {
    const [u] = await tx`select * from profiles where id = ${id}::uuid`;
    if (!u) return null;
    return { u, props: await propertyOptions(tx), owners: await tx<{ id: string; full_name: string; taken: boolean }[]>`select id, full_name, profile_id is not null taken from owners order by full_name`,
      assigned: (await tx`select property_id from user_property_access where user_id = ${id}::uuid`).map((r) => r.property_id as string),
      linked: (await tx`select id from owners where profile_id = ${id}::uuid`)[0]?.id ?? null,
      logins: await tx`select * from login_history where user_id = ${id}::uuid order by created_at desc limit 25`,
      activity: await tx`select occurred_at, action, table_name, record_id from audit_logs where actor_id = ${id}::uuid order by occurred_at desc limit 25` };
  }).catch(() => null);
  if (!d) notFound();
  const { u } = d;
  const self = u.id === admin.id;
  return (
    <div className="max-w-5xl">
      <PageHeader back={{ href: "/users", label: "Users" }} title={<span className="flex items-center gap-2">{u.full_name} {u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</span>}
        description={`${u.email} · ${ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]} · created ${fdatetime(u.created_at)}`}
        actions={!self && <>
          <Modal title="Reset password" trigger={<Button variant="secondary"><KeyRound />Reset password</Button>}>
            <ActionForm action={resetPassword} className="space-y-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="mode" value="set" />
              <Field name="password" label="New temporary password" hint="10+ characters with a letter and a number"><Input name="password" autoComplete="off" /></Field>
              <div className="flex justify-end"><SubmitButton>Set password</SubmitButton></div></ActionForm>
            <div className="border-t border-line mt-5 pt-4"><ActionForm action={resetPassword}><input type="hidden" name="id" value={id} /><input type="hidden" name="mode" value="email" />
              <SubmitButton variant="secondary" className="w-full"><Mail />Email a reset link instead</SubmitButton></ActionForm></div>
          </Modal>
          {u.is_active ? <ConfirmAction action={setActive} hidden={{ id, active: "false" }} label="Deactivate" icon={<UserX />} title={`Deactivate ${u.full_name}?`} description="They are signed out and can no longer log in. Their history is kept." variant="outlineDanger" size="md" confirmLabel="Deactivate" />
            : <ConfirmAction action={setActive} hidden={{ id, active: "true" }} label="Reactivate" icon={<UserCheck />} title="Reactivate this user?" size="md" variant="primary" />}
        </>} />
      <UserForm action={updateUser} properties={d.props} owners={d.owners} assigned={d.assigned} linkedOwner={d.linked} user={{ id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, role: u.role, all_properties: u.all_properties }} />
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Card><CardHeader title="Login history" /><Table><THead><tr><Th>When</Th><Th>Event</Th><Th>IP / device</Th></tr></THead>
          <tbody>{d.logins.map((l) => <Tr key={l.id}><Td className="whitespace-nowrap text-xs">{fdatetime(l.created_at)}</Td><Td><Badge tone={l.event === "failed_login" ? "red" : l.event === "login" ? "green" : "gray"}>{titleCase(l.event)}</Badge></Td><Td className="text-xs text-muted max-w-48 truncate" title={l.user_agent ?? ""}>{l.ip ?? "—"} · {(l.user_agent ?? "").slice(0, 40)}</Td></Tr>)}
            {d.logins.length === 0 && <Tr><Td colSpan={3} className="text-muted">No sign-ins yet</Td></Tr>}</tbody></Table></Card>
        <Card><CardHeader title="Recent activity" /><Table><THead><tr><Th>When</Th><Th>Action</Th><Th>Record</Th></tr></THead>
          <tbody>{d.activity.map((a, i) => <Tr key={i}><Td className="whitespace-nowrap text-xs">{fdatetime(a.occurred_at)}</Td><Td className="capitalize">{a.action}</Td><Td className="text-xs">{titleCase(a.table_name)}</Td></Tr>)}
            {d.activity.length === 0 && <Tr><Td colSpan={3} className="text-muted">No changes recorded</Td></Tr>}</tbody></Table></Card>
      </div>
    </div>
  );
}
