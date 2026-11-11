import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { PageHeader } from "@/components/ui/core";
import { PropertyForm } from "@/components/property-form";
import { createProperty } from "../actions";

export const metadata = { title: "Add property" };
export default async function NewProperty() {
  const u = await requireRole(["super_admin"]);
  const { owners, managers } = await withUser(u.id, async (tx) => ({
    owners: await tx<{ id: string; full_name: string }[]>`select id, full_name from owners where is_active order by full_name`,
    managers: await tx<{ id: string; full_name: string }[]>`select id, full_name from profiles where is_active and role in ('property_manager','admin') order by full_name`,
  }));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Add property" description="Property ID is generated automatically." back={{ href: "/properties", label: "Properties" }} />
      <PropertyForm action={createProperty} owners={owners} managers={managers} isNew />
    </div>
  );
}
