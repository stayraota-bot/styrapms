"use client";
import Link from "next/link";
import { DropdownMenu as M } from "radix-ui";
import { LogOut, KeyRound, Bell } from "lucide-react";

export function UserMenu({ name, email, role, logout }: { name: string; email: string; role: string; logout: () => Promise<void> }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <M.Root>
      <M.Trigger className="flex items-center gap-2 rounded-full pl-1 pr-1 sm:pr-3 py-1 hover:bg-gray-100" aria-label="Account menu">
        <span className="size-8 rounded-full bg-brand-700 text-white text-xs font-semibold grid place-items-center">{initials}</span>
        <span className="hidden sm:block text-left leading-tight"><span className="block text-[13px] font-medium">{name}</span><span className="block text-[11px] text-muted">{role}</span></span>
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-xl border border-line bg-white p-1.5 shadow-pop text-sm">
          <div className="px-2.5 py-2 border-b border-line mb-1"><p className="font-medium">{name}</p><p className="text-xs text-muted">{email}</p></div>
          <M.Item asChild><Link href="/notifications" className="flex items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-brand-50"><Bell className="size-4" />Notifications</Link></M.Item>
          <M.Item asChild><Link href="/reset-password" className="flex items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-brand-50"><KeyRound className="size-4" />Change password</Link></M.Item>
          <M.Item onSelect={() => { void logout(); }} className="flex items-center gap-2 rounded-md px-2.5 py-2 outline-none cursor-pointer text-red-700 data-[highlighted]:bg-red-50"><LogOut className="size-4" />Sign out</M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
