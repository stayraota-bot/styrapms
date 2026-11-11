import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdatetime } from "@/lib/format";
import { Card, PageHeader, EmptyState, Badge, cn } from "@/components/ui/core";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { markAllRead } from "./actions";

export const metadata = { title: "Notifications" };
export default async function Notifications() {
  const u = await requireUser();
  const rows = await withUser(u.id, (tx) => tx`select * from notifications order by created_at desc limit 100`);
  const tone = { critical: "red", warning: "amber", success: "green", info: "blue" } as const;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" description="Bookings, approvals, settlements, payments and operational alerts." actions={<ActionForm action={markAllRead}><SubmitButton variant="secondary">Mark all as read</SubmitButton></ActionForm>} />
      <Card>{rows.length === 0 ? <EmptyState icon={<Bell />} title="No notifications" /> : (
        <ul className="divide-y divide-line">{rows.map((n) => (
          <li key={n.id}><Link href={n.link ?? "#"} className={cn("flex gap-3 px-5 py-3.5 hover:bg-brand-50/40", !n.is_read && "bg-brand-50/30")}>
            <span className={cn("mt-1.5 size-2 rounded-full shrink-0", n.is_read ? "bg-transparent" : "bg-brand-600")} />
            <span className="flex-1 min-w-0"><span className="flex items-center gap-2"><span className="font-medium text-sm">{n.title}</span><Badge tone={tone[n.severity as keyof typeof tone]}>{n.type.replace("_", " ")}</Badge></span>
              {n.body && <span className="block text-sm text-muted truncate">{n.body}</span>}<span className="block text-[11px] text-muted mt-0.5">{fdatetime(n.created_at)}</span></span>
          </Link></li>))}</ul>)}</Card>
      <p className="text-xs text-muted mt-3">Email and WhatsApp delivery are prepared as pluggable channels (see README › Notifications).</p>
    </div>
  );
}
