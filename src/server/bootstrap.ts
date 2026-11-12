import "server-only";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { sysSql } from "@/lib/db";
import { env } from "@/lib/env";
import { addDays, todayIST } from "@/lib/format";

let bootstrapped = false;

export async function ensureBootstrapped() {
  if (bootstrapped) return;
  const [{ has_profiles, has_leads }] = await sysSql<{ has_profiles: boolean; has_leads: boolean }[]>`
    select
      to_regclass('public.profiles') is not null as has_profiles,
      to_regclass('public.leads') is not null as has_leads`;

  const root = path.join(process.cwd(), "supabase");

  if (!has_profiles || !has_leads) {
    const [{ has_auth }] = await sysSql<{ has_auth: boolean }[]>`select to_regclass('auth.users') is not null as has_auth`;
    if (!has_auth) {
      await sysSql.unsafe(readFileSync(path.join(root, "local/00_supabase_shim.sql"), "utf8"));
    }
    await sysSql`create table if not exists public._stayra_migrations (name text primary key, applied_at timestamptz default now())`;
    const done = new Set((await sysSql<{ name: string }[]>`select name from public._stayra_migrations`).map((r) => r.name));
    const files = readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      await sysSql.begin(async (tx) => {
        await tx.unsafe(readFileSync(path.join(root, "migrations", f), "utf8"));
        await tx`insert into public._stayra_migrations(name) values (${f})`;
      });
    }
    await sysSql`alter table public._stayra_migrations enable row level security`;
  }

  // Ensure demo users + properties + leads exist if needed
  const [{ user_count }] = await sysSql<{ user_count: number }[]>`select count(*)::int as user_count from profiles`;
  const [{ prop_count }] = await sysSql<{ prop_count: number }[]>`select count(*)::int as prop_count from properties`;
  if (user_count === 0 || prop_count === 0) {
    await seedInitialDemoData();
  }
  bootstrapped = true;
}

