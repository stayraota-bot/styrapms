"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog as D } from "radix-ui";
import * as I from "lucide-react";
import { cn } from "@/components/ui/core";
import type { NavItem } from "./nav";

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const C = (I as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? I.Circle;
  return <C className={className} />;
};

function isActive(path: string, href: string) { return href === "/" ? path === "/" : path === href || path.startsWith(href + "/"); }

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  let lastGroup: string | undefined;
  return (
    <nav className="space-y-0.5">
      {items.map((it) => {
        const header = it.group && it.group !== lastGroup ? it.group : null;
        lastGroup = it.group;
        return (
          <div key={it.href}>
            {header && <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-300/70">{header}</p>}
            <Link href={it.href} onClick={onNavigate}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition",
                isActive(path, it.href) ? "bg-brand-700 text-white font-medium shadow-sm" : "text-brand-100/85 hover:bg-brand-800 hover:text-white")}>
              <Icon name={it.icon} className="size-[17px] shrink-0" />{it.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="hidden lg:block w-60 shrink-0 bg-brand-900 text-white no-print">
      <div className="sticky top-0 h-dvh flex flex-col">
        <div className="px-6 h-16 flex items-center"><Link href="/" className="text-xl font-bold tracking-[0.22em]">STAYRA</Link></div>
        <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-thin"><NavList items={items} /></div>
      </div>
    </aside>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="lg:hidden rounded-lg p-2 -ml-2 text-ink hover:bg-gray-100" aria-label="Open menu"><I.Menu className="size-5" /></D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed inset-y-0 left-0 z-50 w-72 bg-brand-900 text-white p-3 overflow-y-auto">
          <D.Title className="px-3 h-12 flex items-center text-lg font-bold tracking-[0.22em]">STAYRA</D.Title>
          <D.Description className="sr-only">Main navigation</D.Description>
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function BottomBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const pick = ["/", "/leads", "/bookings", "/calendar", "/expenses", "/housekeeping", "/maintenance"]
    .map((h) => items.find((i) => i.href === h)).filter(Boolean).slice(0, 5) as NavItem[];
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${pick.length}, 1fr)` }}>
      {pick.map((it) => (
        <Link key={it.href} href={it.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px]", isActive(path, it.href) ? "text-brand-700 font-medium" : "text-muted")}>
          <Icon name={it.icon} className="size-5" />{it.label}
        </Link>
      ))}
    </nav>
  );
}
