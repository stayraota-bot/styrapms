import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdatetime, titleCase } from "@/lib/format";
import { sp1 } from "@/server/common";
import { Card, PageHeader, Table, THead, Th, Td, Tr, Badge, Select, Input, LinkButton } from "@/components/ui/core";
import { AutoSubmit } from "@/components/ui/forms";

export const metadata = { title: "Audit logs" };
const SKIP = new Set(["updated_at", "created_at"]);
function diff(o: Record<string, unknown> | null, n: Record<string, unknown> | null) {
  if (!o || !n) return null;
  return Object.keys(n).filter((k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).slice(0, 6).map((k) => `${k}: ${String(o[k] ?? "∅").slice(0, 30)} → ${String(n[k] ?? "∅").slice(0, 30)}`);
}
export default async function AuditLogs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "auditor"]);
  const sp = await searchParams;
  const table = sp1(sp.table) ?? ""; const action = sp1(sp.action) ?? ""; const q = (sp1(sp.q) ?? "").slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);
  const d = await withUser(u.id, async (tx) => ({
    rows: await tx`select * from audit_logs where (${table} = '' or table_name = ${table}) and (${action} = '' or action = ${action})
      and (${q} = '' or actor_email ilike ${"%" + q + "%"} or record_id = ${q} or new_data::text ilike ${"%" + q + "%"}) order by id desc limit 100 offset ${(page - 1) * 100}`,
    tables: (await tx`select distinct table_name from audit_logs order by 1`).map((r) => r.table_name as string),
  }));
  return (
    <>
      <PageHeader title="Audit logs" description="Every change to financial and access records — who, what and when. Tamper-proof (cannot be edited or deleted)." />
      <AutoSubmit className="flex flex-wrap gap-2 mb-4">
        <Input type="search" name="q" defaultValue={q} placeholder="User email, record ID or text…" className="w-full sm:w-72" />
        <Select name="table" defaultValue={table} className="w-auto"><option value="">All records</option>{d.tables.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
        <Select name="action" defaultValue={action} className="w-auto"><option value="">All actions</option><option value="insert">Created</option><option value="update">Updated</option><option value="delete">Deleted</option></Select>
      </AutoSubmit>
      <Card><Table><THead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Record</Th><Th>Changes</Th></tr></THead>
        <tbody>{d.rows.map((r) => {
          const ch = diff(r.old_data, r.new_data); const nd = (r.new_data ?? r.old_data ?? {}) as Record<string, string>;
          const label = nd.booking_code ?? nd.expense_code ?? nd.txn_code ?? nd.settlement_code ?? nd.property_code ?? nd.ticket_code ?? nd.adj_code ?? nd.name ?? nd.full_name ?? nd.email ?? String(r.record_id).slice(0, 8);
          return <Tr key={r.id}><Td className="whitespace-nowrap text-xs">{fdatetime(r.occurred_at)}</Td><Td className="text-xs">{r.actor_email ?? <span className="text-muted">system</span>}</Td>
            <Td><Badge tone={r.action === "insert" ? "green" : r.action === "delete" ? "red" : "blue"}>{r.action}</Badge></Td>
            <Td className="text-xs"><span className="text-muted">{titleCase(r.table_name)}</span> · {label}</Td>
            <Td className="text-[11px] text-muted max-w-md">{ch ? (ch.length ? ch.map((c, i) => <div key={i} className="truncate">{c}</div>) : "—") : r.action === "insert" ? "Created" : "Removed"}</Td></Tr>;
        })}</tbody></Table></Card>
      <div className="flex justify-end gap-2 mt-4">{page > 1 && <LinkButton size="sm" variant="secondary" href={`?${new URLSearchParams({ table, action, q, page: String(page - 1) })}`}>← Newer</LinkButton>}
        {d.rows.length === 100 && <LinkButton size="sm" variant="secondary" href={`?${new URLSearchParams({ table, action, q, page: String(page + 1) })}`}>Older →</LinkButton>}</div>
    </>
  );
}
