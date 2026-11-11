-- =============================================================================
-- STAYRA PMS — Business logic: identity helpers, integrity guards,
-- ledgers, revenue-sharing engine, settlement workflow, notifications, audit.
-- =============================================================================

-- --------------------------------------------------------- identity helpers
create or replace function app.uid() returns uuid language sql stable as $$ select auth.uid() $$;

create or replace function app.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles where id = auth.uid() and is_active), false)
$$;

create or replace function app.has_role(roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = any(roles) from profiles where id = auth.uid() and is_active), false)
$$;

-- Property visibility: super admin, "all properties" staff, explicit assignment, or owner of the property.
create or replace function app.can_access_property(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.is_active and (
      p.role = 'super_admin'
      or (p.all_properties and p.role <> 'owner')
      or (p.role <> 'owner' and exists (select 1 from user_property_access a where a.user_id = p.id and a.property_id = pid))
      or (p.role = 'owner' and exists (select 1 from properties pr join owners o on o.id = pr.owner_id where pr.id = pid and o.profile_id = p.id))
    )
  )
$$;

-- Financial data visibility (no housekeeping / operations).
create or replace function app.can_view_finance(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_access_property(pid) and app.has_role(array['super_admin','admin','property_manager','accountant','owner','auditor']::app_role[])
$$;

create or replace function app.can_write_finance(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_access_property(pid) and app.has_role(array['super_admin','admin','accountant']::app_role[])
$$;

create or replace function app.round_inr(x numeric) returns numeric language sql immutable as $$ select round(x, 2) $$;

create or replace function app.setting(k text, fallback jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = k), fallback)
$$;

-- ---------------------------------------------------------- notifications
create or replace function app.notify_property_users(pid uuid, roles app_role[], ntype text, ntitle text, nbody text, nlink text, nseverity text default 'info')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, type, title, body, link, severity)
  select p.id, ntype, ntitle, nbody, nlink, nseverity
  from profiles p
  where p.is_active and p.role = any(roles)
    and (p.id is distinct from auth.uid())
    and (p.role = 'super_admin' or p.all_properties
         or exists (select 1 from user_property_access a where a.user_id = p.id and a.property_id = pid));
end $$;

create or replace function app.notify_owner(pid uuid, ntype text, ntitle text, nbody text, nlink text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, type, title, body, link, severity)
  select o.profile_id, ntype, ntitle, nbody, nlink, 'info'
  from properties pr join owners o on o.id = pr.owner_id
  where pr.id = pid and o.profile_id is not null;
end $$;

-- ------------------------------------------------------------- audit trail
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text; v_email text;
begin
  v_id := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', '');
  select email into v_email from profiles where id = auth.uid();
  insert into audit_logs(actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), v_email, lower(tg_op), tg_table_name, v_id,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','user_property_access','owners','properties','property_units','revenue_share_agreements',
    'bookings','booking_payments','income','expenses','expense_allocations','expense_payments','financial_adjustments',
    'settlements','settlement_payments','vendors','blocked_dates','maintenance_tickets','app_settings','recurring_expenses','demand_rules']
  loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$I for each row execute function app.audit()', t);
  end loop;
end $$;

-- ------------------------------------------------------ immutability guards
create or replace function app.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable. Record a reversal / adjustment instead.', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger trg_booking_payments_immutable before update or delete on booking_payments for each row execute function app.forbid_change();
create trigger trg_expense_payments_immutable before update or delete on expense_payments for each row execute function app.forbid_change();
create trigger trg_settlement_payments_immutable before update or delete on settlement_payments for each row execute function app.forbid_change();
create trigger trg_audit_immutable before update or delete on audit_logs for each row execute function app.forbid_change();
create trigger trg_agreement_history_immutable before update or delete on agreement_history for each row execute function app.forbid_change();

create or replace function app.forbid_delete() returns trigger language plpgsql as $$
begin
  raise exception '% records cannot be deleted. Void or archive them instead.', tg_table_name using errcode = 'P0001';
end $$;
create trigger trg_bookings_nodelete before delete on bookings for each row execute function app.forbid_delete();
create trigger trg_income_nodelete before delete on income for each row execute function app.forbid_delete();
create trigger trg_expenses_nodelete before delete on expenses for each row execute function app.forbid_delete();
create trigger trg_adjust_nodelete before delete on financial_adjustments for each row execute function app.forbid_delete();
create trigger trg_settlements_nodelete before delete on settlements for each row execute function app.forbid_delete();
create trigger trg_agreements_nodelete before delete on revenue_share_agreements for each row execute function app.forbid_delete();
create trigger trg_properties_nodelete before delete on properties for each row execute function app.forbid_delete();

-- settlement_items: only the is_active flag may change (when a draft is voided).
create or replace function app.guard_settlement_items() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'settlement items cannot be deleted'; end if;
  if (to_jsonb(new) - 'is_active') <> (to_jsonb(old) - 'is_active') then
    raise exception 'settlement items are immutable';
  end if;
  return new;
end $$;
create trigger trg_settlement_items_guard before update or delete on settlement_items for each row execute function app.guard_settlement_items();

-- Is a source record locked inside a live (non-void) settlement?
create or replace function app.is_settled(p_type text, p_ref uuid, p_property uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from settlement_items where item_type = p_type and ref_id = p_ref and is_active
                 and (p_property is null or property_id = p_property))
$$;

