"use client";
import { useMemo, useState } from "react";
import { Check, Clock, Upload, Sparkles, ArrowRight } from "lucide-react";
import { ActionForm, Field, SubmitButton, FormActions, Modal, ModalClose } from "@/components/ui/forms";
import { Button, Card, CardBody, CardHeader, Input, Select, Textarea, LinkButton } from "@/components/ui/core";
import type { ActionState } from "@/lib/action";
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, LEAD_TEMP_LABEL } from "@/lib/format";

type Unit = { id: string; name: string; property_id: string; room_category: string; base_rate: string; max_guests: number };
type Staff = { id: string; full_name: string; role: string };

export type LeadInitial = {
  id?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_whatsapp?: string | null;
  guest_email?: string | null;
  guest_city?: string | null;
  source?: string;
  source_detail?: string | null;
  status?: string;
  temperature?: string;
  property_id?: string | null;
  unit_id?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  adults?: number;
  children?: number;
  rooms_needed?: number;
  budget?: string | number | null;
  quoted_amount?: string | number | null;
  special_requests?: string | null;
  notes?: string | null;
  lost_reason?: string | null;
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  follow_up_note?: string | null;
  assigned_to?: string | null;
};

const nightsBetween = (a: string, b: string) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000)) : 0);
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function LeadForm({
  action,
  properties,
  units,
  staff,
  initial,
  quickModal = false,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  properties: { id: string; name: string }[];
  units: Unit[];
  staff: Staff[];
  initial?: LeadInitial;
  quickModal?: boolean;
}) {
  const [propertyId, setPropertyId] = useState(initial?.property_id ?? (properties.length === 1 ? properties[0].id : ""));
  const [unitId, setUnitId] = useState(initial?.unit_id ?? "");
  const [ci, setCi] = useState(initial?.check_in ?? "");
  const [co, setCo] = useState(initial?.check_out ?? "");
  const [roomsNeeded, setRoomsNeeded] = useState(String(initial?.rooms_needed ?? 1));
  const [status, setStatus] = useState(initial?.status ?? "new");
  const [quoted, setQuoted] = useState(initial?.quoted_amount != null ? String(initial.quoted_amount) : "");

  const filteredUnits = useMemo(() => units.filter((u) => u.property_id === propertyId), [units, propertyId]);
  const unit = filteredUnits.find((u) => u.id === unitId);
  const nights = nightsBetween(ci, co);
  const suggestedQuote = unit && nights > 0 ? Number(unit.base_rate) * nights * Math.max(1, Number(roomsNeeded) || 1) : 0;

  return (
    <ActionForm action={action} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {quickModal && <input type="hidden" name="quick_modal" value="1" />}

      <Card>
        <CardHeader title="Guest & Contact Information" description="Capture traveler details and inquiry source." />
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field name="guest_name" label="Guest full name" required>
            <Input name="guest_name" defaultValue={initial?.guest_name ?? ""} placeholder="e.g. Rohan Kapoor" autoComplete="off" />
          </Field>
          <Field name="guest_phone" label="Phone number" required>
            <Input name="guest_phone" type="tel" inputMode="tel" defaultValue={initial?.guest_phone ?? ""} placeholder="+91 98765 43210" />
          </Field>
          <Field name="guest_whatsapp" label="WhatsApp number" hint="Leave blank if same as phone">
            <Input name="guest_whatsapp" type="tel" inputMode="tel" defaultValue={initial?.guest_whatsapp ?? ""} placeholder="+91 98765 43210" />
          </Field>
          <Field name="guest_email" label="Email address">
            <Input name="guest_email" type="email" defaultValue={initial?.guest_email ?? ""} placeholder="guest@example.com" />
          </Field>
          <Field name="guest_city" label="City / Origin">
            <Input name="guest_city" defaultValue={initial?.guest_city ?? ""} placeholder="e.g. Mumbai, Delhi NCR, Bengaluru" />
          </Field>
          <Field name="source" label="Lead source" required>
            <Select name="source" defaultValue={initial?.source ?? "whatsapp"}>
              {Object.entries(LEAD_SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field name="source_detail" label="Campaign / Referral detail" hint="Instagram ad, travel agent name, etc.">
            <Input name="source_detail" defaultValue={initial?.source_detail ?? ""} placeholder="e.g. Winter Villa Campaign" />
          </Field>
          <Field name="temperature" label="Lead priority / temperature" required>
            <Select name="temperature" defaultValue={initial?.temperature ?? "warm"}>
              {Object.entries(LEAD_TEMP_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field name="assigned_to" label="Assigned staff member">
            <Select name="assigned_to" defaultValue={initial?.assigned_to ?? ""}>
              <option value="">Assign to me (default)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.role.replace(/_/g, " ")})</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Stay Preferences & Quotation" description="Preferred property, travel dates, group size, and pricing." />
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field name="property_id" label="Interested property">
            <Select name="property_id" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }}>
              <option value="">Any / Undecided property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field name="unit_id" label="Preferred room / unit">
            <Select name="unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!propertyId}>
              <option value="">{propertyId ? "Any room / unit" : "Select property first"}</option>
              {filteredUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name} · {u.room_category} · ₹{Number(u.base_rate).toLocaleString("en-IN")}/night</option>
              ))}
            </Select>
          </Field>
          <Field name="check_in" label="Tentative check-in">
            <Input type="date" name="check_in" value={ci} onChange={(e) => setCi(e.target.value)} />
          </Field>
          <Field name="check_out" label="Tentative check-out" hint={nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : undefined}>
            <Input type="date" name="check_out" value={co} min={ci || undefined} onChange={(e) => setCo(e.target.value)} />
          </Field>
          <Field name="adults" label="Adults" required>
            <Input type="number" name="adults" min={1} defaultValue={initial?.adults ?? 2} />
          </Field>
          <Field name="children" label="Children">
            <Input type="number" name="children" min={0} defaultValue={initial?.children ?? 0} />
          </Field>
          <Field name="rooms_needed" label="Rooms needed">
            <Input type="number" name="rooms_needed" min={1} value={roomsNeeded} onChange={(e) => setRoomsNeeded(e.target.value)} />
          </Field>
          <Field name="budget" label="Guest budget (₹)">
            <Input name="budget" inputMode="decimal" defaultValue={initial?.budget != null ? String(initial.budget) : ""} placeholder="e.g. 25000" />
          </Field>
          <Field
            name="quoted_amount"
            label="Quoted tariff (₹, excl. GST)"
            hint={suggestedQuote > 0 ? `Rack rate: ${money(suggestedQuote)}` : undefined}
          >
            <div className="flex gap-1.5">
              <Input name="quoted_amount" inputMode="decimal" value={quoted} onChange={(e) => setQuoted(e.target.value)} placeholder="e.g. 22500" />
              {suggestedQuote > 0 && quoted !== String(suggestedQuote) && (
                <Button type="button" variant="soft" size="sm" className="shrink-0 h-10" onClick={() => setQuoted(String(suggestedQuote))}>
                  Use {money(suggestedQuote)}
                </Button>
              )}
            </div>
          </Field>
          <Field name="special_requests" label="Special requests / requirements" className="sm:col-span-2 lg:col-span-3">
            <Input name="special_requests" defaultValue={initial?.special_requests ?? ""} placeholder="e.g. Pet friendly, bonfire + BBQ setup, early check-in, Jain meals…" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pipeline Status & Follow-up Reminder" description="Set current lead stage and schedule the next follow-up call/message." />
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field name="status" label="Pipeline status" required>
            <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field name="follow_up_date" label="Next follow-up date">
            <Input type="date" name="follow_up_date" defaultValue={initial?.follow_up_date ?? ""} />
          </Field>
          <Field name="follow_up_time" label="Follow-up time (IST)">
            <Input type="time" name="follow_up_time" defaultValue={initial?.follow_up_time ?? "11:00"} />
          </Field>
          <Field name="follow_up_note" label="Reminder note / agenda">
            <Input name="follow_up_note" defaultValue={initial?.follow_up_note ?? ""} placeholder="e.g. Confirm advance UPI payment" />
          </Field>
          {status === "lost" && (
            <Field name="lost_reason" label="Reason lead was lost" className="sm:col-span-2 lg:col-span-4">
              <Input name="lost_reason" defaultValue={initial?.lost_reason ?? ""} placeholder="e.g. Budget constraint, dates unavailable, booked another property…" />
            </Field>
          )}
          <Field name="notes" label="Conversation notes" className="sm:col-span-2 lg:col-span-4">
            <Textarea name="notes" defaultValue={initial?.notes ?? ""} placeholder="Summary of discussion with guest, preferences, discount offered…" />
          </Field>
        </CardBody>
      </Card>

      <FormActions>
        {quickModal ? (
          <ModalClose><Button type="button" variant="secondary">Cancel</Button></ModalClose>
        ) : (
          <LinkButton href={initial?.id ? `/leads/${initial.id}` : "/leads"} variant="secondary">Cancel</LinkButton>
        )}
        <SubmitButton>{initial?.id ? "Save changes" : "Save Lead"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function QuickStatusModal({
  lead,
  action,
  trigger,
}: {
  lead: {
    id: string;
    lead_code: string;
    guest_name: string;
    status: string;
    temperature: string;
    quoted_amount: string | null;
    follow_up_date?: string | null;
    follow_up_note?: string | null;
    lost_reason?: string | null;
  };
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  trigger: React.ReactNode;
}) {
  const [status, setStatus] = useState(lead.status);
  return (
    <Modal
      title={`Update ${lead.lead_code} · ${lead.guest_name}`}
      description="Update pipeline stage, quote amount, or schedule the next follow-up reminder."
      trigger={trigger}
    >
      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="id" value={lead.id} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field name="status" label="Lead status" required>
            <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field name="temperature" label="Priority / Temperature">
            <Select name="temperature" defaultValue={lead.temperature}>
              {Object.entries(LEAD_TEMP_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field name="quoted_amount" label="Quoted tariff (₹, excl. GST)">
          <Input name="quoted_amount" inputMode="decimal" defaultValue={lead.quoted_amount ?? ""} placeholder="e.g. 18000" />
        </Field>
        {status === "lost" && (
          <Field name="lost_reason" label="Reason lead was lost">
            <Input name="lost_reason" defaultValue={lead.lost_reason ?? ""} placeholder="e.g. Dates unavailable, price too high, no response…" />
          </Field>
        )}
        {status !== "won" && status !== "lost" && (
          <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t border-line">
            <Field name="follow_up_date" label="Next follow-up date">
              <Input type="date" name="follow_up_date" defaultValue={lead.follow_up_date ?? ""} />
            </Field>
            <Field name="follow_up_time" label="Time (IST)">
              <Input type="time" name="follow_up_time" defaultValue="11:00" />
            </Field>
            <Field name="follow_up_note" label="Follow-up reminder note" className="sm:col-span-2">
              <Input name="follow_up_note" defaultValue={lead.follow_up_note ?? ""} placeholder="e.g. Call back after guest confirms flight tickets" />
            </Field>
          </div>
        )}
        <Field name="note" label="Activity log note">
          <Textarea name="note" rows={2} placeholder="What happened on this call / WhatsApp follow-up?" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <ModalClose><Button type="button" variant="secondary">Cancel</Button></ModalClose>
          <SubmitButton>Update Status</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}

export function CompleteReminderButtons({
  leadId,
  action,
}: {
  leadId: string;
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActionForm action={action} className="inline-block">
        <input type="hidden" name="lead_id" value={leadId} />
        <input type="hidden" name="op" value="done" />
        <SubmitButton size="sm" variant="primary" pendingText="Saving…">
          <Check className="size-3.5" />Done
        </SubmitButton>
      </ActionForm>
      <ActionForm action={action} className="inline-block">
        <input type="hidden" name="lead_id" value={leadId} />
        <input type="hidden" name="op" value="snooze_1d" />
        <SubmitButton size="sm" variant="secondary" pendingText="…">
          <Clock className="size-3.5" />+1d
        </SubmitButton>
      </ActionForm>
      <ActionForm action={action} className="inline-block">
        <input type="hidden" name="lead_id" value={leadId} />
        <input type="hidden" name="op" value="snooze_3d" />
        <SubmitButton size="sm" variant="secondary" pendingText="…">
          +3d
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

const SAMPLE_CSV = `guest_name,guest_phone,guest_email,guest_city,source,temperature,check_in,check_out,adults,children,budget,quoted_amount,follow_up_date,follow_up_note,notes
Aarav Singhania,+91 98201 11223,aarav@example.com,Mumbai,whatsapp,hot,2026-11-20,2026-11-23,4,1,45000,42000,2026-11-12,Confirm 50% UPI advance,Looking for mountain view villa with bonfire
Neha & Vikram Joshi,+91 98112 33445,neha.joshi@example.com,Delhi NCR,instagram,warm,2026-11-25,2026-11-28,2,0,28000,25500,2026-11-12,Send room photos on WhatsApp,Anniversary getaway inquiry`;

export function CsvImportModal({
  action,
  properties,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  properties: { id: string; name: string }[];
}) {
  const [csvText, setCsvText] = useState("");
  return (
    <Modal
      wide
      title="Import Leads from CSV / Spreadsheet"
      description="Upload a .csv file or paste rows directly from Excel / Google Sheets."
      trigger={
        <Button type="button" variant="secondary">
          <Upload />Import CSV
        </Button>
      }
    >
      <ActionForm action={action} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field name="csv_file" label="Upload CSV file (.csv)">
            <Input type="file" name="csv_file" accept=".csv,text/csv" className="py-1.5" />
          </Field>
          <Field name="property_id" label="Default property (if not specified)">
            <Select name="property_id" defaultValue="">
              <option value="">Any / Undecided property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          name="csv_text"
          label={
            <span className="flex items-center justify-between">
              <span>Or paste CSV rows (with header row)</span>
              <button
                type="button"
                onClick={() => setCsvText(SAMPLE_CSV)}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Load sample template
              </button>
            </span>
          }
          hint="Required columns: guest_name (or name), guest_phone (or phone). Optional: guest_email, guest_city, source, status, temperature, check_in, check_out, adults, children, budget, quoted_amount, follow_up_date, follow_up_note, notes."
        >
          <Textarea
            name="csv_text"
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="guest_name,guest_phone,guest_city,source,temperature,check_in,check_out,adults,budget..."
            className="font-mono text-xs"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <ModalClose><Button type="button" variant="secondary">Cancel</Button></ModalClose>
          <SubmitButton pendingText="Importing…">Import Leads</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}

export function ConvertLeadModal({
  lead,
  properties,
  units,
  canPay,
  action,
  trigger,
}: {
  lead: {
    id: string;
    lead_code: string;
    guest_name: string;
    guest_phone: string;
    property_id: string | null;
    unit_id: string | null;
    check_in: string | null;
    check_out: string | null;
    adults: number;
    children: number;
    quoted_amount: string | null;
    budget: string | null;
    special_requests: string | null;
  };
  properties: { id: string; name: string }[];
  units: Unit[];
  canPay: boolean;
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  trigger?: React.ReactNode;
}) {
  const [propertyId, setPropertyId] = useState(lead.property_id ?? (properties.length === 1 ? properties[0].id : ""));
  const [unitId, setUnitId] = useState(lead.unit_id ?? "");
  const [ci, setCi] = useState(lead.check_in ?? "");
  const [co, setCo] = useState(lead.check_out ?? "");
  const [roomAmt, setRoomAmt] = useState(lead.quoted_amount ?? lead.budget ?? "");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");

  const filteredUnits = useMemo(() => units.filter((u) => u.property_id === propertyId), [units, propertyId]);
  const unit = filteredUnits.find((u) => u.id === unitId);
  const nights = nightsBetween(ci, co);
  const suggested = unit && nights > 0 ? Number(unit.base_rate) * nights : 0;
  const effectiveRoom = roomAmt !== "" ? Number(roomAmt || 0) : suggested;
  const total = Math.max(0, effectiveRoom - Number(discount || 0) + Number(tax || 0));

  return (
    <Modal
      wide
      title={`Convert ${lead.lead_code} (${lead.guest_name}) to Booking`}
      description="Creates a live room booking, links the guest record, and marks this lead as Won."
      trigger={
        trigger ?? (
          <Button type="button" variant="primary">
            <Sparkles />Convert to Booking<ArrowRight className="size-3.5" />
          </Button>
        )
      }
    >
      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="lead_id" value={lead.id} />
        <input type="hidden" name="ota_commission" value="0" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field name="property_id" label="Property" required>
            <Select name="property_id" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }}>
              <option value="">Select property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field name="unit_id" label="Room / Unit" required>
            <Select name="unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!propertyId}>
              <option value="">{propertyId ? "Select room…" : "Choose property first"}</option>
              {filteredUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name} · {u.room_category} · ₹{Number(u.base_rate).toLocaleString("en-IN")}/night</option>
              ))}
            </Select>
          </Field>
          <Field name="check_in" label="Check-in date" required>
            <Input type="date" name="check_in" value={ci} onChange={(e) => setCi(e.target.value)} />
          </Field>
          <Field name="check_out" label="Check-out date" required hint={nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : undefined}>
            <Input type="date" name="check_out" value={co} min={ci || undefined} onChange={(e) => setCo(e.target.value)} />
          </Field>
          <Field name="adults" label="Adults" required>
            <Input type="number" name="adults" min={1} defaultValue={lead.adults} />
          </Field>
          <Field name="children" label="Children">
            <Input type="number" name="children" min={0} defaultValue={lead.children} />
          </Field>
          <Field name="room_amount" label="Room amount (₹, excl. GST)" required hint={suggested > 0 ? `Base rate × nights: ${money(suggested)}` : undefined}>
            <Input name="room_amount" inputMode="decimal" value={roomAmt !== "" ? roomAmt : suggested ? String(suggested) : ""} onChange={(e) => setRoomAmt(e.target.value)} />
          </Field>
          <Field name="discount" label="Discount (₹)">
            <Input name="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field name="tax_amount" label="Taxes / GST (₹)">
            <Input name="tax_amount" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </Field>
          <Field name="status" label="Booking status" required>
            <Select name="status" defaultValue="confirmed">
              <option value="confirmed">Confirmed (blocks room immediately)</option>
              <option value="pending">Pending confirmation</option>
            </Select>
          </Field>
        </div>

        {canPay && (
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-line">
            <Field name="advance" label="Advance collected (optional ₹)">
              <Input name="advance" inputMode="decimal" placeholder="0" />
            </Field>
            <Field name="advance_method" label="Payment method">
              <Select name="advance_method" defaultValue="">
                <option value="">—</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
        )}

        <Field name="notes" label="Booking notes">
          <Input name="notes" defaultValue={lead.special_requests ?? `Converted from ${lead.lead_code}`} />
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-brand-50 border border-brand-100 px-4 py-2.5">
          <span className="text-xs text-muted">Net Booking Total (incl. GST)</span>
          <span className="text-base font-semibold tabular text-brand-900">{money(total)}</span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <ModalClose><Button type="button" variant="secondary">Cancel</Button></ModalClose>
          <SubmitButton pendingText="Converting…">Create Booking & Mark Won</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}
