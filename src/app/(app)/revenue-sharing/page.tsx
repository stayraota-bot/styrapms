import Link from "next/link";
import { Percent, History } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdate, addDays, todayIST } from "@/lib/format";
import { uuidParam } from "@/server/common";
import { Card, CardHeader, PageHeader, Table, THead, Th, Td, Tr, Badge, Button, EmptyState } from "@/components/ui/core";
import { Modal } from "@/components/ui/forms";
import { AgreementForm } from "@/components/agreement-form";
import { saveAgreement } from "./actions";

export const metadata = { title: "Revenue sharing" };
const POLICY: Record<string, string> = { all_approved: "All approved eligible", selected_categories: "Selected categories", booking_specific_only: "Booking-specific only", property_level_only: "Property-level only" };

export default async function RevenueSharing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "accountant", "auditor"]);
  const sp = await searchParams;
  const focus = uuidParam(sp.property);
  const d = await withUser(u.id, async (tx) => ({
    rows: await tx`select a.*, a.id agreement_id, p.id, p.name, p.status::text, o.full_name owner,
        (select max(period_end) from settlements s where s.property_id = p.id and s.status <> 'void') last_settled,
        (select count(*)::int from revenue_share_agreements x where x.property_id = p.id) versions
      from properties p join owners o on o.id = p.owner_id
      left join lateral (select * from revenue_share_agreements r where r.property_id = p.id order by r.effective_from desc limit 1) a on true
      where p.status <> 'archived' order by p.name`,
    history: await tx`select r.*, p.name prop, pr.full_name by_name from revenue_share_agreements r join properties p on p.id = r.property_id left join profiles pr on pr.id = r.created_by
      where (${focus}::uuid is null or r.property_id = ${focus}::uuid) order by p.name, r.version desc`,
    cats: await tx<{ id: string; name: string; group_name: string }[]>`select id, name, group_name from expense_categories where is_active order by sort_order`,
  }));
  const sa = u.role === "super_admin";
  return (
    <>
      <PageHeader title="Revenue-sharing configuration" description="Each property has its own STAYRA / owner split, applied to net distributable revenue (eligible revenue − approved deductible expenses)." />
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={<Percent />} title="No properties" /> : (
          <Table><THead><tr><Th>Property</Th><Th>Owner</Th><Th>STAYRA</Th><Th>Owner</Th><Th>Effective</Th><Th>Frequency</Th><Th>Expense policy</Th><Th>Unpaid bills</Th><Th /></tr></THead>
            <tbody>{d.rows.map((r) => {
              const minDate = [r.effective_from, r.last_settled].filter(Boolean).sort().pop();
              return (
                <Tr key={r.id} className={focus === r.id ? "bg-brand-50/50" : ""}>
                  <Td><Link href={`/properties/${r.id}?tab=agreement`} className="font-medium hover:text-brand-700">{r.name}</Link><div className="text-xs text-muted">v{r.version ?? "—"} · {r.versions} version{r.versions === 1 ? "" : "s"}</div></Td>
                  <Td>{r.owner}</Td>
                  <Td>{r.agreement_id ? <span className="text-lg font-semibold text-brand-800">{Number(r.stayra_pct)}%</span> : <Badge tone="red">Not set</Badge>}</Td>
                  <Td>{r.agreement_id && <span className="text-lg font-semibold text-sand-600">{Number(r.owner_pct)}%</span>}</Td>
                  <Td className="whitespace-nowrap text-sm">{r.agreement_id ? `${fdate(r.effective_from)} →` : "—"}<div className="text-xs text-muted">{r.agreement_end_date ? `ends ${fdate(r.agreement_end_date)}` : "open-ended"}</div></Td>
                  <Td className="capitalize">{r.settlement_frequency ?? "—"}</Td>
                  <Td className="text-xs">{POLICY[r.expense_policy] ?? "—"}</Td>
                  <Td className="text-xs">{r.agreement_id ? (r.include_unpaid_expenses ? "Included" : "Excluded until paid") : "—"}</Td>
                  <Td className="text-right">{sa && <Modal title={`Change terms · ${r.name}`} description="Creates a new version from the effective date." wide defaultOpen={focus === r.id && sp.edit === "1"}
                    trigger={<Button size="sm" variant="secondary"><Percent />Edit %</Button>}>
                    <AgreementForm action={saveAgreement} propertyId={r.id} categories={d.cats} minDate={minDate ? addDays(minDate, 1) : todayIST()}
                      current={r.agreement_id ? { stayra_pct: r.stayra_pct, settlement_frequency: r.settlement_frequency, expense_policy: r.expense_policy, include_unpaid_expenses: r.include_unpaid_expenses, shared_allocation_method: r.shared_allocation_method, deductible_category_ids: r.deductible_category_ids } : undefined} />
                  </Modal>}</Td>
                </Tr>);
            })}</tbody></Table>)}
      </Card>

      <Card className="mt-6"><CardHeader title={<span className="flex items-center gap-2"><History className="size-4" />Agreement history</span>} description="Complete version history. Settlements store the split they were calculated with." />
        <Table><THead><tr><Th>Property</Th><Th>Version</Th><Th>Split</Th><Th>Period in force</Th><Th>Policy</Th><Th>Created</Th><Th>Document</Th></tr></THead>
          <tbody>{d.history.map((h) => (
            <Tr key={h.id}><Td>{h.prop}</Td><Td>v{h.version}</Td><Td className="font-medium">{Number(h.stayra_pct)} / {Number(h.owner_pct)}</Td>
              <Td className="whitespace-nowrap">{fdate(h.effective_from)} → {h.effective_to ? fdate(h.effective_to) : "current"}</Td><Td className="text-xs">{POLICY[h.expense_policy]}{h.include_unpaid_expenses ? " · incl. unpaid" : ""}</Td>
              <Td className="text-xs text-muted">{h.by_name ?? "System"} · {fdate(h.created_at)}</Td>
              <Td>{h.document_id ? <a className="text-brand-700 text-xs hover:underline" href={`/api/files/${h.document_id}`} target="_blank">View</a> : "—"}</Td></Tr>))}</tbody></Table>
      </Card>
    </>
  );
}
