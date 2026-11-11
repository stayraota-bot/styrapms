-- =============================================================================
-- STAYRA PMS — database test suite (financial engine, integrity, RLS).
-- Runs inside a transaction and ROLLS BACK: safe to run on a dev database.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/financial_and_security.test.sql
-- =============================================================================
\set QUIET on
\o /dev/null
begin;
create schema tst;
grant usage on schema tst to authenticated;
create table tst.results(n serial, name text, pass boolean, detail text);
grant all on tst.results to authenticated; grant usage on sequence tst.results_n_seq to authenticated;
create table tst.ids(k text primary key, v uuid);
grant all on tst.ids to authenticated;

create function tst.ok(cond boolean, name text, detail text default null) returns void language plpgsql as $$
begin insert into tst.results(name, pass, detail) values (name, coalesce(cond, false), detail); end $$;
create function tst.eq(a anyelement, b anyelement, name text) returns void language plpgsql as $$
begin insert into tst.results(name, pass, detail) values (name, a is not distinct from b, 'got ' || coalesce(a::text,'NULL') || ', expected ' || coalesce(b::text,'NULL')); end $$;
create function tst.throws(q text, pattern text, name text) returns void language plpgsql as $$
begin
  execute q;
  insert into tst.results(name, pass, detail) values (name, false, 'did not raise');
exception when others then
  insert into tst.results(name, pass, detail) values (name, sqlerrm ~* pattern, sqlerrm);
end $$;
create function tst.id(key text) returns uuid language sql stable as $$ select v from tst.ids where k = key $$;
create function tst.as_user(key text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', tst.id(key), 'role', 'authenticated')::text, true);
end $$;
create function tst.as_system() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant execute on all functions in schema tst to authenticated;

-- ---------------------------------------------------------------- fixtures
do $$
declare u record; v uuid;
begin
  for u in select * from (values ('sa','super_admin'),('acc','accountant'),('pm','property_manager'),('hk','housekeeping'),
                                  ('ownA','owner'),('ownB','owner'),('aud','auditor'),('ops','operations')) t(k, r) loop
    insert into auth.users(email) values (u.k || '@test.stayra') returning id into v;
    insert into profiles(id, email, full_name, role) values (v, u.k || '@test.stayra', 'Test ' || u.k, u.r::app_role);
    insert into tst.ids values (u.k, v);
  end loop;
  insert into owners(full_name, profile_id) values ('Owner A', tst.id('ownA')) returning id into v; insert into tst.ids values ('OA', v);
  insert into owners(full_name, profile_id) values ('Owner B', tst.id('ownB')) returning id into v; insert into tst.ids values ('OB', v);
  insert into properties(name, owner_id) values ('Test Prop A', tst.id('OA')) returning id into v; insert into tst.ids values ('PA', v);
  insert into properties(name, owner_id) values ('Test Prop B', tst.id('OB')) returning id into v; insert into tst.ids values ('PB', v);
  insert into property_units(property_id, name) values (tst.id('PA'), 'A-101') returning id into v; insert into tst.ids values ('UA1', v);
  insert into property_units(property_id, name) values (tst.id('PA'), 'A-102') returning id into v; insert into tst.ids values ('UA2', v);
  insert into property_units(property_id, name) values (tst.id('PB'), 'B-101') returning id into v; insert into tst.ids values ('UB1', v);
  insert into user_property_access(user_id, property_id)
    select tst.id(k), tst.id('PA') from unnest(array['acc','pm','hk','aud','ops']) k;
  insert into guests(full_name, phone) values ('Guest One', '9000000001') returning id into v; insert into tst.ids values ('G1', v);
end $$;

-- ------------------------------------------------- 1. agreements & percentages
select tst.as_user('pm');
select tst.throws($q$ select create_agreement(tst.id('PA'), 40, '2026-01-01') $q$, 'Only Super Admin', 'Non-super-admin cannot configure revenue sharing');
select tst.as_user('sa');
select tst.throws($q$ select create_agreement(tst.id('PA'), 120, '2026-01-01') $q$, 'between 0 and 100', 'Rejects STAYRA % above 100');
select tst.throws($q$ select create_agreement(tst.id('PA'), -5, '2026-01-01') $q$, 'between 0 and 100', 'Rejects negative %');
select tst.throws($q$ insert into revenue_share_agreements(property_id, version, stayra_pct, owner_pct, effective_from) values (tst.id('PA'), 9, 40, 50, '2025-01-01') $q$,
  'agreement_pct_total', 'Database rejects shares not totalling 100%');
insert into tst.ids select 'AG1', create_agreement(tst.id('PA'), 40, '2026-01-01', 'monthly', 'all_approved', false);
insert into tst.ids select 'AGB', create_agreement(tst.id('PB'), 35, '2026-01-01', 'monthly', 'all_approved', true);
select tst.eq((select owner_pct from revenue_share_agreements where id = tst.id('AG1')), 60.00::numeric, 'Owner % derived as 100 − STAYRA %');
select tst.ok((select count(*) = 2 from agreement_history where property_id in (tst.id('PA'), tst.id('PB'))), 'Agreement history recorded');

-- ------------------------------------------------- 2. bookings & overlap protection
select tst.as_user('pm');
with x as (insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, status, source)
  values (tst.id('PA'), tst.id('UA1'), tst.id('G1'), '2026-01-10', '2026-01-13', 30000, 'confirmed', 'direct') returning id) insert into tst.ids select 'B1', id from x;
