import Link from "next/link";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import * as I from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, fdatetime, inr, todayIST, titleCase } from "@/lib/format";
import { Card, CardHeader, CardBody, PageHeader, KV, StatusBadge, Table, THead, Th, Td, Tr, Badge, Button, Input, Select, Alert, Textarea } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { reviewExpenses, payExpense, voidExpense, allocateExpense, attachBill } from "../actions";

export const metadata = { title: "Expense details" };
export default async function ExpenseDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "auditor"]);
  const { id } = await params;
  const d = await withUser(u.id, async (tx) => {
    const [e] = await tx`select e.*, c.name category, c.group_name, p.name prop, v.name vendor, v.gstin vendor_gstin, b.booking_code, cr.full_name created_by_name, ap.full_name approved_by_name,
        doc.file_name, doc.mime_type
      from expenses e join expense_categories c on c.id = e.category_id join properties p on p.id = e.property_id left join vendors v on v.id = e.vendor_id left join bookings b on b.id = e.booking_id
      left join profiles cr on cr.id = e.created_by left join profiles ap on ap.id = e.approved_by left join uploaded_documents doc on doc.id = e.document_id where e.id = ${id}::uuid`;
    if (!e) return null;
    const allocations = await tx`select a.*, p.name prop from expense_allocations a join properties p on p.id = a.property_id where a.expense_id = ${id}::uuid order by p.name`;
    const payments = await tx`select * from expense_payments where expense_id = ${id}::uuid order by paid_on`;
    const settled = await tx`select distinct s.id, s.settlement_code, s.status::text, p.name prop from settlement_items si join settlements s on s.id = si.settlement_id join properties p on p.id = s.property_id
      where si.ref_id = ${id}::uuid and si.is_active and si.item_type in ('expense','owner_recovery')`;
    const props = await tx<{ id: string; name: string; units: number }[]>`select p.id, p.name, (select count(*)::int from property_units x where x.property_id = p.id and x.is_active) units from properties p where p.status <> 'archived' order by p.name`;
    return { e, allocations, payments, settled, props };
  }).catch(() => null);
  if (!d) notFound();
  const { e } = d;
  const active = e.status === "active";
  const due = Number(e.total_amount) - Number(e.paid_amount);
  return (
    <>
      <PageHeader back={{ href: "/expenses", label: "Expenses" }}
        title={<span className="flex items-center gap-2 flex-wrap">{e.expense_code} <StatusBadge status={active ? e.approval_status : "void"} /><StatusBadge status={e.payment_status} /></span>}
        description={`${e.category} · ${e.prop}`}
        actions={active && <>
          {can.approveExpense(u.role) && e.approval_status === "pending" && <>
            <ConfirmAction action={reviewExpenses} hidden={{ ids: id, decision: "approved" }} label="Approve" icon={<I.Check />} title="Approve this expense?" description="Approved deductible expenses reduce net distributable revenue." variant="primary" size="md" />
            <ConfirmAction action={reviewExpenses} hidden={{ ids: id, decision: "rejected" }} reason="Reason for rejection" label="Reject" icon={<I.X />} title="Reject this expense?" variant="outlineDanger" size="md" confirmLabel="Reject" />
          </>}
          {can.manageFinance(u.role) && due > 0 && (
            <Modal title="Record vendor payment" trigger={<Button variant="secondary"><I.Wallet />Record payment</Button>}>
              <ActionForm action={payExpense} className="grid sm:grid-cols-2 gap-4"><input type="hidden" name="expense_id" value={id} /><input type="hidden" name="idem" value={randomUUID()} />
                <Field name="amount" label="Amount (₹)" required hint={`Outstanding ${inr(due)}`}><Input name="amount" defaultValue={String(due)} inputMode="decimal" /></Field>
                <Field name="paid_on" label="Paid on" required><Input type="date" name="paid_on" defaultValue={todayIST()} /></Field>
                <Field name="method" label="Method" required><Select name="method" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option></Select></Field>
                <Field name="reference" label="Reference / UTR"><Input name="reference" /></Field>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save payment</SubmitButton></div></ActionForm></Modal>)}
          {can.manageFinance(u.role) && d.settled.length === 0 && <ConfirmAction action={voidExpense} hidden={{ id }} reason="Reason for voiding" label="Void" icon={<I.Ban />} title="Void this expense?" description="It stays on record for audit but is excluded from every calculation." variant="outlineDanger" size="md" confirmLabel="Void" />}
        </>} />
      {e.status === "void" && <div className="mb-5"><Alert tone="red" title="Voided">{e.void_reason} · {fdatetime(e.voided_at)}</Alert></div>}
      {e.approval_status === "rejected" && <div className="mb-5"><Alert tone="red" title="Rejected">{e.rejection_reason}</Alert></div>}
      {d.settled.length > 0 && <div className="mb-5"><Alert tone="blue" title="Included in owner settlement">{d.settled.map((s, i) => <span key={s.id}>{i > 0 && ", "}<Link href={`/settlements/${s.id}`} className="underline">{s.settlement_code}</Link> ({s.prop.replace("STAYRA ", "")}, {s.status})</span>)}. This bill is locked — use an adjustment entry for corrections.</Alert></div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader title="Bill details" /><CardBody>
          <KV cols={3} items={[["Description", e.description], ["Category", `${e.group_name} › ${e.category}`], ["Property", <Link key="p" href={`/properties/${e.property_id}`} className="text-brand-700 hover:underline">{e.prop}</Link>],
            ["Vendor", e.vendor ? <Link key="v" href={`/vendors/${e.vendor_id}`} className="text-brand-700 hover:underline">{e.vendor}</Link> : "—"], ["Vendor GSTIN", e.vendor_gstin ?? "—"], ["Bill number", e.bill_number ?? "—"],
            ["Bill date", fdate(e.bill_date)], ["Due date", fdate(e.due_date)], ["Booking", e.booking_code ? <Link key="b" href={`/bookings/${e.booking_id}`} className="text-brand-700 hover:underline">{e.booking_code}</Link> : "—"],
            ["Amount", inr(e.amount)], ["GST", inr(e.gst_amount)], ["Total", <span key="t" className="font-semibold">{inr(e.total_amount)}</span>],
            ["Paid by", titleCase(e.paid_by)], ["Paid so far", inr(e.paid_amount)], ["Outstanding", inr(due)],
            ["Created by", `${e.created_by_name ?? "—"} · ${fdatetime(e.created_at)}`], ["Approved by", e.approved_by_name ? `${e.approved_by_name} · ${fdatetime(e.approved_at)}` : "—"], ["Notes", e.notes ?? "—"]]} />
        </CardBody></Card>
        <div className="space-y-6">
          <Card><CardHeader title="Classification" /><CardBody className="space-y-2 text-sm">
            <p className="flex justify-between"><span className="text-muted">Applies to</span><Badge tone="blue">{e.scope}-level</Badge></p>
            <p className="flex justify-between"><span className="text-muted">Borne by</span><Badge tone="sand">{e.bearer === "pool" ? "shared pool" : `${e.bearer}-borne`}</Badge></p>
            <p className="flex justify-between"><span className="text-muted">Before sharing</span>{e.is_deductible ? <Badge tone="green">Deductible</Badge> : <Badge>Non-deductible</Badge>}</p>
            <p className="text-xs text-muted pt-2">{e.bearer === "owner" ? "Owner-borne costs paid by STAYRA are recovered from the owner's share in the settlement." : e.bearer === "stayra" ? "STAYRA-borne costs are never deducted from the owner's share." : e.is_deductible ? "Deducted from revenue before the STAYRA / owner split (when approved; unpaid bills follow the agreement's policy)." : "Recorded for reporting only; not deducted before sharing."}</p>
          </CardBody></Card>
          <Card><CardHeader title="Bill / receipt" action={active && can.addExpense(u.role) && <Modal title="Upload bill" trigger={<Button size="sm" variant="secondary"><I.Upload />{e.document_id ? "Replace" : "Upload"}</Button>}>
            <ActionForm action={attachBill} className="space-y-4"><input type="hidden" name="expense_id" value={id} /><Field name="bill" label="File"><Input type="file" name="bill" accept="image/*,application/pdf" className="py-1.5" /></Field><div className="flex justify-end"><SubmitButton>Upload</SubmitButton></div></ActionForm></Modal>} />
            <CardBody>{e.document_id ? (String(e.mime_type).startsWith("image/")
              ? <a href={`/api/files/${e.document_id}`} target="_blank"><img src={`/api/files/${e.document_id}`} alt="Bill" className="rounded-lg border border-line max-h-72 w-full object-contain bg-gray-50" /></a>
              : <a href={`/api/files/${e.document_id}`} target="_blank" className="flex items-center gap-2 text-brand-700 hover:underline text-sm"><I.FileText className="size-4" />{e.file_name}</a>)
              : <p className="text-sm text-muted">No bill uploaded{e.approval_status === "pending" ? " — approvers may ask for one." : "."}</p>}</CardBody></Card>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Card><CardHeader title="Allocation to properties" description={e.scope === "shared" ? "How this shared cost is split" : "Charged fully to one property"}
          action={e.scope === "shared" && active && d.settled.length === 0 && can.addExpense(u.role) && (
            <Modal title="Split shared expense" wide trigger={<Button size="sm"><I.Split />Allocate</Button>}>
              <ActionForm action={allocateExpense} className="space-y-4"><input type="hidden" name="expense_id" value={id} />
                <Field name="method" label="Allocation rule"><Select name="method" defaultValue="by_units"><option value="by_units">By number of rooms</option><option value="equal">Equally</option><option value="manual">Manual amounts (must total {inr(e.total_amount)})</option></Select></Field>
                <div className="space-y-2">{d.props.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 text-sm"><input type="checkbox" name="property_ids" value={p.id} defaultChecked className="size-4 accent-brand-700" />
                    <span className="flex-1">{p.name} <span className="text-muted text-xs">({p.units} rooms)</span></span>
                    <Input name={`amt_${p.id}`} placeholder="Manual ₹" className="w-32 h-9" inputMode="decimal" /></label>))}</div>
                <div className="flex justify-end"><SubmitButton>Save allocation</SubmitButton></div></ActionForm></Modal>)} />
          <Table><THead><tr><Th>Property</Th><Th>Basis</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>{d.allocations.map((a) => <Tr key={a.id}><Td>{a.prop}</Td><Td className="capitalize">{String(a.basis).replace("_", " ")}</Td><Td className="text-right tabular">{inr(a.amount)}</Td></Tr>)}
              {d.allocations.length === 0 && <Tr><Td colSpan={3} className="text-amber-700">Not allocated yet — click Allocate.</Td></Tr>}</tbody></Table>
        </Card>
        <Card><CardHeader title="Vendor payment history" />
          <Table><THead><tr><Th>Date</Th><Th>Method</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>{d.payments.map((p) => <Tr key={p.id}><Td>{fdate(p.paid_on)}</Td><Td>{titleCase(p.method)}</Td><Td className="text-xs">{p.reference ?? "—"}</Td><Td className="text-right tabular">{inr(p.amount)}</Td></Tr>)}
              {d.payments.length === 0 && <Tr><Td colSpan={4} className="text-muted">No payments yet</Td></Tr>}</tbody></Table>
        </Card>
      </div>
    </>
  );
}
