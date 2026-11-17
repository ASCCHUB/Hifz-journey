// B1 storage-protection tests: quota / blocked / failing storage, retry, migration, ordering, isolation, size.
// Uses fake backends with the same contracts as IndexedDB and localStorage. Assertions check what was actually
// PERSISTED (by reloading from the backends), not only the in-memory state. Synthetic data only.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

registerHooks({ resolve(s, c, n) { if ((s.startsWith("./") || s.startsWith("../")) && !/\.[a-z]+$/i.test(s)) { try { return n(`${s}.ts`, c); } catch {} } return n(s, c); } });
const root = process.cwd();
globalThis.window = {};
const dataFiles = new Map(["quran", "layout", "juz", "divisions"].map((n) => [n, resolve(root, `public/data/${n}.json`)]));
globalThis.fetch = async (url) => { const name = String(url).split("/").at(-1).replace(/\.json(?:\?.*)?$/, ""); const p = dataFiles.get(name); if (!p) return { ok: false, status: 404 }; const json = JSON.parse(await readFile(p, "utf8")); return { ok: true, json: async () => json }; };

const quran = await import("../src/lib/quran.ts"); await quran.loadCore();
const store = await import("../src/lib/store.ts");
const persist = await import("../src/lib/persist.ts");
const GUEST = "hifz-companion-state-v1:guest", USER = "hifz-companion-state-v1:user:u1", LEGACY = "hifz-companion-state-v1";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); await persist.flush(store.currentProfileKey()); for (let i = 0; i < 3; i++) await tick(); };

/** localStorage stand-in with a byte quota (UTF-16: 2 bytes per char) and a "blocked" switch. */
function fakeMirror(quotaBytes = Infinity) {
  const m = new Map(); const o = { quota: quotaBytes, blocked: false, map: m,
    getItem: (k) => (o.blocked ? (() => { throw new DOMException("blocked", "SecurityError"); })() : m.get(k) ?? null),
    setItem: (k, v) => { if (o.blocked) throw new DOMException("blocked", "SecurityError"); let used = 0; m.forEach((val, key) => { if (key !== k) used += (key.length + val.length) * 2; }); if (used + (k.length + v.length) * 2 > o.quota) throw new DOMException("quota", "QuotaExceededError"); m.set(k, v); },
    removeItem: (k) => { m.delete(k); } };
  return o;
}
/** IndexedDB stand-in honouring the putIfNewer contract, with failure and delay switches. */
function fakeDurable() {
  const states = new Map(), aux = new Map();
  const o = { states, aux, fail: null, delay: 0, puts: 0, name: "fake",
    async get(k) { if (o.fail === "blocked") throw new DOMException("blocked", "InvalidStateError"); const r = states.get(k); return r ? structuredClone(r) : null; },
    async putIfNewer(k, rec) {
      if (o.delay) await new Promise((r) => setTimeout(r, o.delay));
      if (o.fail === "quota") throw new DOMException("quota", "QuotaExceededError");
      if (o.fail === "tx") throw new DOMException("aborted", "AbortError");
      if (o.fail === "blocked") throw new DOMException("blocked", "InvalidStateError");
      const cur = states.get(k); if (cur && cur.t > rec.t) return cur; states.set(k, structuredClone(rec)); o.puts++; return rec;
    },
    async getAux(k) { return aux.has(k) ? structuredClone(aux.get(k)) : null; },
    async putAux(k, v) { if (o.fail) throw new DOMException("x", o.fail === "quota" ? "QuotaExceededError" : "AbortError"); aux.set(k, structuredClone(v)); } };
  return o;
}
/** Start the app on given backends as profile `userId` (null = guest) and wait for hydration. */
async function boot(d, m, userId = null) { store.usePersistenceBackends(d, m); store.setProfile(userId); store.getState(); await settle(); }
const practiced = (d, s, a, at) => { d.mem[`${s}:${a}`] = { iv: 3, due: 1, last: 1, reps: 1, successes: 1, history: [{ at, result: "ok", interval: 3 }] }; };
/** Synthetic learner: `ayahs` Ayahs each with `hist` history events. */
function synthetic(ayahs, hist) {
  const st = store.defaultState(); st.t = 1;
  let n = 0;
  outer: for (let s = 1; s <= 114; s++) for (let a = 1; a <= quran.count(s); a++) { if (n++ >= ayahs) break outer;
    st.mem[`${s}:${a}`] = { iv: 14, due: 20800, last: 20790, reps: hist, successes: hist, successDays: [20700, 20710, 20720, 20730, 20740], failures: 0, confidence: 4, history: Array.from({ length: hist }, (_, j) => ({ at: 1794500000000 + j * 86400000, result: "ok", interval: 7 })) }; }
  return st;
}

