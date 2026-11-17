// Worldwide local date/time for the dashboard header (src/lib/localTime.ts): time zones, local midnight,
// daylight-saving transitions and the Hijri date. Fixed instants + explicit zones, so results do not depend on
// the machine running the test.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
registerHooks({ resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) { try { return nextResolve(`${specifier}.ts`, context); } catch {} }
  return nextResolve(specifier, context);
} });
const lt = await import("../src/lib/localTime.ts");

const at = (iso, timeZone, extra = {}) => lt.headerTime(new Date(iso), { timeZone, locale: "en-GB", hour12: false, ...extra });

const MIDNIGHT = [
  // zone, last minute of 16 Nov 2026 (UTC instant), first minute of 17 Nov
  ["Saudi Arabia", "Asia/Riyadh", "2026-11-16T20:59:00Z", "2026-11-16T21:00:00Z"],
  ["India", "Asia/Kolkata", "2026-11-16T18:29:00Z", "2026-11-16T18:30:00Z"],
  ["United Kingdom", "Europe/London", "2026-11-16T23:59:00Z", "2026-11-17T00:00:00Z"],
  ["USA (New York)", "America/New_York", "2026-11-17T04:59:00Z", "2026-11-17T05:00:00Z"],
  ["Japan", "Asia/Tokyo", "2026-11-16T14:59:00Z", "2026-11-16T15:00:00Z"],
  ["Australia (Sydney, summer time)", "Australia/Sydney", "2026-11-16T12:59:00Z", "2026-11-16T13:00:00Z"],
];

for (const [name, zone, before, after] of MIDNIGHT) {
  test(`${name}: local date and clock roll over at local midnight`, () => {
    const a = at(before, zone), b = at(after, zone);
    assert.equal(a.time, "23:59"); assert.match(a.date, /Monday,? 16 November 2026/);
    assert.equal(b.time, "00:00"); assert.match(b.date, /Tuesday,? 17 November 2026/);
    assert.notEqual(a.hijri, b.hijri, "Hijri date advances with the local day");
  });
}

test("Same instant shows each zone's own date (no fixed country or offset)", () => {
  const instant = "2026-11-16T22:30:00Z";
  assert.match(at(instant, "Asia/Tokyo").date, /17 November/);
  assert.match(at(instant, "America/New_York").date, /16 November/);
  assert.equal(at(instant, "Asia/Kolkata").time, "04:00");
  assert.equal(at(instant, "Asia/Riyadh").time, "01:30");
});

test("Daylight saving: UK autumn change (BST → GMT)", () => {
  const a = at("2026-10-25T00:59:00Z", "Europe/London"), b = at("2026-10-25T01:00:00Z", "Europe/London");
  assert.equal(a.time, "01:59"); assert.equal(a.zone, "BST");
  assert.equal(b.time, "01:00"); assert.equal(b.zone, "GMT");
});

test("Daylight saving: USA spring change (EST → EDT)", () => {
  const a = at("2026-03-08T06:59:00Z", "America/New_York", { locale: "en-US" }), b = at("2026-03-08T07:00:00Z", "America/New_York", { locale: "en-US" });
  assert.equal(a.time, "01:59"); assert.equal(a.zone, "EST");
  assert.equal(b.time, "03:00"); assert.equal(b.zone, "EDT");
});

test("Daylight saving: Australia autumn change (AEDT → AEST)", () => {
  const a = at("2026-04-04T15:59:00Z", "Australia/Sydney"), b = at("2026-04-04T16:00:00Z", "Australia/Sydney");
  assert.equal(a.time, "02:59"); assert.equal(b.time, "02:00");
  assert.notEqual(a.zone, b.zone);
});

test("Zones without daylight saving stay fixed all year (Riyadh, Kolkata, Tokyo)", () => {
  for (const z of ["Asia/Riyadh", "Asia/Kolkata", "Asia/Tokyo"]) assert.equal(at("2026-01-15T12:00:00Z", z).zone, at("2026-07-15T12:00:00Z", z).zone);
});

test("Locale formatting and 12/24-hour follow the device unless chosen", () => {
  const us = lt.headerTime(new Date("2026-11-16T18:05:00Z"), { timeZone: "UTC", locale: "en-US" });
  assert.match(us.time, /6:05\s?PM/);
  const gb = lt.headerTime(new Date("2026-11-16T18:05:00Z"), { timeZone: "UTC", locale: "en-GB" });
  assert.equal(gb.time, "18:05");
  assert.match(lt.headerTime(new Date("2026-11-16T18:05:00Z"), { timeZone: "UTC", locale: "en-GB", hour12: true }).time, /6:05\s?pm/i);
});

test("Hijri: the adjustment shifts by whole local days; every listed calendar is supported", () => {
  const base = at("2026-11-16T12:00:00Z", "Asia/Riyadh"), next = at("2026-11-17T12:00:00Z", "Asia/Riyadh");
  assert.equal(at("2026-11-16T12:00:00Z", "Asia/Riyadh", { hijriOffset: 1 }).hijri, next.hijri);
  assert.ok(base.hijriSupported && /AH|\d{4}/.test(base.hijri));
  for (const c of lt.HIJRI_CALENDARS) assert.ok(at("2026-11-16T12:00:00Z", "Europe/London", { hijriCalendar: c.id }).hijriSupported, c.id);
});

test("Clock ticks exactly on the next minute boundary", () => {
  assert.equal(lt.msToNextMinute(Date.UTC(2026, 10, 16, 23, 59, 30)), 30_050);
});

test("No hard-coded country, offset or bullet mojibake in the header code", async () => {
  for (const f of ["src/lib/localTime.ts", "src/components/DashboardHeader.tsx"]) {
    const s = await readFile(f, "utf8");
    assert.ok(!/Asia\/Riyadh|GMT\+3|UTC\+3|\+03:00/.test(s), `${f} hard-codes a zone`);
    assert.ok(!/â€|Â·|Ã/.test(s), `${f} contains mojibake`);
  }
});
