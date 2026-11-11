/**
 * Captures the brief's screenshot set from the RUNNING application (no mock-ups).
 *   BASE_URL=http://localhost:3000 CHROME_PATH=/usr/bin/google-chrome node tests/e2e/screenshots.mjs
 * Requires the demo data (npm run db:seed-demo). Output: docs/screenshots/
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = process.env.DEMO_PASSWORD ?? "Stayra@Demo2026";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
async function session(email, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", email); await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return { page, ctx };
}
async function shot(page, path, file, { full = true, before } = {}) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  if (before) await before(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: full });
  console.log("✓", file, "←", path);
}
const firstHref = async (page, path, selector) => { await page.goto(BASE + path, { waitUntil: "networkidle" }); return page.getAttribute(selector, "href"); };

const { page: sa } = await session("superadmin@stayra.demo", 1440);
await shot(sa, "/", "01-dashboard.png");
await shot(sa, "/properties", "02-properties.png");
const prop = await firstHref(sa, "/properties", "table a[href^='/properties/']");
await shot(sa, `${prop}`, "03-property-details.png");
await shot(sa, "/bookings", "04-bookings.png", { full: false });
await shot(sa, "/calendar?view=rooms", "05-booking-calendar.png");
const bk = await firstHref(sa, "/bookings?view=inhouse", "table a[href^='/bookings/']");
await shot(sa, bk, "06-booking-details.png");
await shot(sa, "/income", "07-income.png", { full: false });
await shot(sa, "/expenses", "08-expenses.png", { full: false });
await shot(sa, "/revenue-sharing", "09-revenue-sharing.png");
const stl = await firstHref(sa, "/settlements?status=outstanding", "table a[href^='/settlements/']");
await shot(sa, stl, "10-owner-settlement.png");
await shot(sa, "/reports?tab=pl&range=this_year", "11-reports.png");
await shot(sa, "/users", "12-user-management.png");
// extra evidence
await shot(sa, "/revenue-sharing", "extra-revenue-sharing-editor.png", { full: false, before: async (p) => { await p.getByRole("button", { name: "Edit %" }).first().click(); await p.waitForSelector("[role=dialog]"); } });
await shot(sa, "/calendar", "extra-calendar-month.png");
await shot(sa, "/settlements", "extra-settlements-list.png");

const { page: own } = await session("owner.mehta@stayra.demo", 1440);
await shot(own, "/owner", "13-owner-portal.png");

const { page: mob } = await session("manager@stayra.demo", 390);
await shot(mob, "/", "14-mobile-dashboard.png", { full: false });
await shot(mob, "/calendar", "15-mobile-calendar.png", { full: false, before: (p) => p.evaluate(() => window.scrollTo(0, 260)) });
await shot(mob, "/bookings", "extra-mobile-bookings.png", { full: false });
const { page: hk } = await session("housekeeping@stayra.demo", 390);
await shot(hk, "/housekeeping", "extra-mobile-housekeeping.png", { full: false });
await browser.close();
