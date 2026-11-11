-- =============================================================================
-- STAYRA PMS — Guest Inquiry Leads & CRM Module
-- Pipeline, Follow-up Reminders, Activity Timeline, and Booking Conversion
-- =============================================================================

do $$ begin
  create type lead_status as enum ('new','contacted','quoted','follow_up','negotiation','won','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_temperature as enum ('hot','warm','cold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum (
    'whatsapp','phone_call','instagram','facebook','website','google',
    'airbnb_inquiry','makemytrip_inquiry','referral','repeat_guest','travel_agent','walk_in','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_activity_type as enum (
    'note','call','whatsapp','email','quote_sent','status_change','reminder_set','converted'
  );
exception when duplicate_object then null; end $$;

create sequence if not exists lead_code_seq start 1001;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text not null unique default 'LEAD-' || lpad(nextval('lead_code_seq')::text, 4, '0'),
  guest_name text not null,
  guest_phone text not null,
  guest_whatsapp text,
  guest_email text,
  guest_city text,
  source lead_source not null default 'whatsapp',
  source_detail text,
  status lead_status not null default 'new',
  temperature lead_temperature not null default 'warm',
  property_id uuid references properties(id),
  unit_id uuid references property_units(id),
  check_in date,
  check_out date,
  adults int not null default 2 check (adults >= 1),
  children int not null default 0 check (children >= 0),
  rooms_needed int not null default 1 check (rooms_needed >= 1),
  budget numeric(14,2) check (budget is null or budget >= 0),
  quoted_amount numeric(14,2) check (quoted_amount is null or quoted_amount >= 0),
  special_requests text,
  notes text,
  lost_reason text,
  next_follow_up_at timestamptz,
  follow_up_note text,
  reminder_completed boolean not null default false,
  last_contacted_at timestamptz,
  assigned_to uuid references profiles(id),
  converted_booking_id uuid references bookings(id),
  converted_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out is null or check_in is null or check_out > check_in)
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_property on leads(property_id);
create index if not exists idx_leads_assigned on leads(assigned_to);
create index if not exists idx_leads_followup on leads(next_follow_up_at) where not reminder_completed and status not in ('won','lost');
create index if not exists idx_leads_created on leads(created_at desc);

create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  activity_type lead_activity_type not null default 'note',
  summary text not null,
  old_status lead_status,
  new_status lead_status,
  quoted_amount numeric(14,2),
  follow_up_at timestamptz,
  created_by uuid references profiles(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead on lead_activities(lead_id, created_at desc);

drop trigger if exists trg_leads_touch on leads;
create trigger trg_leads_touch before update on leads for each row execute function app.touch_updated_at();

create or replace function app.lead_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if new.status <> 'new' and new.last_contacted_at is null then
      new.last_contacted_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status <> 'new' then
        new.last_contacted_at := now();
      end if;
      if new.status in ('won','lost') then
        new.reminder_completed := true;
      end if;
    end if;
    if new.next_follow_up_at is distinct from old.next_follow_up_at and new.next_follow_up_at is not null then
      new.reminder_completed := false;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_lead_guard on leads;
create trigger trg_lead_guard before insert or update on leads for each row execute function app.lead_guard();

create or replace function app.lead_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prop text;
begin
  if new.property_id is not null then
    select name into v_prop from properties where id = new.property_id;
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.assigned_to is distinct from auth.uid() then
    insert into notifications(user_id, type, title, body, link, severity)
    values (
      new.assigned_to,
      'lead_assigned',
      'Lead assigned: ' || new.lead_code || ' (' || new.guest_name || ')',
      coalesce(v_prop, 'Any property') || ' · ' || new.guest_phone,
      '/leads/' || new.id,
      case when new.temperature = 'hot' then 'warning' else 'info' end
    );
  end if;
  return null;
end $$;

drop trigger if exists trg_lead_after on leads;
create trigger trg_lead_after after insert or update on leads for each row execute function app.lead_after();

drop trigger if exists trg_audit_leads on leads;
create trigger trg_audit_leads after insert or update or delete on leads for each row execute function app.audit();

-- Grants & Row Level Security
grant select, insert, update on leads, lead_activities to authenticated;
grant all on leads, lead_activities to service_role;
grant usage, select on sequence lead_code_seq to authenticated, service_role;

alter table leads enable row level security;
alter table leads force row level security;
alter table lead_activities enable row level security;
alter table lead_activities force row level security;

create or replace function app.can_access_lead(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.r('super_admin','admin','property_manager','operations','accountant','auditor')
    and (pid is null or app.can_access_property(pid))
$$;

drop policy if exists leads_select on leads;
create policy leads_select on leads for select using (app.can_access_lead(property_id));

drop policy if exists leads_insert on leads;
create policy leads_insert on leads for insert with check (
  app.r('super_admin','admin','property_manager','operations')
  and (property_id is null or app.can_access_property(property_id))
);

drop policy if exists leads_update on leads;
create policy leads_update on leads for update using (
  app.r('super_admin','admin','property_manager','operations')
  and (property_id is null or app.can_access_property(property_id))
);

drop policy if exists lead_activities_select on lead_activities;
create policy lead_activities_select on lead_activities for select using (
  exists (select 1 from leads l where l.id = lead_activities.lead_id and app.can_access_lead(l.property_id))
);

drop policy if exists lead_activities_insert on lead_activities;
create policy lead_activities_insert on lead_activities for insert with check (
  app.r('super_admin','admin','property_manager','operations')
  and exists (select 1 from leads l where l.id = lead_activities.lead_id and app.can_access_lead(l.property_id))
);