test("B1: localStorage quota error (no IndexedDB) is reported as UNSAVED, kept in memory, and saved by Retry", async () => {
  const m = fakeMirror(Infinity); await boot(null, m);
  m.quota = 10; // device storage now full
  store.update((d) => practiced(d, 1, 1, 100));
  await settle();
  const st = persist.getSaveStatus();
  assert.equal(st.state, "unsaved"); assert.match(st.error, /full/i);
  assert.ok(store.getState().mem["1:1"], "result still in memory while the app is open");
  assert.equal(m.map.get(GUEST), undefined, "nothing was persisted");
  m.quota = Infinity; assert.equal(await persist.retrySaves(), true);
  assert.equal(persist.getSaveStatus().state, "saved");
  await boot(null, m); assert.ok(store.getState().mem["1:1"], "after a reload the result is there (persisted)");
});

test("B1: IndexedDB quota + full mirror → unsaved; IndexedDB recovers → retry saves; reload from IndexedDB alone", async () => {
  const d = fakeDurable(), m = fakeMirror(Infinity); await boot(d, m);
  d.fail = "quota"; m.quota = 10;
  store.update((x) => practiced(x, 2, 255, 200)); await settle();
  assert.equal(persist.getSaveStatus().state, "unsaved");
  d.fail = null; assert.equal(await persist.retrySaves(), true);
  assert.equal(persist.getSaveStatus().where, "indexeddb");
  m.map.clear(); // mirror lost / never written
  await boot(d, fakeMirror()); assert.ok(store.getState().mem["2:255"], "restored from IndexedDB");
});

test("B1: IndexedDB transaction failure with a working mirror counts as saved (basic storage), never silently lost", async () => {
  const d = fakeDurable(), m = fakeMirror(); await boot(d, m);
  d.fail = "tx"; store.update((x) => practiced(x, 3, 1, 300)); await settle();
  const s = persist.getSaveStatus(); assert.equal(s.state, "saved"); assert.equal(s.where, "localstorage");
  await boot(fakeDurable(), m); assert.ok(store.getState().mem["3:1"]);
});

test("B1: storage blocked entirely (private mode) → unsaved with a 'blocked' explanation", async () => {
  const d = fakeDurable(), m = fakeMirror(); await boot(d, m);
  d.fail = "blocked"; m.blocked = true;
  store.update((x) => practiced(x, 4, 1, 400)); await settle();
  const s = persist.getSaveStatus(); assert.equal(s.state, "unsaved"); assert.match(s.error, /blocked|refused/i);
});

test("B1: after a failure, the next change retries automatically; warning stays until a real save (acknowledge ≠ saved)", async () => {
  const m = fakeMirror(); await boot(null, m);
  m.quota = 10; store.update((x) => practiced(x, 5, 1, 500)); await settle();
  persist.acknowledgeUnsaved();
  let s = persist.getSaveStatus(); assert.equal(s.state, "unsaved"); assert.equal(s.acknowledged, true, "acknowledged but still unsaved");
  m.quota = Infinity; store.update((x) => practiced(x, 5, 2, 501)); await settle();
  s = persist.getSaveStatus(); assert.equal(s.state, "saved"); assert.equal(s.acknowledged, false);
  await boot(null, m); assert.ok(store.getState().mem["5:1"] && store.getState().mem["5:2"], "both the failed and the later result persisted");
});

