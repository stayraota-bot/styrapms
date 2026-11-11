import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { inr } from "@/lib/format";
import { Card, PageHeader, Button, Table, THead, Th, Td, Tr, EmptyState, Badge, DemoBadge } from "@/components/ui/core";
import { Modal } from "@/components/ui/forms";
import { OwnerForm } from "@/components/owner-form";

export const metadata = { title: "Owners" };
export default async function Owners({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const u = await requireRole(["super_admin", "admin", "accountant", "auditor", "property_manager"]);
  const sp = await searchParams;
  const rows = await withUser(u.id, (tx) => tx`
    select o.id, o.owner_code, o.full_name, o.phone, o.email, o.profile_id, o.is_demo,
      (select string_agg(p.name, ', ' order by p.name) from properties p where p.owner_id = o.id and p.status <> 'archived') props,
      (select coalesce(sum(s.owner_share - s.owner_borne_recoveries - s.payments_made), 0) from settlements s where s.owner_id = o.id and s.status in ('approved','partially_paid')) payable,
      (select coalesce(sum(sp.amount), 0) from settlement_payments sp join settlements s on s.id = sp.settlement_id where s.owner_id = o.id) paid
    from owners o order by o.full_name`);
  const fin = can.viewFinance(u.role);
  return (
    <>
      <PageHeader title="Owners" description="Property owners, their properties and settlement position."
        actions={can.manageOwners(u.role) && <Modal title="Add owner" wide defaultOpen={sp.new === "1"} trigger={<Button><Plus />Add Owner</Button>}><OwnerForm /></Modal>} />
      <Card>
        {rows.length === 0 ? <EmptyState icon={<UserRound />} title="No owners yet" /> : (
          <Table><THead><tr><Th>Owner</Th><Th>Properties</Th><Th>Contact</Th><Th>Portal login</Th>{fin && <Th className="text-right">Paid to date</Th>}{fin && <Th className="text-right">Payable now</Th>}</tr></THead>
            <tbody>{rows.map((o) => (
              <Tr key={o.id}><Td><Link href={`/owners/${o.id}`} className="font-medium hover:text-brand-700 flex items-center gap-1.5">{o.full_name}<DemoBadge show={o.is_demo} /></Link><span className="text-xs text-muted">{o.owner_code}</span></Td>
                <Td className="max-w-xs">{o.props ?? <span className="text-muted">—</span>}</Td><Td className="text-xs"><div>{o.phone ?? "—"}</div><div className="text-muted">{o.email ?? ""}</div></Td>
                <Td>{o.profile_id ? <Badge tone="green">Enabled</Badge> : <Badge>Not created</Badge>}</Td>
                {fin && <Td className="text-right tabular">{inr(o.paid)}</Td>}{fin && <Td className="text-right tabular font-medium">{inr(o.payable)}</Td>}</Tr>))}</tbody></Table>)}
      </Card>
    </>
  );
}
