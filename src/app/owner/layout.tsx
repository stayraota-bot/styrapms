import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { UserMenu } from "@/components/shell/user-menu";
import { logout } from "../(auth)/actions";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  if (u.role !== "owner") redirect("/");
  return (
    <div className="min-h-dvh">
      <header className="bg-brand-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
          <Link href="/owner" className="text-lg font-bold tracking-[0.22em]">STAYRA</Link>
          <span className="hidden sm:block text-sm text-brand-200">Owner portal</span>
          <div className="flex-1" />
          <div className="[&_*]:text-white [&_.text-muted]:text-brand-200"><UserMenu name={u.fullName} email={u.email} role="Property Owner" logout={logout} /></div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
