"use client";
import { useMemo, useState } from "react";
import { ActionForm, Field, SubmitButton, FormActions } from "@/components/ui/forms";
import { Card, CardBody, CardHeader, Input, Select, Textarea, LinkButton } from "@/components/ui/core";
import type { ActionState } from "@/lib/action";
import { SOURCE_LABEL } from "@/lib/format";

type Unit = { id: string; name: string; property_id: string; room_category: string; base_rate: string; max_guests: number };
const OTA = ["airbnb", "booking_com", "makemytrip", "goibibo", "agoda", "expedia"];
const nightsBetween = (a: string, b: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0);
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BookingForm({ action, properties, units, defaults, idem, canPay }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  properties: { id: string; name: string }[]; units: Unit[]; defaults: { property?: string; unit?: string; check_in?: string; check_out?: string }; idem: string; canPay: boolean;
}) {
  const [propertyId, setPropertyId] = useState(defaults.property ?? (properties.length === 1 ? properties[0].id : ""));
  const [unitId, setUnitId] = useState(defaults.unit ?? "");
  const [ci, setCi] = useState(defaults.check_in ?? "");
  const [co, setCo] = useState(defaults.check_out ?? "");
  const [source, setSource] = useState("direct");
  const [room, setRoom] = useState("");
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const [commission, setCommission] = useState("");
  const [touched, setTouched] = useState(false);
  const list = useMemo(() => units.filter((u) => u.property_id === propertyId), [units, propertyId]);
  const unit = list.find((u) => u.id === unitId);
  const nights = nightsBetween(ci, co);
  const suggested = unit && nights > 0 ? Number(unit.base_rate) * nights : 0;
  const roomVal = touched ? Number(room || 0) : suggested;
  const total = roomVal - Number(discount || 0) + Number(tax || 0);
  const isOta = OTA.includes(source);

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="idem" value={idem} />
      <Card><CardHeader title="Stay" /><CardBody className="grid sm:grid-cols-2 gap-4">
        <Field name="property_id" label="Property" required><Select name="property_id" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }}>
          <option value="">Select property…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field name="unit_id" label="Room / unit" required><Select name="unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!propertyId}>
          <option value="">{propertyId ? "Select room…" : "Choose property first"}</option>{list.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.room_category} · ₹{Number(u.base_rate).toLocaleString("en-IN")}/night</option>)}</Select></Field>
        <Field name="check_in" label="Check-in" required><Input type="date" name="check_in" value={ci} onChange={(e) => setCi(e.target.value)} /></Field>
        <Field name="check_out" label="Check-out" required hint={nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : undefined}><Input type="date" name="check_out" value={co} min={ci} onChange={(e) => setCo(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field name="adults" label="Adults" required><Input type="number" name="adults" min={1} defaultValue={2} /></Field>
          <Field name="children" label="Children"><Input type="number" name="children" min={0} defaultValue={0} /></Field>
        </div>
        <Field name="status" label="Booking status" required><Select name="status" defaultValue="confirmed"><option value="confirmed">Confirmed</option><option value="pending">Pending confirmation</option></Select></Field>
      </CardBody></Card>

      <Card><CardHeader title="Guest" description="Existing guests are matched by name + phone." /><CardBody className="grid sm:grid-cols-3 gap-4">
        <Field name="guest_name" label="Guest name" required><Input name="guest_name" autoComplete="off" /></Field>
        <Field name="guest_phone" label="Phone"><Input name="guest_phone" type="tel" inputMode="tel" /></Field>
        <Field name="guest_email" label="Email"><Input name="guest_email" type="email" /></Field>
      </CardBody></Card>

      <Card><CardHeader title="Source & amounts" description="Amounts in ₹. Taxes (GST) are tracked separately and not revenue-shared." /><CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field name="source" label="Booking source" required><Select name="source" value={source} onChange={(e) => setSource(e.target.value)}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field name="source_reference" label="Source reference" hint="OTA confirmation no."><Input name="source_reference" /></Field>
        <Field name="room_amount" label="Room booking amount" required hint={suggested ? `Suggested ${money(suggested)} (base rate × nights)` : undefined}>
          <Input name="room_amount" inputMode="decimal" value={touched ? room : suggested ? String(suggested) : ""} onChange={(e) => { setTouched(true); setRoom(e.target.value); }} /></Field>
        <Field name="discount" label="Discount"><Input name="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
        <Field name="tax_amount" label="Taxes (GST)"><Input name="tax_amount" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" /></Field>
        <Field name="ota_commission" label="OTA commission" hint={isOta ? "Deducted before sharing" : "Only for OTA bookings"}><Input name="ota_commission" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0" /></Field>
        <Field name="ota_collects_payment" label="Payment collected by"><Select name="ota_collects_payment" defaultValue="false"><option value="false">Property / STAYRA</option><option value="true">OTA (paid out later)</option></Select></Field>
        <div className="rounded-lg bg-brand-50 border border-brand-100 px-4 py-2.5"><p className="text-xs text-muted">Booking total</p><p className="text-lg font-semibold tabular">{money(Math.max(0, total))}</p></div>
      </CardBody></Card>

      {canPay && <Card><CardHeader title="Advance payment (optional)" description="Recorded in the payment ledger. Further payments can be added from the booking." /><CardBody className="grid sm:grid-cols-3 gap-4">
        <Field name="advance" label="Advance amount"><Input name="advance" inputMode="decimal" placeholder="0" /></Field>
        <Field name="advance_method" label="Payment method"><Select name="advance_method" defaultValue=""><option value="">—</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="ota_collection">OTA collection</option><option value="cheque">Cheque</option><option value="other">Other</option></Select></Field>
      </CardBody></Card>}

      <Card><CardBody className="pt-5"><Field name="notes" label="Internal notes"><Textarea name="notes" placeholder="Special requests, arrival time…" /></Field></CardBody></Card>
      <FormActions><LinkButton href="/bookings" variant="secondary">Cancel</LinkButton><SubmitButton>Create booking</SubmitButton></FormActions>
    </ActionForm>
  );
}