-- ------------------------------------------------------------- bookings ----
create or replace function app.booking_guard() returns trigger language plpgsql as $$
declare v_conflict text;
begin
  if not exists (select 1 from property_units u where u.id = new.unit_id and u.property_id = new.property_id) then
    raise exception 'Room does not belong to the selected property' using errcode = 'P0001';
  end if;

  if new.status in ('confirmed','checked_in') and (tg_op = 'INSERT' or new.check_in <> old.check_in or new.check_out <> old.check_out
       or new.unit_id <> old.unit_id or old.status not in ('confirmed','checked_in')) then
    select b.reason::text into v_conflict from blocked_dates b
    where b.is_active and b.property_id = new.property_id and (b.unit_id is null or b.unit_id = new.unit_id)
      and daterange(b.start_date, b.end_date, '[)') && daterange(new.check_in, new.check_out, '[)')
    limit 1;
    if v_conflict is not null then
      raise exception 'Room is blocked (%) for part of these dates', v_conflict using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if (app.is_settled('booking', old.id) or app.is_settled('cancellation', old.id) or app.is_settled('ota_commission', old.id)) and (
         new.room_amount <> old.room_amount or new.discount <> old.discount or new.tax_amount <> old.tax_amount
      or new.ota_commission <> old.ota_commission or new.cancellation_charge <> old.cancellation_charge
      or new.status <> old.status or new.check_in <> old.check_in or new.check_out <> old.check_out or new.property_id <> old.property_id) then
      raise exception 'Booking % is included in an owner settlement; financial fields are locked. Use an adjustment entry.', old.booking_code using errcode = 'P0001';
    end if;
    if new.status <> old.status then
      if old.status in ('cancelled','no_show','checked_out') and new.status not in ('cancelled','no_show','checked_out') then
        raise exception 'Cannot reopen a % booking', old.status using errcode = 'P0001';
      end if;
      if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
      if new.status = 'checked_in' then new.checked_in_at := coalesce(new.checked_in_at, now()); end if;
      if new.status = 'checked_out' then new.checked_out_at := coalesce(new.checked_out_at, now()); end if;
      if new.status in ('cancelled','no_show') then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
    end if;
  elsif new.status = 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end $$;
create trigger trg_booking_guard before insert or update on bookings for each row execute function app.booking_guard();

create or replace function app.booking_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prop text; v_guest text; v_unit text;
begin
  select name into v_prop from properties where id = new.property_id;
  select full_name into v_guest from guests where id = new.guest_id;
  select name into v_unit from property_units where id = new.unit_id;
  if tg_op = 'INSERT' then
    perform app.notify_property_users(new.property_id, array['super_admin','admin','property_manager','operations']::app_role[],
      'booking_new', 'New booking ' || new.booking_code,
      v_guest || ' · ' || v_prop || ' · ' || to_char(new.check_in, 'DD Mon') || ' → ' || to_char(new.check_out, 'DD Mon'),
      '/bookings/' || new.id, 'info');
  elsif new.status <> old.status then
    if new.status = 'checked_out' then
      update property_units set readiness = 'dirty' where id = new.unit_id;
      insert into housekeeping_tasks(property_id, unit_id, booking_id, task_type, status, due_date, notes)
      values (new.property_id, new.unit_id, new.id, 'checkout_cleaning', 'pending', current_date, 'Auto-created at check-out of ' || new.booking_code);
      perform app.notify_property_users(new.property_id, array['housekeeping','property_manager']::app_role[],
        'housekeeping', 'Check-out cleaning: ' || v_unit, v_prop || ' · ' || new.booking_code, '/housekeeping', 'info');
    elsif new.status = 'cancelled' then
      perform app.notify_property_users(new.property_id, array['super_admin','admin','property_manager']::app_role[],
        'booking_cancelled', 'Booking cancelled ' || new.booking_code, v_guest || ' · ' || v_prop, '/bookings/' || new.id, 'warning');
    end if;
  end if;
  return null;
end $$;
create trigger trg_booking_after after insert or update on bookings for each row execute function app.booking_after();

create or replace function app.block_guard() returns trigger language plpgsql as $$
begin
  if new.is_active and exists (
    select 1 from bookings b where b.property_id = new.property_id
      and (new.unit_id is null or b.unit_id = new.unit_id)
      and b.status in ('confirmed','checked_in')
      and daterange(b.check_in, b.check_out, '[)') && daterange(new.start_date, new.end_date, '[)')) then
    raise exception 'Cannot block dates that overlap confirmed bookings. Move or cancel the bookings first.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_block_guard before insert or update on blocked_dates for each row execute function app.block_guard();

-- Booking payment ledger guard: reversal must match its original, refunds cannot exceed net received.
create or replace function app.booking_payment_guard() returns trigger language plpgsql as $$
declare v_orig booking_payments; v_net numeric; v_prop uuid;
begin
  select property_id into v_prop from bookings where id = new.booking_id;
  new.property_id := v_prop;
  if new.entry_type = 'reversal' then
    select * into v_orig from booking_payments where id = new.reversal_of;
    if v_orig.id is null or v_orig.booking_id <> new.booking_id then raise exception 'Invalid reversal target'; end if;
    if v_orig.entry_type = 'reversal' then raise exception 'A reversal cannot itself be reversed'; end if;
    if new.amount <> v_orig.amount then raise exception 'Reversal amount must equal the original entry (%)', v_orig.amount; end if;
  elsif new.entry_type = 'refund' then
    select coalesce(sum(case when entry_type in ('advance','partial','full') then amount
                             when entry_type = 'refund' then -amount
                             when entry_type = 'reversal' then -(select case when o.entry_type = 'refund' then -o.amount else o.amount end from booking_payments o where o.id = bp.reversal_of) end), 0)
      into v_net from booking_payments bp where booking_id = new.booking_id;
    if new.amount > v_net then raise exception 'Refund (%) exceeds net amount received (%)', new.amount, v_net using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger trg_booking_payment_guard before insert on booking_payments for each row execute function app.booking_payment_guard();

