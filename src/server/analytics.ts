import "server-only";
import type { Tx } from "@/lib/db";
import { addDays, monthBounds, todayIST } from "@/lib/format";

export type RangeKey = "today" | "yesterday" | "this_week" | "this_month" | "prev_month" | "this_quarter" | "this_year" | "custom";
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This Week", this_month: "This Month", prev_month: "Previous Month",
  this_quarter: "This Quarter", this_year: "This Year (FY)", custom: "Custom Range",
};

/** Resolve a named period to inclusive IST dates. Indian financial year (Apr–Mar) for "This Year". */
export function resolveRange(sp: { range?: string; from?: string; to?: string }) {
  const t = todayIST();
  const key = (sp.range as RangeKey) || "this_month";
  const [y, m] = t.split("-").map(Number);
  let from = t, to = t;
  switch (key) {
    case "today": break;
    case "yesterday": from = to = addDays(t, -1); break;
    case "this_week": { const dow = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7; from = addDays(t, -dow); to = addDays(from, 6); break; }
    case "this_month": ({ start: from, end: to } = monthBounds(t)); break;
    case "prev_month": { const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`; ({ start: from, end: to } = monthBounds(prev)); break; }
    case "this_quarter": { const qm = Math.floor((m - 1) / 3) * 3 + 1; from = `${y}-${String(qm).padStart(2, "0")}-01`; to = monthBounds(`${y}-${String(qm + 2).padStart(2, "0")}-01`).end; break; }
    case "this_year": { const fy = m >= 4 ? y : y - 1; from = `${fy}-04-01`; to = `${fy + 1}-03-31`; break; }
    case "custom": {
      const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      from = ok(sp.from) ? sp.from! : monthBounds(t).start; to = ok(sp.to) ? sp.to! : t;
      if (to < from) [from, to] = [to, from];
      break;
    }
  }
  return { key, from, to, label: key === "custom" ? `${from} → ${to}` : RANGE_LABEL[key] };
}

export interface PropertyPL {
  property_id: string; name: string; units: number; stayra_pct: string | null;
  booking_revenue: string; cancellation_income: string; additional_income: string; revenue_adjustments: string; gross_revenue: string;
  ota_commission: string; deductible_expenses: string; expense_adjustments: string; total_expenses: string; pending_expenses: string; unpaid_expenses: string;
  net_distributable: string; stayra_share: string; owner_share: string; gst_collected: string;
  stays: number; nights_sold: number; available_nights: number; occupancy: string; adr: string; revpar: string;
}

/** Property-wise P&L for a date range (see SQL function property_pl). RLS applies. */
export async function propertyPL(tx: Tx, from: string, to: string, propertyId?: string | null): Promise<PropertyPL[]> {
  return tx<PropertyPL[]>`select * from property_pl(${from}::date, ${to}::date, ${propertyId ?? null}::uuid)`;
}

export function sumPL(rows: PropertyPL[]) {
  const k = ["booking_revenue", "cancellation_income", "additional_income", "revenue_adjustments", "gross_revenue", "ota_commission", "deductible_expenses",
    "expense_adjustments", "total_expenses", "pending_expenses", "unpaid_expenses", "net_distributable", "stayra_share", "owner_share", "gst_collected",
    "stays", "nights_sold", "available_nights", "units"] as const;
  const t = Object.fromEntries(k.map((key) => [key, rows.reduce((a, r) => a + Number(r[key] ?? 0), 0)])) as Record<(typeof k)[number], number>;
  return { ...t, occupancy: t.available_nights ? (100 * t.nights_sold) / t.available_nights : 0, revpar: t.available_nights ? t.booking_revenue / t.available_nights : 0 };
}

/** Monthly series for the last N months (revenue, expenses, net, occupancy). */
export async function monthlySeries(tx: Tx, months: number, propertyId?: string | null) {
  return tx<{ month: string; revenue: string; expenses: string; net: string; stayra: string; owner: string; occupancy: string }[]>`
    with m as (
      select generate_series(date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) - make_interval(months => ${months - 1}::int),
                             date_trunc('month', (now() at time zone 'Asia/Kolkata')::date), interval '1 month')::date as ms)
    select to_char(m.ms, 'Mon YY') as month,
      coalesce(sum(q.gross_revenue), 0) as revenue,
      coalesce(sum(q.deductible_expenses + q.expense_adjustments), 0) as expenses,
      coalesce(sum(q.net_distributable), 0) as net,
      coalesce(sum(q.stayra_share), 0) as stayra,
      coalesce(sum(q.owner_share), 0) as owner,
      coalesce(round(100.0 * sum(q.nights_sold) / nullif(sum(q.available_nights), 0), 1), 0) as occupancy
    from m cross join lateral property_pl(m.ms, (m.ms + interval '1 month - 1 day')::date, ${propertyId ?? null}::uuid) q
    group by m.ms order by m.ms`;
}
