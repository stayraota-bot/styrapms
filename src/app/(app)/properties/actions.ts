"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth/session";
import { attempt, parse, zf, type ActionState } from "@/lib/action";
import { saveUpload, isRealFile } from "@/lib/storage";
import { todayIST } from "@/lib/format";

const CATS = ["hotel", "resort", "villa", "homestay", "serviced_apartment", "guest_house", "hostel", "other"] as const;
const base = {
  name: zf.text("Property name", 3),
  category: z.enum(CATS, { error: "Select a category" }),
  address: zf.optText(), city: zf.text("City"), state: zf.text("State"), pincode: zf.optText(),
  location_url: z.preprocess((v) => (v === "" ? undefined : v), z.string().url("Enter a valid link (https://…)").optional()),
  owner_id: zf.uuid("an owner"), manager_id: zf.optUuid(),
  guest_capacity: z.preprocess((v) => (v === "" ? undefined : Number(v)), z.number().int().min(0).optional()),
  check_in_time: z.string().regex(/^\d{2}:\d{2}/, "Check-in time required"), check_out_time: z.string().regex(/^\d{2}:\d{2}/, "Check-out time required"),
  agreement_start: zf.optDate(), agreement_end: zf.optDate(),
  status: z.enum(["onboarding", "active", "inactive"]),
  description: zf.optText(),
};
const CreateSchema = z.object({
  ...base,
  stayra_pct: z.preprocess((v) => Number(v), z.number({ error: "Enter STAYRA %" }).min(0, "0–100").max(100, "0–100")),
  effective_from: zf.date("Effective date"),
  rooms: zf.optText(),
}).refine((v) => !v.agreement_end || !v.agreement_start || v.agreement_end >= v.agreement_start, { message: "End date must be after start date", path: ["agreement_end"] });

function parseRooms(text?: string) {
  if (!text) return [];
  return text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const [name, cat, guests, rate] = l.split("|").map((s) => s?.trim());
    if (!name) throw Object.assign(new Error(`Room line ${i + 1} needs a name`), { code: "P0001" });
    const g = Number(guests || 2), r = Number((rate || "0").replace(/[,₹]/g, ""));
    if (!Number.isFinite(g) || g < 1 || !Number.isFinite(r) || r < 0) throw Object.assign(new Error(`Room line ${i + 1}: check guests / rate`), { code: "P0001" });
    return { name, room_category: cat || "Standard", max_guests: g, base_rate: r, sort_order: i };
  });
}

export async function createProperty(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(CreateSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    const rooms = parseRooms(d.rooms);
    const id = await db(async (tx, u) => {
      const [row] = await tx<{ id: string }[]>`insert into properties(name, category, address, city, state, pincode, location_url, owner_id, manager_id, guest_capacity,
          check_in_time, check_out_time, agreement_start, agreement_end, status, description, created_by)
        values (${d.name}, ${d.category}, ${d.address ?? null}, ${d.city}, ${d.state}, ${d.pincode ?? null}, ${d.location_url ?? null}, ${d.owner_id}, ${d.manager_id ?? null},
          ${d.guest_capacity ?? null}, ${d.check_in_time}, ${d.check_out_time}, ${d.agreement_start ?? null}, ${d.agreement_end ?? null}, ${d.status}, ${d.description ?? null}, ${u.id})
        returning id`;
      for (const r of rooms) await tx`insert into property_units(property_id, name, room_category, max_guests, base_rate, sort_order) values (${row.id}, ${r.name}, ${r.room_category}, ${r.max_guests}, ${r.base_rate}, ${r.sort_order})`;
      if (d.manager_id) await tx`insert into user_property_access(user_id, property_id, granted_by) values (${d.manager_id}, ${row.id}, ${u.id}) on conflict do nothing`;
      let docId: string | null = null;
      const agreementFile = fd.get("agreement_file");
      if (isRealFile(agreementFile)) docId = await saveUpload(tx, { file: agreementFile, entityType: "agreement", entityId: row.id, propertyId: row.id, userId: u.id });
      await tx`select create_agreement(${row.id}, ${d.stayra_pct}, ${d.effective_from}, 'monthly', 'all_approved', false, '{}', ${d.agreement_end ?? null}, 'by_units', 'Initial agreement', ${docId})`;
      const photo = fd.get("photo");
      if (isRealFile(photo)) {
        const pid = await saveUpload(tx, { file: photo, entityType: "property", entityId: row.id, propertyId: row.id, userId: u.id });
        await tx`update properties set cover_photo_path = ${pid} where id = ${row.id}`;
      }
      return row.id;
    });
    revalidatePath("/properties");
    return { message: "Property created", redirectTo: `/properties/${id}` };
  });
}