select tst.eq((select nights from bookings where id = tst.id('B1')), 3, 'Nights computed from dates');
select tst.throws($q$ insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, status)
  values (tst.id('PA'), tst.id('UA1'), tst.id('G1'), '2026-01-12', '2026-01-14', 1000, 'confirmed') $q$, 'booking_no_overlap', 'Overlapping confirmed booking on same room is rejected');
with x as (insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, status)
  values (tst.id('PA'), tst.id('UA1'), tst.id('G1'), '2026-01-12', '2026-01-14', 1000, 'pending') returning 1) select tst.ok((select count(*) = 1 from x), 'Pending (unconfirmed) overlap allowed but flagged as a conflict risk');
with x as (insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, status)
  values (tst.id('PA'), tst.id('UA1'), tst.id('G1'), '2026-01-13', '2026-01-15', 1000, 'confirmed') returning 1) select tst.ok((select count(*) = 1 from x), 'Back-to-back booking (check-out day = next check-in) allowed');
select tst.throws($q$ insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount) values (tst.id('PA'), tst.id('UA2'), tst.id('G1'), '2026-01-10', '2026-01-10', 100) $q$, 'booking_dates', 'Check-out must be after check-in');
select tst.throws($q$ insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount) values (tst.id('PB'), tst.id('UB1'), tst.id('G1'), '2026-01-10', '2026-01-11', 100) $q$, 'row-level security|does not belong', 'Manager cannot create bookings in unassigned property');
select tst.throws($q$ insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount) values (tst.id('PA'), tst.id('UB1'), tst.id('G1'), '2026-02-10', '2026-02-11', 100) $q$, 'does not belong', 'Room must belong to the property');
insert into blocked_dates(property_id, unit_id, start_date, end_date, reason) values (tst.id('PA'), tst.id('UA2'), '2026-01-20', '2026-01-25', 'maintenance');
select tst.throws($q$ insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, status) values (tst.id('PA'), tst.id('UA2'), tst.id('G1'), '2026-01-22', '2026-01-23', 100, 'confirmed') $q$, 'blocked', 'Cannot confirm a booking on blocked dates');
select tst.throws($q$ insert into blocked_dates(property_id, unit_id, start_date, end_date, reason) values (tst.id('PA'), tst.id('UA1'), '2026-01-11', '2026-01-12', 'owner_use') $q$, 'overlap confirmed', 'Cannot block dates over confirmed bookings');

