import "server-only";
import type { Tx } from "@/lib/db";
import { SOURCE_LABEL, todayIST } from "@/lib/format";
import { propertyPL } from "./analytics";

export type ColType = "text" | "money" | "int" | "pct" | "date";
export type Report = { title: string; description?: string; columns: { key: string; label: string; type?: ColType }[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> };
export type ReportParams = { from: string; to: string; propertyId: string | null; propertyIds?: string[] };

export const REPORTS: Record<string, string> = {
  overview: "Overall performance", pl: "Property-wise P&L", owners: "Owner-wise performance", revenue: "Booking revenue", expenses: "Expense report",
  occupancy: "Occupancy, ADR & RevPAR", sources: "Booking sources", stayra: "STAYRA earnings", settlements: "Owner settlements",
  receivables: "Outstanding receivables", vendors: "Vendor payments", compare: "Compare properties",
};

const sum = (rows: Record<string, unknown>[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)]));

export async function buildReport(tx: Tx, key: string, p: ReportParams): Promise<Report> {
  const pid = p.propertyId;
  switch (key) {
    case "overview": {
      const rows = await tx`with m as (select generate_series(date_trunc('month', ${p.from}::date), date_trunc('month', ${p.to}::date), interval '1 month')::date ms)
        select to_char(m.ms, 'Mon YYYY') as month, sum(q.gross_revenue) revenue, sum(q.deductible_expenses + q.expense_adjustments) expenses, sum(q.net_distributable) net,
          sum(q.stayra_share) stayra, sum(q.owner_share) owner, sum(q.stays)::int stays, round(100.0 * sum(q.nights_sold) / nullif(sum(q.available_nights),0), 1) occupancy
        from m cross join lateral property_pl(greatest(m.ms, ${p.from}::date), least((m.ms + interval '1 month - 1 day')::date, ${p.to}::date), ${pid}::uuid) q group by m.ms order by m.ms`;
      return { title: REPORTS.overview, description: "Month-by-month business performance (earned basis)", rows,
        columns: [{ key: "month", label: "Month" }, { key: "revenue", label: "Revenue", type: "money" }, { key: "expenses", label: "Deductible expenses", type: "money" }, { key: "net", label: "Net distributable", type: "money" },
          { key: "stayra", label: "STAYRA share", type: "money" }, { key: "owner", label: "Owner share", type: "money" }, { key: "stays", label: "Stays", type: "int" }, { key: "occupancy", label: "Occupancy", type: "pct" }],
        totals: { month: "Total", ...sum(rows, ["revenue", "expenses", "net", "stayra", "owner", "stays"]) } };
    }
    case "pl": case "compare": {
      let rows = await propertyPL(tx, p.from, p.to, pid) as unknown as Record<string, unknown>[];
      if (key === "compare" && p.propertyIds?.length) rows = rows.filter((r) => p.propertyIds!.includes(String(r.property_id)));
      return { title: REPORTS[key], description: "Revenue − approved deductible expenses = net distributable, split per agreement", rows,
        columns: [{ key: "name", label: "Property" }, { key: "booking_revenue", label: "Room revenue", type: "money" }, { key: "cancellation_income", label: "Cancellation", type: "money" },
          { key: "additional_income", label: "Other income", type: "money" }, { key: "gross_revenue", label: "Total revenue", type: "money" }, { key: "ota_commission", label: "OTA commission", type: "money" },
          { key: "deductible_expenses", label: "Deductible exp.", type: "money" }, { key: "net_distributable", label: "Net distributable", type: "money" }, { key: "stayra_pct", label: "STAYRA %", type: "pct" },
          { key: "stayra_share", label: "STAYRA share", type: "money" }, { key: "owner_share", label: "Owner share", type: "money" }, { key: "unpaid_expenses", label: "Unpaid bills", type: "money" },
          { key: "occupancy", label: "Occupancy", type: "pct" }, { key: "adr", label: "ADR", type: "money" }, { key: "revpar", label: "RevPAR", type: "money" }],
        totals: { name: "Total", ...sum(rows, ["booking_revenue", "cancellation_income", "additional_income", "gross_revenue", "ota_commission", "deductible_expenses", "net_distributable", "stayra_share", "owner_share", "unpaid_expenses"]) } };
    }
    case "owners": {
      const rows = await tx`select o.full_name owner, string_agg(q.name, ', ') properties, sum(q.gross_revenue) revenue, sum(q.deductible_expenses + q.expense_adjustments) expenses,
          sum(q.net_distributable) net, sum(q.owner_share) owner_share, sum(q.stayra_share) stayra_share,
          (select coalesce(sum(sp.amount),0) from settlement_payments sp join settlements s on s.id = sp.settlement_id where s.owner_id = o.id and sp.paid_on between ${p.from}::date and ${p.to}::date) paid,
          (select coalesce(sum(s.owner_share - s.owner_borne_recoveries - s.payments_made),0) from settlements s where s.owner_id = o.id and s.status in ('approved','partially_paid')) payable
        from property_pl(${p.from}::date, ${p.to}::date, ${pid}::uuid) q join properties pr on pr.id = q.property_id join owners o on o.id = pr.owner_id group by o.id, o.full_name order by o.full_name`;
      return { title: REPORTS.owners, rows, columns: [{ key: "owner", label: "Owner" }, { key: "properties", label: "Properties" }, { key: "revenue", label: "Revenue", type: "money" }, { key: "expenses", label: "Deductible exp.", type: "money" },
        { key: "net", label: "Net distributable", type: "money" }, { key: "owner_share", label: "Owner entitlement", type: "money" }, { key: "stayra_share", label: "STAYRA share", type: "money" },
        { key: "paid", label: "Paid in period", type: "money" }, { key: "payable", label: "Currently payable", type: "money" }],
        totals: { owner: "Total", ...sum(rows, ["revenue", "expenses", "net", "owner_share", "stayra_share", "paid", "payable"]) } };
    }
    case "revenue": {
      const rows = await tx`select b.booking_code, p.name property, g.full_name guest, b.check_in, b.check_out, b.nights, b.source::text source, b.room_amount, b.discount, b.room_amount - b.discount net_room, b.tax_amount, b.ota_commission,
          coalesce((select sum(amount) from income i where i.booking_id = b.id and i.status = 'active'),0) extras
        from bookings b join properties p on p.id = b.property_id join guests g on g.id = b.guest_id
        where b.status = 'checked_out' and b.check_out between ${p.from}::date and ${p.to}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid) order by b.check_out, b.booking_code`;
      rows.forEach((r) => (r.source = SOURCE_LABEL[r.source as string] ?? r.source));
      return { title: REPORTS.revenue, description: "Completed stays by check-out date", rows, columns: [{ key: "booking_code", label: "Booking" }, { key: "property", label: "Property" }, { key: "guest", label: "Guest" },
        { key: "check_in", label: "Check-in", type: "date" }, { key: "check_out", label: "Check-out", type: "date" }, { key: "nights", label: "Nights", type: "int" }, { key: "source", label: "Source" },
        { key: "room_amount", label: "Room amount", type: "money" }, { key: "discount", label: "Discount", type: "money" }, { key: "net_room", label: "Net room revenue", type: "money" },
        { key: "extras", label: "Folio extras", type: "money" }, { key: "tax_amount", label: "GST", type: "money" }, { key: "ota_commission", label: "OTA commission", type: "money" }],
        totals: { booking_code: "Total", ...sum(rows, ["nights", "room_amount", "discount", "net_room", "extras", "tax_amount", "ota_commission"]) } };
    }
    case "expenses": {
      const rows = await tx`select c.group_name, c.name category, count(distinct e.id)::int bills, sum(al.amount) total,
          sum(al.amount) filter (where e.approval_status = 'approved' and e.bearer = 'pool' and e.is_deductible) deductible,
          sum(al.amount) filter (where e.bearer = 'owner') owner_borne, sum(al.amount) filter (where e.bearer = 'stayra') stayra_borne,
          sum(al.amount) filter (where e.approval_status = 'pending') pending, sum(al.amount) filter (where e.payment_status <> 'paid' and e.approval_status = 'approved') unpaid
        from expenses e join expense_allocations al on al.expense_id = e.id join expense_categories c on c.id = e.category_id
        where e.status = 'active' and e.approval_status <> 'rejected' and e.bill_date between ${p.from}::date and ${p.to}::date and (${pid}::uuid is null or al.property_id = ${pid}::uuid)
        group by c.group_name, c.name, c.sort_order order by c.sort_order`;
      return { title: REPORTS.expenses, description: "By category (allocated share for the selected property)", rows, columns: [{ key: "group_name", label: "Group" }, { key: "category", label: "Category" }, { key: "bills", label: "Bills", type: "int" },
        { key: "total", label: "Total", type: "money" }, { key: "deductible", label: "Deductible", type: "money" }, { key: "owner_borne", label: "Owner-borne", type: "money" }, { key: "stayra_borne", label: "STAYRA-borne", type: "money" },
        { key: "pending", label: "Pending approval", type: "money" }, { key: "unpaid", label: "Unpaid", type: "money" }],
        totals: { group_name: "Total", ...sum(rows, ["bills", "total", "deductible", "owner_borne", "stayra_borne", "pending", "unpaid"]) } };
    }
    case "occupancy": {
      const rows = await propertyPL(tx, p.from, p.to, pid) as unknown as Record<string, unknown>[];
      return { title: REPORTS.occupancy, description: "Occupancy = room-nights sold ÷ available. ADR = room revenue ÷ nights (completed stays). RevPAR = room revenue ÷ available room-nights.", rows,
        columns: [{ key: "name", label: "Property" }, { key: "units", label: "Rooms", type: "int" }, { key: "available_nights", label: "Available nights", type: "int" }, { key: "nights_sold", label: "Nights sold", type: "int" },
          { key: "occupancy", label: "Occupancy", type: "pct" }, { key: "stays", label: "Completed stays", type: "int" }, { key: "booking_revenue", label: "Room revenue", type: "money" }, { key: "adr", label: "ADR", type: "money" }, { key: "revpar", label: "RevPAR", type: "money" }],
        totals: { name: "Total", ...sum(rows, ["units", "available_nights", "nights_sold", "stays", "booking_revenue"]) } };
    }
    case "sources": {
      const rows = await tx`select b.source::text source, count(*)::int bookings, count(*) filter (where b.status in ('cancelled','no_show'))::int cancelled, sum(b.nights) filter (where b.status not in ('cancelled','no_show'))::int nights,
          sum(b.room_amount - b.discount) filter (where b.status not in ('cancelled','no_show')) revenue, sum(b.ota_commission) commission,
          round(avg((b.room_amount - b.discount) / nullif(b.nights,0)) filter (where b.status not in ('cancelled','no_show')), 2) adr
        from bookings b where b.check_in between ${p.from}::date and ${p.to}::date and (${pid}::uuid is null or b.property_id = ${pid}::uuid) group by 1 order by revenue desc nulls last`;
      rows.forEach((r) => { r.net_after_commission = Number(r.revenue ?? 0) - Number(r.commission ?? 0); r.source = SOURCE_LABEL[r.source as string] ?? r.source; });
      return { title: REPORTS.sources, description: "By check-in date", rows, columns: [{ key: "source", label: "Source" }, { key: "bookings", label: "Bookings", type: "int" }, { key: "cancelled", label: "Cancelled", type: "int" },
        { key: "nights", label: "Nights", type: "int" }, { key: "revenue", label: "Room revenue", type: "money" }, { key: "commission", label: "Commission", type: "money" }, { key: "net_after_commission", label: "Net of commission", type: "money" }, { key: "adr", label: "ADR", type: "money" }],
        totals: { source: "Total", ...sum(rows, ["bookings", "cancelled", "nights", "revenue", "commission", "net_after_commission"]) } };
    }
    case "stayra": {
      const rows = await tx`select q.name property, q.stayra_pct, q.net_distributable, q.stayra_share,
          (select coalesce(sum(s.stayra_share),0) from settlements s where s.property_id = q.property_id and s.status in ('approved','partially_paid','paid') and s.period_end between ${p.from}::date and ${p.to}::date) settled_stayra
        from property_pl(${p.from}::date, ${p.to}::date, ${pid}::uuid) q order by q.name`;
      return { title: REPORTS.stayra, description: "Accrued (earned basis) vs. approved in settlements", rows, columns: [{ key: "property", label: "Property" }, { key: "stayra_pct", label: "STAYRA %", type: "pct" },
        { key: "net_distributable", label: "Net distributable", type: "money" }, { key: "stayra_share", label: "STAYRA earnings (accrued)", type: "money" }, { key: "settled_stayra", label: "In approved settlements", type: "money" }],
        totals: { property: "Total", ...sum(rows, ["net_distributable", "stayra_share", "settled_stayra"]) } };
    }
    case "settlements": {
      const rows = await tx`select s.settlement_code, p.name property, o.full_name owner, s.period_start, s.period_end, s.status::text status, s.gross_revenue, s.net_distributable, s.stayra_share, s.owner_share, s.payments_made, s.final_payable
        from settlements s join properties p on p.id = s.property_id join owners o on o.id = s.owner_id
        where s.status <> 'void' and s.period_end between ${p.from}::date and ${p.to}::date and (${pid}::uuid is null or s.property_id = ${pid}::uuid) order by s.period_end, p.name`;
      return { title: REPORTS.settlements, rows, columns: [{ key: "settlement_code", label: "Settlement" }, { key: "property", label: "Property" }, { key: "owner", label: "Owner" }, { key: "period_start", label: "From", type: "date" }, { key: "period_end", label: "To", type: "date" },
        { key: "status", label: "Status" }, { key: "gross_revenue", label: "Revenue", type: "money" }, { key: "net_distributable", label: "Net", type: "money" }, { key: "stayra_share", label: "STAYRA", type: "money" },
        { key: "owner_share", label: "Owner", type: "money" }, { key: "payments_made", label: "Paid", type: "money" }, { key: "final_payable", label: "Payable", type: "money" }],
        totals: { settlement_code: "Total", ...sum(rows, ["gross_revenue", "net_distributable", "stayra_share", "owner_share", "payments_made"]) } };
    }
    case "receivables": {
      const t = todayIST();
      const rows = await tx`select b.booking_code, p.name property, g.full_name guest, g.phone, b.check_in, b.check_out, b.status::text status, f.amount_due, f.net_paid, f.balance_due, greatest(0, ${t}::date - b.check_out) days_since_checkout
        from booking_financials f join bookings b on b.id = f.booking_id join properties p on p.id = b.property_id join guests g on g.id = b.guest_id
        where f.balance_due > 0 and b.status in ('checked_in','checked_out') and (${pid}::uuid is null or b.property_id = ${pid}::uuid) order by b.check_out`;
      const inc = await tx`select i.txn_code booking_code, p.name property, i.description guest, null phone, i.txn_date check_in, i.txn_date check_out, 'income receivable' status, i.amount amount_due, 0 net_paid, i.amount balance_due, ${t}::date - i.txn_date days_since_checkout
        from income i join properties p on p.id = i.property_id where i.status = 'active' and i.booking_id is null and i.collection_status = 'receivable' and (${pid}::uuid is null or i.property_id = ${pid}::uuid)`;
      const all = [...rows, ...inc];
      return { title: REPORTS.receivables, description: "Guest balances of arrived/departed bookings and receivable income (as of today)", rows: all, columns: [{ key: "booking_code", label: "Ref" }, { key: "property", label: "Property" }, { key: "guest", label: "Guest / description" },
        { key: "phone", label: "Phone" }, { key: "check_out", label: "Check-out", type: "date" }, { key: "status", label: "Status" }, { key: "amount_due", label: "Amount due", type: "money" }, { key: "net_paid", label: "Paid", type: "money" },
        { key: "balance_due", label: "Outstanding", type: "money" }, { key: "days_since_checkout", label: "Days overdue", type: "int" }],
        totals: { booking_code: "Total", ...sum(all, ["amount_due", "net_paid", "balance_due"]) } };
    }
    case "vendors": {
      const rows = await tx`select v.name vendor, v.gstin, v.category, count(e.id)::int invoices, coalesce(sum(e.total_amount),0) invoiced, coalesce(sum(e.paid_amount),0) paid, coalesce(sum(e.total_amount - e.paid_amount),0) outstanding,
          max(e.bill_date) last_bill
        from vendors v left join expenses e on e.vendor_id = v.id and e.status = 'active' and e.approval_status <> 'rejected' and e.bill_date between ${p.from}::date and ${p.to}::date and (${pid}::uuid is null or e.property_id = ${pid}::uuid)
        group by v.id order by invoiced desc`;
      return { title: REPORTS.vendors, rows, columns: [{ key: "vendor", label: "Vendor" }, { key: "gstin", label: "GSTIN" }, { key: "category", label: "Category" }, { key: "invoices", label: "Invoices", type: "int" },
        { key: "invoiced", label: "Invoiced", type: "money" }, { key: "paid", label: "Paid", type: "money" }, { key: "outstanding", label: "Outstanding", type: "money" }, { key: "last_bill", label: "Last bill", type: "date" }],
        totals: { vendor: "Total", ...sum(rows, ["invoices", "invoiced", "paid", "outstanding"]) } };
    }
  }
  throw Object.assign(new Error("Unknown report"), { code: "P0001" });
}

