// Mutashabihat, reminder check-ins and learning-view preference. Same harness as test-phase3.mjs.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch {}
    }
    return nextResolve(specifier, context);
  },
});
const root = process.cwd();
const mem = new Map();
globalThis.window = {};
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const dataFiles = new Map(["quran", "layout", "juz", "divisions"].map((n) => [n, resolve(root, `public/data/${n}.json`)]));
globalThis.fetch = async (url) => {
  const name = String(url).split("/").at(-1).replace(/\.json(?:\?.*)?$/, "");
  const path = dataFiles.get(name);
  if (!path) return { ok: false, status: 404 };
  const json = JSON.parse(await readFile(path, "utf8"));
  return { ok: true, json: async () => json };
};
const quran = await import("../src/lib/quran.ts");
await quran.loadCore();
const store = await import("../src/lib/store.ts");
const mut = await import("../src/lib/mutashabihat.ts");
const rem = await import("../src/lib/reminder.ts");

test("Mutashabihat: every curated reference exists and passes the similarity threshold", () => {
  for (const g of mut.MUTASHABIHAT) {
    assert.ok(g.ayahs.length >= 2, g.id);
    for (const [s, a] of g.ayahs) assert.ok(quran.isValidAyah(quran.Q(), s, a), `${g.id}: ${s}:${a} is not a valid Ayah`);
    for (const x of g.ayahs) for (const y of g.ayahs) {
      if (x === y) continue;
      const d = mut.compare(x, y);
      assert.ok(d.shared >= mut.MIN_SHARED, `${g.id}: ${x} vs ${y} shares only ${(d.shared * 100).toFixed(0)}%`);
      assert.equal(d.a.length, quran.words(x[0], x[1]).length);
      assert.equal(d.b.length, quran.words(y[0], y[1]).length);
    }
    assert.ok(g.status === "pending_review" || (g.status === "approved" && g.reviewer), `${g.id}: approved entries need a reviewer`);
  }
});

test("Mutashabihat: comparison kinds and differences are computed from canonical text", () => {
  const exact = mut.compare([2, 5], [31, 5]);
  assert.equal(exact.kind, "exact");
  assert.ok(exact.a.every(Boolean));
  const refrain = mut.compare([77, 15], [77, 19]);
  assert.equal(refrain.kind, "exact");
  const near = mut.compare([2, 48], [2, 123]);
  assert.notEqual(near.kind, "exact");
  assert.ok(near.a.some((x) => !x) && near.b.some((x) => !x), "differing words are marked on both sides");
  assert.ok(near.phrase && near.phrase[1] - near.phrase[0] >= 4, "a long shared opening phrase is found");
});

test("Mutashabihat: unreviewed entries are hidden unless opted in; unknown Ayahs have none", () => {
  assert.equal(mut.matchesFor(2, 48).length, 0, "pending entries hidden by default");
  assert.deepEqual(mut.matchesFor(2, 48, true).map((m) => m.ref), [[2, 123]]);
  assert.equal(mut.matchesFor(1, 2, true).length, 0, "no match → no button");
  assert.equal(mut.matchesFor(26, 8, true).length, 7, "several matches");
});

test("Check-ins are self-reports: they never change Hifz evidence, SRS or plan status", () => {
  const d = store.defaultState();
  d.mem["1:1"] = { iv: 1, due: 0, last: 0, reps: 1, history: [{ at: 1, result: "ok", interval: 1 }] };
  const before = JSON.stringify({ mem: d.mem, weak: d.weak, dailyPlan: d.dailyPlan, lessons: d.lessons });
  rem.recordCheckin(d, "hifz", "yes", "notification");
  rem.recordCheckin(d, "rev", "skip", "app");
  assert.equal(JSON.stringify({ mem: d.mem, weak: d.weak, dailyPlan: d.dailyPlan, lessons: d.lessons }), before);
  const c = rem.checkinFor(d, "hifz");
  assert.equal(c.answer, "yes");
  assert.equal(c.verifiedInApp, false, "nothing was completed in the app: self-reported only");
});

test("Reminder prefs: legacy single reminder maps onto the Hifz reminder; hydrate keeps old saves", () => {
  const legacy = store.hydrateState({ settings: { reminderOn: true, reminderTime: "21:15" } });
  const p = rem.reminderPrefs(legacy);
  assert.equal(p.on, true); assert.equal(p.hifzTime, "21:15"); assert.equal(p.revTime, rem.DEFAULT_REV_TIME);
  assert.equal(legacy.checkins, undefined, "absent until first check-in (keeps sync idempotent)");
  assert.equal(legacy.settings.learnView, undefined, "no view preference until chosen (defaults to Ayah view)");
});

test("Activity status uses the real planner: nothing scheduled → none (no reminder)", () => {
  const d = store.defaultState();
  const h = rem.activityStatus(d, "rev");
  assert.equal(h.state, "none");
});

test("Native bridge: settings are sent as one JSON payload with day bitmask and quiet hours", () => {
  const calls = [];
  globalThis.window.AndroidReminder = { setup: (j) => calls.push(["setup", JSON.parse(j)]), status: (...a) => calls.push(["status", ...a]), configure() {}, report() {}, permitted: () => true, test() {} };
  const d = store.defaultState();
  d.settings.reminders = { on: true, hifzOn: true, hifzTime: "20:30", revOn: false, revTime: "05:45", days: [5, 6], followUpMin: 90, maxFollowUps: 1, quietStart: "23:00", quietEnd: "05:00", sound: "silent" };
  rem.pushReminder(d);
  const setup = calls.find((c) => c[0] === "setup")[1];
  assert.deepEqual(setup, { on: true, hifzOn: true, hifzMin: 1230, revOn: false, revMin: 345, days: 0b1100000, followUp: 90, maxFollow: 1, quietStart: 1380, quietEnd: 300, sound: "silent" });
  assert.equal(calls.filter((c) => c[0] === "status").length, 2);
  delete globalThis.window.AndroidReminder;
});
