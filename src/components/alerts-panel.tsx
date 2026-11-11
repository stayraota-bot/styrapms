import Link from "next/link";
import * as I from "lucide-react";
import type { AlertItem } from "@/server/alerts";
import { Card, CardHeader, Badge, EmptyState, cn } from "@/components/ui/core";

export function AlertsPanel({ alerts, compact }: { alerts: AlertItem[]; compact?: boolean }) {
  const icon = { critical: <I.OctagonAlert className="size-4 text-red-600" />, warning: <I.TriangleAlert className="size-4 text-amber-600" />, info: <I.Info className="size-4 text-sky-600" /> };
  return (
    <Card>
      <CardHeader title="Alerts & risks" description="Click an item to open it" action={<Badge tone={alerts.some((a) => a.severity === "critical") ? "red" : "gray"}>{alerts.length}</Badge>} />
      {alerts.length === 0 ? <EmptyState icon={<I.ShieldCheck />} title="All clear" description="No conflicts, payment or operational risks found." /> : (
        <ul className={cn("divide-y divide-line border-t border-line overflow-y-auto", compact ? "max-h-[420px]" : "max-h-[640px]")}>
          {alerts.map((a, i) => (
            <li key={i}><Link href={a.href} className="flex gap-3 px-5 py-3 hover:bg-brand-50/40">
              <span className="mt-0.5">{icon[a.severity]}</span>
              <span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-muted">{a.type}</span>
                <span className="block text-sm font-medium truncate">{a.title}</span><span className="block text-xs text-muted truncate">{a.detail}</span></span>
            </Link></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
