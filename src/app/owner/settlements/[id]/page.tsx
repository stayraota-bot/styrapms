import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdate, inr, titleCase } from "@/lib/format";
import { loadSettlement } from "@/server/settlements";
import { PageHeader, LinkButton, StatusBadge, Card, CardHeader, Table, THead, Th, Td, Tr } from "@/components/ui/core";
import { StatementSummary, StatementItems, StatementInfo } from "@/components/settlement-statement";

export const metadata = { title: "Statement" };
export default async function OwnerStatement({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const d = await withUser(u.id, (tx) => loadSettlement(tx, id)).catch(() => null);
  if (!d) notFound();
  const { s } = d;
  return (
    <>
      <PageHeader back={{ href: "/owner", label: "Overview" }} title={<span className="flex items-center gap-2">{s.settlement_code} <StatusBadge status={s.status} /></span>}
        description={`${s.prop} · ${fdate(s.period_start)} – ${fdate(s.period_end)}`} actions={<LinkButton href={`/api/settlements/${id}/pdf`} prefetch={false}><Download />Download statement</LinkButton>} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><StatementSummary s={s} /></div>
        <div className="space-y-6"><StatementInfo s={s} />
          <Card><CardHeader title="Payments received" /><Table><THead><tr><Th>Date</Th><Th>Method</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>{d.payments.map((p) => <Tr key={p.id}><Td>{fdate(p.paid_on)}</Td><Td>{titleCase(p.method)}</Td><Td className="text-right tabular">{inr(p.amount)}</Td></Tr>)}</tbody></Table></Card></div>
      </div>
      <div className="mt-6"><StatementItems items={d.items} /></div>
    </>
  );
}
