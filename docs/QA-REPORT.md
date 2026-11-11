# Visual & functional QA report

**Build under test:** production build (`next build && next start`), PostgreSQL 16, demo data seeded fresh, Chrome via Playwright. **Date:** 11 Nov 2026 (IST).
Every screenshot in `docs/screenshots/` was captured from the running application by `tests/e2e/screenshots.mjs`. None are mock-ups.

## Screenshots

| File | Viewport | Logged in as | What it shows |
|---|---|---|---|
| 01-dashboard.png | 1440 | Super Admin | 14 KPIs (all clickable), quick actions, 7 charts, alerts & risks panel |
| 02-properties.png | 1440 | Super Admin | Property list with sharing %, owner, rooms, status tabs, search |
| 03-property-details.png | 1440 | Super Admin | Month KPIs, info, owner, team with access, tabs (rooms / sharing / bookings / documents) |
| 04-bookings.png | 1440 | Super Admin | Filters, quick views (arrivals, departures, in-house, outstanding), balances |
| 05-booking-calendar.png | 1440 | Super Admin | Combined all-property, room-wise timeline with colour legend and alerts |
| 06-booking-details.png | 1440 | Super Admin | Stay/guest, guest balance, booking income vs expenses → net, payment ledger |
| 07-income.png | 1440 | Super Admin | Earned vs collected vs receivable, OTA-collected, transaction list |
| 08-expenses.png | 1440 | Super Admin | Classification badges, approval & payment status, totals |
| 09-revenue-sharing.png | 1440 | Super Admin | Per-property 35/65, 40/60, 50/50, policies, full version history |
| 10-owner-settlement.png | 1440 | Super Admin | Workflow stepper, 13-line statement, entitlement vs cash, payments, line items |
| 11-reports.png | 1440 | Super Admin | Property-wise P&L (FY), chart, CSV/Excel export, 12 report types |
| 12-user-management.png | 1440 | Super Admin | Login IDs, roles, property access, last login, status |
| 13-owner-portal.png | 1440 | Owner (Vikram Mehta) | Only their property, share, statements (PDF), payments received |
| 14-mobile-dashboard.png | 390 | Property Manager | Mobile layout, bottom navigation, quick actions |
| 15-mobile-calendar.png | 390 | Property Manager | Month calendar with occupancy bars, arrivals/departures, high-demand dates |
| extra-* | 1440 / 390 | various | Sharing editor (live 100% check), month calendar, settlements by owner, mobile bookings, mobile housekeeping |

### Financial workflow evidence (`docs/screenshots/workflow/`)

`01-property-rooms` → `02-create-user` → `03-overlap-rejected` → `04-booking-ledger` → `05-expense-with-bill` → `06-settlement-preview` → `07-settlement-paid` → `08-report-pl`, plus the generated statement PDF and `results.json` (31/31 checks).

Worked example verified end-to-end through the UI (40/60 property): room ₹15,000 + food ₹2,000 − approved, paid ration ₹3,000 (unpaid electricity ₹1,000 excluded per policy) = **net ₹14,000 → STAYRA ₹5,600 / owner ₹8,400**. Paid in two instalments (₹4,000 then ₹4,400), status moved Partially Paid → Paid, and ₹0 remained payable.

## Visual QA findings

| # | Area | Finding | Status |
|---|---|---|---|
| 1 | Mobile (all pages) | Wide charts/tables made the page scroll sideways at 390 px | Fixed: grid children shrink, tables scroll inside their card |
| 2 | Calendar room-wise | Day columns stretched too wide; rooms of different properties interleaved | Fixed: fixed 42 px day columns, rooms grouped by property |
| 3 | Dashboard donuts | Pie rendered in a corner inside a responsive container | Fixed: fixed-size pie |
| 4 | Charts | Line/area animations caught mid-draw in captures | Fixed: animations off (also feels snappier) |
| 5 | Bookings list | Default order put far-future bookings first | Fixed: upcoming first, then most recent past |
| 6 | Full-page captures | Fixed bottom nav appears mid-page in very tall mobile captures | Mobile captures are now viewport-sized, like a phone screen |
| 7 | Sidebar | Long pages: sidebar background ended at first screen height | Fixed: sticky sidebar inside a full-height column |

Checked on every screen: consistent spacing, typography (Inter), forest-green palette with sand accents, status badge colours, empty states, loading skeleton (`loading.tsx`), error boundary, success/error toasts, inline field validation, disabled/pending submit buttons.

## Functional test summary

| Suite | Result |
|---|---|
| SQL tests (`npm run db:test`) | 90 / 90 |
| E2E workflow (`tests/e2e/workflow.mjs`) | 31 / 31 |
| Page smoke test (7 roles, 81 page loads) | 0 errors; out-of-role pages redirect, other owners' statements return 404 |
| Unit tests | 5 / 5 |

Brief §22 coverage: create user ✓ · assign role ✓ · owner ✓ · property ✓ · sharing agreement ✓ · room ✓ · booking ✓ · advance ✓ · food income ✓ · expenses ✓ · bill upload ✓ · approve ✓ · net distributable ✓ · owner share ✓ · STAYRA share ✓ · settlement ✓ · approve settlement ✓ · partial payment ✓ · final payment ✓ · reports & exports ✓.
Edge cases: invalid % ✓ · overlapping bookings ✓ · duplicate transactions (idempotency keys) ✓ · refunds & reversals ✓ · unpaid expenses ✓ · agreement changes ✓ · permission restrictions ✓ · owner isolation ✓ · rounding ✓ · historical settlement preservation ✓.
