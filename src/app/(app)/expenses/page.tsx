import Link from "next/link";
import { Plus, Receipt, Paperclip, Download, Check, X } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, inr } from "@/lib/format";
import { resolveRange } from "@/server/analytics";
import { propertyOptions, sp1, uuidParam } from "@/server/common";
import { Card, PageHeader, Button, Table, THead, Th, Td, Tr, StatusBadge, EmptyState, Select, Stat, LinkButton, Tabs, Badge, Textarea } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { PeriodFilter } from "@/components/filters";
import { reviewExpenses } from "./actions";
import { IdsCollector } from "@/components/ids-collector";

export const metadata = { title: "Expenses" };
export default async function Expenses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "auditor"]);
  const sp = await searchParams;
  const approval = sp1(sp.approval) ?? "";
  const r = resolveRange({ range: approval === "pending" && !sp.range ? "this_year" : sp.range, from: sp.from, to: sp.to });
  const pid = uuidParam(sp.property);
  const cat = uuidParam(sp.category);
  const pay = sp1(sp.payment) ?? "";
  const d = await withUser(u.id, async (tx) => {
    const rows = await tx`select e.*, c.name category, c.group_name, p.name prop, v.name vendor, b.booking_code
      from expenses e join expense_categories c on c.id = e.category_id join properties p on p.id = e.property_id left join vendors v on v.id = e.vendor_id left join bookings b on b.id = e.booking_id
      where e.bill_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or e.property_id = ${pid}::uuid) and (${cat}::uuid is null or e.category_id = ${cat}::uuid)
        and (${approval} = '' and e.status = 'active' or ${approval} = 'void' and e.status = 'void' or e.status = 'active' and e.approval_status::text = ${approval})
        and (${pay} = '' or e.payment_status <> 'paid')
      order by e.bill_date desc, e.created_at desc limit 300`;
    const [s] = await tx<{ total: string; deductible: string; pending: string; pending_n: number; unpaid: string }[]>`
      select coalesce(sum(al.amount) filter (where e.approval_status <> 'rejected'),0) total,
        coalesce(sum(al.amount) filter (where e.approval_status = 'approved' and e.bearer = 'pool' and e.is_deductible),0) deductible,
        coalesce(sum(al.amount) filter (where e.approval_status = 'pending'),0) pending, count(distinct e.id) filter (where e.approval_status = 'pending')::int pending_n,
        coalesce(sum(e.total_amount - e.paid_amount) filter (where e.approval_status = 'approved' and e.payment_status <> 'paid'),0) unpaid
      from expenses e join expense_allocations al on al.expense_id = e.id
      where e.status = 'active' and e.bill_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or al.property_id = ${pid}::uuid)`;
    return { rows, s, props: await propertyOptions(tx), cats: await tx<{ id: string; name: string; group_name: string }[]>`select id, name, group_name from expense_categories where is_active order by sort_order` };
  });
  const approver = can.approveExpense(u.role);
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ range: r.key, from: r.from, to: r.to, property: pid ?? "", category: cat ?? "", approval, payment: pay, ...o }).filter(([, v]) => v)).toString();
  const pendingRows = d.rows.filter((e) => e.approval_status === "pending" && e.status === "active");
  return (
    <>
      <PageHeader title="Expenses" description="Every bill with its classification, approval and payment status."
        actions={<>
          <LinkButton href={`/api/export/expenses${qs({})}`} variant="secondary"><Download />Export</LinkButton>
          {can.addExpense(u.role) && <LinkButton href={`/expenses/new${pid ? `?property=${pid}` : ""}`}><Plus />Add Expense</LinkButton>}
        </>} />
      <div className="mb-4"><PeriodFilter range={r.key} from={r.from} to={r.to} property={pid ?? ""} properties={d.props}
        extra={<><input type="hidden" name="approval" value={approval} /><Select name="category" defaultValue={cat ?? ""} className="w-auto"><option value="">All categories</option>
          {["Property", "Staff", "Maintenance", "Other"].map((g) => <optgroup key={g} label={g}>{d.cats.filter((c) => c.group_name === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</Select></>} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Total recorded" value={inr(d.s.total)} />
        <Stat label="Approved & deductible" value={inr(d.s.deductible)} sub="Reduces net distributable revenue" />
        <Stat label="Awaiting approval" value={inr(d.s.pending)} sub={`${d.s.pending_n} bill(s)`} tone={d.s.pending_n ? "warn" : "default"} href={qs({ approval: "pending" })} />
        <Stat label="Approved but unpaid" value={inr(d.s.unpaid)} sub="Shown separately in settlements" href={qs({ payment: "unpaid", approval: "approved" })} />
      </div>
      <Tabs active={pay ? "unpaid" : approval || "all"} tabs={[{ key: "all", label: "All", href: qs({ approval: "", payment: "" }) }, { key: "pending", label: "Pending approval", href: qs({ approval: "pending", payment: "" }) },
        { key: "approved", label: "Approved", href: qs({ approval: "approved", payment: "" }) }, { key: "rejected", label: "Rejected", href: qs({ approval: "rejected", payment: "" }) },
        { key: "unpaid", label: "Unpaid", href: qs({ approval: "approved", payment: "unpaid" }) }, { key: "void", label: "Voided", href: qs({ approval: "void", payment: "" }) }]} />
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={<Receipt />} title="No expenses found" description="Adjust the filters or add a bill." action={can.addExpense(u.role) && <LinkButton href="/expenses/new"><Plus />Add Expense</LinkButton>} /> : (
          <div>
            {approver && pendingRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-line bg-amber-50/50 text-sm">
                <span className="text-amber-900">{pendingRows.length} awaiting approval — tick the bills to review:</span>
                <ReviewButtons />
              </div>)}
            <Table><THead><tr>{approver && <Th className="w-8" />}<Th>Bill date</Th><Th>Expense</Th><Th>Property</Th><Th>Category</Th><Th>Vendor</Th><Th>Class</Th><Th className="text-right">Amount</Th><Th>Payment</Th><Th>Approval</Th></tr></THead>
              <tbody>{d.rows.map((e) => (
                <Tr key={e.id} className={e.status === "void" ? "opacity-50" : ""}>
                  {approver && <Td>{e.approval_status === "pending" && e.status === "active" && <input type="checkbox" name="ids" value={e.id} form="review-form" className="size-4 accent-brand-700" aria-label={`Select ${e.expense_code}`} />}</Td>}
                  <Td className="whitespace-nowrap">{fdate(e.bill_date)}</Td>
                  <Td><Link href={`/expenses/${e.id}`} className="font-medium text-brand-700 hover:underline whitespace-nowrap">{e.expense_code}</Link>{e.document_id && <Paperclip className="inline size-3.5 ml-1 text-muted" />}
                    <div className="text-xs text-muted max-w-56 truncate">{e.description}</div></Td>
                  <Td>{e.prop.replace("STAYRA ", "")}{e.booking_code && <div className="text-xs text-muted">{e.booking_code}</div>}</Td>
                  <Td>{e.category}<div className="text-[10.5px] text-muted">{e.group_name}</div></Td>
                  <Td className="text-xs">{e.vendor?.replace("Demo — ", "") ?? "—"}</Td>
                  <Td><div className="flex flex-wrap gap-1">{e.scope !== "property" && <Badge tone="blue">{e.scope}</Badge>}{e.bearer !== "pool" ? <Badge tone="sand">{e.bearer}-borne</Badge> : e.is_deductible ? <Badge tone="green">deductible</Badge> : <Badge>non-deductible</Badge>}</div></Td>
                  <Td className="text-right tabular font-medium">{inr(e.total_amount)}{Number(e.gst_amount) > 0 && <div className="text-[10.5px] text-muted font-normal">incl. GST {inr(e.gst_amount)}</div>}</Td>
                  <Td><StatusBadge status={e.payment_status} /></Td>
                  <Td>{e.status === "void" ? <StatusBadge status="void" /> : <StatusBadge status={e.approval_status} />}</Td>
                </Tr>))}</tbody></Table>
          </div>)}
      </Card>
      {approver && <ActionForm action={reviewExpenses} id="review-form"><input type="hidden" name="decision" value="approved" /></ActionForm>}
    </>
  );
}

function ReviewButtons() {
  return (
    <span className="flex gap-2 ml-auto">
      <Button type="submit" form="review-form" size="sm"><Check />Approve selected</Button>
      <Modal title="Reject selected expenses" trigger={<Button type="button" size="sm" variant="outlineDanger"><X />Reject…</Button>}>
        <p className="text-sm text-muted mb-3">Rejected bills are excluded from all calculations. Tick the bills in the list first.</p>
        <ActionForm action={reviewExpenses} id="reject-form"><input type="hidden" name="decision" value="rejected" />
          <Field name="reason" label="Reason" required><Textarea name="reason" /></Field>
          <IdsCollector formId="reject-form" sourceForm="review-form" />
          <div className="flex justify-end mt-4"><SubmitButton variant="danger">Reject</SubmitButton></div></ActionForm>
      </Modal>
    </span>
  );
}
