# STAYRA PMS

Multi-property management and revenue-sharing ERP for STAYRA: properties, owners, bookings and calendars, income and expenses with bill uploads, a revenue-sharing engine, owner settlements with PDF statements, reports, maintenance, housekeeping, user management with role-based access, and an owner portal.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn-style components (Radix) · Lucide · Supabase (PostgreSQL, Auth, Storage, RLS) · Vercel (Mumbai `bom1`).

| | |
|---|---|
| Screenshots (real app) | [`docs/screenshots/`](docs/screenshots) · workflow evidence in [`docs/screenshots/workflow/`](docs/screenshots/workflow) |
| Deployment checklist | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| QA report & test results | [`docs/QA-REPORT.md`](docs/QA-REPORT.md) |
| Progress / known issues | [`PROGRESS.md`](PROGRESS.md) |

---

## 1. Architecture

```
Browser ──► Next.js on Vercel (bom1)
              │  proxy.ts            – session gate + Supabase cookie refresh
              │  Server Components    – all reads
              │  Server Actions      – all writes (zod-validated, idempotent where money moves)
              │  /api/*              – PDF statements, CSV/XLSX export, file download, daily cron
              ▼
            PostgreSQL (Supabase, ap-south-1)
              • every request runs inside a transaction as role `authenticated`
                with the signed-in user's id  → Row Level Security applies to every query
              • business rules live in the database: triggers, constraints, SQL functions
            Supabase Auth (login IDs, invites, password reset) · Supabase Storage (bills, photos, agreements)
```

Key decisions:

- **Security is enforced in PostgreSQL, not the UI.** The server connects with a pooled database user, then switches to `authenticated` and sets `request.jwt.claims` for the verified user on every request (`src/lib/db.ts → withUser`). RLS policies (`supabase/migrations/…_security_rls.sql`) decide which properties, finance rows and statements each role can see or change. Server actions re-check permissions before writing. The UI only hides what the user couldn't use anyway.
- **The service-role key never reaches the browser.** It is used only server-side for Auth admin (creating users, invites, bans) and Storage, after the app has authorised the caller.
- **Money is `numeric(14,2)`**, never floating point. Shares are rounded to the paisa with the remainder method (STAYRA = round(net × %), owner = net − STAYRA), so the two always add up exactly to net.
- **Financial history is append-only.** Payment ledgers cannot be edited or deleted (even by a database admin). Income/expenses/bookings are voided, never deleted. Approved settlements are locked; corrections are made with documented adjustment entries.
- **Every change is audited** by a database trigger into a tamper-proof `audit_logs` table.

### Folder map

```
src/app/(auth)/        login, forgot/reset password, auth actions
src/app/(app)/         staff app: dashboard, properties, owners, bookings, calendar, income, expenses,
                       revenue-sharing, settlements, reports, vendors, maintenance, housekeeping,
                       users, settings, audit-logs, notifications
src/app/owner/         owner portal (read-only, own properties only)
src/app/api/           files, exports, settlement PDF, cron
src/server/            analytics, alerts, reports, settlement loader + PDF, auth-admin
src/lib/               db (RLS-scoped access), auth/session, permissions, storage, formatting, action helpers
src/components/        UI kit, charts, forms, shell
supabase/migrations/   schema, business logic, RLS, reference data, reporting
supabase/tests/        SQL test suite (90 tests, runs in a rolled-back transaction)
scripts/               migrate, seed-demo, db-test
tests/                 unit tests, Playwright E2E workflow + screenshot capture
```

## 2. Revenue-sharing engine (how the numbers are made)

```
Eligible revenue          = room revenue of completed stays (net of discount, excl. GST)
                          + cancellation / no-show charges + additional income (F&B, laundry…) ± revenue adjustments
Approved deductible exp.  = approved, deductible, shared-pool expenses (this property's allocated share)
                          + OTA commission ± expense adjustments
Net distributable revenue = eligible revenue − approved deductible expenses
STAYRA share              = round(net × STAYRA %, 2)          Owner share = net − STAYRA share
Final payable             = owner share − owner-borne costs paid by STAYRA + previous outstanding − payments made
```

