import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { propertyOptions, sp1, uuidParam } from "@/server/common";
import { PageHeader } from "@/components/ui/core";
import { UserForm } from "@/components/user-form";
import { createUser } from "../actions";

export const metadata = { title: "Create user" };
export default async function NewUser({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin"]);
  const sp = await searchParams;
  const d = await withUser(u.id, async (tx) => ({ props: await propertyOptions(tx), owners: await tx<{ id: string; full_name: string; taken: boolean }[]>`select id, full_name, profile_id is not null taken from owners order by full_name` }));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Create user" description="Each person gets their own login ID. Access is enforced by role and property in the database." back={{ href: "/users", label: "Users" }} />
      <UserForm action={createUser} properties={d.props} owners={d.owners} defaults={{ role: sp1(sp.role), owner: uuidParam(sp.owner) ?? undefined }} />
    </div>
  );
}
