-- =============================================================================
-- STAYRA PMS — Row Level Security. Every table is locked down; access is
-- granted per role and per assigned property. The app's server connects as a
-- privileged user but switches to the `authenticated` role with the signed-in
-- user's id for every request, so these policies are always enforced.
-- =============================================================================

alter table guests add column if not exists created_by uuid references profiles(id);

-- Housekeeping task status drives room readiness.
create or replace function app.hk_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from (case when tg_op = 'UPDATE' then old.status end) then
    update property_units set readiness = case new.status
      when 'in_progress' then 'cleaning'::room_readiness
      when 'done' then (case when new.task_type = 'inspection' then 'ready' else 'ready' end)::room_readiness
      when 'inspected' then 'ready'::room_readiness
      else readiness end
    where id = new.unit_id and readiness <> 'out_of_order';
  end if;
  return null;
end $$;
create trigger trg_hk_after after insert or update on housekeeping_tasks for each row execute function app.hk_after();

create or replace function app.hk_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('done','inspected') and new.completed_at is null then new.completed_at := now(); end if;
  if new.status = 'inspected' then new.inspected_by := coalesce(new.inspected_by, auth.uid()); end if;
  return new;
end $$;
create trigger trg_hk_guard before insert or update on housekeeping_tasks for each row execute function app.hk_guard();

create or replace function app.ticket_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prop text;
begin
  select name into v_prop from properties where id = new.property_id;
  if tg_op = 'INSERT' then
    perform app.notify_property_users(new.property_id, array['super_admin','admin','property_manager']::app_role[], 'maintenance',
      'Maintenance ' || new.ticket_code || ' (' || new.priority || ')', new.title || ' · ' || v_prop, '/maintenance',
      case when new.priority = 'critical' then 'critical' when new.priority = 'high' then 'warning' else 'info' end);
  end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into notifications(user_id, type, title, body, link, severity)
    values (new.assigned_to, 'maintenance', 'Ticket assigned: ' || new.ticket_code, new.title || ' · ' || v_prop, '/maintenance', 'info');
  end if;
  if new.unit_id is not null and new.blocks_room then
    update property_units set readiness = case when new.status in ('resolved','closed') then 'dirty' else 'out_of_order' end::room_readiness
    where id = new.unit_id;
  end if;
  return null;
end $$;
create trigger trg_ticket_after after insert or update on maintenance_tickets for each row execute function app.ticket_after();

create or replace function app.ticket_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('resolved','closed') and new.resolved_at is null then new.resolved_at := now(); end if;
  if new.assigned_to is not null and new.status = 'open' then new.status := 'assigned'; end if;
  new.reported_by := coalesce(new.reported_by, auth.uid());
  return new;
end $$;
create trigger trg_ticket_guard before insert or update on maintenance_tickets for each row execute function app.ticket_guard();

-- Users may edit their own name/phone but never their own role, scope or status.
create or replace function app.profile_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not app.is_super_admin() then
    if new.role <> old.role or new.all_properties <> old.all_properties or new.is_active <> old.is_active or new.email <> old.email then
      raise exception 'Only Super Admin can change roles, access scope or status' using errcode = '42501';
    end if;
  end if;
  if auth.uid() is not null and new.id = auth.uid() and (new.is_active = false or new.role <> old.role) then
    raise exception 'You cannot deactivate or change the role of your own account' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_profile_guard before update on profiles for each row execute function app.profile_guard();

-- --------------------------------------------------------------- grants ----
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant delete on user_property_access, vendor_properties, expense_allocations, demand_rules, notifications to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
revoke all on all tables in schema public from anon;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public, app to service_role;

-- ------------------------------------------------------------ enable RLS ---
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- shorthand role arrays
create or replace function app.r(variadic roles app_role[]) returns boolean language sql stable as $$ select app.has_role(roles) $$;

-- ------------------------------------------------------------- policies ----
-- profiles
create policy profiles_select on profiles for select using (
  id = auth.uid() or app.r('super_admin','admin','property_manager','accountant','auditor','operations'));
create policy profiles_insert on profiles for insert with check (app.is_super_admin());
create policy profiles_update on profiles for update using (id = auth.uid() or app.is_super_admin());

create policy login_history_select on login_history for select using (user_id = auth.uid() or app.is_super_admin());
create policy login_history_insert on login_history for insert with check (user_id = auth.uid() or app.is_super_admin());

create policy upa_select on user_property_access for select using (user_id = auth.uid() or app.is_super_admin());
create policy upa_write on user_property_access for all using (app.is_super_admin()) with check (app.is_super_admin());