Rules (implemented in `supabase/migrations/…_business_logic.sql → settlement_lines / preview_settlement / generate_settlement`):

- **Per-property agreements with history.** `create_agreement` adds a new version and closes the old one the day before. It refuses to start inside an already-settled period. Settlements store the split they used, so old statements never change.
- **Expense policy per agreement:** all approved eligible / selected categories only / booking-specific only / property-level only. Owner-borne and STAYRA-borne bills are never in the shared pool. Owner-borne bills paid by STAYRA are recovered from the owner's share.
- **Unpaid bills** are included or excluded per agreement. Excluded ones are shown separately on the statement and picked up by a later settlement once paid.
- **No double counting:** each booking / income / bill / adjustment can sit in only one live settlement (a partial unique index, per property, so shared bills settle once in each property). Late entries dated in an earlier period under the same agreement are picked up by the next settlement rather than lost.
- **Booking-wise or period settlements** (weekly, monthly, quarterly, custom). A period must fall inside one agreement; split it at an agreement change.
- **Entitlement ≠ cash.** Statements also show cash collected in the period and GST collected (pass-through, never shared).
- **Workflow:** Draft → Submitted → Approved (Super Admin only, locks it) → Partially Paid → Paid. Owner payments are capped at the amount due and are idempotent (double-clicks don't duplicate).
- **Reports are accrual-basis.** The P&L and dashboard count all approved deductible bills, paid or not, and flag unpaid amounts. A settlement applies its agreement's unpaid-bill policy, so for a property with unpaid bills the two can differ by exactly the "unpaid bills excluded" figure on the statement.

## 3. Roles

| Role | Can do |
|---|---|
| Super Admin | Everything, including users, sharing %, settlement approval, settings |
| Admin | Assigned properties: bookings, expenses, operations, settlement drafts |
| Property Manager | Assigned properties: bookings, guests, check-in/out, payments, expenses (incl. petty-cash payments), maintenance |
| Accountant | Income, expense approval, adjustments, settlements, owner payments, reports |
| Operations Staff | Check-in/out, operational updates, maintenance. No finance |
| Housekeeping | Own cleaning tasks, maintenance reports. No bookings or finance |
| Property Owner | Owner portal: own properties, performance, approved statements, payments |
| Auditor | Read-only access to authorised financial records and audit logs |

Staff can be assigned specific properties or "all properties". Owners are linked to an owner record and see only that owner's properties.

## 4. Local development

Prerequisites: Node ≥ 20.9, PostgreSQL 15+ (or a Supabase dev project).

```bash
npm ci
cp .env.example .env.local      # then edit
```

**Option A, fully offline (no Supabase):** set `AUTH_MODE=local` and point `DATABASE_URL` at a local Postgres. Local mode adds a small shim for Supabase's `auth` schema and checks passwords against it. It is refused on Vercel production.

```bash
createdb stayra
DATABASE_URL=postgres://postgres@localhost:5432/stayra npm run db:migrate -- --local
AUTH_MODE=local DATABASE_URL=postgres://postgres@localhost:5432/stayra npm run db:seed-demo
npm run dev        # http://localhost:3000
```

**Option B, against a Supabase dev project:** `AUTH_MODE=supabase` with your project's URL/keys. Run migrations (section 6), then seed with `ALLOW_DEMO_SEED=true npm run db:seed-demo`.

Demo logins (password `Stayra@Demo2026`, override with `DEMO_PASSWORD`):

| Role | Email |
|---|---|
| Super Admin | superadmin@stayra.demo |
| Admin | admin@stayra.demo |
| Property Manager | manager@stayra.demo |
| Accountant | accounts@stayra.demo |
| Operations | ops@stayra.demo |
| Housekeeping | housekeeping@stayra.demo |
| Auditor | auditor@stayra.demo |
| Owners | owner.mehta@ / owner.rao@ / owner.malhotra@stayra.demo |

Demo data: STAYRA Mountain Retreat (35/65), STAYRA City Stay (40/60), STAYRA Premium Villa (50/50), ~770 bookings over 4 months plus upcoming, F&B income, ration/electricity/maintenance bills, settlements in every workflow state, and payments. Every demo row is flagged `is_demo` and marked **DEMO** in the UI. The seeder refuses to run on a database that contains any non-demo property, and on Supabase it also requires `ALLOW_DEMO_SEED=true`.

## 5. Testing

```bash
npm run typecheck
npm test                                   # unit tests (formatting, dates)
DATABASE_URL=… npm run db:test             # 90 SQL tests: engine, rounding, locking, RLS isolation (rolled back)
npm run build && npm start                 # then, against the running app:
CHROME_PATH=/path/to/chrome node tests/e2e/workflow.mjs      # 31-check business workflow through the UI
CHROME_PATH=/path/to/chrome node tests/e2e/screenshots.mjs   # regenerates docs/screenshots
```

## 6. Database migrations

Migrations are plain SQL in `supabase/migrations/` (apply in filename order):

1. `…01_core_schema.sql`: tables, enums, constraints (incl. exclusion constraint against double bookings)
2. `…02_business_logic.sql`: guards, ledgers, revenue-sharing engine, settlement workflow, notifications, audit
3. `…03_security_rls.sql`: Row Level Security for every table
4. `…04_reference_data.sql`: categories, settings, private `documents` storage bucket
5. `…05_reporting.sql`: `property_pl()` reporting function
6. `…06_manager_expense_payments.sql`: managers may record petty-cash bill payments

Apply with either:

- **Supabase CLI (recommended):** `supabase link --project-ref <ref>` then `supabase db push`
- **Built-in runner:** `DATABASE_URL_DIRECT=<direct 5432 connection> npm run db:migrate` (records applied files in `_stayra_migrations`)

**Never** apply `supabase/local/00_supabase_shim.sql` to Supabase. It exists only for plain-Postgres development and CI.

## 7. Deployment (GitHub → Vercel + Supabase)

Full click-by-click checklist: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). In short:

1. **Supabase:** create two projects in region **ap-south-1 (Mumbai)**, `stayra-prod` and `stayra-dev`. Run migrations on both. Seed demo data only into `stayra-dev`.
2. **Supabase Auth:** set Site URL to your domain. Add `https://<domain>/auth/callback` and your Vercel preview URL pattern to Redirect URLs. Configure SMTP for invitation and reset emails.
3. **GitHub:** push this repo (default branch `main`).
4. **Vercel:** import the repo (framework auto-detected; `vercel.json` pins region `bom1` and the daily cron). Add environment variables:
   - Production → `stayra-prod` values
   - Preview + Development → `stayra-dev` values

   | Variable | Scope | Notes |
   |---|---|---|
   | `AUTH_MODE` | all | `supabase` |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | public |
   | `NEXT_PUBLIC_APP_URL` | all | e.g. `https://app.stayra.in` |
   | `SUPABASE_SERVICE_ROLE_KEY` | all | **secret**, server-only |
   | `DATABASE_URL` | all | Supavisor **transaction pooler** (port 6543) |
   | `AUTH_SECRET`, `CRON_SECRET` | all | long random strings |
5. Pushes to `main` deploy to production. Every other branch or PR gets a preview deployment against the dev project.
6. **Custom domain:** Vercel → Project → Domains → add `app.stayra.in`. Add the CNAME it shows at your DNS provider, then update Supabase Site URL / Redirect URLs.
7. **First Super Admin:** in Supabase → Authentication → Users → *Add user*, then in the SQL editor:
   `insert into profiles(id, email, full_name, role) select id, email, 'Your Name', 'super_admin' from auth.users where email = 'you@stayra.in';`
   Create everyone else from **Users** in the app.

## 8. Notifications

In-app notifications are created by database triggers (new bookings, expense approvals, settlements, owner payments, critical maintenance, cancellations) and by the daily cron (upcoming check-ins/check-outs, unpaid upcoming bookings). Email and WhatsApp delivery are prepared as pluggable channels in `src/server/notify-channels.ts`: implement `send()` for a provider and set its keys.

## 9. Conventions

- Currency INR (₹, Indian digit grouping), timezone Asia/Kolkata, financial year April–March.
- Dates are handled as `YYYY-MM-DD` strings end-to-end (no timezone drift).
- Uploads: JPG/PNG/WEBP/HEIC/PDF up to 10 MB, private bucket, served only after an RLS check.
