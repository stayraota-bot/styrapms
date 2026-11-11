// Server-compatible UI primitives (shadcn-style, no client hooks).
import * as React from "react";
import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { cva, type VariantProps } from "class-variance-authority";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm",
        secondary: "bg-white text-ink border border-line hover:bg-sand-50 shadow-sm",
        ghost: "text-ink hover:bg-brand-50",
        danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
        outlineDanger: "border border-red-200 text-red-700 bg-white hover:bg-red-50",
        soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
        link: "text-brand-700 underline-offset-4 hover:underline px-0 h-auto",
      },
      size: { sm: "h-8 px-3 text-xs", md: "h-10 px-4", lg: "h-11 px-5 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;
export function Button({ className, variant, size, ...p }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...p} />;
}
export function LinkButton({ href, className, variant, size, children, ...p }:
  { href: string; children: React.ReactNode; className?: string; prefetch?: boolean } & VariantProps<typeof buttonVariants>) {
  return <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...p}>{children}</Link>;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-white shadow-card", className)} {...p} />;
}
export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0"><h3 className="font-semibold text-[15px] text-ink">{title}</h3>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}</div>
      {action}
    </div>
  );
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...p} />;
}

const badgeTone = {
  green: "bg-brand-50 text-brand-700 ring-brand-200",
  gray: "bg-gray-50 text-gray-600 ring-gray-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  sand: "bg-sand-100 text-sand-600 ring-sand-200",
};
export type Tone = keyof typeof badgeTone;
export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap", badgeTone[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  active: "green", confirmed: "green", approved: "green", paid: "green", collected: "green", ready: "green", resolved: "green", done: "green", inspected: "green", checked_out: "gray",
  pending: "orange", submitted: "blue", draft: "gray", partially_paid: "amber", receivable: "amber", unpaid: "red", rejected: "red", void: "gray",
  checked_in: "blue", cancelled: "red", no_show: "red", onboarding: "blue", inactive: "gray", archived: "gray", overpaid: "purple", refunded: "gray",
  open: "orange", assigned: "blue", in_progress: "blue", closed: "gray", dirty: "orange", cleaning: "blue", inspection: "purple", out_of_order: "red",
  low: "gray", medium: "blue", high: "orange", critical: "red",
};
export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  const s = status ?? "";
  return <Badge tone={STATUS_TONE[s] ?? "gray"}>{label ?? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

const fieldBase = "w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-gray-400 shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-gray-50 aria-[invalid=true]:border-red-400";
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(fieldBase, "h-10", p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cn(fieldBase, "py-2", p.className)} />;
export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) =>
  <select {...p} className={cn(fieldBase, "h-10 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2366736d%22 stroke-width=%222%22><path d=%22m4 6 4 4 4-4%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat", className)}>{children}</select>;
export function Label({ children, htmlFor, required, className }: { children: React.ReactNode; htmlFor?: string; required?: boolean; className?: string }) {
  return <label htmlFor={htmlFor} className={cn("block text-[13px] font-medium text-ink mb-1.5", className)}>{children}{required && <span className="text-red-500 ml-0.5">*</span>}</label>;
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link href={back.href} className="text-xs text-muted hover:text-brand-700 inline-flex items-center gap-1 mb-2">← {back.label}</Link>}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0"><h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="text-sm text-muted mt-1">{description}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-600 [&_svg]:size-6">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto scrollbar-thin", className)}><table className="w-full text-sm border-collapse">{children}</table></div>;
}
export const THead = ({ children }: { children: React.ReactNode }) => <thead className="bg-gray-50/70 text-left">{children}</thead>;
export const Th = ({ children, className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) =>
  <th {...p} className={cn("px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap border-b border-line", className)}>{children}</th>;
export const Td = ({ children, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) =>
  <td {...p} className={cn("px-4 py-3 border-b border-line/70 align-middle", className)}>{children}</td>;
export const Tr = ({ children, className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) =>
  <tr {...p} className={cn("hover:bg-brand-50/30 transition-colors", className)}>{children}</tr>;

export function Stat({ label, value, sub, href, icon, tone = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; icon?: React.ReactNode; tone?: "default" | "warn" | "danger" | "brand" }) {
  const inner = (
    <Card className={cn("p-4 h-full transition", href && "hover:border-brand-300 hover:shadow-pop", tone === "brand" && "bg-brand-800 border-brand-800 text-white")}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-xs font-medium", tone === "brand" ? "text-brand-100" : "text-muted")}>{label}</p>
        {icon && <span className={cn("[&_svg]:size-4", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-red-600" : tone === "brand" ? "text-brand-200" : "text-brand-600")}>{icon}</span>}
      </div>
      <p className="mt-2 text-xl sm:text-[22px] font-semibold tracking-tight tabular">{value}</p>
      {sub && <p className={cn("text-[11px] mt-1", tone === "brand" ? "text-brand-200" : "text-muted")}>{sub}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function KV({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; cols?: 2 | 3 | 4 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {items.map(([k, v], i) => <div key={i} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="text-sm font-medium mt-0.5 break-words">{v ?? "—"}</dd></div>)}
    </dl>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: React.ReactNode; href: string }[]; active: string }) {
  return (
    <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto scrollbar-thin">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} scroll={false}
          className={cn("px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition", active === t.key ? "border-brand-600 text-brand-800 font-medium" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Alert({ tone = "amber", title, children }: { tone?: "amber" | "red" | "green" | "blue"; title?: string; children?: React.ReactNode }) {
  const t = { amber: "bg-amber-50 border-amber-200 text-amber-900", red: "bg-red-50 border-red-200 text-red-900", green: "bg-brand-50 border-brand-200 text-brand-900", blue: "bg-sky-50 border-sky-200 text-sky-900" }[tone];
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", t)}>{title && <p className="font-medium">{title}</p>}{children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}</div>;
}

export function DemoBadge({ show }: { show?: boolean }) {
  return show ? <Badge tone="sand" className="uppercase tracking-wide text-[9px]">Demo</Badge> : null;
}
