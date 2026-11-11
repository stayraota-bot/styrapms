import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { PageHeader } from "@/components/ui/core";
import { PropertyForm } from "@/components/property-form";
import { updateProperty } from "../../actions";

export const metadata = { title: "Edit property" };
export default async function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole(["super_admin", "admin"]);
  const { id } = await params;
  const d = await withUser(u.id, async (tx) => ({
    p: (await tx`select * from properties where id = ${id}::uuid`)[0],
    owners: await tx<{ id: string; full_name: string }[]>`select id, full_name from owners order by full_name`,
    managers: await tx<{ id: string; full_name: string }[]>`select id, full_name from profiles where is_active and role in ('property_manager','admin') order by full_name`,
  })).catch(() => null);
  if (!d?.p) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${d.p.name}`} back={{ href: `/properties/${id}`, label: d.p.name }} />
      <PropertyForm action={updateProperty} owners={d.owners} managers={d.managers} property={d.p as never} />
    </div>
  );
}
