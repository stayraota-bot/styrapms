# Deployment checklist

You will connect four services. Do them in this order.

| Service | Purpose | Region / plan notes |
|---|---|---|
| **Supabase** | Database, login, file storage | Region **South Asia (Mumbai) – ap-south-1**. Pro plan recommended for production (daily backups, no pausing) |
| **GitHub** | Source code | Private repository, default branch `main` |
| **Vercel** | Live application hosting | `vercel.json` pins functions to **bom1 (Mumbai)**. Cron jobs need a Pro plan for daily frequency |
| **Your domain** | e.g. `app.stayra.in` | DNS access at your registrar |

## A. Supabase (≈15 min)

1. supabase.com → New project → name `stayra-prod`, region **Mumbai**, strong DB password. Repeat for `stayra-dev`.
2. Project → **Connect**: copy
   - *Transaction pooler* URI (port **6543**) → `DATABASE_URL`
   - *Direct connection* URI (port 5432) → `DATABASE_URL_DIRECT` (only needed on your machine for migrations)
3. Project Settings → **API**: copy Project URL, `anon` key and `service_role` key (keep the service role key secret).
4. Apply migrations to each project (from your machine):
   ```bash
   npx supabase link --project-ref <ref> && npx supabase db push
   # or: DATABASE_URL_DIRECT='postgresql://…:5432/postgres' npm run db:migrate
   ```
5. Verify: `DATABASE_URL='<direct URI>' npm run db:test` → `✓ 90 database tests passed` (nothing is left behind; it rolls back).
6. Authentication → **URL Configuration**: Site URL = `https://app.stayra.in`. Redirect URLs: `https://app.stayra.in/auth/callback`, `https://*-<your-team>.vercel.app/auth/callback`.
7. Authentication → **SMTP**: connect your mail provider so invitations and password resets come from your domain.
8. Authentication → Providers → Email: disable "Allow new users to sign up" (accounts are created by Super Admin only).
9. Dev project only: `ALLOW_DEMO_SEED=true AUTH_MODE=supabase DATABASE_URL=… NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run db:seed-demo`.

## B. GitHub (≈5 min)

```bash
git remote add origin git@github.com:<org>/stayra-pms.git
git push -u origin main
```
Protect `main` (Settings → Branches → require PR + passing checks) if several people will contribute.

## C. Vercel (≈10 min)

1. vercel.com → Add New → Project → import `stayra-pms`. Framework: Next.js (auto). Leave build settings at their defaults; `vercel.json` sets them.
2. Settings → **Environment Variables**: add each variable twice, once for **Production** (stayra-prod values) and once for **Preview + Development** (stayra-dev values):
   `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`.
   Generate the secrets with `openssl rand -base64 32`.
3. Settings → Functions: confirm region **Mumbai (bom1)**.
4. Deploy. Every push to `main` deploys to production. Branches and PRs get preview URLs on the dev database.
5. Settings → **Cron Jobs**: confirm `/api/cron/daily` (00:30 UTC = 06:00 IST) is listed.

## D. Domain (≈10 min + DNS propagation)

1. Vercel → Project → **Domains** → add `app.stayra.in`.
2. At your DNS provider add the record Vercel shows (usually `CNAME app → cname.vercel-dns.com`).
3. Wait for the green tick (HTTPS certificate is automatic).
4. Update `NEXT_PUBLIC_APP_URL` and Supabase Site URL / Redirect URLs if they differ.

## E. First login

1. Supabase → Authentication → Users → **Add user** (your email + password, "auto confirm").
2. SQL editor:
   ```sql
   insert into profiles(id, email, full_name, role)
   select id, email, 'Your Name', 'super_admin' from auth.users where email = 'you@stayra.in';
   ```
3. Sign in at `https://app.stayra.in`. Then: Settings (company details) → Owners → Properties (with sharing %) → Users.

## Post-deployment checks

- [ ] Login and logout work. Forgot-password email arrives and the link opens "Choose a new password".
- [ ] Create a property manager restricted to one property and confirm they see only that property.
- [ ] Upload a bill (Storage bucket `documents` exists and is **private**).
- [ ] Generate a settlement in the dev project and download the PDF.
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://app.stayra.in/api/cron/daily` returns `{"ok":true…}`.
- [ ] Supabase → Database → Backups enabled (Pro plan) for production.
