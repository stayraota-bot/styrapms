import { Plus, Wrench, Image as Img } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, fdatetime, todayIST } from "@/lib/format";
import { propertyOptions, unitOptions, staffOptions, sp1 } from "@/server/common";
import { Card, PageHeader, Button, EmptyState, Input, Select, Textarea, StatusBadge, Tabs, Badge, cn } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton } from "@/components/ui/forms";
import { createTicket, updateTicket } from "./actions";

export const metadata = { title: "Maintenance" };
const CATS = ["Plumbing", "Electrical", "AC / Appliances", "Furniture", "Civil work", "Painting", "Swimming pool", "Garden", "Pest control", "Internet / TV", "General"];

export default async function Maintenance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "operations", "housekeeping"]);
  const sp = await searchParams;
  const tab = sp1(sp.tab) ?? "active";
  const d = await withUser(u.id, async (tx) => ({
    rows: await tx`select m.*, p.name prop, un.name unit, a.full_name assignee, r.full_name reporter from maintenance_tickets m join properties p on p.id = m.property_id
        left join property_units un on un.id = m.unit_id left join profiles a on a.id = m.assigned_to left join profiles r on r.id = m.reported_by
      where (${tab} = 'all' or (${tab} = 'active' and m.status in ('open','assigned','in_progress')) or (${tab} = 'mine' and m.assigned_to = ${u.id}) or (${tab} = 'done' and m.status in ('resolved','closed')))
      order by case m.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, m.created_at desc limit 200`,
    props: await propertyOptions(tx), units: await unitOptions(tx), staff: await staffOptions(tx),
  }));
  const manage = can.manageMaintenance(u.role);
  const t = todayIST();
  return (
    <>
      <PageHeader title="Maintenance" description="Raise, assign and resolve property issues. Critical tickets appear on the dashboard and calendar."
        actions={<Modal title="New maintenance ticket" wide defaultOpen={sp.new === "1"} trigger={<Button><Plus />New Ticket</Button>}>
          <ActionForm action={createTicket} className="grid sm:grid-cols-2 gap-4" resetOnSuccess>
            <Field name="property_id" label="Property" required><Select name="property_id"><option value="">Select…</option>{d.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field name="unit_id" label="Room"><Select name="unit_id"><option value="">Common area / whole property</option>{d.props.map((p) => <optgroup key={p.id} label={p.name}>{d.units.filter((x) => x.property_id === p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}</Select></Field>
            <Field name="title" label="Issue" required className="sm:col-span-2"><Input name="title" placeholder="e.g. AC not cooling" /></Field>
            <Field name="category" label="Category" required><Select name="category">{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field name="priority" label="Priority" required><Select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></Select></Field>
            <Field name="description" label="Description" className="sm:col-span-2"><Textarea name="description" /></Field>
            {manage && <Field name="assigned_to" label="Assign to"><Select name="assigned_to"><option value="">Unassigned</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>}
            <Field name="expected_completion" label="Expected completion"><Input type="date" name="expected_completion" min={t} /></Field>
            <Field name="photo" label="Photograph"><Input type="file" name="photo" accept="image/*" capture="environment" className="py-1.5" /></Field>
            <Field name="blocks_room" label="Room usable?"><Select name="blocks_room" defaultValue="false"><option value="false">Yes, still usable</option><option value="true">No — mark room out of order</option></Select></Field>
            <div className="sm:col-span-2 flex justify-end"><SubmitButton>Raise ticket</SubmitButton></div>
          </ActionForm></Modal>} />
      <Tabs active={tab} tabs={[{ key: "active", label: "Open", href: "?tab=active" }, { key: "mine", label: "Assigned to me", href: "?tab=mine" }, { key: "done", label: "Resolved", href: "?tab=done" }, { key: "all", label: "All", href: "?tab=all" }]} />
      {d.rows.length === 0 ? <Card><EmptyState icon={<Wrench />} title="No tickets here" description="Everything is in working order." /></Card> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{d.rows.map((m) => {
          const overdue = m.expected_completion && m.expected_completion < t && !["resolved", "closed"].includes(m.status);
          return (
            <Card key={m.id} className={cn("p-4 flex flex-col gap-3", m.priority === "critical" && !["resolved", "closed"].includes(m.status) && "border-red-300 ring-1 ring-red-100")}>
              <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted">{m.ticket_code} · {m.category}</p><p className="font-semibold">{m.title}</p></div><StatusBadge status={m.priority} /></div>
              <p className="text-sm text-muted">{m.prop.replace("STAYRA ", "")}{m.unit ? ` · ${m.unit}` : " · common area"}{m.blocks_room ? " · room out of order" : ""}</p>
              {m.description && <p className="text-sm">{m.description}</p>}
              {m.photo_document_id && <a href={`/api/files/${m.photo_document_id}`} target="_blank" className="text-xs text-brand-700 inline-flex items-center gap-1"><Img className="size-3.5" />View photo</a>}
              <div className="flex flex-wrap gap-2 text-xs"><StatusBadge status={m.status} /><Badge>{m.assignee ?? "Unassigned"}</Badge>{m.expected_completion && <Badge tone={overdue ? "red" : "gray"}>Due {fdate(m.expected_completion, false)}</Badge>}</div>
              <p className="text-[11px] text-muted">Reported by {m.reporter ?? "—"} · {fdatetime(m.created_at)}</p>
              {(manage || m.assigned_to === u.id) && <Modal title={`Update ${m.ticket_code}`} trigger={<Button variant="secondary" size="sm" className="mt-auto">Update status</Button>}>
                <ActionForm action={updateTicket} className="grid grid-cols-2 gap-4"><input type="hidden" name="id" value={m.id} />
                  <Field name="status" label="Status"><Select name="status" defaultValue={m.status}><option value="open">Open</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select></Field>
                  <Field name="priority" label="Priority"><Select name="priority" defaultValue={m.priority}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></Select></Field>
                  <Field name="assigned_to" label="Assigned to"><Select name="assigned_to" defaultValue={m.assigned_to ?? ""} disabled={!manage}><option value="">Unassigned</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
                  {!manage && <input type="hidden" name="assigned_to" value={m.assigned_to ?? ""} />}
                  <Field name="expected_completion" label="Expected completion"><Input type="date" name="expected_completion" defaultValue={m.expected_completion ?? ""} /></Field>
                  <div className="col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div></ActionForm></Modal>}
            </Card>);
        })}</div>)}
    </>
  );
}
