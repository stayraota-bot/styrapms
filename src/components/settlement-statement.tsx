import { Fragment } from "react";
import { fdate, inr } from "@/lib/format";
import { Card, CardHeader, CardBody, Table, THead, Th, Td, Tr, Badge } from "@/components/ui/core";
import { ITEM_LABEL, ITEM_ORDER, type LoadedSettlement } from "@/server/settlements";

export function StatementSummary({ s }: { s: LoadedSettlement["s"] }) {
  const L = ({ n, k, v, bold, neg, sub }: { n?: number; k: string; v: unknown; bold?: boolean; neg?: boolean; sub?: string }) => (
    <div className={`flex justify-between gap-4 py-2 ${bold ? "font-semibold" : ""}`}>
      <span className="flex gap-2">{n && <span className="text-muted tabular w-5">{n}.</span>}<span>{k}{sub && <span className="block text-xs text-muted font-normal">{sub}</span>}</span></span>
      <span className="tabular whitespace-nowrap">{neg ? "− " : ""}{inr(v)}</span>
    </div>);
  return (
    <Card><CardHeader title="Settlement calculation" description={`Agreement v${s.agreement_version} · STAYRA ${Number(s.stayra_pct)}% / Owner ${Number(s.owner_pct)}%`} />
      <CardBody className="divide-y divide-line text-sm">
        <L n={4} k="Booking revenue" v={s.booking_revenue} sub="Completed stays (net of discount, excl. GST) + cancellation charges" />
        <L n={5} k="Additional income" v={Number(s.additional_income) + Number(s.revenue_adjustments)} sub={Number(s.revenue_adjustments) ? `incl. adjustments ${inr(s.revenue_adjustments)}` : "F&B, laundry, activities and other income"} />
        <L k="Total eligible revenue" v={s.gross_revenue} bold />
        <L n={6} k="Deductible expenses" v={Number(s.deductible_expenses) + Number(s.expense_adjustments)} neg sub={`Approved pool expenses + OTA commission${Number(s.expense_adjustments) ? ` + adjustments ${inr(s.expense_adjustments)}` : ""}`} />
        <div className="bg-brand-50 -mx-5 px-5"><L n={7} k="Net distributable revenue" v={s.net_distributable} bold /></div>
        <L n={9} k={`STAYRA share (${Number(s.stayra_pct)}%)`} v={s.stayra_share} />
        <L n={10} k={`Owner share (${Number(s.owner_pct)}%)`} v={s.owner_share} bold />
        {Number(s.owner_borne_recoveries) > 0 && <L k="Less: owner-borne costs paid by STAYRA" v={s.owner_borne_recoveries} neg />}
        <L n={11} k="Previous outstanding" v={s.previous_outstanding} sub="Unpaid balance of earlier approved settlements" />
        <L n={12} k="Payments made (this settlement)" v={s.payments_made} neg />
        <div className="bg-brand-800 text-white -mx-5 px-5 rounded-b-[var(--radius-card)]"><L n={13} k="Final payable to owner" v={s.final_payable} bold /></div>
      </CardBody>
    </Card>
  );
}

export function StatementInfo({ s }: { s: LoadedSettlement["s"] }) {
  return (
    <Card><CardHeader title="Entitlement vs cash" description="Profit entitlement is not the same as cash available" /><CardBody className="space-y-2 text-sm">
      <p className="flex justify-between"><span className="text-muted">Cash collected in period</span><span className="tabular">{inr(s.cash_collected)}</span></p>
      <p className="flex justify-between"><span className="text-muted">GST collected (pass-through, not shared)</span><span className="tabular">{inr(s.gst_collected)}</span></p>
      <p className="flex justify-between"><span className="text-muted">Unpaid bills included</span><span className="tabular">{inr(s.unpaid_expenses_included)}</span></p>
      <p className="flex justify-between"><span className="text-muted">Unpaid bills excluded (later)</span><span className="tabular">{inr(s.unpaid_expenses_excluded)}</span></p>
      <p className="text-xs text-muted pt-1">Policy: {String(s.expense_policy).replace(/_/g, " ")} · unpaid bills {s.include_unpaid_expenses ? "included" : "excluded until paid"}.</p>
    </CardBody></Card>
  );
}

export function StatementItems({ items }: { items: LoadedSettlement["items"] }) {
  const groups = ITEM_ORDER.map((t) => ({ t, rows: items.filter((i) => i.item_type === t) })).filter((g) => g.rows.length);
  return (
    <Card><CardHeader title="Line items" description="Every booking, income and bill included — each can only ever be settled once" />
      <Table><THead><tr><Th>Date</Th><Th>Description</Th><Th className="text-right">Amount</Th></tr></THead>
        <tbody>{groups.map((g) => (<Fragment key={g.t}>
          <tr><td colSpan={3} className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">{ITEM_LABEL[g.t]} <Badge>{g.rows.length}</Badge>
            <span className="float-right tabular">{inr(g.rows.reduce((a, r) => a + Number(r.amount), 0))}</span></td></tr>
          {g.rows.map((r) => <Tr key={r.id} className={!r.is_active ? "line-through opacity-50" : g.t === "unpaid_expense_excluded" ? "text-muted" : ""}><Td className="whitespace-nowrap text-xs">{fdate(r.item_date)}</Td><Td className="text-xs">{r.description}</Td><Td className="text-right tabular text-xs">{inr(r.amount)}</Td></Tr>)}
        </Fragment>))}</tbody></Table>
    </Card>
  );
}