-- Guest folio & balance per booking.
create or replace view booking_financials with (security_invoker = true) as
with pay as (
  select bp.booking_id,
    sum(case when bp.entry_type in ('advance','partial','full') then bp.amount else 0 end) as received,
    sum(case when bp.entry_type = 'refund' then bp.amount else 0 end) as refunded,
    sum(case when bp.entry_type = 'reversal' then (case when o.entry_type = 'refund' then -o.amount else o.amount end) else 0 end) as reversed,
    sum(case when bp.entry_type in ('advance','partial','full') and bp.collected_by = 'ota' then bp.amount else 0 end) as ota_collected
  from booking_payments bp left join booking_payments o on o.id = bp.reversal_of
  group by bp.booking_id
), extras as (
  select booking_id, sum(amount) as extras from income where status = 'active' and booking_id is not null group by booking_id
)
select b.id as booking_id, b.property_id,
  b.total_amount as room_total,
  coalesce(e.extras, 0) as extras_total,
  case when b.status in ('cancelled','no_show') then b.cancellation_charge else b.total_amount + coalesce(e.extras, 0) end as amount_due,
  coalesce(p.received, 0) as received,
  coalesce(p.refunded, 0) as refunded,
  coalesce(p.reversed, 0) as reversed,
  coalesce(p.received, 0) - coalesce(p.refunded, 0) - coalesce(p.reversed, 0) as net_paid,
  coalesce(p.ota_collected, 0) as ota_collected,
  (case when b.status in ('cancelled','no_show') then b.cancellation_charge else b.total_amount + coalesce(e.extras, 0) end)
    - (coalesce(p.received, 0) - coalesce(p.refunded, 0) - coalesce(p.reversed, 0)) as balance_due,
  case
    when (coalesce(p.received, 0) - coalesce(p.refunded, 0) - coalesce(p.reversed, 0)) <= 0 and coalesce(p.refunded,0) > 0 then 'refunded'
    when (coalesce(p.received, 0) - coalesce(p.refunded, 0) - coalesce(p.reversed, 0)) <= 0 then 'unpaid'
    when (coalesce(p.received, 0) - coalesce(p.refunded, 0) - coalesce(p.reversed, 0)) <
         (case when b.status in ('cancelled','no_show') then b.cancellation_charge else b.total_amount + coalesce(e.extras, 0) end) then 'partially_paid'
    when (coalesce(p.received, 0) - coalesce(p.refunded, 0) - coalesce(p.reversed, 0)) =
         (case when b.status in ('cancelled','no_show') then b.cancellation_charge else b.total_amount + coalesce(e.extras, 0) end) then 'paid'
    else 'overpaid'
  end as payment_status
from bookings b left join pay p on p.booking_id = b.id left join extras e on e.booking_id = b.id;

-- --------------------------------------------------------- income guards ---
create or replace function app.income_guard() returns trigger language plpgsql as $$
begin
  if new.booking_id is not null and not exists (select 1 from bookings where id = new.booking_id and property_id = new.property_id) then
    raise exception 'Booking does not belong to this property' using errcode = 'P0001';
  end if;
  if new.collection_status = 'collected' and new.collected_at is null then new.collected_at := now(); end if;
  if tg_op = 'UPDATE' and app.is_settled('income', old.id) and (
     new.amount <> old.amount or new.property_id <> old.property_id or new.txn_date <> old.txn_date or new.status <> old.status
     or new.category_id <> old.category_id) then
    raise exception 'Income % is included in an owner settlement and is locked. Use an adjustment entry.', old.txn_code using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.status = 'void' and old.status = 'active' then
    new.voided_at := now(); new.voided_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and old.status = 'void' and new.status = 'active' then
    raise exception 'Voided records cannot be restored; create a new entry.';
  end if;
  return new;
end $$;
create trigger trg_income_guard before insert or update on income for each row execute function app.income_guard();

-- -------------------------------------------------------- expense guards ---
create or replace function app.expense_guard() returns trigger language plpgsql as $$
begin
  if new.booking_id is not null and not exists (select 1 from bookings where id = new.booking_id and property_id = new.property_id) then
    raise exception 'Booking does not belong to this property' using errcode = 'P0001';
  end if;
  if new.scope = 'booking' and new.booking_id is null then raise exception 'Booking-specific expenses need a booking'; end if;
  if new.bearer <> 'pool' then new.is_deductible := false; end if;
  new.payment_status := case when new.paid_amount <= 0 then 'unpaid'
                             when new.paid_amount < new.amount + new.gst_amount then 'partially_paid' else 'paid' end;
  if tg_op = 'UPDATE' then
    if (app.is_settled('expense', old.id) or app.is_settled('owner_recovery', old.id)) and (
        new.amount <> old.amount or new.gst_amount <> old.gst_amount or new.property_id <> old.property_id or new.bill_date <> old.bill_date
     or new.bearer <> old.bearer or new.is_deductible <> old.is_deductible or new.scope <> old.scope or new.status <> old.status
     or new.approval_status <> old.approval_status or new.category_id <> old.category_id) then
      raise exception 'Expense % is included in an owner settlement and is locked. Use an adjustment entry.', old.expense_code using errcode = 'P0001';
    end if;
    if old.approval_status = 'approved' and (new.amount <> old.amount or new.gst_amount <> old.gst_amount or new.property_id <> old.property_id) then
      -- material change after approval → back to pending
      new.approval_status := 'pending'; new.approved_by := null; new.approved_at := null;
    end if;
    if new.approval_status = 'approved' and old.approval_status <> 'approved' then
      if not app.has_role(array['super_admin','accountant']::app_role[]) and auth.uid() is not null then
        raise exception 'Only Super Admin or Accountant can approve expenses' using errcode = '42501';
      end if;
      new.approved_by := auth.uid(); new.approved_at := now();
    end if;
    if new.status = 'void' and old.status = 'active' then new.voided_at := now(); new.voided_by := auth.uid(); end if;
    if old.status = 'void' and new.status = 'active' then raise exception 'Voided records cannot be restored'; end if;
  elsif new.approval_status = 'approved' then
    if not app.has_role(array['super_admin','accountant']::app_role[]) and auth.uid() is not null then
      new.approval_status := 'pending';
    else
      new.approved_by := auth.uid(); new.approved_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger trg_expense_guard before insert or update on expenses for each row execute function app.expense_guard();

