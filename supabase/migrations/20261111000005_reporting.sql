-- Reporting: property-wise P&L for any date range (earned basis; same revenue/expense rules as the
-- settlement engine but irrespective of settlement status). SECURITY INVOKER → RLS applies.
create or replace function property_pl(p_from date, p_to date, p_property uuid default null)
returns table(property_id uuid, name text, units int, stayra_pct numeric,
  booking_revenue numeric, cancellation_income numeric, additional_income numeric, revenue_adjustments numeric, gross_revenue numeric,
  ota_commission numeric, deductible_expenses numeric, expense_adjustments numeric, total_expenses numeric, pending_expenses numeric, unpaid_expenses numeric,
  net_distributable numeric, stayra_share numeric, owner_share numeric, gst_collected numeric,
  stays int, nights_sold int, available_nights int, occupancy numeric, adr numeric, revpar numeric)
language sql stable as $$
  with props as (
    select p.id, p.name, (select count(*)::int from property_units u where u.property_id = p.id and u.is_active) units
    from properties p where p.status <> 'archived' and (p_property is null or p.id = p_property)),
  ag as (select distinct on (r.property_id) r.property_id, r.stayra_pct from revenue_share_agreements r
         where r.effective_from <= p_to order by r.property_id, r.effective_from desc),
  bk as (select b.property_id, sum(b.room_amount - b.discount) rev, sum(b.ota_commission) ota, sum(b.tax_amount) gst, count(*)::int stays, sum(b.nights)::int nights
         from bookings b where b.status = 'checked_out' and b.check_out between p_from and p_to group by 1),
  cx as (select b.property_id, sum(b.cancellation_charge) canc, sum(b.ota_commission) ota from bookings b where b.status in ('cancelled','no_show')
         and coalesce(b.cancelled_at::date, b.check_in) between p_from and p_to group by 1),
  occ as (select b.property_id, sum(greatest(0, least(b.check_out, p_to + 1) - greatest(b.check_in, p_from)))::int nights
          from bookings b where b.status in ('confirmed','checked_in','checked_out') and b.check_in <= p_to and b.check_out > p_from group by 1),
  inc as (select i.property_id, sum(i.amount) amt from income i where i.status = 'active' and i.txn_date between p_from and p_to group by 1),
  ex as (select al.property_id,
           sum(al.amount) filter (where e.approval_status <> 'rejected') total,
           sum(al.amount) filter (where e.approval_status = 'approved' and e.bearer = 'pool' and e.is_deductible) ded,
           sum(al.amount) filter (where e.approval_status = 'pending') pending,
           sum(al.amount) filter (where e.approval_status = 'approved' and e.payment_status <> 'paid') unpaid
         from expenses e join expense_allocations al on al.expense_id = e.id
         where e.status = 'active' and e.bill_date between p_from and p_to group by 1),
  adj as (select f.property_id, sum(f.amount) filter (where f.kind = 'revenue') rev, sum(f.amount) filter (where f.kind = 'expense') exp
          from financial_adjustments f where f.status = 'active' and f.adj_date between p_from and p_to group by 1),
  c as (
    select p.id pid, p.name, p.units, ag.stayra_pct,
      coalesce(bk.rev,0) br, coalesce(cx.canc,0) ci, coalesce(inc.amt,0) ai, coalesce(adj.rev,0) ra,
      coalesce(bk.ota,0) + coalesce(cx.ota,0) ota, coalesce(ex.ded,0) ded, coalesce(adj.exp,0) ea,
      coalesce(ex.total,0) te, coalesce(ex.pending,0) pe, coalesce(ex.unpaid,0) ue, coalesce(bk.gst,0) gst,
      coalesce(bk.stays,0) stays, coalesce(bk.nights,0) bn, coalesce(occ.nights,0) ns, p.units * (p_to - p_from + 1) an
    from props p left join ag on ag.property_id = p.id left join bk on bk.property_id = p.id left join cx on cx.property_id = p.id
      left join occ on occ.property_id = p.id left join inc on inc.property_id = p.id left join ex on ex.property_id = p.id left join adj on adj.property_id = p.id),
  n as (select c.*, (br + ci + ai + ra) gross, (ded + ota) dedx, (br + ci + ai + ra) - (ded + ota + ea) net from c)
  select pid, name, units, stayra_pct, br, ci, ai, ra, gross, ota, dedx, ea, te + ota, pe, ue, net,
    round(net * coalesce(stayra_pct, 0) / 100, 2), net - round(net * coalesce(stayra_pct, 0) / 100, 2), gst,
    stays, ns, an, round(100.0 * ns / nullif(an, 0), 1), round(br / nullif(bn, 0), 2), round(br / nullif(an, 0), 2)
  from n order by name
$$;
grant execute on function property_pl(date, date, uuid) to authenticated;
