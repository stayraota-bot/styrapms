-- =============================================================================
-- STAYRA PMS — Core schema
-- Currency: INR (numeric(14,2)). Timezone: Asia/Kolkata.
-- Financial rows are never hard-deleted: they are voided or reversed.
-- =============================================================================
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin execute format('alter database %I set timezone to %L', current_database(), 'Asia/Kolkata'); end $$;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------- enums ----
create type app_role as enum ('super_admin','admin','property_manager','accountant','operations','housekeeping','owner','auditor');
create type property_category as enum ('hotel','resort','villa','homestay','serviced_apartment','guest_house','hostel','other');
create type property_status as enum ('onboarding','active','inactive','archived');
create type settlement_frequency as enum ('booking','weekly','monthly','quarterly','custom');
create type expense_policy as enum ('all_approved','selected_categories','booking_specific_only','property_level_only');
create type allocation_method as enum ('equal','by_units','manual');
create type booking_source as enum ('direct','airbnb','booking_com','makemytrip','goibibo','agoda','expedia','walk_in','travel_agent','corporate','other');
create type booking_status as enum ('pending','confirmed','checked_in','checked_out','cancelled','no_show');
create type payment_method as enum ('cash','upi','bank_transfer','card','ota_collection','cheque','other');
create type payment_entry_type as enum ('advance','partial','full','refund','reversal');
create type collector as enum ('property','ota','stayra');
create type collection_status as enum ('collected','receivable');
create type record_status as enum ('active','void');
create type expense_scope as enum ('booking','property','shared');
create type expense_bearer as enum ('pool','owner','stayra');
create type expense_payer as enum ('stayra','owner','property_cash','vendor_credit');
create type approval_status as enum ('pending','approved','rejected');
create type pay_status as enum ('unpaid','partially_paid','paid');
create type settlement_status as enum ('draft','submitted','approved','partially_paid','paid','void');
create type ticket_priority as enum ('low','medium','high','critical');
create type ticket_status as enum ('open','assigned','in_progress','resolved','closed');
create type hk_task_type as enum ('room_cleaning','checkout_cleaning','inspection','deep_cleaning');
create type hk_status as enum ('pending','assigned','in_progress','done','inspected');
create type room_readiness as enum ('ready','dirty','cleaning','inspection','out_of_order');
create type block_reason as enum ('maintenance','owner_use','renovation','closure','other');

-- ------------------------------------------------------------ sequences ----
create sequence property_code_seq;
create sequence owner_code_seq;
create sequence booking_code_seq start 1001;
create sequence income_code_seq start 1001;
create sequence expense_code_seq start 1001;
create sequence settlement_code_seq start 101;
create sequence ticket_code_seq start 101;
create sequence adjustment_code_seq start 101;

-- ---------------------------------------------------------- touch trigger --
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- =============================================================== people ====
create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  phone text,
  role app_role not null default 'operations',
  all_properties boolean not null default false,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  last_login_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_touch before update on profiles for each row execute function app.touch_updated_at();

