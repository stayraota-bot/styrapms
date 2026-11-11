import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, AlarmClock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { navFor } from "@/components/shell/nav";
import { Sidebar, MobileNav, BottomBar } from "@/components/shell/sidebar";
import { UserMenu } from "@/components/shell/user-menu";
import { logout } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "owner") redirect("/owner");
  const items = navFor(user.role);
  const { unread, dueReminders } = await withUser(user.id, async (tx) => {
    const [{ unread }] = await tx<{ unread: number }[]>`select count(*)::int unread from notifications where not is_read`;
    let dueReminders = 0;
    if (user.role !== "housekeeping") {
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int n from leads
        where not reminder_completed and status not in ('won','lost')
          and next_follow_up_at is not null
          and (next_follow_up_at AT TIME ZONE 'Asia/Kolkata')::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date`;
      dueReminders = n;
    }
    return { unread, dueReminders };
  });
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar items={items} />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 h-14 sm:h-16 bg-white/85 backdrop-blur border-b border-line flex items-center gap-3 px-4 sm:px-6 no-print">
          <MobileNav items={items} />
          <Link href="/" className="lg:hidden font-bold tracking-[0.2em] text-brand-800">STAYRA</Link>
          <div className="flex-1" />
          {user.role !== "housekeeping" && (
            <Link href="/leads?view=reminders" className="relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium hover:bg-gray-100 text-ink" title="Lead follow-up reminders due today or overdue">
              <AlarmClock className="size-4 text-brand-700" />
              <span className="hidden sm:inline">Follow-ups</span>
              {dueReminders > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-amber-600 text-white text-[10px] font-semibold grid place-items-center">{dueReminders > 99 ? "99+" : dueReminders}</span>}
            </Link>
          )}
          <Link href="/notifications" className="relative rounded-full p-2 hover:bg-gray-100" aria-label={`${unread} unread notifications`}>
            <Bell className="size-5 text-ink" />
            {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold grid place-items-center">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <UserMenu name={user.fullName} email={user.email} role={ROLE_LABEL[user.role]} logout={logout} />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-[1500px] mx-auto">{children}</main>
      </div>
      <BottomBar items={items} />
    </div>
  );
}
