/** Runs the SQL test suite (inside a transaction that is rolled back). Usage: DATABASE_URL=... npm run db:test */
import { execFileSync } from "child_process";
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL"); process.exit(1); }
const out = execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/financial_and_security.test.sql"], { encoding: "utf8" });
console.log(out);
const m = out.match(/\n\s*(\d+)\s*\|\s*(\d+)\s*\n/g)?.pop()?.trim().split("|").map((s) => Number(s.trim()));
if (!m || m[1] !== 0) { console.error("✗ database tests failed"); process.exit(1); }
console.log(`✓ ${m[0]} database tests passed`);