-- Keep a single direct allocation in sync for non-shared expenses.
create or replace function app.expense_allocate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.scope <> 'shared' then
    delete from expense_allocations where expense_id = new.id and property_id <> new.property_id;
    insert into expense_allocations(expense_id, property_id, amount, basis)
    values (new.id, new.property_id, new.total_amount, 'direct')
    on conflict (expense_id, property_id) do update set amount = excluded.amount, basis = 'direct';
  elsif tg_op = 'UPDATE' and (new.total_amount <> old.total_amount) then
    raise exception 'Re-allocate the shared expense after changing its amount';
  end if;
  if tg_op = 'INSERT' and new.approval_status = 'pending' then
    perform app.notify_property_users(new.property_id, array['super_admin','accountant']::app_role[], 'expense_approval',
      'Expense awaiting approval ' || new.expense_code, new.description || ' · ₹' || to_char(new.total_amount, 'FM99,99,99,990.00'),
      '/expenses?status=pending', 'warning');
  end if;
  return null;
end $$;
create trigger trg_expense_allocate after insert or update on expenses for each row execute function app.expense_allocate();

-- Split a shared expense between properties: equal, by number of active units, or manual amounts.
create or replace function allocate_shared_expense(p_expense uuid, p_property_ids uuid[], p_method allocation_method, p_manual numeric[] default null)
returns void language plpgsql as $$
declare e expenses; v_total_weight numeric; v_running numeric := 0; i int; v_n int; v_amt numeric; v_weights numeric[] := '{}';
begin
  select * into e from expenses where id = p_expense for update;
  if e.id is null then raise exception 'Expense not found'; end if;
  if e.scope <> 'shared' then raise exception 'Only shared expenses can be allocated'; end if;
  if app.is_settled('expense', e.id) then raise exception 'Expense already settled'; end if;
  v_n := coalesce(array_length(p_property_ids, 1), 0);
  if v_n < 2 then raise exception 'Choose at least two properties'; end if;
  for i in 1..v_n loop
    v_weights := v_weights || case p_method
      when 'equal' then 1::numeric
      when 'by_units' then (select count(*)::numeric from property_units where property_id = p_property_ids[i] and is_active)
      else p_manual[i] end;
  end loop;
  select sum(w) into v_total_weight from unnest(v_weights) w;
  if v_total_weight is null or v_total_weight <= 0 then raise exception 'Allocation weights must be positive'; end if;
  if p_method = 'manual' and v_total_weight <> e.total_amount then
    raise exception 'Manual allocations (%) must add up to the expense total (%)', v_total_weight, e.total_amount;
  end if;
  delete from expense_allocations where expense_id = e.id;
  for i in 1..v_n loop
    if i < v_n then v_amt := app.round_inr(e.total_amount * v_weights[i] / v_total_weight);
    else v_amt := e.total_amount - v_running; end if;     -- last share absorbs rounding
    v_running := v_running + v_amt;
    insert into expense_allocations(expense_id, property_id, amount, basis) values (e.id, p_property_ids[i], v_amt, p_method::text);
  end loop;
end $$;

-- Vendor payments update the expense's paid amount.
create or replace function app.expense_payment_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric;
begin
  select total_amount into v_total from expenses where id = new.expense_id;
  select coalesce(sum(amount), 0) into v_paid from expense_payments where expense_id = new.expense_id;
  if v_paid > v_total then raise exception 'Payments (%) would exceed the bill total (%)', v_paid, v_total using errcode = 'P0001'; end if;
  update expenses set paid_amount = v_paid, payment_method = new.method where id = new.expense_id;
  return null;
end $$;
create trigger trg_expense_payment_after after insert on expense_payments for each row execute function app.expense_payment_after();

-- Recurring expense generator (idempotent per recurring rule + bill date).
create or replace function generate_recurring_expenses(p_as_of date default current_date) returns int
language plpgsql as $$
declare r recurring_expenses; v_count int := 0;
begin
  for r in select * from recurring_expenses where is_active and next_run_date <= p_as_of for update loop
    while r.next_run_date <= p_as_of loop
      insert into expenses(property_id, category_id, vendor_id, description, amount, gst_amount, bill_date, due_date,
                           bearer, is_deductible, recurring_id, approval_status, created_by)
      values (r.property_id, r.category_id, r.vendor_id, r.description || ' (' || to_char(r.next_run_date, 'Mon YYYY') || ')',
              r.amount, r.gst_amount, r.next_run_date, r.next_run_date + 10, r.bearer, r.is_deductible, r.id, 'pending', r.created_by)
      on conflict on constraint expense_recurring_once do nothing;
      if found then v_count := v_count + 1; end if;
      r.next_run_date := r.next_run_date + case r.frequency when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1 year' end;
    end loop;
    update recurring_expenses set next_run_date = r.next_run_date where id = r.id;
  end loop;
  return v_count;
end $$;

-- ----------------------------------------------------- agreements ----------
create or replace function app.agreement_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if exists (select 1 from settlements s where s.agreement_id = old.id and s.status <> 'void') then
      if (to_jsonb(new) - 'effective_to' - 'document_id' - 'notes' - 'agreement_end_date') <> (to_jsonb(old) - 'effective_to' - 'document_id' - 'notes' - 'agreement_end_date') then
        raise exception 'This agreement is used by settlements and cannot be changed. Create a new agreement version with a new effective date.' using errcode = 'P0001';
      end if;
      if new.effective_to is distinct from old.effective_to and exists (
        select 1 from settlements s where s.agreement_id = old.id and s.status <> 'void' and s.period_end > coalesce(new.effective_to, 'infinity'::date)) then
        raise exception 'Cannot end agreement before the end of a settlement that uses it' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_agreement_guard before update on revenue_share_agreements for each row execute function app.agreement_guard();

create or replace function app.agreement_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into agreement_history(agreement_id, property_id, change_type, snapshot, changed_by)
  values (new.id, new.property_id, lower(tg_op), to_jsonb(new), auth.uid());
  return null;
