import { NextResponse, type NextRequest } from "next/server";
import { sysSql } from "@/lib/db";
import { addDays, todayIST } from "@/lib/format";
import { dispatchPending } from "@/server/notify-channels";

export const runtime = "nodejs";

// Daily job (Vercel Cron, 06:00 IST): recurring bills + reminders. Protected by CRON_SECRET.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("Unauthorized", { status: 401 });
  const t = todayIST();
  const [{ n }] = await sysSql<{ n: number }[]>`select generate_recurring_expenses(${t}::date) n`;
  const arrivals = await sysSql<{ property_id: string; c: number }[]>`select property_id, count(*)::int c from bookings where status in ('confirmed','pending') and check_in = ${addDays(t, 1)}::date group by 1`;
  for (const a of arrivals) await sysSql`select app.notify_property_users(${a.property_id}, array['property_manager','operations','housekeeping']::app_role[], 'checkin_upcoming', ${`${a.c} arrival(s) tomorrow`}, 'Prepare rooms and confirm arrival times', '/calendar', 'info')`;
  const departures = await sysSql<{ property_id: string; c: number }[]>`select property_id, count(*)::int c from bookings where status = 'checked_in' and check_out = ${t}::date group by 1`;
  for (const a of departures) await sysSql`select app.notify_property_users(${a.property_id}, array['property_manager','operations']::app_role[], 'checkout_today', ${`${a.c} check-out(s) today`}, 'Settle guest balances before departure', '/bookings?view=departures', 'info')`;
  const unpaid = await sysSql<{ property_id: string; c: number }[]>`select b.property_id, count(*)::int c from bookings b join booking_financials f on f.booking_id = b.id
    where b.status = 'confirmed' and b.check_in between ${t}::date and ${addDays(t, 2)}::date and f.net_paid = 0 group by 1`;
  for (const a of unpaid) await sysSql`select app.notify_property_users(${a.property_id}, array['property_manager','accountant']::app_role[], 'payment_pending', ${`${a.c} upcoming booking(s) with no payment`}, 'Collect an advance before arrival', '/bookings?view=upcoming', 'warning')`;
  const sent = await dispatchPending();
  return NextResponse.json({ ok: true, date: t, recurringGenerated: n, arrivals: arrivals.length, departures: departures.length, unpaid: unpaid.length, externalSent: sent });
}
