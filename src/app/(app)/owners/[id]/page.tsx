import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, KeyRound } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, inr } from "@/lib/format";
import { Card, CardHeader, CardBody, PageHeader, KV, Table, THead, Th, Td, Tr, StatusBadge, Button, Stat, LinkButton, EmptyState } from "@/components/ui/core";
import { Modal } from "@/components/ui/forms";
import { OwnerForm } from "@/components/owner-form";

export const metadata = { title: "Owner details" };
export default async function OwnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin", "accountant", "auditor", "property_manager"]);
  const { id } = await params;
  const fin = can.viewFinance(u.role);
  const d = await withUser(u.id, async (tx) => {
    const [o] = await tx`select o.*, pr.email login_email, pr.is_active login_active, pr.last_login_at from owners o left join profiles pr on pr.id = o.profile_id where o.id = ${id}::uuid`;
    if (!o) return null;
    const props = await tx`select p.id, p.name, p.city, p.status::text, a.stayra_pct, a.owner_pct from properties p
      left join lateral (select stayra_pct, owner_pct from revenue_share_agreements r where r.property_id = p.id and r.effective_from <= current_date order by effective_from desc limit 1) a on true
      where p.owner_id = ${id}::uuid order by p.name`;
    const settlements = fin ? await tx`select s.id, s.settlement_code, p.name prop, s.period_start, s.period_end, s.status::text, s.net_distributable, s.owner_share, s.owner_borne_recoveries, s.payments_made
      from settlements s join properties p on p.id = s.property_id where s.owner_id = ${id}::uuid and s.status <> 'void' order by s.period_end desc limit 24` : [];
    return { o, props, settlements };
  }).catch(() => null);
  if (!d) notFound();
  const { o } = d;
  const approved = d.settlements.filter((s) => ["approved", "partially_paid", "paid"].includes(s.status));
  const entitled = approved.reduce((a, s) => a + Number(s.owner_share) - Number(s.owner_borne_recoveries), 0);
  const paid = approved.reduce((a, s) => a + Number(s.payments_made), 0);
  return (
    <>
      <PageHeader back={{ href: "/owners", label: "Owners" }} title={o.full_name} description={`${o.owner_code} · ${d.props.length} propert${d.props.length === 1 ? "y" : "ies"}`}
        actions={<>
          {can.manageUsers(u.role) && !o.profile_id && <LinkButton href={`/users/new?role=owner&owner=${id}`} variant="secondary"><KeyRound />Create owner login</LinkButton>}
          {can.manageOwners(u.role) && <Modal title="Edit owner" wide trigger={<Button><Pencil />Edit</Button>}><OwnerForm owner={o} /></Modal>}
        </>} />
      {fin && <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Stat label="Total owner entitlement (approved)" value={inr(entitled)} />
        <Stat label="Payments made" value={inr(paid)} />
        <Stat label="Current payable" value={inr(entitled - paid)} tone="brand" href="/settlements?status=outstanding" />
      </div>}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader title="Owner details" /><CardBody>
          <KV items={[["Phone", o.phone], ["Email", o.email], ["Address", o.address], ["PAN", o.pan], ["Bank account", o.bank_account_name ? `${o.bank_account_name} · ${o.bank_account_number ?? ""}` : "—"], ["IFSC", o.bank_ifsc], ["UPI", o.upi_id],
            ["Portal login", o.profile_id ? `${o.login_email} · ${o.login_active ? "active" : "deactivated"} · last login ${o.last_login_at ? fdate(o.last_login_at) : "never"}` : "Not created"], ["Notes", o.notes]]} />
        </CardBody></Card>
        <Card><CardHeader title="Associated properties" /><CardBody className="space-y-3">
          {d.props.map((p) => <Link key={p.id} href={`/properties/${p.id}`} className="block rounded-lg border border-line p-3 hover:border-brand-300">
            <div className="flex justify-between items-center"><span className="font-medium text-sm">{p.name}</span><StatusBadge status={p.status} /></div>
            <p className="text-xs text-muted mt-1">{p.city}{fin && p.stayra_pct ? ` · STAYRA ${Number(p.stayra_pct)}% / Owner ${Number(p.owner_pct)}%` : ""}</p></Link>)}
          {d.props.length === 0 && <p className="text-sm text-muted">No properties linked.</p>}
        </CardBody></Card>
      </div>
      {fin && <Card className="mt-6"><CardHeader title="Settlement history" />
        {d.settlements.length === 0 ? <EmptyState title="No settlements yet" /> : (
          <Table><THead><tr><Th>Settlement</Th><Th>Property</Th><Th>Period</Th><Th className="text-right">Net distributable</Th><Th className="text-right">Owner share</Th><Th className="text-right">Paid</Th><Th>Status</Th></tr></THead>
            <tbody>{d.settlements.map((s) => <Tr key={s.id}><Td><Link href={`/settlements/${s.id}`} className="text-brand-700 font-medium hover:underline">{s.settlement_code}</Link></Td><Td>{s.prop}</Td>
              <Td className="whitespace-nowrap">{fdate(s.period_start)} – {fdate(s.period_end)}</Td><Td className="text-right tabular">{inr(s.net_distributable)}</Td><Td className="text-right tabular">{inr(s.owner_share)}</Td>
              <Td className="text-right tabular">{inr(s.payments_made)}</Td><Td><StatusBadge status={s.status} /></Td></Tr>)}</tbody></Table>)}
      </Card>}
    </>
  );
}