-- ------------------------------------------------- 3. payment ledger
insert into booking_payments(booking_id, entry_type, amount, method, idempotency_key) values (tst.id('B1'), 'advance', 10000, 'upi', 'pay-k1');
select tst.throws($q$ insert into booking_payments(booking_id, entry_type, amount, method, idempotency_key) values (tst.id('B1'), 'advance', 10000, 'upi', 'pay-k1') $q$, 'duplicate key', 'Duplicate payment submission rejected (idempotency key)');
select tst.throws($q$ insert into booking_payments(booking_id, entry_type, amount, method) values (tst.id('B1'), 'refund', 15000, 'upi') $q$, 'exceeds net amount', 'Refund cannot exceed net received');
insert into booking_payments(booking_id, entry_type, amount, method) values (tst.id('B1'), 'refund', 1000, 'upi');
select tst.as_system();  -- even a privileged database user cannot alter the ledger
select tst.throws($q$ update booking_payments set amount = 1 where booking_id = tst.id('B1') $q$, 'immutable', 'Payment ledger rows cannot be edited (even by DB admin)');
select tst.throws($q$ delete from booking_payments where booking_id = tst.id('B1') $q$, 'immutable', 'Payment ledger rows cannot be deleted (even by DB admin)');
select tst.as_user('pm');
-- food income on the guest folio
insert into income(property_id, booking_id, category_id, description, amount, txn_date, payment_mode)
  values (tst.id('PA'), tst.id('B1'), (select id from income_categories where code = 'fnb'), 'Dinner', 2000, '2026-01-12', 'cash');
select tst.eq((select balance_due from booking_financials where booking_id = tst.id('B1')), 23000.00::numeric, 'Outstanding guest balance = room + folio − net paid');
select tst.eq((select payment_status from booking_financials where booking_id = tst.id('B1')), 'partially_paid', 'Payment status derived from ledger');
-- reversal of a mistaken entry
insert into booking_payments(booking_id, entry_type, amount, method, reversal_of)
  select tst.id('B1'), 'reversal', 1000, 'upi', id from booking_payments where booking_id = tst.id('B1') and entry_type = 'refund';
select tst.eq((select net_paid from booking_financials where booking_id = tst.id('B1')), 10000.00::numeric, 'Reversing a refund restores net paid');
select tst.throws($q$ insert into booking_payments(booking_id, entry_type, amount, method, reversal_of)
  select tst.id('B1'), 'reversal', 1000, 'upi', id from booking_payments where booking_id = tst.id('B1') and entry_type = 'refund' $q$, 'duplicate key', 'An entry can be reversed only once');

update bookings set status = 'checked_in' where id = tst.id('B1');
update bookings set status = 'checked_out' where id = tst.id('B1');
select tst.ok((select count(*) = 1 from housekeeping_tasks where booking_id = tst.id('B1') and task_type = 'checkout_cleaning'), 'Check-out auto-creates a cleaning task');
select tst.eq((select readiness::text from property_units where id = tst.id('UA1')), 'dirty', 'Room marked dirty after check-out');
-- OTA booking with commission
with x as (insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, discount, tax_amount, ota_commission, status, source, ota_collects_payment)
  values (tst.id('PA'), tst.id('UA2'), tst.id('G1'), '2026-01-05', '2026-01-07', 11000, 1000, 1200, 1500, 'confirmed', 'airbnb', true) returning id) insert into tst.ids select 'B2', id from x;
update bookings set status = 'checked_out' where id = tst.id('B2');

-- ------------------------------------------------- 4. expenses & approvals
with x as (insert into expenses(property_id, category_id, description, amount, bill_date, paid_amount)
  values (tst.id('PA'), (select id from expense_categories where name = 'Ration'), 'Monthly ration', 5000, '2026-01-08', 5000) returning id) insert into tst.ids select 'E1', id from x;
with x as (insert into expenses(property_id, category_id, description, amount, bill_date)
  values (tst.id('PA'), (select id from expense_categories where name = 'Electricity'), 'MSEB Jan', 3000, '2026-01-25') returning id) insert into tst.ids select 'E2', id from x;
with x as (insert into expenses(property_id, category_id, description, amount, bill_date, bearer, paid_by, paid_amount)
  values (tst.id('PA'), (select id from expense_categories where name = 'Furniture'), 'Owner requested sofa', 1000, '2026-01-09', 'owner', 'stayra', 1000) returning id) insert into tst.ids select 'E3', id from x;
with x as (insert into expenses(property_id, category_id, description, amount, bill_date, bearer, paid_amount)
  values (tst.id('PA'), (select id from expense_categories where name = 'Software'), 'STAYRA software', 700, '2026-01-09', 'stayra', 700) returning id) insert into tst.ids select 'E4', id from x;