/** CSV with Excel-safe quoting and formula-injection protection. */
export function toCSV(r: Report) {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(c.label)).join(","), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(","))];
  if (r.totals) lines.push(r.columns.map((c) => esc(r.totals![c.key] ?? "")).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function toXLSX(r: Report, meta: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "STAYRA PMS";
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.addRow([r.title]).font = { bold: true, size: 14, color: { argb: "FF163C2D" } };
  ws.addRow([meta]).font = { italic: true, color: { argb: "FF66736D" } };
  ws.addRow([]);
  const h = ws.addRow(r.columns.map((c) => c.label));
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4B37" } }; });
  const conv = (v: unknown, t?: ColType) => (v === null || v === undefined ? null : t === "money" || t === "int" || t === "pct" ? Number(v) : t === "date" ? String(v).slice(0, 10) : String(v));
  r.rows.forEach((row) => ws.addRow(r.columns.map((c) => conv(row[c.key], c.type))));
  if (r.totals) ws.addRow(r.columns.map((c) => conv(r.totals![c.key], c.type))).font = { bold: true };
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(40, Math.max(12, c.label.length + 4));
    if (c.type === "money") col.numFmt = '[$₹-4009]#,##,##0.00';
    if (c.type === "pct") col.numFmt = '0.0"%"';
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
