import { Download, FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdate, inr, n } from "@/lib/format";
import { resolveRange } from "@/server/analytics";
import { buildReport, REPORTS, type ColType } from "@/server/reports";
import { propertyOptions, sp1, uuidParam } from "@/server/common";
import { Card, CardHeader, CardBody, PageHeader, LinkButton, Table, THead, Th, Td, Tr, EmptyState, cn } from "@/components/ui/core";
import { PeriodFilter } from "@/components/filters";
import { RevenueExpenseChart, Donut, PropertyBarChart, SimpleBars } from "@/components/charts";
import Link from "next/link";

export const metadata = { title: "Reports" };
const fmt = (v: unknown, t?: ColType) => v === null || v === undefined || v === "" ? "—" : t === "money" ? inr(v) : t === "int" ? n(v) : t === "pct" ? `${Number(v).toFixed(1)}%` : t === "date" ? fdate(String(v)) : String(v);

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "accountant", "auditor", "property_manager"]);
  const sp = await searchParams;
  const tab = (sp1(sp.tab) ?? "overview") in REPORTS ? (sp1(sp.tab) ?? "overview") : "overview";
  const r = resolveRange({ range: sp1(sp.range) ?? (tab === "overview" ? "this_year" : undefined), from: sp1(sp.from), to: sp1(sp.to) });
  const pid = uuidParam(sp.property);
  const picked = ([] as string[]).concat(sp.p ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const { report, props } = await withUser(u.id, async (tx) => ({ report: await buildReport(tx, tab, { from: r.from, to: r.to, propertyId: tab === "compare" ? null : pid, propertyIds: picked }), props: await propertyOptions(tx) }));
  const base = { tab, range: r.key, from: r.from, to: r.to, ...(pid ? { property: pid } : {}) };
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams({ ...base, ...o }).toString() + picked.map((x) => `&p=${x}`).join("");
  const exp = (f: string) => `/api/export/${tab}${qs({ format: f })}`;
  const num = (k: string) => report.rows.map((row) => Number(row[k] ?? 0));
  return (
    <>
      <PageHeader title="Reports & analytics" description={`${report.title} · ${fdate(r.from)} – ${fdate(r.to)}`}
        actions={<><LinkButton href={exp("csv")} variant="secondary" prefetch={false}><Download />CSV</LinkButton><LinkButton href={exp("xlsx")} prefetch={false}><FileSpreadsheet />Excel</LinkButton></>} />
      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1">{Object.entries(REPORTS).map(([k, v]) => (
          <Link key={k} href={`?${new URLSearchParams({ tab: k, range: r.key, from: r.from, to: r.to, ...(pid ? { property: pid } : {}) })}`}
            className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", k === tab ? "bg-brand-700 text-white font-medium" : "hover:bg-white text-ink")}>{v}</Link>))}</nav>
        <div className="min-w-0 space-y-6">
          <PeriodFilter range={r.key} from={r.from} to={r.to} property={pid ?? ""} properties={props} hideProperty={tab === "compare"} extra={<input type="hidden" name="tab" value={tab} />} />
          {tab === "compare" && <Card><CardBody className="pt-5"><form className="flex flex-wrap items-center gap-4 text-sm">
            {Object.entries(base).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <span className="text-muted">Compare:</span>{props.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="p" value={p.id} defaultChecked={!picked.length || picked.includes(p.id)} className="accent-brand-700 size-4" />{p.name}</label>)}
            <button className="h-9 px-3 rounded-lg bg-brand-700 text-white">Apply</button></form></CardBody></Card>}
          {tab === "overview" && report.rows.length > 0 && <Card><CardHeader title="Revenue vs deductible expenses" /><CardBody><RevenueExpenseChart data={report.rows.map((x) => ({ month: String(x.month).replace(" 20", " "), revenue: Number(x.revenue), expenses: Number(x.expenses) }))} /></CardBody></Card>}
          {(tab === "pl" || tab === "compare") && report.rows.length > 0 && <Card><CardHeader title="Revenue and net by property" /><CardBody><PropertyBarChart data={report.rows.map((x) => ({ name: String(x.name).replace("STAYRA ", ""), revenue: Number(x.gross_revenue), net: Number(x.net_distributable) }))} /></CardBody></Card>}
          {tab === "sources" && report.rows.length > 0 && <Card><CardHeader title="Room revenue by source" /><CardBody><Donut data={report.rows.slice(0, 8).map((x) => ({ name: String(x.source), value: Number(x.revenue ?? 0) }))} /></CardBody></Card>}
          {tab === "occupancy" && report.rows.length > 0 && <Card><CardHeader title="Occupancy by property" /><CardBody><SimpleBars money={false} data={report.rows.map((x) => ({ name: String(x.name).replace("STAYRA ", ""), value: Number(x.occupancy ?? 0) }))} /></CardBody></Card>}
          {tab === "expenses" && report.rows.length > 0 && <Card><CardHeader title="Spend by category group" /><CardBody><Donut data={["Property", "Staff", "Maintenance", "Other"].map((g) => ({ name: g, value: report.rows.filter((x) => x.group_name === g).reduce((a, x) => a + Number(x.total ?? 0), 0) }))} /></CardBody></Card>}
          <Card><CardHeader title={report.title} description={report.description} />
            {report.rows.length === 0 ? <EmptyState title="No data for this period" description="Try a wider date range." /> : (
              <Table><THead><tr>{report.columns.map((c) => <Th key={c.key} className={c.type && c.type !== "text" && c.type !== "date" ? "text-right" : ""}>{c.label}</Th>)}</tr></THead>
                <tbody>{report.rows.map((row, i) => <Tr key={i}>{report.columns.map((c) => <Td key={c.key} className={cn("whitespace-nowrap", c.type && c.type !== "text" && c.type !== "date" && "text-right tabular")}>{fmt(row[c.key], c.type)}</Td>)}</Tr>)}
                  {report.totals && <tr className="bg-brand-50 font-semibold">{report.columns.map((c) => <Td key={c.key} className={cn("whitespace-nowrap", c.type && c.type !== "text" && c.type !== "date" && "text-right tabular")}>{c.type === "pct" || c.type === "date" ? "" : fmt(report.totals![c.key], c.type)}</Td>)}</tr>}
                </tbody></Table>)}
          </Card>
          {num.length === 0 && null}
        </div>
      </div>
    </>
  );
}
