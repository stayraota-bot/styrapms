import Link from "next/link";
import { Building2, Plus, MapPin } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { sp1 } from "@/server/common";
import { Card, PageHeader, LinkButton, Table, THead, Th, Td, Tr, StatusBadge, EmptyState, Tabs, DemoBadge, Badge } from "@/components/ui/core";
import { CATEGORY_LABEL } from "@/components/property-form";

export const metadata = { title: "Properties" };
type Row = { id: string; property_code: string; name: string; category: string; city: string; status: string; owner: string; manager: string | null; units: number; stayra_pct: string | null; owner_pct: string | null; cover_photo_path: string | null; is_demo: boolean };

export default async function Properties({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "operations", "auditor"]);
  const sp = await searchParams;
  const status = sp1(sp.status) ?? "all";
  const q = (sp1(sp.q) ?? "").slice(0, 60);
  const fin = can.viewFinance(u.role);
  const rows = await withUser(u.id, (tx) => tx<Row[]>`
    select p.id, p.property_code, p.name, p.category::text, p.city, p.status::text, o.full_name owner, m.full_name manager, p.cover_photo_path, p.is_demo,
      (select count(*)::int from property_units x where x.property_id = p.id and x.is_active) units, a.stayra_pct, a.owner_pct
    from properties p join owners o on o.id = p.owner_id left join profiles m on m.id = p.manager_id
    left join lateral (select stayra_pct, owner_pct from revenue_share_agreements r where r.property_id = p.id and r.effective_from <= current_date order by effective_from desc limit 1) a on true
    where (${status} = 'all' and p.status <> 'archived' or p.status::text = ${status})
      and (${q} = '' or p.name ilike ${"%" + q + "%"} or p.city ilike ${"%" + q + "%"} or p.property_code ilike ${"%" + q + "%"})
    order by p.name`);
  const counts = await withUser(u.id, (tx) => tx<{ status: string; n: number }[]>`select status::text, count(*)::int n from properties group by 1`);
  const c = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
  const tab = (k: string, l: string, n: number) => ({ key: k, label: <>{l} <span className="text-muted">({n})</span></>, href: `/properties?status=${k}` });
  return (
    <>
      <PageHeader title="Properties" description="All properties you have access to, with their revenue-sharing terms."
        actions={can.addProperty(u.role) && <LinkButton href="/properties/new"><Plus />Add Property</LinkButton>} />
      <Tabs active={status} tabs={[tab("all", "All", counts.filter((x) => x.status !== "archived").reduce((a, x) => a + x.n, 0)), tab("active", "Active", c("active")), tab("onboarding", "Onboarding", c("onboarding")), tab("inactive", "Inactive", c("inactive")), tab("archived", "Archived", c("archived"))]} />
      <form className="mb-4"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="Search name, city or ID…" className="h-10 w-full sm:w-80 rounded-lg border border-line bg-white px-3 text-sm" /></form>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Building2 />} title="No properties found" description={q ? "Try a different search." : "Add your first property to get started."}
          action={can.addProperty(u.role) && <LinkButton href="/properties/new"><Plus />Add Property</LinkButton>} /> : (
          <Table>
            <THead><tr><Th>Property</Th><Th>Location</Th><Th>Owner</Th><Th className="text-right">Rooms</Th>{fin && <Th>Share (STAYRA / Owner)</Th>}<Th>Manager</Th><Th>Status</Th></tr></THead>
            <tbody>{rows.map((r) => (
              <Tr key={r.id}>
                <Td><Link href={`/properties/${r.id}`} className="flex items-center gap-3 group">
                  {r.cover_photo_path ? <img src={`/api/files/${r.cover_photo_path}`} alt="" className="size-11 rounded-lg object-cover" />
                    : <span className="size-11 rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-white grid place-items-center font-semibold">{r.name.replace("STAYRA ", "").slice(0, 1)}</span>}
                  <span><span className="font-medium group-hover:text-brand-700 flex items-center gap-1.5">{r.name}<DemoBadge show={r.is_demo} /></span>
                    <span className="text-xs text-muted">{r.property_code} · {CATEGORY_LABEL[r.category]}</span></span></Link></Td>
                <Td><span className="inline-flex items-center gap-1 text-muted"><MapPin className="size-3.5" />{r.city}</span></Td>
                <Td>{r.owner}</Td>
                <Td className="text-right tabular">{r.units}</Td>
                {fin && <Td>{r.stayra_pct ? <Badge tone="green">{Number(r.stayra_pct)} / {Number(r.owner_pct)}</Badge> : <Badge tone="red">Not set</Badge>}</Td>}
                <Td className="text-muted">{r.manager ?? "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
              </Tr>))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