test("B1 migration: existing localStorage progress is copied to IndexedDB, verified, and the original kept", async () => {
  const m = fakeMirror(); const old = synthetic(50, 3); old.t = 1000; m.setItem(GUEST, JSON.stringify(old));
  const d = fakeDurable(); await boot(d, m);
  assert.equal(Object.keys(d.states.get(GUEST).state.mem).length, 50, "copied to IndexedDB");
  assert.ok(m.map.get(GUEST), "original localStorage copy kept");
  assert.equal(Object.keys(store.getState().mem).length, 50);
});

test("B1 migration: interrupted (IndexedDB write fails) → old data untouched and shown; retried next start", async () => {
  const m = fakeMirror(); const old = synthetic(30, 2); old.t = 1000; m.setItem(GUEST, JSON.stringify(old));
  const d = fakeDurable(); d.fail = "quota"; await boot(d, m);
  assert.equal(d.states.size, 0, "nothing in IndexedDB");
  assert.equal(Object.keys(JSON.parse(m.map.get(GUEST)).mem).length, 30, "localStorage copy untouched");
  assert.equal(Object.keys(store.getState().mem).length, 30, "learner still sees all progress");
  d.fail = null; await boot(d, m);
  assert.equal(Object.keys(d.states.get(GUEST).state.mem).length, 30, "migration completed on retry");
});

test("B1: an empty IndexedDB is never treated as 'no progress'; a newer IndexedDB copy is merged over a stale mirror", async () => {
  const m = fakeMirror(); const stale = synthetic(10, 1); stale.t = 100; m.setItem(GUEST, JSON.stringify(stale));
  const d = fakeDurable(); const newer = synthetic(10, 1); newer.t = 900; practiced(newer, 50, 1, 900); d.states.set(GUEST, { t: 900, savedAt: 1, state: newer });
  await boot(d, m);
  assert.ok(store.getState().mem["50:1"], "newer IndexedDB evidence adopted");
  assert.equal(Object.keys(store.getState().mem).length, 11);
});

test("B1: an early change made before IndexedDB finished loading is merged, not lost, and never overwrites newer progress", async () => {
  const m = fakeMirror(); const stale = store.defaultState(); stale.t = 100; m.setItem(GUEST, JSON.stringify(stale));
  const d = fakeDurable(); const real = synthetic(20, 2); real.t = 5000; d.states.set(GUEST, { t: 5000, savedAt: 1, state: real });
  d.delay = 0;
  store.usePersistenceBackends(d, m); store.setProfile(null); store.getState();
  store.update((x) => practiced(x, 60, 1, 6000)); // before hydration completes
  await settle();
  const persisted = d.states.get(GUEST).state;
  assert.equal(Object.keys(persisted.mem).length, 21, "durable copy = real progress + the early change");
  assert.ok(persisted.mem["60:1"] && persisted.mem["1:1"]);
});

test("B1 ordering: delayed and out-of-order writes can never replace newer progress", async () => {
  const d = fakeDurable(), m = fakeMirror(); await boot(d, m);
  d.delay = 15;
  for (let i = 1; i <= 5; i++) store.update((x) => practiced(x, 70, i, 7000 + i));
  await settle(); await new Promise((r) => setTimeout(r, 100)); await settle();
  const rec = d.states.get(GUEST); assert.equal(Object.keys(rec.state.mem).filter((k) => k.startsWith("70:")).length, 5, "the newest state was written last");
  assert.ok(d.puts <= 3, `writes coalesced (${d.puts})`);
  d.states.set(GUEST, { t: Number.MAX_SAFE_INTEGER, savedAt: 1, state: { ...rec.state, mem: { ...rec.state.mem, "99:1": rec.state.mem["70:1"] } } });
  store.update((x) => practiced(x, 71, 1, 7100)); await settle(); await new Promise((r) => setTimeout(r, 40)); await settle();
  assert.ok(d.states.get(GUEST).state.mem["99:1"], "an older write did not replace a newer durable record");
  d.delay = 0;
});

test("B1: guest and account data stay in separate durable records", async () => {
  const d = fakeDurable(), m = fakeMirror();
  await boot(d, m, null); store.update((x) => practiced(x, 80, 1, 1)); await settle();
  await boot(d, m, "u1"); store.update((x) => practiced(x, 81, 1, 2)); await settle();
  assert.ok(d.states.get(GUEST).state.mem["80:1"] && !d.states.get(GUEST).state.mem["81:1"]);
  assert.ok(d.states.get(USER).state.mem["81:1"] && !d.states.get(USER).state.mem["80:1"]);
  assert.ok((await store.guestProgressDurable()).mem["80:1"], "guest progress readable for an explicit merge");
});

