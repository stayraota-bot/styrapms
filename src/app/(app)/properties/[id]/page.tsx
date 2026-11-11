import Link from "next/link";
import { notFound } from "next/navigation";
import * as I from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fdate, inr, inr0, monthBounds, todayIST, SOURCE_LABEL } from "@/lib/format";
import { propertyPL } from "@/server/analytics";
import { sp1 } from "@/server/common";
import { Card, CardHeader, CardBody, PageHeader, LinkButton, KV, StatusBadge, Tabs, Table, THead, Th, Td, Tr, Badge, Stat, EmptyState, Button, Input, Select, DemoBadge } from "@/components/ui/core";
import { Modal, ActionForm, Field, SubmitButton, ConfirmAction } from "@/components/ui/forms";
import { CATEGORY_LABEL } from "@/components/property-form";
import { saveUnit, setPropertyStatus, uploadPropertyDoc } from "../actions";

export const metadata = { title: "Property details" };

export default async function PropertyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const u = await requireRole(["super_admin", "admin", "property_manager", "accountant", "operations", "auditor"]);
  const { id } = await params;
  const tab = sp1((await searchParams).tab) ?? "overview";
  const fin = can.viewFinance(u.role);
  const { start, end } = monthBounds(todayIST());
  const d = await withUser(u.id, async (tx) => {
    const [p] = await tx`select p.*, o.full_name owner_name, o.phone owner_phone, o.email owner_email, m.full_name manager_name
      from properties p join owners o on o.id = p.owner_id left join profiles m on m.id = p.manager_id where p.id = ${id}::uuid`;
    if (!p) return null;
    const units = await tx`select * from property_units where property_id = ${id}::uuid order by sort_order, name`;
    const agreements = fin ? await tx`select a.*, d.file_name from revenue_share_agreements a left join uploaded_documents d on d.id = a.document_id where a.property_id = ${id}::uuid order by version desc` : [];
    const docs = await tx`select id, file_name, entity_type, created_at from uploaded_documents where property_id = ${id}::uuid and entity_type in ('property','agreement') order by created_at desc limit 20`;
    const bookings = await tx`select b.id, b.booking_code, g.full_name guest, u.name unit, b.check_in, b.check_out, b.status::text, b.source::text, b.total_amount
      from bookings b join guests g on g.id = b.guest_id join property_units u on u.id = b.unit_id where b.property_id = ${id}::uuid order by b.check_in desc limit 15`;
    const pl = fin ? (await propertyPL(tx, start, end, id))[0] : null;
    const team = await tx`select pr.full_name, pr.role::text from user_property_access a join profiles pr on pr.id = a.user_id where a.property_id = ${id}::uuid and pr.is_active order by pr.full_name`;
    return { p, units, agreements, docs, bookings, pl, team };
  }).catch(() => null);
  if (!d) notFound();
  const { p } = d;
  const current = d.agreements.find((a) => a.effective_from <= todayIST() && (!a.effective_to || a.effective_to >= todayIST())) ?? d.agreements[0];
  const canRooms = can.manageRooms(u.role);
  const tabs = [
    { key: "overview", label: "Overview", href: `?tab=overview` },
    { key: "rooms", label: `Rooms (${d.units.length})`, href: `?tab=rooms` },
    ...(fin ? [{ key: "agreement", label: "Revenue sharing", href: `?tab=agreement` }] : []),
    { key: "bookings", label: "Recent bookings", href: `?tab=bookings` },
    { key: "documents", label: "Documents", href: `?tab=documents` },
  ];
  return (
    <>
      <PageHeader back={{ href: "/properties", label: "Properties" }}
        title={<span className="flex items-center gap-2 flex-wrap">{p.name} <StatusBadge status={p.status} /><DemoBadge show={p.is_demo} /></span>}
        description={`${p.property_code} · ${CATEGORY_LABEL[p.category]} · ${p.city}, ${p.state}`}
        actions={<>
          <LinkButton href={`/calendar?property=${id}&view=rooms`} variant="secondary"><I.CalendarDays />Calendar</LinkButton>
          {can.manageBookings(u.role) && <LinkButton href={`/bookings/new?property=${id}`} variant="secondary"><I.CalendarPlus />New booking</LinkButton>}
          {can.manageProperties(u.role) && <LinkButton href={`/properties/${id}/edit`}><I.Pencil />Edit</LinkButton>}
          {can.manageProperties(u.role) && p.status !== "archived" && <ConfirmAction action={setPropertyStatus} hidden={{ id, status: "archived" }} label="Archive" icon={<I.Archive />} title="Archive this property?" description="Archived properties are hidden from daily operations. All financial history is kept and it can be reactivated later." confirmLabel="Archive" variant="outlineDanger" size="md" />}
          {can.manageProperties(u.role) && p.status !== "active" && <ConfirmAction action={setPropertyStatus} hidden={{ id, status: "active" }} label="Reactivate" icon={<I.RotateCcw />} title="Reactivate this property?" confirmLabel="Reactivate" size="md" />}
        </>} />

      {fin && d.pl && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Stat label="Revenue this month" value={inr0(d.pl.gross_revenue)} href={`/reports?tab=pl&property=${id}`} />
          <Stat label="Deductible expenses" value={inr0(d.pl.deductible_expenses)} href={`/expenses?property=${id}`} />
          <Stat label="Net distributable" value={inr0(d.pl.net_distributable)} tone="brand" />
          <Stat label="Occupancy (month)" value={`${Number(d.pl.occupancy ?? 0)}%`} sub={`ADR ${inr0(d.pl.adr)}`} />
          <Stat label="Sharing" value={current ? `${Number(current.stayra_pct)} / ${Number(current.owner_pct)}` : "Not set"} sub="STAYRA / Owner" href={`/revenue-sharing?property=${id}`} />
        </div>
      )}

      <Tabs active={tab} tabs={tabs} />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2"><CardHeader title="Property information" /><CardBody>
            {p.cover_photo_path && <img src={`/api/files/${p.cover_photo_path}`} alt={p.name} className="w-full h-56 object-cover rounded-xl mb-5" />}
            <KV items={[["Property ID", p.property_code], ["Category", CATEGORY_LABEL[p.category]], ["Address", [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ")],
              ["Location", p.location_url ? <a href={p.location_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open map ↗</a> : "—"],
              ["Rooms / units", d.units.filter((x) => x.is_active).length], ["Guest capacity", p.guest_capacity ?? "—"],
              ["Check-in / Check-out", `${String(p.check_in_time).slice(0, 5)} / ${String(p.check_out_time).slice(0, 5)}`],
              ["Agreement", `${fdate(p.agreement_start)} → ${fdate(p.agreement_end)}`], ["Notes", p.description ?? "—"]]} />
          </CardBody></Card>
          <div className="space-y-6">
            <Card><CardHeader title="Owner" action={<Link href={`/owners/${p.owner_id}`} className="text-xs text-brand-700 hover:underline">View →</Link>} /><CardBody>
              <KV cols={2} items={[["Name", p.owner_name], ["Phone", p.owner_phone ?? "—"], ["Email", p.owner_email ?? "—"]]} /></CardBody></Card>
            <Card><CardHeader title="Team with access" /><CardBody>
              <p className="text-sm mb-3"><span className="text-muted">Manager:</span> <span className="font-medium">{p.manager_name ?? "—"}</span></p>
              <ul className="space-y-1.5 text-sm">{d.team.map((t, i) => <li key={i} className="flex justify-between"><span>{t.full_name}</span><Badge>{t.role.replace("_", " ")}</Badge></li>)}</ul>
              {d.team.length === 0 && <p className="text-sm text-muted">Only Super Admins and all-property staff.</p>}
            </CardBody></Card>
          </div>
        </div>
      )}

      {tab === "rooms" && (
        <Card><CardHeader title="Rooms / units" description="Room categories, capacity, base rates and readiness"
          action={canRooms && <Modal title="Add room" trigger={<Button size="sm"><I.Plus />Add room</Button>}><UnitForm propertyId={id} /></Modal>} />
          {d.units.length === 0 ? <EmptyState icon={<I.BedDouble />} title="No rooms yet" description="Add rooms so bookings can be made." /> : (
            <Table><THead><tr><Th>Room</Th><Th>Category</Th><Th className="text-right">Max guests</Th><Th className="text-right">Base rate</Th><Th>Readiness</Th><Th>Status</Th>{canRooms && <Th />}</tr></THead>
              <tbody>{d.units.map((r) => (
                <Tr key={r.id}><Td className="font-medium">{r.name}</Td><Td>{r.room_category}</Td><Td className="text-right">{r.max_guests}</Td><Td className="text-right tabular">{inr(r.base_rate)}</Td>
                  <Td><StatusBadge status={r.readiness} /></Td><Td>{r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  {canRooms && <Td className="text-right"><Modal title={`Edit ${r.name}`} trigger={<Button size="sm" variant="ghost"><I.Pencil />Edit</Button>}><UnitForm propertyId={id} unit={r} /></Modal></Td>}
                </Tr>))}</tbody></Table>)}
        </Card>
      )}

      {tab === "agreement" && fin && (
        <Card><CardHeader title="Revenue-sharing agreements" description="Every version is kept. Settlements always use the version in force for their period."
          action={can.configureSharing(u.role) && <LinkButton href={`/revenue-sharing?property=${id}&edit=1`} size="sm"><I.Percent />Change terms</LinkButton>} />
          <Table><THead><tr><Th>Version</Th><Th>STAYRA / Owner</Th><Th>Effective</Th><Th>Settlement</Th><Th>Expense policy</Th><Th>Unpaid bills</Th><Th>Document</Th></tr></THead>
            <tbody>{d.agreements.map((a) => (
              <Tr key={a.id}><Td>v{a.version} {a === current && <Badge tone="green">Current</Badge>}</Td><Td className="font-medium">{Number(a.stayra_pct)}% / {Number(a.owner_pct)}%</Td>
                <Td>{fdate(a.effective_from)} → {a.effective_to ? fdate(a.effective_to) : "open"}</Td><Td className="capitalize">{a.settlement_frequency}</Td>
                <Td className="capitalize">{String(a.expense_policy).replace(/_/g, " ")}</Td><Td>{a.include_unpaid_expenses ? "Included" : "Excluded until paid"}</Td>
                <Td>{a.document_id ? <a href={`/api/files/${a.document_id}`} target="_blank" className="text-brand-700 hover:underline">{a.file_name}</a> : "—"}</Td></Tr>))}</tbody></Table>
        </Card>
      )}

      {tab === "bookings" && (
        <Card><CardHeader title="Recent bookings" action={<Link href={`/bookings?property=${id}`} className="text-xs text-brand-700 hover:underline">All bookings →</Link>} />
          {d.bookings.length === 0 ? <EmptyState icon={<I.BookOpen />} title="No bookings yet" /> : (
            <Table><THead><tr><Th>Booking</Th><Th>Guest</Th><Th>Room</Th><Th>Stay</Th><Th>Source</Th>{fin && <Th className="text-right">Total</Th>}<Th>Status</Th></tr></THead>
              <tbody>{d.bookings.map((b) => (
                <Tr key={b.id}><Td><Link href={`/bookings/${b.id}`} className="font-medium text-brand-700 hover:underline">{b.booking_code}</Link></Td><Td>{b.guest}</Td><Td>{b.unit}</Td>
                  <Td className="whitespace-nowrap">{fdate(b.check_in, false)} → {fdate(b.check_out, false)}</Td><Td>{SOURCE_LABEL[b.source]}</Td>
                  {fin && <Td className="text-right tabular">{inr(b.total_amount)}</Td>}<Td><StatusBadge status={b.status} /></Td></Tr>))}</tbody></Table>)}
        </Card>
      )}

      {tab === "documents" && (
        <Card><CardHeader title="Photographs & documents" action={can.manageRooms(u.role) && (
          <Modal title="Upload document or photo" trigger={<Button size="sm"><I.Upload />Upload</Button>}>
            <ActionForm action={uploadPropertyDoc} className="space-y-4"><input type="hidden" name="property_id" value={id} />
              <Field name="file" label="File" hint="Photos or PDF, up to 10 MB"><Input type="file" name="file" accept="image/*,application/pdf" className="py-1.5" /></Field>
              <div className="flex justify-end"><SubmitButton>Upload</SubmitButton></div></ActionForm></Modal>)} />
          {d.docs.length === 0 ? <EmptyState icon={<I.FileText />} title="No documents uploaded" /> : (
            <ul className="divide-y divide-line border-t border-line">{d.docs.map((x) => (
              <li key={x.id} className="flex items-center justify-between px-5 py-3 text-sm"><a href={`/api/files/${x.id}`} target="_blank" className="flex items-center gap-2 text-brand-700 hover:underline"><I.FileText className="size-4" />{x.file_name}</a>
                <span className="text-muted text-xs">{x.entity_type} · {fdate(x.created_at)}</span></li>))}</ul>)}
        </Card>
      )}
    </>
  );
}

function UnitForm({ propertyId, unit }: { propertyId: string; unit?: Record<string, unknown> }) {
  return (
    <ActionForm action={saveUnit} className="grid sm:grid-cols-2 gap-4">
      <input type="hidden" name="property_id" value={propertyId} />
      {unit && <input type="hidden" name="id" value={String(unit.id)} />}
      <Field name="name" label="Room / unit name" required><Input name="name" defaultValue={String(unit?.name ?? "")} /></Field>
      <Field name="room_category" label="Room category" required><Input name="room_category" defaultValue={String(unit?.room_category ?? "Standard")} /></Field>
      <Field name="max_guests" label="Max guests" required><Input name="max_guests" type="number" min={1} defaultValue={String(unit?.max_guests ?? 2)} /></Field>
      <Field name="base_rate" label="Base rate / night (₹)" required><Input name="base_rate" inputMode="decimal" defaultValue={String(unit?.base_rate ?? "")} /></Field>
      <Field name="is_active" label="Status"><Select name="is_active" defaultValue={unit && !unit.is_active ? "false" : "true"}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{unit ? "Save room" : "Add room"}</SubmitButton></div>
    </ActionForm>
  );
}
