import { randomUUID } from "crypto";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { propertyOptions, unitOptions, sp1, uuidParam } from "@/server/common";
import { PageHeader } from "@/components/ui/core";
import { BookingForm } from "@/components/booking-form";
import { createBooking } from "../actions";

export const metadata = { title: "Add booking" };
export default async function NewBooking({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "operations"]);
  const sp = await searchParams;
  const { props, units } = await withUser(u.id, async (tx) => ({ props: (await propertyOptions(tx)).filter((p) => p.status === "active" || p.status === "onboarding"), units: await unitOptions(tx) }));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Add booking" description="Confirmed bookings block the room instantly; double bookings are rejected by the database." back={{ href: "/bookings", label: "Bookings" }} />
      <BookingForm action={createBooking} properties={props} units={units} idem={randomUUID()} canPay={can.recordGuestPayment(u.role)}
        defaults={{ property: uuidParam(sp.property) ?? undefined, unit: uuidParam(sp.unit) ?? undefined, check_in: sp1(sp.check_in), check_out: sp1(sp.check_out) }} />
    </div>
  );
}
