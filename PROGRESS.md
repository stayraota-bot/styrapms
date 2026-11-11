# STAYRA PMS — progress log

_Last updated: 11 Nov 2026_

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation & database | Normalised schema (30 tables), constraints, triggers, audit, migrations | ✅ Done |
| 2 Authentication & permissions | Supabase Auth (+ offline local mode), 8 roles, property assignments, RLS on every table, server-side checks | ✅ Done |
| 3 Properties & owners | Add/edit/archive/reactivate, rooms, photos, documents, owner records & bank details | ✅ Done |
| 4 Bookings & calendar | Booking CRUD, check-in/out/cancel/no-show, payment ledger, folio charges, month/week/day/room-wise calendars, blocks, demand rules, alerts | ✅ Done |
| 5 Income & expenses | Income (earned/collected/receivable), expenses with classification, bill upload, approval workflow, shared allocation, vendor payments, recurring bills | ✅ Done |
| 6 Revenue-sharing engine | Versioned agreements, expense policies, booking/period calculations, rounding, adjustments | ✅ Done |
| 7 Owner settlements | Preview, Draft→Submitted→Approved→Partially Paid→Paid, locking, payments, PDF statement | ✅ Done |
| 8 Analytics & reports | 12 reports, dashboard KPIs & charts, CSV/Excel export | ✅ Done |
| 9 Maintenance & housekeeping | Tickets (priority/status/assignment/photo), housekeeping tasks, room readiness | ✅ Done |
| 10 Testing, screenshots, deployment | SQL suite, E2E workflow, screenshots, build | ✅ Done locally · ⏳ Vercel/Supabase deployment needs your accounts |

## Database migrations

| File | Contents |
|---|---|
| 20261111000001_core_schema.sql | Tables, enums, sequences, constraints |
| 20261111000002_business_logic.sql | Guards, ledgers, engine, workflow, notifications, audit |
| 20261111000003_security_rls.sql | RLS policies, grants, operational triggers |
| 20261111000004_reference_data.sql | Categories, settings, storage bucket |
| 20261111000005_reporting.sql | `property_pl()` |
| 20261111000006_manager_expense_payments.sql | Managers may record petty-cash bill payments (found by E2E test) |

## Test results (11 Nov 2026)

- `npm run typecheck`: clean · `next build`: success (42 routes)
- SQL suite: **90 / 90 passed** (agreements & % validation, overlap protection, ledger immutability, refunds/reversals, approvals, engine maths, rounding, double-count prevention, agreement history, shared allocation, owner/housekeeping/ops/auditor isolation, role escalation, audit tamper-proofing)
- E2E workflow through the UI: **31 / 31 passed** (`docs/screenshots/workflow/results.json`)
- Page smoke test: 81 page loads across 7 roles, 0 errors
- Unit tests: 5 / 5

## Bugs found and fixed by testing

1. A shared expense settled in one property blocked its share in the others → the double-count lock is now per property.
2. Property managers could not save bills marked "Paid" (RLS blocked the payment row) → migration 006.
3. A query column collision on the Revenue-sharing page meant "Edit %" targeted the agreement id instead of the property → fixed.
4. Form fields crashed in production when server-rendered inputs arrived as lazy references → `Field` handles both.
5. Mobile pages scrolled sideways because of wide charts/tables → grid children may now shrink.

## Known limitations / next steps

- **Not yet deployed.** Needs your Supabase, GitHub and Vercel accounts (see `docs/DEPLOYMENT.md`). All tests ran against PostgreSQL 16 with the same migrations; the Supabase Auth/Storage code paths (invites, reset emails, signed URLs) are implemented but were not exercised live, because there was no Supabase project to run them against.
- Email / WhatsApp delivery: channel interfaces are in place, providers not connected.
- Google login and magic links (shown on the visual board) aren't enabled. Add them in Supabase Auth → Providers; the login page needs one button.
- OTA channel-manager sync (Airbnb/Booking.com APIs) is out of scope; bookings are entered manually or via the form.
- Reports are accrual-based. Settlements apply each agreement's unpaid-bill policy (documented in README §2).
