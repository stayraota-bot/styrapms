import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const PASS = "Stayra@Demo2026";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox"]
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", "superadmin@stayra.demo");
  await page.fill("input[name=password]", PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click("button[type=submit]")
  ]);

  // Capture CRM Leads Table
  await page.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/16-crm-leads-table.png`, fullPage: false });
  console.log("Captured 16-crm-leads-table.png");

  // Capture CRM Kanban Board
  await page.goto(`${BASE}/leads?view=kanban`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/17-crm-leads-kanban.png`, fullPage: false });
  console.log("Captured 17-crm-leads-kanban.png");

  // Capture CRM Reminders
  await page.goto(`${BASE}/leads?view=reminders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/18-crm-leads-reminders.png`, fullPage: false });
  console.log("Captured 18-crm-leads-reminders.png");

  await browser.close();
}

main().catch(console.error);
