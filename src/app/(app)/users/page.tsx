import Link from "next/link";
import { Plus, Users as UsersIcon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { fdatetime } from "@/lib/format";
import { sp1 } from "@/server/common";
import { Card, PageHeader, LinkButton, Table, THead, Th, Td, Tr, EmptyState, Badge, Select, Input, DemoBadge } from "@/components/ui/core";
import { AutoSubmit } from "@/components/ui/forms";

export const metadata = { title: "Users" };
export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin"]);
  const sp = await searchParams;
  const role = sp1(sp.role) ?? ""; const q = (sp1(sp.q) ?? "").slice(0, 60); const st = sp1(sp.status) ?? "active";
  const rows = await withUser(u.id, (tx) => tx`select pr.*, (select string_agg(p.name, ', ' order by p.name) from user_property_access a join properties p on p.id = a.property_id where a.user_id = pr.id) props,
      (select string_agg(p.name, ', ') from owners o join properties p on p.owner_id = o.id where o.profile_id = pr.id) owner_props
    from profiles pr where (${role} = '' or pr.role::text = ${role}) and (${st} = 'all' or pr.is_active = (${st} = 'active'))
      and (${q} = '' or pr.full_name ilike ${"%" + q + "%"} or pr.email ilike ${"%" + q + "%"}) order by pr.is_active desc, pr.role, pr.full_name`);
  return (
    <>
      <PageHeader title="User management" description="Separate login IDs for staff, accountants, managers, owners and auditors." actions={<LinkButton href="/users/new"><Plus />Add User</LinkButton>} />
      <AutoSubmit className="flex flex-wrap gap-2 mb-4">
        <Input type="search" name="q" defaultValue={q} placeholder="Search name or email…" className="w-full sm:w-64" />
        <Select name="role" defaultValue={role} className="w-auto"><option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select name="status" defaultValue={st} className="w-auto"><option value="active">Active</option><option value="inactive">Deactivated</option><option value="all">All</option></Select>
      </AutoSubmit>
      <Card>{rows.length === 0 ? <EmptyState icon={<UsersIcon />} title="No users match" /> : (
        <Table><THead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Access</Th><Th>Last login</Th><Th>Status</Th></tr></THead>
          <tbody>{rows.map((r) => (
            <Tr key={r.id}><Td><Link href={`/users/${r.id}`} className="font-medium hover:text-brand-700">{r.full_name}</Link> <DemoBadge show={r.is_demo} /></Td><Td className="text-muted">{r.email}</Td>
              <Td><Badge tone={r.role === "super_admin" ? "green" : r.role === "owner" ? "sand" : "blue"}>{ROLE_LABEL[r.role as Role]}</Badge></Td>
              <Td className="text-xs max-w-64 truncate">{r.role === "super_admin" || r.all_properties ? "All properties" : r.role === "owner" ? (r.owner_props ? `${r.owner_props} (view only)` : "—") : r.props ?? <span className="text-amber-700">No properties</span>}</Td>
              <Td className="text-xs text-muted whitespace-nowrap">{r.last_login_at ? fdatetime(r.last_login_at) : "Never"}</Td>
              <Td>{r.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</Td></Tr>))}</tbody></Table>)}
      </Card>
    </>
  );
}
