import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { inr, fdate } from "@/lib/format";
import { propertyOptions } from "@/server/common";
import { Card, PageHeader, Button, Table, THead, Th, Td, Tr, EmptyState, Badge, DemoBadge } from "@/components/ui/core";
import { Modal } from "@/components/ui/forms";
import { VendorForm } from "@/components/vendor-form";

export const metadata = { title: "Vendors" };
export default async function Vendors() {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "auditor"]);
  const d = await withUser(u.id, async (tx) => ({
    rows: await tx`select v.*, count(e.id)::int invoices, coalesce(sum(e.total_amount),0) invoiced, coalesce(sum(e.paid_amount),0) paid, coalesce(sum(e.total_amount - e.paid_amount),0) outstanding, max(e.bill_date) last_bill,
        (select string_agg(p.name, ', ') from vendor_properties vp join properties p on p.id = vp.property_id where vp.vendor_id = v.id) props
      from vendors v left join expenses e on e.vendor_id = v.id and e.status = 'active' and e.approval_status <> 'rejected' group by v.id order by v.name`,
    props: await propertyOptions(tx),
  }));
  const canEdit = ["super_admin", "admin", "accountant", "property_manager"].includes(u.role);
  return (
    <>
      <PageHeader title="Vendors" description="Suppliers and service providers with invoice and payment history."
        actions={canEdit && <Modal title="Add vendor" wide trigger={<Button><Plus />Add Vendor</Button>}><VendorForm properties={d.props} /></Modal>} />
      <Card>{d.rows.length === 0 ? <EmptyState icon={<Truck />} title="No vendors yet" /> : (
        <Table><THead><tr><Th>Vendor</Th><Th>Category</Th><Th>GSTIN</Th><Th>Properties</Th><Th className="text-right">Invoices</Th><Th className="text-right">Invoiced</Th><Th className="text-right">Paid</Th><Th className="text-right">Outstanding</Th><Th>Last bill</Th></tr></THead>
          <tbody>{d.rows.map((v) => (
            <Tr key={v.id}><Td><Link href={`/vendors/${v.id}`} className="font-medium hover:text-brand-700">{v.name}</Link> <DemoBadge show={v.is_demo} />{!v.is_active && <Badge>Inactive</Badge>}<div className="text-xs text-muted">{v.phone ?? ""}</div></Td>
              <Td>{v.category ?? "—"}</Td><Td className="text-xs font-mono">{v.gstin ?? "—"}</Td><Td className="text-xs max-w-48 truncate">{v.props ?? "—"}</Td>
              <Td className="text-right">{v.invoices}</Td><Td className="text-right tabular">{inr(v.invoiced)}</Td><Td className="text-right tabular">{inr(v.paid)}</Td>
              <Td className={`text-right tabular ${Number(v.outstanding) > 0 ? "text-red-700 font-medium" : ""}`}>{inr(v.outstanding)}</Td><Td className="whitespace-nowrap">{fdate(v.last_bill)}</Td></Tr>))}</tbody></Table>)}
      </Card>
    </>
  );
}