select tst.eq((select approval_status::text from expenses where id = tst.id('E1')), 'pending', 'New expenses start pending approval');
select tst.eq((select payment_status::text from expenses where id = tst.id('E1')), 'paid', 'Payment status derived from paid amount');
select tst.throws($q$ update expenses set approval_status = 'approved' where id = tst.id('E1') $q$, 'Only Super Admin or Accountant', 'Property manager cannot approve expenses');
select tst.as_user('acc');
select tst.ok((select count(*) > 0 from notifications n where n.type = 'expense_approval'), 'Approvers notified of pending expense');
select tst.as_user('acc');
update expenses set approval_status = 'approved' where id in (tst.id('E1'), tst.id('E2'), tst.id('E3'), tst.id('E4'));
select tst.eq((select is_deductible from expenses where id = tst.id('E4')), false, 'STAYRA-borne expense forced non-deductible');
select tst.eq((select sum(amount) from expense_allocations where expense_id = tst.id('E1')), 5000.00::numeric, 'Direct expense allocated 100% to its property');

-- ------------------------------------------------- 5. revenue-sharing engine
-- Expected: bookings (30000) + (11000−1000) = 40000; income 2000 → gross 42000
-- deductible: ration 5000 (paid) + OTA 1500 = 6500; electricity 3000 unpaid → excluded (policy)
-- net 35500 → STAYRA 40% 14200, owner 60% 21300; owner-borne 1000 recovered → final payable 20300
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'gross_revenue')::numeric, 42000.00::numeric, 'Gross revenue = completed stays (net of discount, excl. GST) + additional income');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'deductible_expenses')::numeric, 6500.00::numeric, 'Deductible = approved paid pool expenses + OTA commission');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'unpaid_expenses_excluded')::numeric, 3000.00::numeric, 'Unpaid expense shown separately and excluded per policy');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'net_distributable')::numeric, 35500.00::numeric, 'Net distributable revenue');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'stayra_share')::numeric, 14200.00::numeric, 'STAYRA share at 40%');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'owner_share')::numeric, 21300.00::numeric, 'Owner share at 60%');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'final_payable')::numeric, 20300.00::numeric, 'Owner-borne costs recovered from owner payable');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'gst_collected')::numeric, 1200.00::numeric, 'GST tracked separately (not shared)');
select tst.ok((select not exists (select 1 from jsonb_array_elements(preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->'lines') l where (l->>'ref_id')::uuid = tst.id('E4'))), 'STAYRA-borne expense not deducted from pool');

-- booking-level calculation
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31', tst.id('B2'))->>'net_distributable')::numeric, 8500.00::numeric, 'Booking-level calculation (10000 − 1500 OTA commission)');

insert into tst.ids select 'S1', generate_settlement(tst.id('PA'), '2026-01-01', '2026-01-31');
select tst.eq((select final_payable from settlements where id = tst.id('S1')), 20300.00::numeric, 'Generated settlement matches preview');
select tst.throws($q$ select generate_settlement(tst.id('PA'), '2026-01-15', '2026-01-31') $q$, 'overlapping period', 'Cannot settle an overlapping period twice');
select tst.eq((preview_settlement(tst.id('PA'), '2026-01-01', '2026-01-31')->>'net_distributable')::numeric, 0::numeric, 'Already-settled items are not counted again');
select tst.throws($q$ insert into settlement_items(settlement_id, property_id, item_type, ref_id, description, amount) values (tst.id('S1'), tst.id('PA'), 'booking', tst.id('B1'), 'dup', 1) $q$, 'no_double_count', 'Database blocks the same booking in two live settlements');
select tst.throws($q$ update expenses set amount = 1 where id = tst.id('E1') $q$, 'locked', 'Settled expense is locked');
select tst.throws($q$ update bookings set room_amount = 1 where id = tst.id('B1') $q$, 'locked', 'Settled booking financials are locked');
select tst.throws($q$ update income set status = 'void', void_reason = 'test' where booking_id = tst.id('B1') $q$, 'locked', 'Settled income cannot be voided');
select tst.as_system();
select tst.throws($q$ delete from bookings where id = tst.id('B1') $q$, 'cannot be deleted', 'Bookings cannot be hard-deleted (even by DB admin)');
select tst.as_user('acc');

