/**
 * End-to-end business workflow through the real UI (brief §22), with screenshot evidence.
 *   BASE_URL=http://localhost:3000 CHROME_PATH=/usr/bin/google-chrome node tests/e2e/workflow.mjs
 * Creates records prefixed "E2E" in a dev/demo database.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = process.env.DEMO_PASSWORD ?? "Stayra@Demo2026";
const OUT = "docs/screenshots/workflow"; mkdirSync(OUT, { recursive: true });
const stamp = Date.now().toString(36).slice(-4).toUpperCase();
const ist = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const [Y, M] = ist.split("-").map(Number);
const pm = (d) => new Date(Date.UTC(Y, M - 2, d)).toISOString().slice(0, 10); // day d of previous month
const prevStart = pm(1), prevEnd = new Date(Date.UTC(Y, M - 1, 0)).toISOString().slice(0, 10);
const results = []; let n = 0;
const ok = (name, cond, detail = "") => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const money = (s) => Number(String(s).replace(/[^\d.-]/g, ""));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
async function login(email, password = PASS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`); await page.fill("input[name=email]", email); await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return page;
}
const snap = (page, name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
const dialog = (page) => page.locator("[role=dialog]");
async function confirmIn(page, buttonName, confirmName = "Confirm") {
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  await dialog(page).getByRole("button", { name: confirmName }).click();
  await page.waitForSelector("[role=dialog]", { state: "detached" }); await page.waitForLoadState("networkidle");
}
const toast = async (page) => (await page.locator("[data-sonner-toast]").last().textContent({ timeout: 15000 }).catch(() => "")) ?? "";

try {
  const sa = await login("superadmin@stayra.demo");
  // 3. Create an owner
  await sa.goto(`${BASE}/owners`); await sa.getByRole("button", { name: "Add Owner" }).click();
  await dialog(sa).locator("[name=full_name]").fill(`E2E Owner ${stamp}`); await dialog(sa).locator("[name=phone]").fill("9876543210");
  await dialog(sa).locator("[name=pan]").fill("ABCDE1234F"); await dialog(sa).getByRole("button", { name: "Add owner" }).click();
  await sa.waitForURL(/\/owners\/[0-9a-f-]{36}/); ok("3. Owner created", true, sa.url().split("/").pop());

  // 4–6. Add property + sharing agreement (40/60) + rooms
  await sa.goto(`${BASE}/properties/new`);
  await sa.fill("[name=name]", `E2E Lakeview ${stamp}`); await sa.selectOption("[name=category]", "homestay");
  await sa.fill("[name=city]", "Nashik"); await sa.selectOption("[name=owner_id]", { label: `E2E Owner ${stamp}` });
  await sa.fill("[name=stayra_pct]", "40"); await sa.fill("[name=effective_from]", prevStart);
  await sa.fill("[name=rooms]", "Lake Room | Deluxe | 2 | 5000");
  await sa.getByRole("button", { name: "Create property" }).click();
  await sa.waitForURL(/\/properties\/[0-9a-f-]{36}$/); const propUrl = sa.url(); const propId = propUrl.split("/").pop();
  ok("4–5. Property created with 40/60 agreement", (await sa.textContent("body")).includes("40 / 60"));
  await sa.goto(`${propUrl}?tab=rooms`); await sa.getByRole("button", { name: "Add room" }).click();
  await dialog(sa).locator("[name=name]").fill("Garden Room"); await dialog(sa).locator("[name=base_rate]").fill("4000");
  await dialog(sa).getByRole("button", { name: "Add room" }).click(); await sa.waitForSelector("text=Garden Room");
  ok("6. Room added", true); await snap(sa, "property-rooms");

  // 1–2. Create a user and assign role + property
  const mgrEmail = `e2e.mgr.${stamp.toLowerCase()}@stayra.demo`;
  await sa.goto(`${BASE}/users/new`); await sa.fill("[name=full_name]", `E2E Manager ${stamp}`); await sa.fill("[name=email]", mgrEmail);
  await sa.fill("[name=password]", "E2eTest2026pass"); await sa.check("input[name=role][value=property_manager]");
  await sa.getByLabel(`E2E Lakeview ${stamp}`).check(); await snap(sa, "create-user");
  await sa.getByRole("button", { name: "Create user" }).click(); await sa.waitForURL(/\/users\/[0-9a-f-]{36}/);
  ok("1–2. User created with Property Manager role and property access", true, mgrEmail);

  // 7–8. Booking with advance payment (as the new manager)
  const mg = await login(mgrEmail, "E2eTest2026pass");
  await mg.goto(`${BASE}/properties`, { waitUntil: "networkidle" });
  ok("Permission: new manager sees only the assigned property", (await mg.locator("table tbody tr").count()) === 1);
  const newBooking = async () => {
    await mg.goto(`${BASE}/bookings/new?property=${propId}`, { waitUntil: "networkidle" });
    await mg.selectOption("[name=unit_id]", { index: 2 }); // Lake Room (sorted after Garden Room)
    await mg.fill("[name=check_in]", pm(10)); await mg.fill("[name=check_out]", pm(13));
    await mg.fill("[name=guest_name]", "Test Guest"); await mg.fill("[name=guest_phone]", "9000011111");
    await mg.fill("[name=room_amount]", "15000"); await mg.fill("[name=advance]", "5000"); await mg.selectOption("[name=advance_method]", "upi");
    await mg.getByRole("button", { name: "Create booking" }).click();
  };
  await newBooking(); await mg.waitForURL(/\/bookings\/[0-9a-f-]{36}$/); const bookingUrl = mg.url();
  ok("7–8. Booking created with ₹5,000 advance", (await mg.textContent("body")).includes("₹5,000.00"));
  await newBooking(); const err = await mg.getByText(/already has a confirmed booking/).first().textContent({ timeout: 20000 }).catch(() => "no error shown");
  ok("Negative: overlapping confirmed booking rejected", /already has a confirmed booking/.test(err), err.trim()); await snap(mg, "overlap-rejected");
  await mg.goto(bookingUrl);
  await confirmIn(mg, "Check in"); await confirmIn(mg, "Check out");
  ok("Check-in → check-out", (await mg.textContent("body")).includes("Checked out"));
  // 9. Additional food income on the folio
  await mg.getByRole("button", { name: "Add charge" }).click();
  await dialog(mg).locator("[name=amount]").fill("2000"); await dialog(mg).locator("input[name=description]").fill("Dinner for 2");
  await dialog(mg).locator("[name=txn_date]").fill(pm(12)); await dialog(mg).getByRole("button", { name: "Add charge" }).click();
  await mg.waitForSelector("text=Dinner for 2"); ok("9. Food income ₹2,000 recorded", true);
  await mg.getByRole("button", { name: "Record payment" }).click(); await dialog(mg).locator("[name=paid_at]").fill(pm(13));
  await dialog(mg).getByRole("button", { name: "Save entry" }).click(); await mg.waitForSelector("[role=dialog]", { state: "detached" }); await mg.waitForLoadState("networkidle");
  const bal = await mg.locator("text=Balance due").locator("..").textContent();
  ok("Guest balance settled to ₹0", /₹0\.00/.test(bal), bal); await snap(mg, "booking-ledger");

  // 10–11. Expenses + bill upload
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const addExpense = async (cat, desc, amt, paid) => {
    await mg.goto(`${BASE}/expenses/new?property=${propId}`, { waitUntil: "networkidle" }); await mg.waitForSelector("[name=category_id]", { state: "visible", timeout: 60000 });
    await mg.selectOption("[name=category_id]", { label: cat }); await mg.fill("input[name=description]", desc); await mg.fill("[name=amount]", amt);
    await mg.fill("[name=bill_date]", pm(12)); await mg.selectOption("[name=paid_now]", paid ? "paid" : "unpaid");
    if (paid) await mg.setInputFiles("[name=bill]", { name: "ration-bill.png", mimeType: "image/png", buffer: png });
    await mg.getByRole("button", { name: "Submit expense" }).click();
    await mg.waitForURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 30000 }).catch(async () => { await snap(mg, "expense-error"); throw new Error("Expense not saved: " + (await mg.locator("form p.text-red-600, form [role=alert]").allTextContents()).join("; ")); });
    return mg.url();
  };
  const e1 = await addExpense("Ration", "E2E ration bill", "3000", true);
  ok("10–11. Ration bill ₹3,000 with uploaded bill (pending approval)", (await mg.textContent("body")).includes("Pending") && (await mg.locator("img[alt=Bill]").count()) === 1);
  await snap(mg, "expense-with-bill");
  const e2 = await addExpense("Electricity", "E2E electricity", "1000", false);
  ok("Permission: manager cannot approve", (await mg.getByRole("button", { name: "Approve" }).count()) === 0);

  // 12. Accountant approves
  const ac = await login("accounts@stayra.demo");
  for (const e of [e1, e2]) { await ac.goto(e); await confirmIn(ac, "Approve"); }
  ok("12. Accountant approved both expenses", (await ac.textContent("body")).includes("Approved"));

  // 13–16. Calculate & generate settlement
  await sa.goto(`${BASE}/settlements/preview?property=${propId}&from=${prevStart}&to=${prevEnd}`); await sa.waitForLoadState("networkidle");
  const body = await sa.textContent("body"); await snap(sa, "settlement-preview");
  const cardVal = async (label) => money(await sa.locator(`text=${label}`).first().locator("..").locator("p").nth(1).textContent());
  const net = await cardVal("Net distributable"); const owner = await cardVal("Owner share (60%)");
  ok("13. Net distributable = 15,000 + 2,000 − 3,000 = ₹14,000 (unpaid electricity excluded)", net === 14000, String(net));
  ok("14. Owner share 60% = ₹8,400", owner === 8400, String(owner));
  ok("15. STAYRA share 40% = ₹5,600", body.includes("₹5,600.00"));
  await sa.getByRole("button", { name: "Generate draft settlement" }).click(); await sa.waitForURL(/\/settlements\/[0-9a-f-]{36}$/);
  const stlUrl = sa.url(); const stlId = stlUrl.split("/").pop(); ok("16. Draft settlement generated", true, stlId);
  await confirmIn(sa, "Submit for approval"); await confirmIn(sa, "Approve");
  ok("17. Settlement approved & locked", (await sa.textContent("body")).includes("Locked"));
  const pay = async (amt) => { await sa.getByRole("button", { name: "Record payment" }).click(); await dialog(sa).locator("[name=amount]").fill(amt);
    await dialog(sa).locator("[name=reference]").fill(`UTR${amt}`); await dialog(sa).getByRole("button", { name: "Save payment" }).click();
    await sa.waitForSelector("[role=dialog]", { state: "detached" }); await sa.waitForLoadState("networkidle"); };
  await pay("4000"); ok("18. Partial owner payment → Partially Paid", (await sa.textContent("body")).includes("Partially paid"));
  await pay("4400"); const done = await sa.textContent("body");
  ok("19. Final owner payment → Paid, nothing payable", done.includes("Paid") && /Final payable to owner\s*₹0\.00/.test(done.replace(/\s+/g, " ")));
  await snap(sa, "settlement-paid");
  const pdf = await sa.request.get(`${BASE}/api/settlements/${stlId}/pdf`); ok("Settlement PDF downloads", pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf");
  writeFileSync(`${OUT}/settlement-${stamp}.pdf`, await pdf.body());

  // 20. Reports + export
  await sa.goto(`${BASE}/reports?tab=pl&range=custom&from=${prevStart}&to=${prevEnd}&property=${propId}`); await snap(sa, "report-pl");
  // Reports are accrual-basis (all approved deductible bills, paid or not): 17,000 − 3,000 − 1,000 = 13,000, with ₹1,000 shown as unpaid.
  const rep = await sa.textContent("body");
  ok("20. P&L report (accrual): net ₹13,000 incl. unpaid electricity, unpaid ₹1,000 flagged", rep.includes("₹13,000.00") && rep.includes("₹1,000.00"));
  const x = await sa.request.get(`${BASE}/api/export/pl?range=custom&from=${prevStart}&to=${prevEnd}&property=${propId}&format=xlsx`);
  ok("Excel export downloads", x.status() === 200 && /spreadsheetml/.test(x.headers()["content-type"]));
  const c = await sa.request.get(`${BASE}/api/export/pl?range=custom&from=${prevStart}&to=${prevEnd}&property=${propId}&format=csv`);
  ok("CSV export contains the net", (await c.text()).includes("13000"));

  // Negative + security checks
  await sa.goto(`${BASE}/revenue-sharing?property=${propId}&edit=1`); await dialog(sa).locator("[name=stayra_pct]").fill("120");
  ok("Negative: invalid sharing % (120) blocked", await dialog(sa).getByRole("button", { name: "Save new agreement version" }).isDisabled());
  await dialog(sa).locator("[name=stayra_pct]").fill("45"); await dialog(sa).locator("[name=effective_from]").fill(pm(15));
  await dialog(sa).getByRole("button", { name: "Save new agreement version" }).click();
  const t1 = await toast(sa); ok("Negative: agreement change inside a settled period rejected", /Settlements already exist/.test(t1), t1);
  const settledLocked = await (async () => { await sa.goto(stlUrl); return (await sa.textContent("body")).includes("STAYRA 40% / Owner 60%"); })();
  ok("Historical settlement keeps 40/60", settledLocked);
  const owner2 = await login("owner.mehta@stayra.demo");
  ok("Owner isolation: another owner's property is invisible", !(await owner2.textContent("body")).includes(`E2E Lakeview ${stamp}`));
  ok("Owner isolation: another owner's statement PDF is 404", (await owner2.request.get(`${BASE}/api/settlements/${stlId}/pdf`)).status() === 404);
  ok("Owner isolation: export endpoints forbidden for owners", (await owner2.request.get(`${BASE}/api/export/pl`)).status() === 403);
  const hk = await login("housekeeping@stayra.demo");
  await hk.goto(`${BASE}/income`, { waitUntil: "networkidle" }); ok("Housekeeping cannot open finance pages", !new URL(hk.url()).pathname.startsWith("/income"));
} catch (e) {
  ok("Workflow aborted", false, e.message.split("\n").slice(0, 3).join(" "));
} finally {
  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ run: new Date().toISOString(), passed, failed: results.length - passed, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}