-- owners
create policy owners_select on owners for select using (
  app.is_super_admin() or profile_id = auth.uid()
  or (app.r('admin','property_manager','accountant','auditor') and exists (select 1 from properties p where p.owner_id = owners.id and app.can_access_property(p.id))));
create policy owners_insert on owners for insert with check (app.r('super_admin','admin'));
create policy owners_update on owners for update using (
  app.is_super_admin() or (app.r('admin') and exists (select 1 from properties p where p.owner_id = owners.id and app.can_access_property(p.id))));

-- properties & rooms
create policy properties_select on properties for select using (app.can_access_property(id));
create policy properties_insert on properties for insert with check (app.is_super_admin());
create policy properties_update on properties for update using (app.is_super_admin() or (app.r('admin') and app.can_access_property(id)));

create policy units_select on property_units for select using (app.can_access_property(property_id));
create policy units_write on property_units for insert with check (app.r('super_admin','admin','property_manager') and app.can_access_property(property_id));
create policy units_update on property_units for update using (app.r('super_admin','admin','property_manager','operations') and app.can_access_property(property_id));

-- documents
create policy docs_select on uploaded_documents for select using (
  uploaded_by = auth.uid() or (property_id is not null and app.can_access_property(property_id)
    and (entity_type in ('property','ticket') or app.can_view_finance(property_id))));
create policy docs_insert on uploaded_documents for insert with check (
  auth.uid() is not null and (property_id is null or app.can_access_property(property_id)));

-- agreements
create policy agreements_select on revenue_share_agreements for select using (app.can_view_finance(property_id));
create policy agreements_insert on revenue_share_agreements for insert with check (app.is_super_admin());
create policy agreements_update on revenue_share_agreements for update using (app.is_super_admin());
create policy agreement_history_select on agreement_history for select using (app.can_view_finance(property_id));
create policy agreement_history_insert on agreement_history for insert with check (true);

-- guests (visible through bookings the user can see, or if they created the record)
create policy guests_select on guests for select using (
  app.is_super_admin() or created_by = auth.uid()
  or exists (select 1 from bookings b where b.guest_id = guests.id and app.can_access_property(b.property_id) and not app.r('housekeeping')));
create policy guests_insert on guests for insert with check (app.r('super_admin','admin','property_manager','operations','accountant'));
create policy guests_update on guests for update using (
  app.is_super_admin() or created_by = auth.uid()
  or (app.r('admin','property_manager','operations') and exists (select 1 from bookings b where b.guest_id = guests.id and app.can_access_property(b.property_id))));

-- bookings
create policy bookings_select on bookings for select using (app.can_access_property(property_id) and not app.r('housekeeping'));
create policy bookings_insert on bookings for insert with check (app.r('super_admin','admin','property_manager','operations') and app.can_access_property(property_id));
create policy bookings_update on bookings for update using (app.r('super_admin','admin','property_manager','operations','accountant') and app.can_access_property(property_id));

create policy bpay_select on booking_payments for select using (app.can_view_finance(property_id));
create policy bpay_insert on booking_payments for insert with check (
  app.r('super_admin','admin','property_manager','accountant')
  and app.can_access_property((select b.property_id from bookings b where b.id = booking_id)));

-- categories & settings
create policy inc_cat_select on income_categories for select using (auth.uid() is not null);
create policy inc_cat_write on income_categories for all using (app.is_super_admin()) with check (app.is_super_admin());
create policy exp_cat_select on expense_categories for select using (auth.uid() is not null);
create policy exp_cat_write on expense_categories for all using (app.is_super_admin()) with check (app.is_super_admin());
create policy settings_select on app_settings for select using (auth.uid() is not null);
create policy settings_write on app_settings for all using (app.is_super_admin()) with check (app.is_super_admin());

-- income
create policy income_select on income for select using (app.can_view_finance(property_id));
create policy income_insert on income for insert with check (app.r('super_admin','admin','accountant','property_manager') and app.can_access_property(property_id));
create policy income_update on income for update using (app.r('super_admin','admin','accountant') and app.can_access_property(property_id));

-- vendors
create policy vendors_select on vendors for select using (app.r('super_admin','admin','property_manager','accountant','auditor'));
create policy vendors_insert on vendors for insert with check (app.r('super_admin','admin','property_manager','accountant'));
create policy vendors_update on vendors for update using (app.r('super_admin','admin','accountant'));
create policy vprop_select on vendor_properties for select using (app.r('super_admin','admin','property_manager','accountant','auditor'));
create policy vprop_write on vendor_properties for all using (app.r('super_admin','admin','accountant')) with check (app.r('super_admin','admin','accountant'));

