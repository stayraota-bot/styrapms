import { Plus, Sparkles, Play, Check, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fdate, todayIST, titleCase } from "@/lib/format";
import { propertyOptions, unitOptions, staffOptions, sp1 } from "@/server/common";
import { Card, CardHeader, PageHeader, Button, EmptyState, Input, Select, StatusBadge, Tabs, Badge, cn } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { setTaskStatus, createTask } from "./actions";

export const metadata = { title: "Housekeeping" };
export default async function Housekeeping({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "operations", "housekeeping"]);
  const tab = sp1((await searchParams).tab) ?? "today";
  const t = todayIST();
  const d = await withUser(u.id, async (tx) => ({
    tasks: await tx`select h.*, p.name prop, un.name unit, un.readiness::text readiness, a.full_name assignee,
        (select b.check_in from bookings b where b.unit_id = h.unit_id and b.status in ('confirmed','pending') and b.check_in >= ${t}::date order by b.check_in limit 1) next_arrival
      from housekeeping_tasks h join properties p on p.id = h.property_id join property_units un on un.id = h.unit_id left join profiles a on a.id = h.assigned_to
      where (${tab} = 'today' and (h.due_date <= ${t}::date and h.status not in ('done','inspected') or h.due_date = ${t}::date))
         or (${tab} = 'upcoming' and h.due_date > ${t}::date) or (${tab} = 'done' and h.status in ('done','inspected') and h.due_date >= ${t}::date - 7)
      order by h.status in ('done','inspected'), next_arrival nulls last, h.due_date limit 200`,
    rooms: await tx`select un.id, un.name, un.readiness::text readiness, p.name prop from property_units un join properties p on p.id = un.property_id where un.is_active and p.status = 'active' order by p.name, un.sort_order`,
    props: await propertyOptions(tx), units: await unitOptions(tx), staff: (await staffOptions(tx)).filter((s) => ["housekeeping", "operations", "property_manager"].includes(s.role)),
  }));
  const supervisor = u.role !== "housekeeping";
  const counts = d.rooms.reduce<Record<string, number>>((a, r) => ((a[r.readiness] = (a[r.readiness] ?? 0) + 1), a), {});
  return (
    <>
      <PageHeader title="Housekeeping" description={supervisor ? "Room cleaning, check-out cleaning, inspections and room readiness." : "Your cleaning tasks for today."}
        actions={supervisor && <Modal title="New housekeeping task" trigger={<Button><Plus />New Task</Button>}>
          <ActionForm action={createTask} className="grid sm:grid-cols-2 gap-4">
            <Field name="unit_id" label="Room" required className="sm:col-span-2"><Select name="unit_id"><option value="">Select…</option>{d.props.map((p) => <optgroup key={p.id} label={p.name}>{d.units.filter((x) => x.property_id === p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}</Select></Field>
            <Field name="task_type" label="Task" required><Select name="task_type"><option value="room_cleaning">Room cleaning</option><option value="checkout_cleaning">Check-out cleaning</option><option value="inspection">Inspection</option><option value="deep_cleaning">Deep cleaning</option></Select></Field>
            <Field name="due_date" label="Due" required><Input type="date" name="due_date" defaultValue={t} /></Field>
            <Field name="assigned_to" label="Assign to" className="sm:col-span-2"><Select name="assigned_to"><option value="">Unassigned</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
            <Field name="notes" label="Notes" className="sm:col-span-2"><Input name="notes" /></Field>
            <div className="sm:col-span-2 flex justify-end"><SubmitButton>Create task</SubmitButton></div></ActionForm></Modal>} />
      {supervisor && <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">{["ready", "dirty", "cleaning", "inspection", "out_of_order"].map((k) =>
        <Card key={k} className="p-3"><p className="text-xs text-muted">{titleCase(k)}</p><p className="text-xl font-semibold">{counts[k] ?? 0}</p></Card>)}</div>}
      <Tabs active={tab} tabs={[{ key: "today", label: "Today & overdue", href: "?tab=today" }, { key: "upcoming", label: "Upcoming", href: "?tab=upcoming" }, { key: "done", label: "Completed (7 days)", href: "?tab=done" }]} />
      {d.tasks.length === 0 ? <Card><EmptyState icon={<Sparkles />} title="No tasks" description="All rooms are taken care of." /></Card> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{d.tasks.map((h) => {
          const urgent = h.next_arrival && h.next_arrival <= t && !["done", "inspected"].includes(h.status);
          return (
            <Card key={h.id} className={cn("p-4 flex flex-col gap-2", urgent && "border-orange-300 ring-1 ring-orange-100")}>
              <div className="flex justify-between items-start gap-2"><div><p className="font-semibold text-lg leading-tight">{h.unit}</p><p className="text-xs text-muted">{h.prop.replace("STAYRA ", "")}</p></div><StatusBadge status={h.status} /></div>
              <div className="flex flex-wrap gap-1.5 text-xs"><Badge tone="blue">{titleCase(h.task_type)}</Badge><Badge>Due {fdate(h.due_date, false)}</Badge><Badge>{h.assignee ?? "Unassigned"}</Badge>
                {h.next_arrival && <Badge tone={urgent ? "orange" : "gray"}>Next arrival {h.next_arrival === t ? "today" : fdate(h.next_arrival, false)}</Badge>}</div>
              {h.notes && <p className="text-sm text-muted">{h.notes}</p>}
              <div className="flex gap-2 mt-auto pt-2">
                {["pending", "assigned"].includes(h.status) && <ActionForm action={setTaskStatus} className="flex-1"><input type="hidden" name="id" value={h.id} /><input type="hidden" name="status" value="in_progress" /><SubmitButton variant="secondary" className="w-full" size="lg"><Play />Start</SubmitButton></ActionForm>}
                {["pending", "assigned", "in_progress"].includes(h.status) && <ActionForm action={setTaskStatus} className="flex-1"><input type="hidden" name="id" value={h.id} /><input type="hidden" name="status" value="done" /><SubmitButton className="w-full" size="lg"><Check />{h.task_type === "inspection" ? "Passed" : "Clean & ready"}</SubmitButton></ActionForm>}
                {h.status === "done" && supervisor && <ActionForm action={setTaskStatus} className="flex-1"><input type="hidden" name="id" value={h.id} /><input type="hidden" name="status" value="inspected" /><SubmitButton variant="soft" className="w-full"><ShieldCheck />Mark inspected</SubmitButton></ActionForm>}
              </div>
            </Card>);
        })}</div>)}
      {supervisor && <Card className="mt-6"><CardHeader title="Room readiness board" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 px-5 pb-5">{d.rooms.map((r) => <div key={r.id} className="rounded-lg border border-line p-2.5"><p className="text-sm font-medium truncate">{r.name}</p><p className="text-[10.5px] text-muted truncate mb-1.5">{r.prop.replace("STAYRA ", "")}</p><StatusBadge status={r.readiness} /></div>)}</div></Card>}
    </>
  );
}