end $$;
create trigger trg_agreement_history after insert or update on revenue_share_agreements for each row execute function app.agreement_history_log();

-- Create a new agreement version. Closes the previous open agreement the day before.
create or replace function create_agreement(
  p_property uuid, p_stayra_pct numeric, p_effective_from date,
  p_frequency settlement_frequency default 'monthly', p_policy expense_policy default 'all_approved',
  p_include_unpaid boolean default false, p_categories uuid[] default '{}', p_end_date date default null,
  p_allocation allocation_method default 'by_units', p_notes text default null, p_document uuid default null)
returns uuid language plpgsql as $$
declare v_prev revenue_share_agreements; v_id uuid; v_version int;
begin
  if not app.is_super_admin() and auth.uid() is not null then
    raise exception 'Only Super Admin can configure revenue sharing' using errcode = '42501';
  end if;
  if p_stayra_pct is null or p_stayra_pct < 0 or p_stayra_pct > 100 then
    raise exception 'STAYRA percentage must be between 0 and 100' using errcode = 'P0001';
  end if;
  if p_stayra_pct <> round(p_stayra_pct, 2) then raise exception 'Use at most two decimal places' using errcode = 'P0001'; end if;
  if p_policy = 'selected_categories' and coalesce(array_length(p_categories, 1), 0) = 0 then
    raise exception 'Select at least one deductible expense category' using errcode = 'P0001';
  end if;
  perform 1 from properties where id = p_property for update;
  if exists (select 1 from revenue_share_agreements where property_id = p_property and effective_from >= p_effective_from) then
    raise exception 'A later or same-day agreement already exists. Choose an effective date after %',
      (select max(effective_from) from revenue_share_agreements where property_id = p_property) using errcode = 'P0001';
  end if;
  if exists (select 1 from settlements s where s.property_id = p_property and s.status <> 'void' and s.period_end >= p_effective_from) then
    raise exception 'Settlements already exist on or after %. New terms must start after the last settled period.', p_effective_from using errcode = 'P0001';
  end if;
  select * into v_prev from revenue_share_agreements where property_id = p_property and effective_to is null;
  if v_prev.id is not null then
    update revenue_share_agreements set effective_to = p_effective_from - 1 where id = v_prev.id;
  end if;
  select coalesce(max(version), 0) + 1 into v_version from revenue_share_agreements where property_id = p_property;
  insert into revenue_share_agreements(property_id, version, stayra_pct, owner_pct, effective_from, agreement_end_date,
    settlement_frequency, expense_policy, deductible_category_ids, include_unpaid_expenses, shared_allocation_method, notes, document_id, created_by)
  values (p_property, v_version, p_stayra_pct, 100 - p_stayra_pct, p_effective_from, p_end_date,
    p_frequency, p_policy, coalesce(p_categories, '{}'), p_include_unpaid, p_allocation, p_notes, p_document, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ================================================= REVENUE-SHARING ENGINE ==
-- Returns every line that would be included in a settlement.
-- Rules (documented in README › Revenue-sharing engine):
--   • Revenue is recognised on an EARNED basis: completed stays by check-out date, cancellation/no-show
--     charges by cancellation date, other income by transaction date. GST/taxes are pass-through (excluded).
--   • Any eligible item dated from the agreement's start up to period_end that is not already in a live
--     settlement is picked up (late entries are never lost and never double counted).
--   • Booking mode settles one checked-out booking with its folio extras, OTA commission and booking-specific expenses.
create or replace function settlement_lines(p_property uuid, p_start date, p_end date, p_booking uuid default null)
returns table(item_type text, ref_id uuid, item_date date, description text, amount numeric, counted boolean)
language plpgsql stable as $$
declare a revenue_share_agreements; v_from date;
begin
  select * into a from revenue_share_agreements r where r.property_id = p_property
    and r.effective_from <= p_end and coalesce(r.effective_to, 'infinity'::date) >= p_end;
  if a.id is null then raise exception 'No revenue-sharing agreement covers %', p_end using errcode = 'P0001'; end if;
  if p_start < a.effective_from then
    raise exception 'Period starts before the agreement in force (v%, from %). Split the settlement at the agreement change.', a.version, a.effective_from using errcode = 'P0001';
  end if;
  v_from := a.effective_from;

  return query
  -- completed stays: room revenue net of discount, excluding taxes
  select 'booking', b.id, b.check_out, b.booking_code || ' · ' || g.full_name || ' · ' || b.nights || ' night(s)', b.room_amount - b.discount, true
  from bookings b join guests g on g.id = b.guest_id
  where b.property_id = p_property and b.status = 'checked_out' and b.check_out between v_from and p_end
    and (p_booking is null or b.id = p_booking) and not app.is_settled('booking', b.id) and b.room_amount - b.discount > 0
  union all
  select 'cancellation', b.id, coalesce(b.cancelled_at::date, b.check_in), b.booking_code || ' · cancellation/no-show charge', b.cancellation_charge, true
  from bookings b
  where p_booking is null and b.property_id = p_property and b.status in ('cancelled','no_show') and b.cancellation_charge > 0
    and coalesce(b.cancelled_at::date, b.check_in) between v_from and p_end and not app.is_settled('cancellation', b.id)
  union all
  select 'ota_commission', b.id, case when b.status = 'checked_out' then b.check_out else coalesce(b.cancelled_at::date, b.check_in) end,
         b.booking_code || ' · OTA commission (' || b.source::text || ')', b.ota_commission, true
  from bookings b
  where b.property_id = p_property and b.ota_commission > 0
    and ((b.status = 'checked_out' and b.check_out between v_from and p_end)
      or (p_booking is null and b.status in ('cancelled','no_show') and coalesce(b.cancelled_at::date, b.check_in) between v_from and p_end))
    and (p_booking is null or b.id = p_booking) and not app.is_settled('ota_commission', b.id)
  union all
  select 'income', i.id, i.txn_date, i.txn_code || ' · ' || c.name || ' · ' || i.description, i.amount, true
  from income i join income_categories c on c.id = i.category_id
  where i.property_id = p_property and i.status = 'active' and not app.is_settled('income', i.id)
    and (case when p_booking is null then i.txn_date between v_from and p_end else i.booking_id = p_booking end)
  union all
  select 'revenue_adjustment', f.id, f.adj_date, f.adj_code || ' · ' || f.reason, f.amount, true
  from financial_adjustments f
  where p_booking is null and f.property_id = p_property and f.kind = 'revenue' and f.status = 'active'
    and f.adj_date between v_from and p_end and not app.is_settled('revenue_adjustment', f.id)
  union all
  select 'expense_adjustment', f.id, f.adj_date, f.adj_code || ' · ' || f.reason, f.amount, true
  from financial_adjustments f
  where p_booking is null and f.property_id = p_property and f.kind = 'expense' and f.status = 'active'
    and f.adj_date between v_from and p_end and not app.is_settled('expense_adjustment', f.id)
  union all
  -- deductible pool expenses (allocated share for this property), subject to agreement policy
  select case when e.payment_status = 'paid' or a.include_unpaid_expenses then 'expense' else 'unpaid_expense_excluded' end,
         e.id, e.bill_date,
         e.expense_code || ' · ' || c.name || ' · ' || e.description || case when e.payment_status <> 'paid' then ' (' || replace(e.payment_status::text, '_', ' ') || ')' else '' end,
         al.amount,
         (e.payment_status = 'paid' or a.include_unpaid_expenses)
  from expenses e
  join expense_allocations al on al.expense_id = e.id and al.property_id = p_property
  join expense_categories c on c.id = e.category_id
  where e.status = 'active' and e.approval_status = 'approved' and e.bearer = 'pool' and e.is_deductible
    and not app.is_settled('expense', e.id, p_property)
    and (case when p_booking is null then e.bill_date between v_from and p_end else e.booking_id = p_booking end)
    and (case a.expense_policy
          when 'all_approved' then true
          when 'selected_categories' then e.category_id = any(a.deductible_category_ids)
          when 'booking_specific_only' then e.scope = 'booking'
          when 'property_level_only' then e.scope in ('property','shared') end)
  union all
  -- owner-borne costs paid by STAYRA / property cash: recovered from the owner's share
  select 'owner_recovery', e.id, e.bill_date, e.expense_code || ' · ' || c.name || ' · ' || e.description || ' (owner-borne)', al.amount, true
  from expenses e
  join expense_allocations al on al.expense_id = e.id and al.property_id = p_property
  join expense_categories c on c.id = e.category_id
  where e.status = 'active' and e.approval_status = 'approved' and e.bearer = 'owner' and e.paid_by <> 'owner'
    and not app.is_settled('owner_recovery', e.id, p_property)
    and (case when p_booking is null then e.bill_date between v_from and p_end else e.booking_id = p_booking end);
end $$;

-- Pure calculation (no writes): used for previews, booking-level and custom-period views.
create or replace function preview_settlement(p_property uuid, p_start date, p_end date, p_booking uuid default null)
returns jsonb language plpgsql stable as $$
declare a revenue_share_agreements; r record; v jsonb;
  v_booking numeric := 0; v_income numeric := 0; v_rev_adj numeric := 0; v_exp numeric := 0; v_ota numeric := 0;
  v_exp_adj numeric := 0; v_rec numeric := 0; v_unpaid_inc numeric := 0; v_unpaid_exc numeric := 0;
  v_gross numeric; v_ded numeric; v_net numeric; v_stayra numeric; v_owner numeric; v_prev numeric; v_owner_id uuid; v_cash numeric; v_gst numeric;
begin
  select * into a from revenue_share_agreements x where x.property_id = p_property
    and x.effective_from <= p_end and coalesce(x.effective_to, 'infinity'::date) >= p_end;
  if a.id is null then raise exception 'No revenue-sharing agreement covers %', p_end using errcode = 'P0001'; end if;
  select owner_id into v_owner_id from properties where id = p_property;

  for r in select * from settlement_lines(p_property, p_start, p_end, p_booking) loop
    case r.item_type
      when 'booking' then v_booking := v_booking + r.amount;
      when 'cancellation' then v_booking := v_booking + r.amount;
      when 'income' then v_income := v_income + r.amount;
      when 'revenue_adjustment' then v_rev_adj := v_rev_adj + r.amount;
      when 'ota_commission' then v_ota := v_ota + r.amount;
      when 'expense' then v_exp := v_exp + r.amount;
      when 'expense_adjustment' then v_exp_adj := v_exp_adj + r.amount;
      when 'owner_recovery' then v_rec := v_rec + r.amount;
      when 'unpaid_expense_excluded' then v_unpaid_exc := v_unpaid_exc + r.amount;
      else null;
    end case;
  end loop;
  select coalesce(sum(al.amount), 0) into v_unpaid_inc
  from settlement_lines(p_property, p_start, p_end, p_booking) l
  join expenses e on e.id = l.ref_id join expense_allocations al on al.expense_id = e.id and al.property_id = p_property
  where l.item_type = 'expense' and e.payment_status <> 'paid';

  v_gross := v_booking + v_income + v_rev_adj;
  v_ded := v_exp + v_ota + v_exp_adj;
  v_net := v_gross - v_ded;
  v_stayra := app.round_inr(v_net * a.stayra_pct / 100);
  v_owner := v_net - v_stayra;  -- remainder method: shares always add up to the paisa

  select coalesce(sum(s.owner_share - s.owner_borne_recoveries - s.payments_made), 0) into v_prev
  from settlements s where s.property_id = p_property and s.owner_id = v_owner_id
    and s.status in ('approved','partially_paid') ;

  select coalesce(sum(case when bp.entry_type in ('advance','partial','full') then bp.amount when bp.entry_type = 'refund' then -bp.amount
                           else -(select case when o.entry_type = 'refund' then -o.amount else o.amount end from booking_payments o where o.id = bp.reversal_of) end), 0)
    into v_cash from booking_payments bp
    where bp.property_id = p_property and bp.paid_at::date between p_start and p_end and (p_booking is null or bp.booking_id = p_booking);
  v_cash := v_cash + coalesce((select sum(amount) from income where property_id = p_property and status = 'active' and booking_id is null
                        and collection_status = 'collected' and txn_date between p_start and p_end and p_booking is null), 0);
  select coalesce(sum(tax_amount), 0) into v_gst from bookings b where b.property_id = p_property and b.status = 'checked_out'
    and b.check_out between p_start and p_end and (p_booking is null or b.id = p_booking);

  v := jsonb_build_object(
    'agreement_id', a.id, 'agreement_version', a.version, 'stayra_pct', a.stayra_pct, 'owner_pct', a.owner_pct,
    'expense_policy', a.expense_policy, 'include_unpaid_expenses', a.include_unpaid_expenses,
    'booking_revenue', v_booking, 'additional_income', v_income, 'revenue_adjustments', v_rev_adj,
    'gross_revenue', v_gross, 'deductible_expenses', v_exp + v_ota, 'ota_commission', v_ota, 'expense_adjustments', v_exp_adj,
    'net_distributable', v_net, 'stayra_share', v_stayra, 'owner_share', v_owner,
    'owner_borne_recoveries', v_rec, 'previous_outstanding', v_prev,
    'final_payable', v_owner - v_rec + v_prev,
    'unpaid_expenses_included', v_unpaid_inc, 'unpaid_expenses_excluded', v_unpaid_exc,
    'cash_collected', v_cash, 'gst_collected', v_gst,
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.item_date, l.item_type) from settlement_lines(p_property, p_start, p_end, p_booking) l), '[]'::jsonb)
  );
  return v;