-- ------------------------------------------------- 6. settlement workflow & owner payments
select transition_settlement(tst.id('S1'), 'submitted');
select tst.throws($q$ select transition_settlement(tst.id('S1'), 'approved') $q$, 'Only Super Admin', 'Accountant cannot approve settlements');
select tst.as_user('sa');
select transition_settlement(tst.id('S1'), 'approved');
select tst.throws($q$ update settlements set owner_share = 1 where id = tst.id('S1') $q$, 'locked', 'Approved settlement cannot be silently edited');
select tst.throws($q$ select transition_settlement(tst.id('S1'), 'void', 'trying to void') $q$, 'Cannot move', 'Approved settlement cannot be voided');
select tst.as_user('acc');
select record_settlement_payment(tst.id('S1'), 10000, '2026-02-05', 'bank_transfer', 'UTR1', null, 'own-pay-1');
select tst.eq((select status::text from settlements where id = tst.id('S1')), 'partially_paid', 'Partial owner payment → Partially Paid');
select tst.eq((select count(*)::int from (select record_settlement_payment(tst.id('S1'), 10000, '2026-02-05', 'bank_transfer', 'UTR1', null, 'own-pay-1')) x
  where (select count(*) from settlement_payments where settlement_id = tst.id('S1')) = 1), 1, 'Re-submitting the same payment does not duplicate it');
select tst.throws($q$ select record_settlement_payment(tst.id('S1'), 10300.01, '2026-02-10', 'upi') $q$, 'exceeds the amount due', 'Cannot overpay an owner');
select record_settlement_payment(tst.id('S1'), 10300, '2026-02-10', 'upi', 'UTR2');
select tst.eq((select status::text from settlements where id = tst.id('S1')), 'paid', 'Final owner payment → Paid');
select tst.eq((select final_payable from settlements where id = tst.id('S1')), 0.00::numeric, 'Nothing left payable after final payment');
select tst.as_user('ownA');
select tst.ok((select count(*) >= 2 from notifications n where n.type in ('settlement','owner_payment')), 'Owner notified of statement and payments');

-- ------------------------------------------------- 7. agreement change preserves history
select tst.as_user('sa');
select tst.throws($q$ select create_agreement(tst.id('PA'), 50, '2026-01-15') $q$, 'Settlements already exist', 'New terms cannot start inside a settled period');
insert into tst.ids select 'AG2', create_agreement(tst.id('PA'), 50, '2026-02-01');
select tst.eq((select effective_to from revenue_share_agreements where id = tst.id('AG1')), '2026-01-31'::date, 'Previous agreement closed the day before');
select tst.eq((select stayra_pct from settlements where id = tst.id('S1')), 40.00::numeric, 'Historical settlement keeps its original 40/60 split');
select tst.throws($q$ update revenue_share_agreements set stayra_pct = 45, owner_pct = 55 where id = tst.id('AG1') $q$, 'cannot be changed', 'Agreement used by settlements cannot be rewritten');

-- ------------------------------------------------- 8. rounding & unpaid inclusion (property B, 35/65, includes unpaid)
select tst.as_system();
insert into bookings(property_id, unit_id, guest_id, check_in, check_out, room_amount, status)
  values (tst.id('PB'), tst.id('UB1'), tst.id('G1'), '2026-01-03', '2026-01-04', 10000.01, 'checked_out');
insert into expenses(property_id, category_id, description, amount, bill_date, approval_status)
  values (tst.id('PB'), (select id from expense_categories where name = 'Water'), 'Water tanker', 333.33, '2026-01-04', 'approved');
select tst.eq((preview_settlement(tst.id('PB'), '2026-01-01', '2026-01-31')->>'net_distributable')::numeric, 9666.68::numeric, 'Unpaid expense included when agreement says so');
select tst.eq((preview_settlement(tst.id('PB'), '2026-01-01', '2026-01-31')->>'stayra_share')::numeric, 3383.34::numeric, 'STAYRA share rounded to the paisa (35% of 9666.68 = 3383.338)');
select tst.eq((preview_settlement(tst.id('PB'), '2026-01-01', '2026-01-31')->>'owner_share')::numeric, 6283.34::numeric, 'Owner share = remainder, so shares always sum to net');

-- ------------------------------------------------- 9. shared expense allocation
with x as (insert into expenses(property_id, category_id, description, amount, gst_amount, bill_date, scope)
  values (tst.id('PA'), (select id from expense_categories where name = 'Marketing'), 'Shared ad campaign', 1000, 0, '2026-02-02', 'shared') returning id) insert into tst.ids select 'E5', id from x;
