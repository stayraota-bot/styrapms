/**
 * Apply SQL migrations in order (fallback to `supabase db push`).
 *   npm run db:migrate            → uses DATABASE_URL_DIRECT (or DATABASE_URL)
 *   npm run db:migrate -- --local → also applies the Supabase shim (plain local Postgres only)
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import postgres from "postgres";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL_DIRECT (or DATABASE_URL)."); process.exit(1); }
const local = process.argv.includes("--local");
const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  const root = path.join(process.cwd(), "supabase");
  if (local) {
    const [{ exists }] = await sql`select to_regclass('auth.users') is not null as exists`;
    if (!exists) { console.log("→ local shim"); await sql.unsafe(readFileSync(path.join(root, "local/00_supabase_shim.sql"), "utf8")); }
  }
  await sql`create table if not exists public._stayra_migrations (name text primary key, applied_at timestamptz default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from public._stayra_migrations`).map((r) => r.name));
  const files = readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    console.log(`→ ${f}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path.join(root, "migrations", f), "utf8"));
      await tx`insert into public._stayra_migrations(name) values (${f})`;
    });
  }
  await sql`alter table public._stayra_migrations enable row level security`;
  console.log("✓ migrations up to date");
  await sql.end();
}
main().catch(async (e) => { console.error(e.message); await sql.end(); process.exit(1); });
