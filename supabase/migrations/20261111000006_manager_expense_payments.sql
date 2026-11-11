-- Property managers record bills they paid on the spot (petty cash / UPI). Allow them to add the
-- matching vendor-payment ledger row for expenses of their assigned properties.
drop policy if exists exp_pay_insert on expense_payments;
create policy exp_pay_insert on expense_payments for insert with check (
  app.r('super_admin','admin','accountant','property_manager')
  and exists (select 1 from expenses e where e.id = expense_id and app.can_access_property(e.property_id)));
