import "server-only";
import type { Tx } from "@/lib/db";

export const propertyOptions = (tx: Tx) =>
  tx<{ id: string; name: string; status: string }[]>`select id, name, status::text from properties where status <> 'archived' order by name`;

export const unitOptions = (tx: Tx) =>
  tx<{ id: string; name: string; property_id: string; room_category: string; base_rate: string; max_guests: number }[]>`
    select u.id, u.name, u.property_id, u.room_category, u.base_rate, u.max_guests from property_units u join properties p on p.id = u.property_id
    where u.is_active order by p.name, u.sort_order, u.name`;

export const staffOptions = (tx: Tx) =>
  tx<{ id: string; full_name: string; role: string }[]>`select id, full_name, role::text from profiles where is_active and role not in ('owner','auditor') order by full_name`;

/** Validate a uuid search param (ignore anything else). */
export const uuidParam = (v?: string | string[]) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
export const sp1 = (v?: string | string[]) => (typeof v === "string" ? v : undefined);
