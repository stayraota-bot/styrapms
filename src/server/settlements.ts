import "server-only";
import type { Tx } from "@/lib/db";

export const ITEM_LABEL: Record<string, string> = {
  booking: "Booking revenue (completed stays)", cancellation: "Cancellation / no-show charges", income: "Additional income", revenue_adjustment: "Revenue adjustments",
  ota_commission: "OTA commission", expense: "Deductible expenses", expense_adjustment: "Expense adjustments", owner_recovery: "Owner-borne costs (recovered)",
  unpaid_expense_excluded: "Unpaid expenses — excluded (shown for information)",
};
export const ITEM_ORDER = ["booking", "cancellation", "income", "revenue_adjustment", "ota_commission", "expense", "expense_adjustment", "owner_recovery", "unpaid_expense_excluded"];

export async function loadSettlement(tx: Tx, id: string) {
  const [s] = await tx`select s.*, p.name prop, p.property_code, p.address, p.city, p.state, o.full_name owner, o.owner_code, o.email owner_email, o.phone owner_phone, o.pan,
      o.bank_account_name, o.bank_account_number, o.bank_ifsc, o.upi_id, a.version agreement_version, a.expense_policy, a.include_unpaid_expenses,
      cr.full_name created_by_name, sb.full_name submitted_by_name, ap.full_name approved_by_name, b.booking_code
    from settlements s join properties p on p.id = s.property_id join owners o on o.id = s.owner_id join revenue_share_agreements a on a.id = s.agreement_id
    left join profiles cr on cr.id = s.created_by left join profiles sb on sb.id = s.submitted_by left join profiles ap on ap.id = s.approved_by left join bookings b on b.id = s.booking_id
    where s.id = ${id}::uuid`;
  if (!s) return null;
  const items = await tx<{ id: string; item_type: string; ref_id: string; item_date: string; description: string; amount: string; is_active: boolean }[]>`
    select id, item_type, ref_id, item_date, description, amount, is_active from settlement_items where settlement_id = ${id}::uuid order by item_date, description`;
  const payments = await tx`select sp.*, pr.full_name by_name from settlement_payments sp left join profiles pr on pr.id = sp.created_by where sp.settlement_id = ${id}::uuid order by paid_on`;
  const [company] = await tx<{ value: Record<string, string> }[]>`select value from app_settings where key = 'company'`;
  return { s, items, payments, company: company?.value ?? { name: "STAYRA Hospitality" } };
}
export type LoadedSettlement = NonNullable<Awaited<ReturnType<typeof loadSettlement>>>;