test("B1: snapshots live in IndexedDB (not localStorage); backup restore keeps an undoable copy", async () => {
  const d = fakeDurable(), m = fakeMirror(); await boot(d, m);
  store.update((x) => practiced(x, 90, 1, 1)); await settle();
  const b = store.defaultState(); practiced(b, 91, 1, 2); store.restoreBackup(b); await settle();
  assert.ok(store.getState().mem["91:1"] && !store.getState().mem["90:1"]);
  const snaps = await store.listSnapshots(); assert.equal(snaps.length, 1); assert.ok(snaps[0].state.mem["90:1"]);
  assert.equal(m.map.get(`${GUEST}:snapshots`), undefined, "no snapshot copies in localStorage");
  await boot(d, m); assert.ok(store.getState().mem["91:1"], "restored backup persisted");
});

test("B1: old localStorage snapshots are moved to IndexedDB, freeing localStorage only after a verified copy", async () => {
  const m = fakeMirror(); const s = store.defaultState(); s.t = 5; m.setItem(GUEST, JSON.stringify(s));
  m.setItem(`${GUEST}:snapshots`, JSON.stringify([{ at: 11, reason: "old", state: s }]));
  const d = fakeDurable(); await boot(d, m); await settle();
  assert.equal((await store.listSnapshots())[0].at, 11); assert.equal(m.map.get(`${GUEST}:snapshots`), undefined);
});

test("B1: the oldest shared key is only removed after its copy succeeds", async () => {
  const m = fakeMirror(); const s = store.defaultState(); practiced(s, 1, 2, 1); m.map.set(LEGACY, JSON.stringify(s));
  m.quota = 10; await boot(null, m);
  assert.ok(m.map.get(LEGACY), "legacy data kept when the copy to the guest key failed");
});

test("B1: full-Quran synthetic learner exceeding a 5 MB localStorage is saved durably (IndexedDB) and survives reload", async () => {
  const d = fakeDurable(), m = fakeMirror(5 * 1024 * 1024); await boot(d, m);
  const big = synthetic(6236, 60);
  store.replaceState(big); await settle();
  const s = persist.getSaveStatus(); assert.equal(s.state, "saved"); assert.equal(s.where, "indexeddb");
  assert.equal(m.map.get(GUEST), undefined, "mirror could not hold it (expected)");
  await boot(d, fakeMirror(5 * 1024 * 1024)); assert.equal(Object.keys(store.getState().mem).length, 6236, "all 6,236 Ayah records restored from IndexedDB");
});

test("B1: saving is local only — no network call is made to persist progress (offline safe)", async () => {
  let calls = 0; const realFetch = globalThis.fetch; globalThis.fetch = async (...a) => { calls++; return realFetch(...a); };
  const d = fakeDurable(), m = fakeMirror(); await boot(d, m);
  store.update((x) => practiced(x, 100, 1, 1)); await settle();
  globalThis.fetch = realFetch;
  assert.equal(calls, 0); assert.equal(persist.getSaveStatus().state, "saved");
});

test("B1 measurement: serialized state sizes for representative synthetic learners", () => {
  const rows = [["new learner", 0, 0], ["1 Juz (~208 Ayahs), 6 months", 208, 15], ["5 Juz (~1,040), 1 year", 1040, 25], ["15 Juz (~3,118), 1 year", 3118, 25], ["full Quran, 1 year (~18 revisions)", 6236, 18], ["full Quran, history cap (100)", 6236, 100]];
  const out = rows.map(([label, ay, h]) => { const st = synthetic(ay, h); const bytes = Buffer.byteLength(JSON.stringify(st)); return `${label.padEnd(36)} ${(bytes / 1048576).toFixed(2).padStart(7)} MB (localStorage UTF-16 ≈ ${(bytes * 2 / 1048576).toFixed(1)} MB)`; });
  console.log("\n" + out.join("\n"));
  assert.ok(out.length === 6);
});
