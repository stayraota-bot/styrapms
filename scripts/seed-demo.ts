/**
 * Seeds clearly-labelled DEMO data (is_demo = true, names prefixed "STAYRA", emails @stayra.demo).
 * Safety: refuses to run against a database that already has non-demo properties, and refuses on a
 * Supabase project unless ALLOW_DEMO_SEED=true. Use a separate Supabase project for demos.
 *   AUTH_MODE=local DATABASE_URL=... npm run db:seed-demo
 */
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
const mode = process.env.AUTH_MODE ?? "supabase";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Stayra@Demo2026";
if (!url) throw new Error("DATABASE_URL required");
if (mode !== "local" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to seed demo data: set ALLOW_DEMO_SEED=true on a dedicated demo/staging project."); process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {}, types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } } });

// deterministic RNG so the demo is reproducible
let seed = 20261111;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
const round50 = (x: number) => Math.round(x / 50) * 50;
const ist = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const add = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthStart = (s: string, back: number) => { const [y, m] = s.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 - back, 1)); return d.toISOString().slice(0, 10); };
const monthEnd = (s: string) => { const [y, m] = s.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const TODAY = ist();

async function asUser<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('role','authenticated',true), set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

async function createAuthUser(email: string, fullName: string): Promise<string> {
  if (mode === "local") {
    const [u] = await sql`insert into auth.users(email, encrypted_password, raw_user_meta_data) values (${email}, crypt(${PASSWORD}, gen_salt('bf')), ${sql.json({ full_name: fullName })})
      on conflict (email) do update set encrypted_password = excluded.encrypted_password returning id`;
    return u.id;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const [{ real }] = await sql`select count(*)::int real from properties where not is_demo`;
  if (real > 0) { console.error("This database contains real (non-demo) properties. Demo data will NOT be mixed in."); process.exit(1); }
  const [{ demo }] = await sql`select count(*)::int demo from properties where is_demo`;
  if (demo > 0) { console.log("Demo data already present — nothing to do."); await sql.end(); return; }

  // ------------------------------------------------------------- users
  const people: [string, string, string, boolean?][] = [
    ["superadmin@stayra.demo", "Aarav Shah", "super_admin"],
    ["admin@stayra.demo", "Neha Kulkarni", "admin"],
    ["manager@stayra.demo", "Rohit Desai", "property_manager"],
    ["accounts@stayra.demo", "Priya Iyer", "accountant", true],
    ["ops@stayra.demo", "Imran Shaikh", "operations"],
    ["housekeeping@stayra.demo", "Sunita Pawar", "housekeeping"],
    ["auditor@stayra.demo", "Meera Joshi", "auditor", true],
    ["owner.mehta@stayra.demo", "Vikram Mehta", "owner"],
    ["owner.rao@stayra.demo", "Anjali Rao", "owner"],
    ["owner.malhotra@stayra.demo", "Karan Malhotra", "owner"],
  ];
  const U: Record<string, string> = {};
  for (const [email, name, role, all] of people) {
    const id = await createAuthUser(email, name);
    await sql`insert into profiles(id, email, full_name, role, all_properties, is_demo, phone)
      values (${id}, ${email}, ${name}, ${role}, ${!!all}, true, ${"98" + String(between(10000000, 99999999))}) on conflict (id) do nothing`;
    U[role === "owner" ? email.split("@")[0] : role] = id;
  }

  // ------------------------------------------------------------- owners & properties
  const owners = await sql`insert into owners(full_name, email, phone, address, pan, bank_account_name, bank_account_number, bank_ifsc, upi_id, profile_id, is_demo) values
    ('Vikram Mehta', 'owner.mehta@stayra.demo', '9822011001', 'Bandra West, Mumbai', 'ABCPM1234D', 'Vikram Mehta', 'XXXXXXXX4521', 'HDFC0000123', 'vikram@okhdfc', ${U["owner.mehta"]}, true),
    ('Anjali Rao', 'owner.rao@stayra.demo', '9822011002', 'Koregaon Park, Pune', 'ABCPR5678E', 'Anjali Rao', 'XXXXXXXX9932', 'ICIC0000456', 'anjali@okicici', ${U["owner.rao"]}, true),
    ('Karan Malhotra', 'owner.malhotra@stayra.demo', '9822011003', 'Juhu, Mumbai', 'ABCPM9012F', 'Karan Malhotra', 'XXXXXXXX1188', 'SBIN0000789', 'karan@oksbi', ${U["owner.malhotra"]}, true)
    returning id`;
  const props = [
    { name: "STAYRA Mountain Retreat", cat: "resort", city: "Lonavala", state: "Maharashtra", owner: owners[0].id, pct: 35, cap: 18,
      units: [["Cottage 1", "Valley Cottage", 3, 6500], ["Cottage 2", "Valley Cottage", 3, 6500], ["Cottage 3", "Valley Cottage", 3, 6500], ["Deluxe 101", "Deluxe Room", 2, 4800], ["Deluxe 102", "Deluxe Room", 2, 4800], ["Family Suite", "Suite", 4, 9200]] },
    { name: "STAYRA City Stay", cat: "serviced_apartment", city: "Pune", state: "Maharashtra", owner: owners[1].id, pct: 40, cap: 16,
      units: [["Studio 201", "Studio", 2, 3200], ["Studio 202", "Studio", 2, 3200], ["Studio 203", "Studio", 2, 3200], ["1BHK 301", "1 BHK", 3, 4500], ["1BHK 302", "1 BHK", 3, 4500], ["1BHK 303", "1 BHK", 3, 4500], ["2BHK 401", "2 BHK", 5, 6800], ["2BHK 402", "2 BHK", 5, 6800]] },
    { name: "STAYRA Premium Villa", cat: "villa", city: "Alibaug", state: "Maharashtra", owner: owners[2].id, pct: 50, cap: 12,
      units: [["Entire Villa", "5 BHK Pool Villa", 12, 28000]] },
  ];
  const P: { id: string; units: { id: string; rate: number }[]; pct: number; name: string }[] = [];
  const agreementStart = monthStart(TODAY, 4);
  for (const p of props) {
    const [row] = await sql`insert into properties(name, category, address, city, state, location_url, owner_id, manager_id, guest_capacity, agreement_start, agreement_end, status, is_demo, description)
      values (${p.name}, ${p.cat}, ${"Demo address, " + p.city}, ${p.city}, ${p.state}, ${"https://maps.google.com/?q=" + encodeURIComponent(p.city)}, ${p.owner}, ${U.property_manager}, ${p.cap},
      ${agreementStart}, ${add(agreementStart, 365 * 3 - 1)}, 'active', true, ${"Demo property — " + p.cat.replace("_", " ") + " in " + p.city}) returning id`;
    const units = [];
    let i = 0;
    for (const [name, cat, max, rate] of p.units) {
      const [u] = await sql`insert into property_units(property_id, name, room_category, max_guests, base_rate, sort_order) values (${row.id}, ${name as string}, ${cat as string}, ${max as number}, ${rate as number}, ${i++}) returning id`;
      units.push({ id: u.id, rate: rate as number });
    }
    P.push({ id: row.id, units, pct: p.pct, name: p.name });
  }
  await sql`insert into user_property_access(user_id, property_id) select ${U.property_manager}, id from properties where name in ('STAYRA Mountain Retreat','STAYRA City Stay')`;
  await sql`insert into user_property_access(user_id, property_id) select u, p.id from properties p, unnest(${[U.admin, U.operations, U.housekeeping]}::uuid[]) u`;

  for (const p of P) {
    await asUser(U.super_admin, (tx) => tx`select create_agreement(${p.id}, ${p.pct}, ${agreementStart}, 'monthly', 'all_approved', ${p.pct === 35}, '{}', ${add(agreementStart, 365 * 3 - 1)}, 'by_units', 'Demo agreement')`);
  }

  // ------------------------------------------------------------- guests & bookings
  const first = ["Rahul", "Sneha", "Arjun", "Kavya", "Rohan", "Ishita", "Aditya", "Pooja", "Siddharth", "Ananya", "Varun", "Nisha", "Kunal", "Divya", "Manish", "Ritu", "Harsh", "Tanvi", "Nikhil", "Shreya", "Amit", "Leena", "Gaurav", "Ira"];
  const last = ["Sharma", "Patel", "Nair", "Gupta", "Reddy", "Kapoor", "Bose", "Menon", "Kulkarni", "Chopra", "Joshi", "Verma", "Bhat", "Das", "Pillai", "Saxena"];
  const sources = ["direct", "direct", "direct", "airbnb", "airbnb", "booking_com", "booking_com", "makemytrip", "makemytrip", "goibibo", "agoda", "walk_in", "corporate", "travel_agent", "expedia"];
  const OTA = ["airbnb", "booking_com", "makemytrip", "goibibo", "agoda", "expedia"];
  const fnb = (await sql`select id from income_categories where code = 'fnb'`)[0].id;
  const incCat = Object.fromEntries((await sql`select code, id from income_categories`).map((r) => [r.code, r.id]));
  const start = monthStart(TODAY, 4);
  const horizon = add(TODAY, 75);
  let bookingCount = 0;

  for (const p of P) {
    for (const u of p.units) {
      let d = add(start, between(0, 4));
      while (d < horizon) {
        const isVilla = p.units.length === 1;
        const nights = isVilla ? between(2, 3) : between(1, 4);
        const ci = d, co = add(d, nights);
        const dow = new Date(`${ci}T00:00:00Z`).getUTCDay();
        const weekend = dow === 5 || dow === 6 ? 1.2 : 1;
        const room = round50(u.rate * nights * weekend * (0.9 + rnd() * 0.2));
        const discount = rnd() < 0.25 ? round50(room * 0.08) : 0;
        const tax = Math.round(((room - discount) * (u.rate > 7500 ? 0.18 : 0.05)) * 100) / 100;
        const src = pick(sources);
        const isOta = OTA.includes(src);
        const commission = isOta ? Math.round((room - discount) * (src === "airbnb" ? 0.15 : 0.18) * 100) / 100 : 0;
        let status = co <= TODAY ? "checked_out" : ci <= TODAY ? "checked_in" : rnd() < 0.15 ? "pending" : "confirmed";
        let cancelCharge = 0;
        if (status === "checked_out" && rnd() < 0.05) { status = "cancelled"; cancelCharge = round50(room * 0.25); }
        if ((status === "confirmed") && rnd() < 0.04) status = "cancelled";
        const name = `${pick(first)} ${pick(last)}`;
        const [g] = await sql`insert into guests(full_name, phone, email, city, is_demo) values (${name}, ${"9" + between(100000000, 999999999)}, ${name.toLowerCase().replace(" ", ".") + "@example.com"}, ${pick(["Mumbai", "Pune", "Bengaluru", "Delhi", "Hyderabad", "Ahmedabad", "Chennai"])}, true) returning id`;
        const bookedAt = add(ci, -between(3, 40));
        const [b] = await sql`insert into bookings(property_id, unit_id, guest_id, adults, children, check_in, check_out, source, source_reference, booked_at, room_amount, discount, tax_amount, ota_commission,
            cancellation_charge, status, ota_collects_payment, is_demo, created_by, notes, checked_in_at, checked_out_at, cancelled_at)
          values (${p.id}, ${u.id}, ${g.id}, ${between(1, isVilla ? 8 : 2)}, ${rnd() < 0.3 ? between(1, 2) : 0}, ${ci}, ${co}, ${src}, ${isOta ? src.toUpperCase().slice(0, 3) + between(100000, 999999) : null},
            ${bookedAt + "T10:00:00+05:30"}, ${room}, ${discount}, ${status === "cancelled" ? 0 : tax}, ${status === "cancelled" ? 0 : commission}, ${cancelCharge}, ${status},
            ${["airbnb", "booking_com"].includes(src)}, true, ${U.property_manager}, ${rnd() < 0.15 ? "Guest requested early check-in" : null},
            ${["checked_in", "checked_out"].includes(status) ? ci + "T13:30:00+05:30" : null}, ${status === "checked_out" ? co + "T10:45:00+05:30" : null},
            ${status === "cancelled" ? add(ci, -2) + "T12:00:00+05:30" : null})
          returning id, total_amount`;
        bookingCount++;
        const total = Number(b.total_amount);
        const method = ["airbnb", "booking_com"].includes(src) ? "ota_collection" : pick(["upi", "upi", "card", "bank_transfer", "cash"]);
        const collector = method === "ota_collection" ? "ota" : "property";
        if (status === "checked_out") {
          const adv = round50(total * 0.3);
          await sql`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, paid_at, received_by, reference)
            values (${b.id}, ${p.id}, 'advance', ${adv}, ${method}, ${collector}, ${bookedAt + "T11:00:00+05:30"}, 'Front desk', ${"UTR" + between(1e8, 9e8)})`;
          // a few guests still owe money at checkout (shows outstanding receivables)
          const owes = rnd() < 0.08;
          // folio extras
          let extras = 0;
          if (rnd() < 0.45) { const a = round50(between(800, 4200)); extras += a; await sql`insert into income(property_id, booking_id, category_id, description, amount, txn_date, payment_mode, received_by, is_demo, created_by) values (${p.id}, ${b.id}, ${fnb}, 'Meals & beverages', ${a}, ${add(co, -1)}, 'upi', 'Restaurant', true, ${U.property_manager})`; }
          if (rnd() < 0.15) { const a = round50(between(300, 900)); extras += a; await sql`insert into income(property_id, booking_id, category_id, description, amount, txn_date, payment_mode, received_by, is_demo, created_by) values (${p.id}, ${b.id}, ${incCat.laundry}, 'Laundry service', ${a}, ${add(co, -1)}, 'cash', 'Front desk', true, ${U.property_manager})`; }
          if (rnd() < 0.12 && !isVilla) { const a = round50(between(1500, 4000)); extras += a; await sql`insert into income(property_id, booking_id, category_id, description, amount, txn_date, payment_mode, received_by, is_demo, created_by) values (${p.id}, ${b.id}, ${incCat.activities}, 'Guided trek / activity', ${a}, ${ci}, 'upi', 'Front desk', true, ${U.property_manager})`; }
          const rest = Math.round((total + extras - adv) * 100) / 100 - (owes ? round50(total * 0.2) : 0);
          if (rest > 0) await sql`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, paid_at, received_by)
            values (${b.id}, ${p.id}, 'full', ${rest}, ${method}, ${collector}, ${co + "T10:30:00+05:30"}, 'Front desk')`;
        } else if (status === "cancelled" && cancelCharge > 0) {
          await sql`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, paid_at) values (${b.id}, ${p.id}, 'advance', ${round50(total * 0.5)}, ${method}, ${collector}, ${bookedAt + "T11:00:00+05:30"})`;
          const refund = round50(total * 0.5) - cancelCharge;
          if (refund > 0) await sql`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, paid_at, notes) values (${b.id}, ${p.id}, 'refund', ${refund}, ${method}, ${collector}, ${add(ci, -2) + "T12:00:00+05:30"}, 'Refund after cancellation charge')`;
        } else if (status === "checked_in" || (status === "confirmed" && rnd() < 0.7)) {
          await sql`insert into booking_payments(booking_id, property_id, entry_type, amount, method, collected_by, paid_at, received_by) values (${b.id}, ${p.id}, 'advance', ${round50(total * (status === "checked_in" ? 0.5 : 0.3))}, ${method}, ${collector}, ${bookedAt + "T11:00:00+05:30"}, 'Reservations')`;
        }
        d = add(co, isVilla ? between(1, 5) : between(0, 3));
      }
    }
  }

  // ------------------------------------------------------------- vendors & expenses
  const vendors = await sql`insert into vendors(name, phone, email, gstin, category, address, is_demo) values
    ('Demo — Sahyadri Provisions', '9811100001', 'sales@sahyadri.demo', '27AAAAA0000A1Z5', 'Groceries & ration', 'Lonavala', true),
    ('Demo — Fresh Farm Vegetables', '9811100002', null, null, 'Vegetables & fruits', 'Pune', true),
    ('Demo — MSEDCL (Electricity)', '1912', null, null, 'Utilities', 'Maharashtra', true),
    ('Demo — CoolAir AC Services', '9811100004', 'service@coolair.demo', '27BBBBB1111B1Z5', 'AC servicing', 'Pune', true),
    ('Demo — AquaFix Plumbers', '9811100005', null, null, 'Plumbing', 'Alibaug', true),
    ('Demo — BrightNet Fibre', '9811100006', 'billing@brightnet.demo', '27CCCCC2222C1Z5', 'Internet', 'Pune', true),
    ('Demo — PoolCare India', '9811100007', null, '27DDDDD3333D1Z5', 'Swimming pool', 'Alibaug', true)
    returning id, name`;
  const V = (k: string) => vendors.find((v) => v.name.includes(k))!.id;
  for (const p of P) for (const v of vendors) await sql`insert into vendor_properties values (${v.id}, ${p.id}) on conflict do nothing`;
  const C = Object.fromEntries((await sql`select name, id from expense_categories`).map((r) => [r.name, r.id]));
  const scale = (p: (typeof P)[number]) => (p.units.length === 1 ? 0.8 : p.units.length / 6);
  for (const p of P) {
    for (let back = 4; back >= 0; back--) {
      const ms = monthStart(TODAY, back), me = monthEnd(ms);
      const current = back === 0;
      const exp = async (cat: string, desc: string, amount: number, day: number, o: { vendor?: string; gst?: number; paid?: boolean; approved?: boolean; bearer?: string; paidBy?: string } = {}) => {
        const billDate = add(ms, day);
        if (billDate > TODAY) return;
        const total = amount + (o.gst ?? 0);
        const paid = o.paid ?? !current;
        const approved = o.approved ?? (!current || rnd() < 0.5);
        await sql`insert into expenses(property_id, category_id, vendor_id, description, amount, gst_amount, bill_date, due_date, paid_amount, payment_method, paid_by, bearer,
            approval_status, approved_by, approved_at, is_demo, created_by, bill_number)
          values (${p.id}, ${C[cat]}, ${o.vendor ? V(o.vendor) : null}, ${desc}, ${amount}, ${o.gst ?? 0}, ${billDate}, ${add(billDate, 15)}, ${paid ? total : 0}, ${paid ? "bank_transfer" : null},
            ${o.paidBy ?? "stayra"}, ${o.bearer ?? "pool"}, ${approved ? "approved" : "pending"}, ${approved ? U.accountant : null}, ${approved ? billDate + "T18:00:00+05:30" : null}, true, ${U.property_manager}, ${"INV-" + between(1000, 9999)})`;
      };
      const s = scale(p);
      await exp("Ration", "Monthly ration & groceries", round50(between(9000, 14000) * s), 2, { vendor: "Sahyadri" });
      await exp("Ration", "Ration top-up", round50(between(3000, 5000) * s), 16, { vendor: "Sahyadri" });
      for (const day of [4, 11, 18, 25]) await exp("Vegetables", "Weekly vegetables & fruits", round50(between(1800, 3200) * s), day, { vendor: "Fresh Farm" });
      await exp("Milk", "Milk & dairy (monthly)", round50(between(2500, 4200) * s), 27);
      await exp("Electricity", `Electricity bill — ${ms.slice(0, 7)}`, round50(between(9000, 16000) * s), 9, { vendor: "MSEDCL", paid: !current ? true : false, approved: true });
      await exp("Internet", "Fibre broadband", 1499, 5, { vendor: "BrightNet", gst: 269.82 });
      await exp("Salaries", "Staff salaries", round50(28000 * Math.max(s, 0.8)), 1);
      await exp("Cleaning supplies", "Housekeeping & cleaning supplies", round50(between(2000, 4000) * s), 12);
      await exp("Guest amenities", "Toiletries & guest amenities", round50(between(1500, 3500) * s), 20);
      if (back % 2 === 0) await exp("AC servicing", "Quarterly AC servicing", round50(between(3500, 6000) * s), 14, { vendor: "CoolAir", gst: 0 });
      if (back === 1) await exp("Plumbing", "Leak repair — bathroom", round50(between(2500, 5500)), 7, { vendor: "AquaFix" });
      if (p.units.length === 1) await exp("Swimming pool", "Pool cleaning & chemicals", 6500, 6, { vendor: "PoolCare", gst: 1170 });
    }
  }
  // owner-borne & STAYRA-borne examples, plus a shared marketing cost
  const villa = P[2], mountain = P[0];
  await sql`insert into expenses(property_id, category_id, description, amount, bill_date, paid_amount, paid_by, bearer, approval_status, approved_by, approved_at, is_demo, notes, payment_method)
    values (${villa.id}, ${C["Furniture"]}, 'Owner-requested patio furniture (owner-borne)', 18500, ${add(monthStart(TODAY, 2), 10)}, 18500, 'stayra', 'owner', 'approved', ${U.accountant}, now(), true, 'Paid by STAYRA, recovered from owner share', 'bank_transfer'),
           (${mountain.id}, ${C["Software"]}, 'Channel manager subscription (STAYRA-borne)', 2950, ${add(monthStart(TODAY, 1), 3)}, 2950, 'stayra', 'stayra', 'approved', ${U.accountant}, now(), true, null, 'card')`;
  const [shared] = await sql`insert into expenses(property_id, category_id, description, amount, gst_amount, bill_date, paid_amount, scope, approval_status, approved_by, approved_at, is_demo, payment_method)
    values (${mountain.id}, ${C["Marketing"]}, 'Instagram ad campaign — all properties', 12000, 2160, ${add(monthStart(TODAY, 1), 5)}, 14160, 'shared', 'approved', ${U.accountant}, now(), true, 'card') returning id`;
  await sql`select allocate_shared_expense(${shared.id}, ${P.map((p) => p.id)}::uuid[], 'by_units')`;
  // recurring rules
  for (const p of P) await sql`insert into recurring_expenses(property_id, category_id, vendor_id, description, amount, frequency, day_of_month, next_run_date, created_by)
    values (${p.id}, ${C["Internet"]}, ${V("BrightNet")}, 'Fibre broadband', 1499, 'monthly', 5, ${add(monthStart(TODAY, -1), 4)}, ${U.accountant})`;

  // ------------------------------------------------------------- settlements (4 past months)
  for (const p of P) {
    for (const back of [4, 3, 2, 1]) {
      const ms = monthStart(TODAY, back), me = monthEnd(ms);
      const sid = await asUser(U.accountant, async (tx) => (await tx`select generate_settlement(${p.id}, ${ms}, ${me}) as id`)[0].id as string);
      if (back === 1 && p.pct === 40) continue; // City Stay: latest month left as draft
      await asUser(U.accountant, (tx) => tx`select transition_settlement(${sid}, 'submitted')`);
      if (back === 1) continue; // others: latest awaiting approval
      await asUser(U.super_admin, (tx) => tx`select transition_settlement(${sid}, 'approved')`);
      const [s] = await sql`select owner_share - owner_borne_recoveries as due from settlements where id = ${sid}`;
      const due = Number(s.due);
      if (due <= 0) continue;
      if (back >= 3) await asUser(U.accountant, (tx) => tx`select record_settlement_payment(${sid}, ${due}, ${add(me, 8)}, 'bank_transfer', ${"NEFT" + between(1e6, 9e6)}, 'Full settlement')`);
      else await asUser(U.accountant, (tx) => tx`select record_settlement_payment(${sid}, ${Math.round(due * 0.6)}, ${add(me, 10)}, 'bank_transfer', ${"NEFT" + between(1e6, 9e6)}, 'Part payment')`);
    }
  }

  // ------------------------------------------------------------- operations
  await sql`insert into maintenance_tickets(property_id, unit_id, category, title, description, priority, status, assigned_to, reported_by, expected_completion, is_demo, blocks_room) values
    (${P[0].id}, ${P[0].units[3].id}, 'Electrical', 'Geyser not heating', 'Guest reported no hot water in Deluxe 101', 'high', 'in_progress', ${U.operations}, ${U.housekeeping}, ${add(TODAY, 1)}, true, false),
    (${P[1].id}, ${P[1].units[6].id}, 'Plumbing', 'Kitchen sink leakage', 'Slow leak under sink', 'medium', 'assigned', ${U.operations}, ${U.property_manager}, ${add(TODAY, 3)}, true, false),
    (${P[2].id}, ${P[2].units[0].id}, 'Swimming pool', 'Pool pump making noise', 'Check motor bearing before weekend', 'critical', 'open', null, ${U.property_manager}, ${add(TODAY, 1)}, true, false),
    (${P[0].id}, ${P[0].units[0].id}, 'Furniture', 'Wardrobe hinge broken', null, 'low', 'resolved', ${U.operations}, ${U.housekeeping}, ${add(TODAY, -3)}, true, false)`;
  const today = await sql`select b.id, b.property_id, b.unit_id from bookings b where b.is_demo and b.check_out = ${TODAY} and b.status in ('checked_in','checked_out')`;
  for (const t of today) await sql`insert into housekeeping_tasks(property_id, unit_id, booking_id, task_type, status, assigned_to, due_date) values (${t.property_id}, ${t.unit_id}, ${t.id}, 'checkout_cleaning', 'pending', ${U.housekeeping}, ${TODAY})`;
  const arrivals = await sql`select distinct b.property_id, b.unit_id from bookings b where b.is_demo and b.check_in = ${add(TODAY, 1)} and b.status in ('confirmed','pending') limit 4`;
  for (const t of arrivals) await sql`insert into housekeeping_tasks(property_id, unit_id, task_type, status, assigned_to, due_date, notes) values (${t.property_id}, ${t.unit_id}, 'inspection', 'assigned', ${U.housekeeping}, ${TODAY}, 'Pre-arrival inspection')`;
  await sql`update property_units set readiness = 'dirty' where id in (select unit_id from housekeeping_tasks where status = 'pending' and task_type = 'checkout_cleaning')`;
  // block dates on a free window
  const [free] = await sql`select u.id, u.property_id from property_units u where u.property_id = ${P[1].id} and not exists (select 1 from bookings b where b.unit_id = u.id and b.status in ('confirmed','checked_in') and daterange(b.check_in,b.check_out) && daterange(${add(TODAY, 20)}::date, ${add(TODAY, 24)}::date)) limit 1`;
  if (free) await sql`insert into blocked_dates(property_id, unit_id, start_date, end_date, reason, notes, created_by) values (${free.property_id}, ${free.id}, ${add(TODAY, 20)}, ${add(TODAY, 24)}, 'maintenance', 'Repainting', ${U.property_manager})`;
  await sql`insert into demand_rules(property_id, name, kind, start_date, end_date, notes, created_by) values
    (null, 'Christmas & New Year', 'season', ${TODAY.slice(0, 4) + "-12-20"}, ${String(Number(TODAY.slice(0, 4)) + 1) + "-01-02"}, 'Peak holiday season', ${U.super_admin}),
    (${P[0].id}, 'Long weekend', 'event', ${add(TODAY, 15)}, ${add(TODAY, 17)}, 'Manual designation by revenue team', ${U.super_admin})`;

  // curated notifications (trigger-generated seed noise removed)
  await sql`delete from notifications`;
  await sql`insert into notifications(user_id, type, title, body, link, severity, created_at)
    select p.id, n.type, n.title, n.body, n.link, n.severity, now() - (n.mins || ' minutes')::interval
    from profiles p cross join (values
      ('maintenance','Critical: Pool pump making noise','STAYRA Premium Villa · assign a technician','/maintenance','critical', 25),
      ('expense_approval','Expenses awaiting approval','Current-month bills need review','/expenses?approval=pending','warning', 90),
      ('settlement','Settlements submitted for approval','Last month''s owner settlements are ready','/settlements?status=submitted','warning', 180),
      ('booking_new','Upcoming arrivals tomorrow','Check room readiness on the calendar','/calendar','info', 300)) n(type,title,body,link,severity,mins)
    where p.role in ('super_admin','admin','accountant','property_manager')`;

  console.log(`✓ Demo data created: 3 properties, ${bookingCount} bookings. Password for all demo users: ${PASSWORD}`);
  console.log(people.map(([e, n, r]) => `   ${r.padEnd(17)} ${e}`).join("\n"));
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