-- expenses
create policy expenses_select on expenses for select using (
  app.can_view_finance(property_id)
  or exists (select 1 from expense_allocations a where a.expense_id = expenses.id and app.can_view_finance(a.property_id)));
create policy expenses_insert on expenses for insert with check (app.r('super_admin','admin','property_manager','accountant') and app.can_access_property(property_id));
create policy expenses_update on expenses for update using (app.r('super_admin','admin','property_manager','accountant') and app.can_access_property(property_id));

create policy alloc_select on expense_allocations for select using (app.can_view_finance(property_id));
create policy alloc_write on expense_allocations for all
  using (app.r('super_admin','admin','accountant','property_manager') and app.can_access_property(property_id))
  with check (app.r('super_admin','admin','accountant','property_manager') and app.can_access_property(property_id));

create policy exp_pay_select on expense_payments for select using (exists (select 1 from expenses e where e.id = expense_id));
create policy exp_pay_insert on expense_payments for insert with check (
  app.r('super_admin','admin','accountant') and exists (select 1 from expenses e where e.id = expense_id and app.can_access_property(e.property_id)));

create policy recurring_select on recurring_expenses for select using (app.can_view_finance(property_id));
create policy recurring_write on recurring_expenses for insert with check (app.can_write_finance(property_id));
create policy recurring_update on recurring_expenses for update using (app.can_write_finance(property_id));

create policy adj_select on financial_adjustments for select using (app.can_view_finance(property_id));
create policy adj_insert on financial_adjustments for insert with check (app.r('super_admin','accountant') and app.can_access_property(property_id));
create policy adj_update on financial_adjustments for update using (app.r('super_admin','accountant') and app.can_access_property(property_id));

-- settlements: owners see only approved statements of their own properties
create policy settlements_select on settlements for select using (
  app.can_view_finance(property_id) and (not app.r('owner') or status in ('approved','partially_paid','paid')));
create policy settlements_insert on settlements for insert with check (app.can_write_finance(property_id));
create policy settlements_update on settlements for update using (app.can_write_finance(property_id));
create policy sitems_select on settlement_items for select using (exists (select 1 from settlements s where s.id = settlement_id));
create policy sitems_insert on settlement_items for insert with check (exists (select 1 from settlements s where s.id = settlement_id and app.can_write_finance(s.property_id)));
create policy sitems_update on settlement_items for update using (exists (select 1 from settlements s where s.id = settlement_id and app.can_write_finance(s.property_id)));
create policy spay_select on settlement_payments for select using (exists (select 1 from settlements s where s.id = settlement_id));
create policy spay_insert on settlement_payments for insert with check (
  app.r('super_admin','accountant') and exists (select 1 from settlements s where s.id = settlement_id and app.can_access_property(s.property_id)));

-- operations
create policy tickets_select on maintenance_tickets for select using (app.can_access_property(property_id) and not app.r('owner'));
create policy tickets_insert on maintenance_tickets for insert with check (
  app.r('super_admin','admin','property_manager','operations','housekeeping') and app.can_access_property(property_id));
create policy tickets_update on maintenance_tickets for update using (
  (app.r('super_admin','admin','property_manager','operations') and app.can_access_property(property_id)) or assigned_to = auth.uid());

create policy hk_select on housekeeping_tasks for select using (
  app.can_access_property(property_id) and not app.r('owner','auditor','accountant')
  and (not app.r('housekeeping') or assigned_to = auth.uid() or assigned_to is null));
create policy hk_insert on housekeeping_tasks for insert with check (
  app.r('super_admin','admin','property_manager','operations') and app.can_access_property(property_id));
create policy hk_update on housekeeping_tasks for update using (
  (app.r('super_admin','admin','property_manager','operations') and app.can_access_property(property_id))
  or (app.r('housekeeping') and app.can_access_property(property_id) and (assigned_to = auth.uid() or assigned_to is null)));

create policy blocks_select on blocked_dates for select using (app.can_access_property(property_id));
create policy blocks_insert on blocked_dates for insert with check (app.r('super_admin','admin','property_manager') and app.can_access_property(property_id));
create policy blocks_update on blocked_dates for update using (app.r('super_admin','admin','property_manager') and app.can_access_property(property_id));

create policy demand_select on demand_rules for select using (auth.uid() is not null);
create policy demand_write on demand_rules for all using (app.r('super_admin','admin')) with check (app.r('super_admin','admin'));

-- platform
create policy notif_select on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update using (user_id = auth.uid());
create policy notif_delete on notifications for delete using (user_id = auth.uid());
create policy audit_select on audit_logs for select using (app.r('super_admin','auditor'));
