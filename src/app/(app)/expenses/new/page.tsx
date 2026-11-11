import { randomUUID } from "crypto";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdate, todayIST } from "@/lib/format";
import { propertyOptions, uuidParam } from "@/server/common";
import { PageHeader } from "@/components/ui/core";
import { ExpenseForm } from "@/components/expense-form";
import { createExpense } from "../actions";

export const metadata = { title: "Add expense" };
export default async function NewExpense({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant"]);
  const sp = await searchParams;
  const d = await withUser(u.id, async (tx) => ({
    props: (await propertyOptions(tx)).filter((p) => p.status !== "archived"),
    cats: await tx<{ id: string; name: string; group_name: string }[]>`select id, name, group_name from expense_categories where is_active order by sort_order`,
    vendors: await tx<{ id: string; name: string }[]>`select id, name from vendors where is_active order by name`,
    bookings: await tx<{ id: string; booking_code: string; guest: string; check_in: string; property_id: string }[]>`select b.id, b.booking_code, g.full_name guest, b.check_in, b.property_id from bookings b join guests g on g.id = b.guest_id
      where b.check_in > current_date - 60 and b.check_in < current_date + 60 and b.status not in ('cancelled') order by b.check_in desc limit 400`,
  }));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Add expense" description="New bills go to the approval queue. Approved, deductible bills reduce net distributable revenue." back={{ href: "/expenses", label: "Expenses" }} />
      <ExpenseForm action={createExpense} properties={d.props} categories={d.cats} vendors={d.vendors} idem={randomUUID()} today={todayIST()}
        bookings={d.bookings.map((b) => ({ id: b.id, property_id: b.property_id, label: `${b.booking_code} · ${b.guest} · ${fdate(b.check_in, false)}` }))}
        defaults={{ property: uuidParam(sp.property) ?? undefined, booking: uuidParam(sp.booking) ?? undefined }} />
    </div>
  );
}
