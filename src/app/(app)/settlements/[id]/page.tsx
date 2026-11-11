import Link from "next/link";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import * as I from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, fdatetime, inr, todayIST, titleCase } from "@/lib/format";
import { loadSettlement } from "@/server/settlements";
import { Card, CardHeader, CardBody, PageHeader, StatusBadge, Table, THead, Th, Td, Tr, Button, Input, Select, Alert, LinkButton, KV } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { StatementSummary, StatementItems, StatementInfo } from "@/components/settlement-statement";
import { transition, payOwner } from "../actions";

export const metadata = { title: "Settlement" };
const STEPS = ["draft", "submitted", "approved", "partially_paid", "paid"];

export default async function SettlementDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin", "accountant", "auditor"]);
  const { id } = await params;
  const d = await withUser(u.id, (tx) => loadSettlement(tx, id)).catch(() => null);
  if (!d) notFound();
  const { s } = d;
  const due = Number(s.owner_share) - Number(s.owner_borne_recoveries) - Number(s.payments_made);
  const step = STEPS.indexOf(s.status);
  return (
    <>
      <PageHeader back={{ href: "/settlements", label: "Owner settlements" }}
        title={<span className="flex items-center gap-2 flex-wrap">{s.settlement_code} <StatusBadge status={s.status} /></span>}
        description={`${s.prop} · ${s.owner} · ${fdate(s.period_start)} – ${fdate(s.period_end)}${s.booking_code ? ` · booking ${s.booking_code}` : ""}`}
        actions={<>
          <LinkButton href={`/api/settlements/${id}/pdf`} variant="secondary" prefetch={false}><I.Download />Download PDF</LinkButton>
          {s.status === "draft" && can.generateSettlement(u.role) && <ConfirmAction action={transition} hidden={{ id, to: "submitted" }} label="Submit for approval" icon={<I.Send />} title="Submit for approval?" description="Super Admin will review and approve." variant="primary" size="md" />}
          {s.status === "submitted" && can.approveSettlement(u.role) && <ConfirmAction action={transition} hidden={{ id, to: "approved" }} label="Approve" icon={<I.ShieldCheck />} title="Approve and lock this settlement?" description="After approval nothing can be edited; corrections need adjustment entries. The owner will see the statement in their portal." variant="primary" size="md" />}
          {s.status === "submitted" && ["super_admin", "accountant"].includes(u.role) && <ConfirmAction action={transition} hidden={{ id, to: "draft" }} reason="What needs to change?" label="Return to draft" title="Return to draft?" size="md" />}
          {["draft", "submitted"].includes(s.status) && can.generateSettlement(u.role) && <ConfirmAction action={transition} hidden={{ id, to: "void" }} reason="Reason for voiding" label="Void" icon={<I.Ban />} title="Void this settlement?" description="Its items become available for a new settlement." variant="outlineDanger" size="md" confirmLabel="Void" />}
          {["approved", "partially_paid"].includes(s.status) && can.recordOwnerPayment(u.role) && (
            <Modal title="Record owner payment" trigger={<Button><I.Banknote />Record payment</Button>}>
              <ActionForm action={payOwner} className="grid sm:grid-cols-2 gap-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="idem" value={randomUUID()} />
                <Field name="amount" label="Amount (₹)" required hint={`Due on this settlement: ${inr(due)}`}><Input name="amount" defaultValue={String(due)} inputMode="decimal" /></Field>
                <Field name="paid_on" label="Paid on" required><Input type="date" name="paid_on" defaultValue={todayIST()} /></Field>
                <Field name="method" label="Method" required><Select name="method" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer (NEFT/IMPS/RTGS)</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="other">Other</option></Select></Field>
                <Field name="reference" label="UTR / reference"><Input name="reference" /></Field>
                <Field name="notes" label="Notes" className="sm:col-span-2"><Input name="notes" /></Field>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save payment</SubmitButton></div></ActionForm></Modal>)}
        </>} />

      {s.status !== "void" && <ol className="flex flex-wrap gap-2 mb-6 text-xs">{STEPS.map((x, i) => (
        <li key={x} className={`flex items-center gap-2 rounded-full px-3 py-1.5 border ${i <= step ? "bg-brand-700 text-white border-brand-700" : "bg-white text-muted border-line"}`}>
          {i < step ? <I.Check className="size-3.5" /> : <span className="tabular">{i + 1}</span>}{titleCase(x)}</li>))}</ol>}
      {s.status === "void" && <div className="mb-5"><Alert tone="red" title="Voided">{s.void_reason}</Alert></div>}
      {["approved", "partially_paid", "paid"].includes(s.status) && <div className="mb-5"><Alert tone="green" title="Locked">Approved by {s.approved_by_name} on {fdatetime(s.approved_at)}. Corrections are made with adjustment entries in a later settlement.</Alert></div>}
      {Number(s.net_distributable) < 0 && <div className="mb-5"><Alert tone="amber" title="Negative net revenue">Expenses exceeded revenue; the owner share is negative for this period.</Alert></div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><StatementSummary s={s} /></div>
        <div className="space-y-6">
          <Card><CardHeader title="Owner & property" /><CardBody><KV cols={2} items={[["Owner", <Link key="o" href={`/owners/${s.owner_id}`} className="text-brand-700 hover:underline">{s.owner}</Link>], ["Owner ID", s.owner_code],
            ["Property", s.prop], ["Mode", s.mode === "booking" ? "Booking-wise" : "Period"], ["Bank", s.bank_account_name ? `${s.bank_account_name} · ${s.bank_account_number}` : "—"], ["IFSC / UPI", [s.bank_ifsc, s.upi_id].filter(Boolean).join(" · ") || "—"],
            ["Prepared by", s.created_by_name ?? "—"], ["Submitted by", s.submitted_by_name ?? "—"]]} /></CardBody></Card>
          <StatementInfo s={s} />
        </div>
      </div>
      <Card className="mt-6"><CardHeader title="Owner payments" />
        <Table><THead><tr><Th>Date</Th><Th>Method</Th><Th>Reference</Th><Th>Recorded by</Th><Th className="text-right">Amount</Th></tr></THead>
          <tbody>{d.payments.map((p) => <Tr key={p.id}><Td>{fdate(p.paid_on)}</Td><Td>{titleCase(p.method)}</Td><Td className="text-xs">{p.reference ?? "—"}{p.notes ? ` · ${p.notes}` : ""}</Td><Td className="text-xs">{p.by_name ?? "—"}</Td><Td className="text-right tabular font-medium">{inr(p.amount)}</Td></Tr>)}
            {d.payments.length === 0 && <Tr><Td colSpan={5} className="text-muted">No payments yet</Td></Tr>}</tbody></Table></Card>
      <div className="mt-6"><StatementItems items={d.items} /></div>
    </>
  );
}
