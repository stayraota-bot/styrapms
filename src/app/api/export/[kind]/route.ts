import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { resolveRange } from "@/server/analytics";
import { buildReport, toCSV, toXLSX, REPORTS, type Report } from "@/server/reports";
import { SOURCE_LABEL, LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL } from "@/lib/format";

export const runtime = "nodejs";
const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (kind === "leads" ? !can.viewLeads(user.role) : !can.viewFinance(user.role)) return new NextResponse("Forbidden", { status: 403 });
  const q = req.nextUrl.searchParams;
  const r = resolveRange({ range: q.get("range") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  const pid = uuid(q.get("property"));
  const format = q.get("format") === "csv" ? "csv" : "xlsx";
  const report: Report = await withUser(user.id, async (tx) => {
    if (kind in REPORTS) return buildReport(tx, kind, { from: r.from, to: r.to, propertyId: pid, propertyIds: q.getAll("p").map(uuid).filter(Boolean) as string[] });
    if (kind === "leads") {
      const status = q.get("status") ?? "";
      const source = q.get("source") ?? "";
      const temp = q.get("temperature") ?? "";
      const rows = await tx`
        select l.lead_code, l.guest_name, l.guest_phone, l.guest_whatsapp, l.guest_email, l.guest_city,
          l.source::text source, l.source_detail, l.status::text status, l.temperature::text temperature,
          p.name property, u.name room, l.check_in::text, l.check_out::text, l.adults, l.children, l.rooms_needed,
          l.budget, l.quoted_amount,
          (l.next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date::text next_follow_up_date,
          l.follow_up_note, pr.full_name assigned_to, b.booking_code converted_booking,
          l.special_requests, l.notes, l.lost_reason, (l.created_at AT TIME ZONE 'Asia/Kolkata')::date::text created_date
        from leads l
        left join properties p on p.id = l.property_id
        left join property_units u on u.id = l.unit_id
        left join profiles pr on pr.id = l.assigned_to
        left join bookings b on b.id = l.converted_booking_id
        where (${pid}::uuid is null or l.property_id = ${pid}::uuid)
          and (${status} = '' or l.status::text = ${status})
          and (${source} = '' or l.source::text = ${source})
          and (${temp} = '' or l.temperature::text = ${temp})
        order by l.created_at desc limit 20000`;
      rows.forEach((x) => {
        x.source = LEAD_SOURCE_LABEL[x.source] ?? x.source;
        x.status = LEAD_STATUS_LABEL[x.status] ?? x.status;
      });
      return {
        title: "CRM Leads",
        rows,
        columns: [
          "lead_code", "guest_name", "guest_phone", "guest_whatsapp", "guest_email", "guest_city",
          "source", "source_detail", "status", "temperature", "property", "room",
          "check_in", "check_out", "adults", "children", "rooms_needed", "budget", "quoted_amount",
          "next_follow_up_date", "follow_up_note", "assigned_to", "converted_booking",
          "special_requests", "notes", "lost_reason", "created_date",
        ].map((k) => ({
          key: k,
          label: k.replace(/_/g, " "),
          type: ["budget", "quoted_amount"].includes(k) ? ("money" as const) : undefined,
        })),
      };
    }
    if (kind === "bookings") {
      const rows = await tx`select b.booking_code, p.name property, u.name room, g.full_name guest, g.phone, b.check_in, b.check_out, b.nights, b.source::text source, b.status::text status,
          b.room_amount, b.discount, b.tax_amount, b.ota_commission, f.amount_due, f.net_paid, f.balance_due, f.payment_status
        from bookings b join properties p on p.id = b.property_id join property_units u on u.id = b.unit_id join guests g on g.id = b.guest_id join booking_financials f on f.booking_id = b.id
        where (${pid}::uuid is null or b.property_id = ${pid}::uuid) and (${q.get("from") ?? ""} = '' or b.check_in >= ${q.get("from") || "1900-01-01"}::date) and (${q.get("to") ?? ""} = '' or b.check_in <= ${q.get("to") || "2999-01-01"}::date)
        order by b.check_in desc limit 20000`;
      rows.forEach((x) => (x.source = SOURCE_LABEL[x.source] ?? x.source));
      return { title: "Bookings", rows, columns: ["booking_code", "property", "room", "guest", "phone", "check_in", "check_out", "nights", "source", "status", "room_amount", "discount", "tax_amount", "ota_commission", "amount_due", "net_paid", "balance_due", "payment_status"]
        .map((k) => ({ key: k, label: k.replace(/_/g, " "), type: ["room_amount", "discount", "tax_amount", "ota_commission", "amount_due", "net_paid", "balance_due"].includes(k) ? "money" as const : undefined })) };
    }
    if (kind === "income") {
      const rows = await tx`select i.txn_code, i.txn_date, p.name property, b.booking_code, c.name category, i.description, i.amount, i.payment_mode::text, i.payment_reference, i.collection_status::text, i.status::text, i.received_by
        from income i join properties p on p.id = i.property_id join income_categories c on c.id = i.category_id left join bookings b on b.id = i.booking_id
        where i.txn_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or i.property_id = ${pid}::uuid) order by i.txn_date`;
      return { title: "Income", rows, columns: ["txn_code", "txn_date", "property", "booking_code", "category", "description", "amount", "payment_mode", "payment_reference", "collection_status", "status", "received_by"].map((k) => ({ key: k, label: k.replace(/_/g, " "), type: k === "amount" ? "money" as const : undefined })) };
    }
    if (kind === "expenses") {
      const rows = await tx`select e.expense_code, e.bill_date, p.name property, c.group_name, c.name category, v.name vendor, e.bill_number, e.description, e.amount, e.gst_amount, e.total_amount, e.paid_amount,
          e.payment_status::text, e.approval_status::text, e.scope::text, e.bearer::text, e.is_deductible, e.status::text
        from expenses e join properties p on p.id = e.property_id join expense_categories c on c.id = e.category_id left join vendors v on v.id = e.vendor_id
        where e.bill_date between ${r.from}::date and ${r.to}::date and (${pid}::uuid is null or e.property_id = ${pid}::uuid) order by e.bill_date`;
      return { title: "Expenses", rows, columns: ["expense_code", "bill_date", "property", "group_name", "category", "vendor", "bill_number", "description", "amount", "gst_amount", "total_amount", "paid_amount", "payment_status", "approval_status", "scope", "bearer", "is_deductible", "status"]
        .map((k) => ({ key: k, label: k.replace(/_/g, " "), type: ["amount", "gst_amount", "total_amount", "paid_amount"].includes(k) ? "money" as const : undefined })) };
    }
    throw new Error("Unknown export");
  });
  const name = `stayra-${kind}-${r.from}-to-${r.to}`;
  if (format === "csv") return new NextResponse(toCSV(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  const buf = await toXLSX(report, `Period ${r.from} to ${r.to} · exported by ${user.fullName} · STAYRA PMS`);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
}
