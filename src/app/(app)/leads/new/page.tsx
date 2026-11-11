import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { propertyOptions, unitOptions, staffOptions, sp1, uuidParam } from "@/server/common";
import { addDays, todayIST } from "@/lib/format";
import { PageHeader } from "@/components/ui/core";
import { LeadForm } from "@/components/lead-form";
import { createLead } from "../actions";

export const metadata = { title: "Add Lead — CRM" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "operations"]);
  const sp = await searchParams;
  const tomorrow = addDays(todayIST(), 1);
  const { props, units, staff } = await withUser(u.id, async (tx) => ({
    props: (await propertyOptions(tx)).filter((p) => p.status === "active" || p.status === "onboarding"),
    units: await unitOptions(tx),
    staff: await staffOptions(tx),
  }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Add New Guest Inquiry Lead"
        description="Record traveler contact details, stay requirements, quoted tariff, and schedule a follow-up reminder."
        back={{ href: "/leads", label: "Leads & CRM" }}
      />
      <LeadForm
        action={createLead}
        properties={props}
        units={units}
        staff={staff}
        initial={{
          property_id: uuidParam(sp.property) ?? undefined,
          unit_id: uuidParam(sp.unit) ?? undefined,
          check_in: sp1(sp.check_in),
          check_out: sp1(sp.check_out),
          assigned_to: u.id,
          follow_up_date: tomorrow,
          follow_up_time: "11:00",
        }}
      />
    </div>
  );
}
