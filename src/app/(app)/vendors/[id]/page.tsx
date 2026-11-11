import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { inr, fdate, titleCase } from "@/lib/format";
import { propertyOptions } from "@/server/common";
import { Card, CardHeader, CardBody, PageHeader, Button, Table, THead, Th, Td, Tr, KV, Stat, StatusBadge } from "@/components/ui/core";
import { Modal } from "@/components/ui/forms";
import { VendorForm } from "@/components/vendor-form";

export const metadata = { title: "Vendor" };
export default async function Vendor({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "auditor"]);
  const { id } = await params;
  const d = await withUser(u.id, async (tx) => {
    const [v] = await tx`select * from vendors where id = ${id}::uuid`;
    if (!v) return null;
    return { v, linked: (await tx`select property_id from vendor_properties where vendor_id = ${id}::uuid`).map((r) => r.property_id as string), props: await propertyOptions(tx),
      bills: await tx`select e.id, e.expense_code, e.bill_date, e.description, e.total_amount, e.paid_amount, e.payment_status::text, e.approval_status::text, p.name prop from expenses e join properties p on p.id = e.property_id where e.vendor_id = ${id}::uuid and e.status = 'active' order by e.bill_date desc limit 100`,
      pays: await tx`select ep.*, e.expense_code from expense_payments ep join expenses e on e.id = ep.expense_id where e.vendor_id = ${id}::uuid order by ep.paid_on desc limit 100` };
  }).catch(() => null);
  if (!d) notFound();
  const inv = d.bills.reduce((a, b) => a + Number(b.total_amount), 0), paid = d.bills.reduce((a, b) => a + Number(b.paid_amount), 0);
  return (
    <>
      <PageHeader back={{ href: "/vendors", label: "Vendors" }} title={d.v.name} description={d.v.category ?? undefined}
        actions={u.role !== "auditor" && <Modal title="Edit vendor" wide trigger={<Button><Pencil />Edit</Button>}><VendorForm vendor={d.v} properties={d.props} linked={d.linked} /></Modal>} />
      <div className="grid grid-cols-3 gap-3 mb-6"><Stat label="Total invoices" value={`${d.bills.length} · ${inr(inv)}`} /><Stat label="Paid amount" value={inr(paid)} /><Stat label="Outstanding" value={inr(inv - paid)} tone={inv - paid > 0 ? "warn" : "default"} /></div>
      <Card className="mb-6"><CardBody className="pt-5"><KV cols={4} items={[["Phone", d.v.phone], ["Email", d.v.email], ["GSTIN", d.v.gstin], ["Address", d.v.address]]} /></CardBody></Card>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card><CardHeader title="Invoices" /><Table><THead><tr><Th>Date</Th><Th>Bill</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></THead>
          <tbody>{d.bills.map((b) => <Tr key={b.id}><Td className="whitespace-nowrap">{fdate(b.bill_date)}</Td><Td><Link className="text-brand-700 hover:underline" href={`/expenses/${b.id}`}>{b.expense_code}</Link><div className="text-xs text-muted">{b.prop.replace("STAYRA ", "")} · {b.description}</div></Td>
            <Td className="text-right tabular">{inr(b.total_amount)}</Td><Td><StatusBadge status={b.payment_status} /></Td></Tr>)}</tbody></Table></Card>
        <Card><CardHeader title="Payment history" /><Table><THead><tr><Th>Date</Th><Th>Bill</Th><Th>Method</Th><Th className="text-right">Amount</Th></tr></THead>
          <tbody>{d.pays.map((p) => <Tr key={p.id}><Td>{fdate(p.paid_on)}</Td><Td>{p.expense_code}</Td><Td>{titleCase(p.method)}</Td><Td className="text-right tabular">{inr(p.amount)}</Td></Tr>)}</tbody></Table></Card>
      </div>
    </>
  );
}