select allocate_shared_expense(tst.id('E5'), array[tst.id('PA'), tst.id('PB')], 'by_units');
select tst.eq((select amount from expense_allocations where expense_id = tst.id('E5') and property_id = tst.id('PA')), 666.67::numeric, 'Shared expense split by rooms (2 of 3)');
select tst.eq((select sum(amount) from expense_allocations where expense_id = tst.id('E5')), 1000.00::numeric, 'Shared allocations always total the bill');
update expenses set approval_status = 'approved', paid_amount = 1000 where id = tst.id('E5');
select tst.as_user('acc');
insert into tst.ids select 'S2', generate_settlement(tst.id('PA'), '2026-02-01', '2026-02-28');
select tst.as_user('sa');
select tst.eq((select sum(amount) from settlement_items where settlement_id = tst.id('S2') and item_type = 'expense'), 666.67::numeric, 'Property A settles only its 2/3 share of the shared cost');
select tst.ok((select exists (select 1 from jsonb_array_elements(preview_settlement(tst.id('PB'), '2026-01-01', '2026-02-28')->'lines') l where (l->>'ref_id')::uuid = tst.id('E5') and (l->>'amount')::numeric = 333.33)),
  'Property B still settles its own share after A has settled');
select tst.as_system();

-- ------------------------------------------------- 10. access isolation
select tst.as_user('ownA');
select tst.eq((select count(*)::int from properties), 1, 'Owner sees only their own property');
select tst.eq((select count(*)::int from bookings where property_id = tst.id('PB')), 0, 'Owner cannot see other owners'' bookings');
select tst.eq((select count(*)::int from settlements), 1, 'Owner sees their approved settlement');
select tst.throws($q$ insert into income(property_id, category_id, description, amount) values (tst.id('PA'), (select id from income_categories limit 1), 'x', 1) $q$, 'row-level security', 'Owner cannot write financial records');
select tst.as_user('ownB');
select tst.eq((select count(*)::int from settlements where property_id = tst.id('PA')), 0, 'Owner B cannot see Owner A settlements');
select tst.eq((select count(*)::int from expenses where property_id = tst.id('PA') and scope <> 'shared'), 0, 'Owner B cannot see Owner A expenses');
select tst.eq((select count(*)::int from expense_allocations where property_id = tst.id('PA')), 0, 'Owner B sees only their own share of shared costs');
select tst.eq((select count(*)::int from owners), 1, 'Owner B sees only their own owner record');
select tst.as_user('hk');
select tst.eq((select count(*)::int from income), 0, 'Housekeeping has no access to income');
select tst.eq((select count(*)::int from bookings), 0, 'Housekeeping has no access to bookings / guest financials');
select tst.eq((select count(*)::int from settlements), 0, 'Housekeeping has no access to settlements');
select tst.ok((select count(*) >= 1 from housekeeping_tasks), 'Housekeeping sees room tasks');
update housekeeping_tasks set status = 'done' where booking_id = tst.id('B1');
select tst.eq((select readiness::text from property_units where id = tst.id('UA1')), 'ready', 'Completing cleaning marks room ready');
select tst.as_user('ops');
select tst.eq((select count(*)::int from income), 0, 'Operations staff cannot see income');
select tst.ok((select count(*) > 0 from bookings), 'Operations staff can see bookings of assigned property');
select tst.as_user('aud');
select tst.ok((select count(*) >= 1 from settlements), 'Auditor can read authorised settlements');
select tst.throws($q$ insert into income(property_id, category_id, description, amount) values (tst.id('PA'), (select id from income_categories limit 1), 'x', 1) $q$, 'row-level security', 'Auditor is read-only');
select tst.as_user('pm');
select tst.throws($q$ update profiles set role = 'super_admin' where id = auth.uid() $q$, 'Only Super Admin|row-level|cannot', 'Users cannot escalate their own role');
select tst.eq((select count(*)::int from audit_logs), 0, 'Property manager cannot read audit logs');
select tst.as_system();
select tst.ok((select count(*) > 20 from audit_logs), 'Audit trail captured financial changes');
select tst.throws($q$ update audit_logs set action = 'x' $q$, 'immutable', 'Audit log is tamper-proof');

-- ---------------------------------------------------------------- report
\o
\set QUIET off
\pset footer off
select n as "#", case when pass then 'PASS' else 'FAIL' end as result, name, case when not pass then detail end as detail from tst.results order by n;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from tst.results;
rollback;