create table login_history (
  id bigserial primary key,
  user_id uuid references profiles(id),
  email text,
  event text not null check (event in ('login','logout','failed_login','password_reset','deactivated','reactivated')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on login_history(user_id, created_at desc);

create table owners (
  id uuid primary key default gen_random_uuid(),
  owner_code text not null unique default 'OWN-' || lpad(nextval('owner_code_seq')::text, 4, '0'),
  full_name text not null,
  email text,
  phone text,
  address text,
  pan text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  profile_id uuid unique references profiles(id),
  notes text,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_owners_touch before update on owners for each row execute function app.touch_updated_at();

-- =========================================================== properties ====
create table properties (
  id uuid primary key default gen_random_uuid(),
  property_code text not null unique default 'PRP-' || lpad(nextval('property_code_seq')::text, 4, '0'),
  name text not null,
  category property_category not null default 'villa',
  address text,
  city text,
  state text,
  pincode text,
  location_url text,
  owner_id uuid not null references owners(id),
  manager_id uuid references profiles(id),
  guest_capacity int check (guest_capacity is null or guest_capacity >= 0),
  check_in_time time not null default '14:00',
  check_out_time time not null default '11:00',
  agreement_start date,
  agreement_end date,
  status property_status not null default 'active',
  cover_photo_path text,
  description text,
  is_demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_agreement_dates check (agreement_end is null or agreement_start is null or agreement_end >= agreement_start)
);
create unique index properties_name_uq on properties(lower(name));
create index on properties(owner_id);
create trigger trg_properties_touch before update on properties for each row execute function app.touch_updated_at();

create table user_property_access (
  user_id uuid not null references profiles(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
create index on user_property_access(property_id);

create table property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  name text not null,
  room_category text not null default 'Standard',
  max_guests int not null default 2 check (max_guests > 0),
  base_rate numeric(14,2) not null default 0 check (base_rate >= 0),
  readiness room_readiness not null default 'ready',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, name)
);
create trigger trg_units_touch before update on property_units for each row execute function app.touch_updated_at();

-- ======================================================= documents ========
create table uploaded_documents (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'documents',
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  entity_type text not null,   -- property | booking | income | expense | settlement | agreement | ticket | adjustment | owner
  entity_id uuid,
  property_id uuid references properties(id),
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on uploaded_documents(entity_type, entity_id);

-- ================================================ revenue share agreements =
create table revenue_share_agreements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  version int not null,
  stayra_pct numeric(5,2) not null check (stayra_pct >= 0 and stayra_pct <= 100),
  owner_pct numeric(5,2) not null check (owner_pct >= 0 and owner_pct <= 100),
  effective_from date not null,
  effective_to date,                       -- inclusive; null = open-ended
  agreement_end_date date,
  settlement_frequency settlement_frequency not null default 'monthly',
  expense_policy expense_policy not null default 'all_approved',
  deductible_category_ids uuid[] not null default '{}',
  include_unpaid_expenses boolean not null default false,
  shared_allocation_method allocation_method not null default 'by_units',
  document_id uuid references uploaded_documents(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint agreement_pct_total check (stayra_pct + owner_pct = 100),
  constraint agreement_dates check (effective_to is null or effective_to >= effective_from),
  unique (property_id, version),
  constraint agreement_no_overlap exclude using gist (
    property_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table agreement_history (
  id bigserial primary key,
  agreement_id uuid not null references revenue_share_agreements(id),
  property_id uuid not null references properties(id),
  change_type text not null,
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- ============================================================== guests =====
create table guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  id_type text,
  id_number text,
  city text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on guests(lower(full_name));
create index on guests(phone);

-- ============================================================= bookings ====
create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default 'BK-' || lpad(nextval('booking_code_seq')::text, 6, '0'),
  property_id uuid not null references properties(id),
  unit_id uuid not null references property_units(id),
  guest_id uuid not null references guests(id),
  adults int not null default 1 check (adults >= 1),
  children int not null default 0 check (children >= 0),
  check_in date not null,
  check_out date not null,
  nights int generated always as (check_out - check_in) stored,
  source booking_source not null default 'direct',
  source_reference text,
  booked_at timestamptz not null default now(),
  room_amount numeric(14,2) not null default 0 check (room_amount >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  ota_commission numeric(14,2) not null default 0 check (ota_commission >= 0),
  cancellation_charge numeric(14,2) not null default 0 check (cancellation_charge >= 0),
  total_amount numeric(14,2) generated always as (room_amount - discount + tax_amount) stored,
  status booking_status not null default 'confirmed',
  ota_collects_payment boolean not null default false,
  notes text,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  is_demo boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_dates check (check_out > check_in),
  constraint booking_discount check (discount <= room_amount),
  -- Hard guarantee: no two confirmed/in-house/completed bookings overlap on the same room.
  constraint booking_no_overlap exclude using gist (
    unit_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('confirmed','checked_in','checked_out'))
);
create index on bookings(property_id, check_in);
create index on bookings(property_id, check_out);
create index on bookings(status);
create index on bookings(guest_id);
create trigger trg_bookings_touch before update on bookings for each row execute function app.touch_updated_at();

-- Immutable payment ledger.
create table booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  property_id uuid not null references properties(id),
  entry_type payment_entry_type not null,
  amount numeric(14,2) not null check (amount > 0),
  method payment_method not null,
  collected_by collector not null default 'property',
  reference text,
  paid_at timestamptz not null default now(),
  received_by text,
  reversal_of uuid references booking_payments(id),
  notes text,
  document_id uuid references uploaded_documents(id),
  idempotency_key text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint reversal_link check ((entry_type = 'reversal') = (reversal_of is not null))
);
create index on booking_payments(booking_id);
create unique index booking_payments_one_reversal on booking_payments(reversal_of) where reversal_of is not null;

-- =============================================================== income ====
create table income_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table income (
  id uuid primary key default gen_random_uuid(),
  txn_code text not null unique default 'INC-' || lpad(nextval('income_code_seq')::text, 6, '0'),
  property_id uuid not null references properties(id),
  booking_id uuid references bookings(id),
  category_id uuid not null references income_categories(id),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  txn_date date not null default current_date,
  payment_mode payment_method,
  payment_reference text,
  received_by text,
  collection_status collection_status not null default 'collected',
  collected_at timestamptz,
  notes text,
  document_id uuid references uploaded_documents(id),
  status record_status not null default 'active',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid,
  idempotency_key text unique,
  is_demo boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_void_reason check (status = 'active' or void_reason is not null)
);
create index on income(property_id, txn_date);
create index on income(booking_id);
create trigger trg_income_touch before update on income for each row execute function app.touch_updated_at();

-- ============================================================== vendors ====
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  gstin text,
  category text,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendors_name_uq on vendors(lower(name));
create unique index vendors_gstin_uq on vendors(gstin) where gstin is not null;

create table vendor_properties (
  vendor_id uuid not null references vendors(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  primary key (vendor_id, property_id)
);

-- ============================================================= expenses ====
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  group_name text not null check (group_name in ('Property','Staff','Maintenance','Other')),
  name text not null unique,
  default_deductible boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  category_id uuid not null references expense_categories(id),
  vendor_id uuid references vendors(id),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  gst_amount numeric(14,2) not null default 0 check (gst_amount >= 0),
  frequency text not null check (frequency in ('monthly','quarterly','yearly')),
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  next_run_date date not null,
  bearer expense_bearer not null default 'pool',
  is_deductible boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_code text not null unique default 'EXP-' || lpad(nextval('expense_code_seq')::text, 6, '0'),
  property_id uuid not null references properties(id),     -- primary / billing property
  booking_id uuid references bookings(id),
  category_id uuid not null references expense_categories(id),
  vendor_id uuid references vendors(id),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  gst_amount numeric(14,2) not null default 0 check (gst_amount >= 0),
  total_amount numeric(14,2) generated always as (amount + gst_amount) stored,
  bill_date date not null default current_date,
  due_date date,
  bill_number text,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_status pay_status not null default 'unpaid',
  payment_method payment_method,
  paid_by expense_payer not null default 'stayra',
  scope expense_scope not null default 'property',
  bearer expense_bearer not null default 'pool',
  is_deductible boolean not null default true,
  approval_status approval_status not null default 'pending',
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  recurring_id uuid references recurring_expenses(id),
  notes text,
  document_id uuid references uploaded_documents(id),
  status record_status not null default 'active',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid,
  idempotency_key text unique,
  is_demo boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_booking_scope check (scope <> 'booking' or booking_id is not null),
  constraint expense_paid_le_total check (paid_amount <= amount + gst_amount),
  constraint expense_void_reason check (status = 'active' or void_reason is not null),
  constraint expense_recurring_once unique (recurring_id, bill_date)
);
create index on expenses(property_id, bill_date);
create index on expenses(approval_status) where status = 'active';
create index on expenses(vendor_id);
create trigger trg_expenses_touch before update on expenses for each row execute function app.touch_updated_at();

-- How much of each expense belongs to each property (single row unless shared).
create table expense_allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  property_id uuid not null references properties(id),
  amount numeric(14,2) not null check (amount >= 0),
  basis text not null default 'direct',
  unique (expense_id, property_id)
);
create index on expense_allocations(property_id);

-- Immutable vendor-payment ledger for expenses.
create table expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method payment_method not null,
  reference text,
  notes text,
  idempotency_key text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on expense_payments(expense_id);

-- Documented corrections (signed). revenue: +increase / -decrease. expense: +adds cost / -reduces cost.
create table financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  adj_code text not null unique default 'ADJ-' || lpad(nextval('adjustment_code_seq')::text, 5, '0'),
  property_id uuid not null references properties(id),
  booking_id uuid references bookings(id),
  adj_date date not null default current_date,
  kind text not null check (kind in ('revenue','expense')),
  amount numeric(14,2) not null check (amount <> 0),
  reason text not null check (length(trim(reason)) >= 5),
  related_settlement_id uuid,
  document_id uuid references uploaded_documents(id),
  status record_status not null default 'active',
  void_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on financial_adjustments(property_id, adj_date);

-- ========================================================== settlements ====
create table settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_code text not null unique default 'STL-' || lpad(nextval('settlement_code_seq')::text, 5, '0'),
  property_id uuid not null references properties(id),
  owner_id uuid not null references owners(id),
  agreement_id uuid not null references revenue_share_agreements(id),
  mode text not null default 'period' check (mode in ('period','booking')),
  booking_id uuid references bookings(id),
  period_start date not null,
  period_end date not null,
  status settlement_status not null default 'draft',
  stayra_pct numeric(5,2) not null,
  owner_pct numeric(5,2) not null,
  booking_revenue numeric(14,2) not null default 0,
  additional_income numeric(14,2) not null default 0,
  revenue_adjustments numeric(14,2) not null default 0,
  gross_revenue numeric(14,2) not null default 0,
  deductible_expenses numeric(14,2) not null default 0,
  expense_adjustments numeric(14,2) not null default 0,
  net_distributable numeric(14,2) not null default 0,
  stayra_share numeric(14,2) not null default 0,
  owner_share numeric(14,2) not null default 0,
  owner_borne_recoveries numeric(14,2) not null default 0,
  previous_outstanding numeric(14,2) not null default 0,
  payments_made numeric(14,2) not null default 0,
  final_payable numeric(14,2) not null default 0,
  unpaid_expenses_included numeric(14,2) not null default 0,
  unpaid_expenses_excluded numeric(14,2) not null default 0,
  cash_collected numeric(14,2) not null default 0,
  gst_collected numeric(14,2) not null default 0,
  notes text,
  submitted_by uuid references profiles(id),
  submitted_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  void_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_period check (period_end >= period_start),
  constraint settlement_pct check (stayra_pct + owner_pct = 100),
  constraint settlement_split check (stayra_share + owner_share = net_distributable),
  constraint settlement_booking_mode check ((mode = 'booking') = (booking_id is not null))
);
create index on settlements(property_id, period_start);
create index on settlements(owner_id);

create table settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id),
  property_id uuid not null references properties(id),
  item_type text not null check (item_type in ('booking','cancellation','ota_commission','income','expense','unpaid_expense_excluded','owner_recovery','revenue_adjustment','expense_adjustment')),
  ref_id uuid not null,
  item_date date,
  description text not null,
  amount numeric(14,2) not null,
  is_active boolean not null default true
);
create index on settlement_items(settlement_id);
-- A booking / income / expense / adjustment can only sit in ONE live settlement: prevents double counting.
-- (property-aware so a shared expense can be settled once in EACH property it is allocated to)
create unique index settlement_items_no_double_count on settlement_items(item_type, ref_id, property_id)
  where is_active and item_type <> 'unpaid_expense_excluded';

create table settlement_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method payment_method not null,
  reference text,
  notes text,
  idempotency_key text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on settlement_payments(settlement_id);

-- ======================================================== operations =======
create table maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique default 'MT-' || lpad(nextval('ticket_code_seq')::text, 5, '0'),
  property_id uuid not null references properties(id),
  unit_id uuid references property_units(id),
  category text not null default 'General',
  title text not null,
  description text,
  priority ticket_priority not null default 'medium',
  status ticket_status not null default 'open',
  assigned_to uuid references profiles(id),
  reported_by uuid references profiles(id),
  expected_completion date,
  resolved_at timestamptz,
  photo_document_id uuid references uploaded_documents(id),
  blocks_room boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on maintenance_tickets(property_id, status);
create trigger trg_tickets_touch before update on maintenance_tickets for each row execute function app.touch_updated_at();

create table housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  unit_id uuid not null references property_units(id),
  booking_id uuid references bookings(id),
  task_type hk_task_type not null default 'room_cleaning',
  status hk_status not null default 'pending',
  assigned_to uuid references profiles(id),
  due_date date not null default current_date,
  notes text,
  completed_at timestamptz,
  inspected_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on housekeeping_tasks(property_id, due_date);
create index on housekeeping_tasks(assigned_to, status);
create trigger trg_hk_touch before update on housekeeping_tasks for each row execute function app.touch_updated_at();

create table blocked_dates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  unit_id uuid references property_units(id),         -- null = whole property
  start_date date not null,
  end_date date not null,                              -- exclusive (like check-out)
  reason block_reason not null,
  notes text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint block_dates check (end_date > start_date)
);
create index on blocked_dates(property_id, start_date);

-- Explicit high-demand designations (manual, events, seasons). Computed demand uses history.
create table demand_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id),          -- null = all properties
  name text not null,
  kind text not null check (kind in ('manual','event','season')),
  start_date date not null,
  end_date date not null,                              -- inclusive
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint demand_dates check (end_date >= start_date)
);

-- ===================================================== platform tables =====
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications(user_id, is_read, created_at desc);

create table audit_logs (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb
);
create index on audit_logs(occurred_at desc);
create index on audit_logs(table_name, record_id);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