end $$;

-- Generate a DRAFT settlement atomically.
create or replace function generate_settlement(p_property uuid, p_start date, p_end date, p_booking uuid default null, p_notes text default null)
returns uuid language plpgsql as $$
declare p jsonb; v_id uuid; v_owner uuid;
begin
  if auth.uid() is not null and not app.has_role(array['super_admin','admin','accountant']::app_role[]) then
    raise exception 'You are not allowed to generate settlements' using errcode = '42501';
  end if;
  if p_booking is not null and not exists (select 1 from bookings where id = p_booking and property_id = p_property and status = 'checked_out') then
    raise exception 'Booking-wise settlement needs a checked-out booking of this property' using errcode = 'P0001';
  end if;
  -- serialise settlement generation per property
  perform pg_advisory_xact_lock(hashtext('settle:' || p_property::text));
  if p_booking is null and exists (select 1 from settlements where property_id = p_property and status <> 'void' and mode = 'period'
      and daterange(period_start, period_end, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'A settlement already exists for an overlapping period' using errcode = 'P0001';
  end if;
  p := preview_settlement(p_property, p_start, p_end, p_booking);
  if jsonb_array_length(p->'lines') = 0 then raise exception 'Nothing to settle for this period' using errcode = 'P0001'; end if;
  select owner_id into v_owner from properties where id = p_property;

  insert into settlements(property_id, owner_id, agreement_id, mode, booking_id, period_start, period_end, status,
    stayra_pct, owner_pct, booking_revenue, additional_income, revenue_adjustments, gross_revenue, deductible_expenses,
    expense_adjustments, net_distributable, stayra_share, owner_share, owner_borne_recoveries, previous_outstanding,
    payments_made, final_payable, unpaid_expenses_included, unpaid_expenses_excluded, cash_collected, gst_collected, notes, created_by)
  values (p_property, v_owner, (p->>'agreement_id')::uuid, case when p_booking is null then 'period' else 'booking' end, p_booking, p_start, p_end, 'draft',
    (p->>'stayra_pct')::numeric, (p->>'owner_pct')::numeric, (p->>'booking_revenue')::numeric, (p->>'additional_income')::numeric,
    (p->>'revenue_adjustments')::numeric, (p->>'gross_revenue')::numeric, (p->>'deductible_expenses')::numeric,
    (p->>'expense_adjustments')::numeric, (p->>'net_distributable')::numeric, (p->>'stayra_share')::numeric, (p->>'owner_share')::numeric,
    (p->>'owner_borne_recoveries')::numeric, (p->>'previous_outstanding')::numeric, 0, (p->>'final_payable')::numeric,
    (p->>'unpaid_expenses_included')::numeric, (p->>'unpaid_expenses_excluded')::numeric, (p->>'cash_collected')::numeric,
    (p->>'gst_collected')::numeric, p_notes, auth.uid())
  returning id into v_id;

  insert into settlement_items(settlement_id, property_id, item_type, ref_id, item_date, description, amount)
  select v_id, p_property, l->>'item_type', (l->>'ref_id')::uuid, (l->>'item_date')::date, l->>'description', (l->>'amount')::numeric
  from jsonb_array_elements(p->'lines') l;
  return v_id;
end $$;

-- Settlement lock: after approval only workflow/payment columns may change.
create or replace function app.settlement_guard() returns trigger language plpgsql as $$
begin
  if old.status in ('approved','partially_paid','paid') then
    if (to_jsonb(new) - 'status' - 'payments_made' - 'final_payable' - 'updated_at' - 'notes')
       <> (to_jsonb(old) - 'status' - 'payments_made' - 'final_payable' - 'updated_at' - 'notes') then
      raise exception 'Settlement % is approved and locked. Record an adjustment entry for corrections.', old.settlement_code using errcode = 'P0001';
    end if;
    if new.status in ('draft','submitted','void') then
      raise exception 'An approved settlement cannot go back to %', new.status using errcode = 'P0001';
    end if;
  elsif old.status = 'void' then
    raise exception 'Voided settlements cannot be changed' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_settlement_guard before update on settlements for each row execute function app.settlement_guard();

create or replace function transition_settlement(p_id uuid, p_to settlement_status, p_reason text default null)
returns void language plpgsql as $$
declare s settlements; v_role app_role := app.current_role();
begin
  select * into s from settlements where id = p_id for update;
  if s.id is null then raise exception 'Settlement not found'; end if;
  if p_to = 'submitted' and s.status = 'draft' then
    if v_role not in ('super_admin','admin','accountant') then raise exception 'Not allowed' using errcode = '42501'; end if;
    update settlements set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = p_id;
    perform app.notify_property_users(s.property_id, array['super_admin']::app_role[], 'settlement', 'Settlement ' || s.settlement_code || ' submitted for approval',
      'Owner payable ₹' || to_char(s.final_payable, 'FM99,99,99,990.00'), '/settlements/' || s.id, 'warning');
  elsif p_to = 'draft' and s.status = 'submitted' then
    if v_role not in ('super_admin','accountant') then raise exception 'Not allowed' using errcode = '42501'; end if;
    update settlements set status = 'draft', submitted_by = null, submitted_at = null, notes = coalesce(p_reason, notes) where id = p_id;
  elsif p_to = 'approved' and s.status = 'submitted' then
    if v_role <> 'super_admin' then raise exception 'Only Super Admin can approve settlements' using errcode = '42501'; end if;
    update settlements set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
    perform app.notify_owner(s.property_id, 'settlement', 'Settlement statement ' || s.settlement_code || ' is ready',
      to_char(s.period_start, 'DD Mon YYYY') || ' – ' || to_char(s.period_end, 'DD Mon YYYY'), '/owner/settlements/' || s.id);
  elsif p_to = 'void' and s.status in ('draft','submitted') then
    if v_role not in ('super_admin','admin','accountant') then raise exception 'Not allowed' using errcode = '42501'; end if;
    if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Give a reason for voiding' using errcode = 'P0001'; end if;
    update settlement_items set is_active = false where settlement_id = p_id;
    update settlements set status = 'void', voided_by = auth.uid(), voided_at = now(), void_reason = p_reason where id = p_id;
  else
    raise exception 'Cannot move settlement from % to %', s.status, p_to using errcode = 'P0001';
  end if;
end $$;

-- Owner payments against an approved settlement (capped at that settlement's own amount due).
create or replace function record_settlement_payment(p_id uuid, p_amount numeric, p_paid_on date, p_method payment_method,
  p_reference text default null, p_notes text default null, p_idempotency text default null)
returns uuid language plpgsql as $$
declare s settlements; v_due numeric; v_pid uuid; v_paid numeric;
begin
  if auth.uid() is not null and not app.has_role(array['super_admin','accountant']::app_role[]) then
    raise exception 'Only Super Admin or Accountant can record owner payments' using errcode = '42501';
  end if;
  if p_idempotency is not null then
    select id into v_pid from settlement_payments where idempotency_key = p_idempotency;
    if v_pid is not null then return v_pid; end if;   -- duplicate submit → same payment
  end if;
  select * into s from settlements where id = p_id for update;
  if s.status not in ('approved','partially_paid') then raise exception 'Payments can only be recorded on approved settlements' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Enter a valid amount' using errcode = 'P0001'; end if;
  v_due := s.owner_share - s.owner_borne_recoveries - s.payments_made;
  if p_amount > v_due then raise exception 'Payment (%) exceeds the amount due on this settlement (%)', p_amount, v_due using errcode = 'P0001'; end if;
  insert into settlement_payments(settlement_id, amount, paid_on, method, reference, notes, idempotency_key, created_by)
  values (p_id, p_amount, p_paid_on, p_method, p_reference, p_notes, p_idempotency, auth.uid()) returning id into v_pid;
  v_paid := s.payments_made + p_amount;
  update settlements set payments_made = v_paid,
    final_payable = s.owner_share - s.owner_borne_recoveries + s.previous_outstanding - v_paid,
    status = case when v_paid >= s.owner_share - s.owner_borne_recoveries then 'paid'::settlement_status else 'partially_paid'::settlement_status end
  where id = p_id;
  perform app.notify_owner(s.property_id, 'owner_payment', 'Payment received ₹' || to_char(p_amount, 'FM99,99,99,990.00'),
    'Against settlement ' || s.settlement_code, '/owner/settlements/' || s.id);
  return v_pid;
end $$;

-- --------------------------------------------------------- demand / alerts -
-- Dates flagged high-demand: explicit rules, or same date last year with occupancy ≥ threshold.
create or replace function high_demand_dates(p_property uuid, p_start date, p_end date)
returns table(day date, reason text) language sql stable as $$
  with days as (select d::date as day from generate_series(p_start, p_end, interval '1 day') d),
  units as (select count(*)::numeric n from property_units where property_id = p_property and is_active),
  thr as (select (app.setting('demand.occupancy_threshold', '0.85'::jsonb))::text::numeric t),
  rules as (
    select d.day, string_agg(r.name || ' (' || r.kind || ')', ', ') reason
    from days d join demand_rules r on d.day between r.start_date and r.end_date and (r.property_id is null or r.property_id = p_property)
    group by d.day),
  hist as (
    select d.day, count(b.id)::numeric occ
    from days d left join bookings b on b.property_id = p_property and b.status in ('confirmed','checked_in','checked_out')
      and (d.day - interval '1 year')::date >= b.check_in and (d.day - interval '1 year')::date < b.check_out
    group by d.day)
  select d.day, coalesce(r.reason, 'Last year occupancy ' || round(100 * h.occ / nullif(u.n, 0)) || '%')
  from days d left join rules r on r.day = d.day left join hist h on h.day = d.day, units u, thr
  where r.reason is not null or (u.n > 0 and h.occ / u.n >= thr.t)
$$;
