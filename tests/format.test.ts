import { test } from "node:test";
import assert from "node:assert/strict";
import { inr, fdate, addDays, daysBetween, monthBounds, inrShort } from "../src/lib/format";

test("INR uses Indian digit grouping", () => assert.equal(inr(1234567.5), "₹12,34,567.50"));
test("short INR in lakhs/crores", () => { assert.equal(inrShort(750000), "₹7.50L"); assert.equal(inrShort(12500000), "₹1.25Cr"); });
test("dates never drift across timezones", () => assert.equal(fdate("2026-01-05"), "05 Jan 2026"));
test("date arithmetic", () => { assert.equal(addDays("2026-02-28", 1), "2026-03-01"); assert.equal(daysBetween("2026-01-10", "2026-01-13"), 3); });
test("month bounds incl. leap year", () => assert.deepEqual(monthBounds("2028-02-10"), { start: "2028-02-01", end: "2028-02-29" }));