const UpdateSchema = z.object({ id: zf.uuid("property"), ...base });
export async function updateProperty(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(UpdateSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx, u) => {
      const r = await tx`update properties set name = ${d.name}, category = ${d.category}, address = ${d.address ?? null}, city = ${d.city}, state = ${d.state}, pincode = ${d.pincode ?? null},
        location_url = ${d.location_url ?? null}, owner_id = ${d.owner_id}, manager_id = ${d.manager_id ?? null}, guest_capacity = ${d.guest_capacity ?? null},
        check_in_time = ${d.check_in_time}, check_out_time = ${d.check_out_time}, agreement_start = ${d.agreement_start ?? null}, agreement_end = ${d.agreement_end ?? null},
        status = ${d.status}, description = ${d.description ?? null} where id = ${d.id}`;
      if (r.count === 0) throw Object.assign(new Error("You don't have permission to edit this property."), { code: "42501" });
      if (d.manager_id && u.role === "super_admin") await tx`insert into user_property_access(user_id, property_id, granted_by) values (${d.manager_id}, ${d.id}, ${u.id}) on conflict do nothing`;
      const photo = fd.get("photo");
      if (isRealFile(photo)) {
        const pid = await saveUpload(tx, { file: photo, entityType: "property", entityId: d.id, propertyId: d.id, userId: u.id });
        await tx`update properties set cover_photo_path = ${pid} where id = ${d.id}`;
      }
    });
    revalidatePath(`/properties/${d.id}`);
    return { message: "Property updated", redirectTo: `/properties/${d.id}` };
  });
}

export async function setPropertyStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id")); const status = String(fd.get("status"));
  if (!["active", "inactive", "archived"].includes(status)) return { error: "Invalid status", at: Date.now() };
  return attempt(async () => {
    await db(async (tx) => {
      if (status === "archived") {
        const [{ n }] = await tx<{ n: number }[]>`select count(*)::int n from bookings where property_id = ${id} and status in ('confirmed','checked_in','pending') and check_out >= ${todayIST()}::date`;
        if (n > 0) throw Object.assign(new Error(`Cannot archive: ${n} upcoming/in-house booking(s). Cancel or move them first.`), { code: "P0001" });
      }
      const r = await tx`update properties set status = ${status} where id = ${id}`;
      if (r.count === 0) throw Object.assign(new Error("Not allowed"), { code: "42501" });
    });
    revalidatePath("/properties"); revalidatePath(`/properties/${id}`);
    return { message: status === "archived" ? "Property archived" : status === "active" ? "Property reactivated" : "Property marked inactive" };
  });
}

const UnitSchema = z.object({
  id: zf.optUuid(), property_id: zf.uuid("property"), name: zf.text("Room name"), room_category: zf.text("Room category"),
  max_guests: zf.int("Max guests", 1), base_rate: zf.money("Base rate"), is_active: zf.bool(),
});
export async function saveUnit(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = parse(UnitSchema, fd);
  if (!p.ok) return p.state;
  const d = p.data;
  return attempt(async () => {
    await db(async (tx) => {
      if (d.id) {
        const r = await tx`update property_units set name = ${d.name}, room_category = ${d.room_category}, max_guests = ${d.max_guests}, base_rate = ${d.base_rate}, is_active = ${d.is_active} where id = ${d.id}`;
        if (r.count === 0) throw Object.assign(new Error("Not allowed"), { code: "42501" });
      } else {
        await tx`insert into property_units(property_id, name, room_category, max_guests, base_rate, sort_order)
          values (${d.property_id}, ${d.name}, ${d.room_category}, ${d.max_guests}, ${d.base_rate}, (select coalesce(max(sort_order),0)+1 from property_units where property_id = ${d.property_id}))`;
      }
    });
    revalidatePath(`/properties/${d.property_id}`);
    return { message: d.id ? "Room updated" : "Room added" };
  });
}

export async function uploadPropertyDoc(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("property_id"));
  const file = fd.get("file");
  if (!isRealFile(file)) return { error: "Choose a file", at: Date.now() };
  return attempt(async () => {
    await db((tx, u) => saveUpload(tx, { file, entityType: "property", entityId: id, propertyId: id, userId: u.id }));
    revalidatePath(`/properties/${id}`);
    return { message: "Document uploaded" };
  });
}