async function seedInitialDemoData() {
  const pw = process.env.DEMO_PASSWORD ?? "Stayra@Demo2026";
  const t = todayIST();
  const people: [string, string, string, boolean?][] = [
    ["superadmin@stayra.demo", "Aarav Shah", "super_admin"],
    ["admin@stayra.demo", "Neha Kulkarni", "admin"],
    ["manager@stayra.demo", "Rohit Desai", "property_manager"],
    ["accounts@stayra.demo", "Priya Iyer", "accountant", true],
    ["ops@stayra.demo", "Vikram Patil", "operations"],
    ["housekeeping@stayra.demo", "Sunita Pawar", "housekeeping"],
    ["auditor@stayra.demo", "Kiran Malhotra", "auditor", true],
    ["owner.mehta@stayra.demo", "Rajesh Mehta", "owner"],
    ["owner.rao@stayra.demo", "Ananya Rao", "owner"],
    ["owner.malhotra@stayra.demo", "Vikramaditya Malhotra", "owner"],
  ];

  const U: Record<string, string> = {};
  for (const [email, name, role, allProps] of people) {
    let uid: string | undefined;
    const [existing] = await sysSql<{ id: string }[]>`select id from auth.users where lower(email) = lower(${email}) limit 1`;
    if (existing) {
      uid = existing.id;
      await sysSql`update auth.users set encrypted_password = crypt(${pw}, gen_salt('bf')) where id = ${uid}`;
    } else {
      const [u] = await sysSql<{ id: string }[]>`
        insert into auth.users(id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
        values (gen_random_uuid(), ${email}, crypt(${pw}, gen_salt('bf')), now(), ${sysSql.json({ full_name: name })}, now(), now())
        returning id`;
      uid = u.id;
    }
    await sysSql`
      insert into profiles(id, email, full_name, phone, role, all_properties, is_demo)
      values (${uid}, ${email}, ${name}, '+91 98200 10000', ${role}, ${role === "super_admin" || !!allProps}, true)
      on conflict (id) do update set role = excluded.role, all_properties = excluded.all_properties`;
    U[role === "owner" ? email : role] = uid;
  }

  const getOrInsertOwner = async (name: string, email: string, phone: string, address: string, pan: string, bankName: string, bankAcc: string, ifsc: string, upi: string, profileEmail: string) => {
    const [existing] = await sysSql<{ id: string }[]>`select id from owners where lower(email) = lower(${email}) limit 1`;
    if (existing) return existing.id;
    const [o] = await sysSql<{ id: string }[]>`insert into owners(full_name, email, phone, address, pan, bank_account_name, bank_account_number, bank_ifsc, upi_id, profile_id, is_demo)
      values (${name}, ${email}, ${phone}, ${address}, ${pan}, ${bankName}, ${bankAcc}, ${ifsc}, ${upi}, ${U[profileEmail]}, true) returning id`;
    return o.id;
  };

  const o1Id = await getOrInsertOwner('Rajesh Mehta','owner.mehta@stayra.demo','+91 98201 11001','Bandra West, Mumbai','AAAPM1234A','Rajesh Mehta','50100234567890','HDFC0000123','rajeshmehta@hdfcbank','owner.mehta@stayra.demo');
  const o2Id = await getOrInsertOwner('Ananya Rao','owner.rao@stayra.demo','+91 98201 11002','Koregaon Park, Pune','AAAPR5678B','Ananya Rao','002101234567','ICIC0000021','ananyarao@icici','owner.rao@stayra.demo');
  const o3Id = await getOrInsertOwner('Vikramaditya Malhotra','owner.malhotra@stayra.demo','+91 98201 11003','Defence Colony, New Delhi','AAAPM9012C','V Malhotra Hospitality','919010012345678','UTIB0000045','vmalhotra@axis','owner.malhotra@stayra.demo');

  const getOrInsertProperty = async (name: string, category: string, ownerId: string, address: string, city: string, state: string, pincode: string, cap: number) => {
    const [existing] = await sysSql<{ id: string }[]>`select id from properties where lower(name) = lower(${name}) limit 1`;
    if (existing) return existing.id;
    const [p] = await sysSql<{ id: string }[]>`insert into properties(name, category, status, owner_id, manager_id, address, city, state, pincode, guest_capacity, check_in_time, check_out_time, is_demo, created_by)
      values (${name}, ${category}::property_category, 'active', ${ownerId}, ${U.property_manager}, ${address}, ${city}, ${state}, ${pincode}, ${cap}, '14:00', '11:00', true, ${U.super_admin}) returning id`;
    return p.id;
  };

  const p1Id = await getOrInsertProperty('STAYRA Mountain Retreat','resort', o1Id,'Old Mumbai–Pune Hwy, Tungarli','Lonavala','Maharashtra','410401', 18);
  const p2Id = await getOrInsertProperty('STAYRA City Stay','serviced_apartment', o2Id,'Lane 7, Koregaon Park','Pune','Maharashtra','411001', 20);
  const p3Id = await getOrInsertProperty('STAYRA Premium Villa','villa', o3Id,'Awas Beach Road','Alibaug','Maharashtra','402201', 10);

  for (const pid of [p1Id, p2Id, p3Id]) {
    for (const r of ["admin", "property_manager", "operations", "housekeeping"]) {
      await sysSql`insert into user_property_access(user_id, property_id, assigned_by) values (${U[r]}, ${pid}, ${U.super_admin}) on conflict do nothing`;
    }
  }

  const getOrInsertUnit = async (pid: string, name: string, category: string, maxGuests: number, rate: number, sortOrder: number) => {
    const [existing] = await sysSql<{ id: string }[]>`select id from property_units where property_id = ${pid} and name = ${name} limit 1`;
    if (existing) return existing.id;
    const [u] = await sysSql<{ id: string }[]>`insert into property_units(property_id, name, room_category, max_guests, base_rate, sort_order)
      values (${pid}, ${name}, ${category}, ${maxGuests}, ${rate}, ${sortOrder}) returning id`;
    return u.id;
  };

  const u1Id = await getOrInsertUnit(p1Id, 'Valley View 101', 'Valley View Suite', 3, 6500, 1);
  await getOrInsertUnit(p1Id, 'Valley View 102', 'Valley View Suite', 3, 6500, 2);
  await getOrInsertUnit(p1Id, 'Deluxe 201', 'Deluxe Room', 2, 4800, 3);

  const u2Id = await getOrInsertUnit(p2Id, 'Studio 101', 'Studio Apartment', 2, 3400, 1);
  await getOrInsertUnit(p2Id, 'One-Bed 201', '1BHK Suite', 4, 4600, 2);

  const u3Id = await getOrInsertUnit(p3Id, 'Entire 4BHK Pool Villa', 'Luxury Villa', 10, 24000, 1);

  await sysSql`insert into revenue_share_agreements(property_id, version, stayra_pct, owner_pct, effective_from, settlement_frequency, expense_policy, include_unpaid_expenses, created_by)
    values (${p1Id}, 1, 35, 65, '2026-01-01', 'monthly', 'all_approved', false, ${U.super_admin}),
           (${p2Id}, 1, 40, 60, '2026-01-01', 'monthly', 'all_approved', false, ${U.super_admin}),
           (${p3Id}, 1, 50, 50, '2026-01-01', 'monthly', 'all_approved', false, ${U.super_admin})
    on conflict (property_id, version) do nothing`;

  const [{ leadCount }] = await sysSql<{ leadCount: number }[]>`select count(*)::int as leadCount from leads`;
  if (leadCount === 0) {
    const demoLeads = [
      {
        guest_name: "Rohan & Priya Deshmukh", guest_phone: "+91 98204 55112", guest_email: "rohan.deshmukh@gmail.com", guest_city: "Mumbai",
        source: "whatsapp", source_detail: "Direct WhatsApp inquiry", status: "negotiation", temperature: "hot",
        property_id: p3Id, unit_id: u3Id, check_in: addDays(t, 4), check_out: addDays(t, 7), adults: 6, children: 2,
        budget: 55000, quoted_amount: 58500, special_requests: "Private pool heating, bonfire + BBQ setup on Saturday",
        notes: "Family reunion group. Ready to pay 50% advance today.",
        next_follow_up_at: `${t}T15:30:00+05:30`, follow_up_note: "Call Rohan to share UPI QR and confirm 50% advance payment",
        assigned_to: U.property_manager,
      },
      {
        guest_name: "Karanveer Malhotra", guest_phone: "+91 98111 77890", guest_email: "karan.m@outlook.com", guest_city: "Delhi NCR",
        source: "instagram", source_detail: "Mountain Retreat Reel", status: "quoted", temperature: "hot",
        property_id: p1Id, unit_id: u1Id, check_in: addDays(t, 6), check_out: addDays(t, 9), adults: 2, children: 0,
        budget: 24000, quoted_amount: 22500, special_requests: "Anniversary room decor & candlelight dinner",
        notes: "Sent PDF brochure & Valley View Suite tariff on WhatsApp.",
        next_follow_up_at: `${t}T11:00:00+05:30`, follow_up_note: "Follow up on quote sent yesterday — confirm flight timings",
        assigned_to: U.admin,
      },
      {
        guest_name: "Ananya Nair (TechCorp Offsite)", guest_phone: "+91 99001 44210", guest_email: "ananya.nair@techcorp.in", guest_city: "Bengaluru",
        source: "website", source_detail: "Corporate inquiry form", status: "follow_up", temperature: "hot",
        property_id: p1Id, unit_id: u1Id, check_in: addDays(t, 10), check_out: addDays(t, 13), adults: 8, children: 0,
        budget: 85000, quoted_amount: 82000, special_requests: "High-speed Wi-Fi, projector setup, GST invoice required",
        notes: "Leadership retreat for 8 executives. Waiting for finance PO approval.",
        next_follow_up_at: `${addDays(t, -1)}T16:00:00+05:30`, follow_up_note: "Check if finance team approved the proforma invoice",
        assigned_to: U.super_admin,
      },
      {
        guest_name: "Siddharth & Meera Kulkarni", guest_phone: "+91 97654 32109", guest_email: "sid.kulkarni@yahoo.com", guest_city: "Pune",
        source: "phone_call", source_detail: "Inbound reservation desk", status: "new", temperature: "warm",
        property_id: p3Id, unit_id: u3Id, check_in: addDays(t, 12), check_out: addDays(t, 14), adults: 4, children: 1,
        budget: 36000, quoted_amount: null, special_requests: "Jain food options for dinner & breakfast",
        notes: "Inquired about weekend villa availability.",
        next_follow_up_at: `${t}T17:00:00+05:30`, follow_up_note: "Send weekend villa tariff and Jain meal menu on WhatsApp",
        assigned_to: U.property_manager,
      },
      {
        guest_name: "Devika Sharma", guest_phone: "+91 98450 91234", guest_email: "devika.s@gmail.com", guest_city: "Hyderabad",
        source: "airbnb_inquiry", source_detail: "Airbnb message thread", status: "contacted", temperature: "warm",
        property_id: p2Id, unit_id: u2Id, check_in: addDays(t, 5), check_out: addDays(t, 8), adults: 2, children: 1,
        budget: 16000, quoted_amount: 15000, special_requests: "Early check-in at 11 AM",
        notes: "Shared direct booking rate.",
        next_follow_up_at: `${addDays(t, 1)}T11:30:00+05:30`, follow_up_note: "Check if guest wants to lock the room for next week",
        assigned_to: U.operations,
      },
    ];

    for (const l of demoLeads) {
      const [ins] = await sysSql<{ id: string }[]>`
        insert into leads (
          guest_name, guest_phone, guest_whatsapp, guest_email, guest_city,
          source, source_detail, status, temperature, property_id, unit_id,
          check_in, check_out, adults, children, rooms_needed,
          budget, quoted_amount, special_requests, notes,
          next_follow_up_at, follow_up_note, reminder_completed,
          assigned_to, is_demo, created_by
        ) values (
          ${l.guest_name}, ${l.guest_phone}, ${l.guest_phone}, ${l.guest_email}, ${l.guest_city},
          ${l.source}::lead_source, ${l.source_detail}, ${l.status}::lead_status, ${l.temperature}::lead_temperature, ${l.property_id}, ${l.unit_id},
          ${l.check_in}, ${l.check_out}, ${l.adults}, ${l.children}, 1,
          ${l.budget}, ${l.quoted_amount}, ${l.special_requests}, ${l.notes},
          ${l.next_follow_up_at}, ${l.follow_up_note}, false,
          ${l.assigned_to}, true, ${U.super_admin}
        ) returning id`;
      await sysSql`
        insert into lead_activities (lead_id, activity_type, summary, new_status, quoted_amount, follow_up_at, created_by, created_by_name)
        values (${ins.id}, 'quote_sent', ${l.notes}, ${l.status}::lead_status, ${l.quoted_amount}, ${l.next_follow_up_at}, ${l.assigned_to}, 'STAYRA Reservations')`;
    }
  }
}
