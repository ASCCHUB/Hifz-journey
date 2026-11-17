// B4 tests: legacy clients vs the server-side revision guard.
//
// MOCK, NOT A DATABASE: `FakeSupabase` models the semantics the guard relies on —
//   • PostgREST upsert   = INSERT … ON CONFLICT (user_id) DO UPDATE SET <only the columns sent>
//   • PostgREST update   = UPDATE … SET <columns sent> WHERE <eq filters>; `.select()` returns the updated rows
//   • RLS                = a user sees/changes only rows with user_id = their uid; inserting another uid fails 42501
//   • missing columns    = 42703 on select, PGRST204 on write (guard migration not installed)
//   • BEFORE trigger     = a line-by-line port of public.user_state_guard() in
//                          supabase/migrations/20261114_b4_user_state_revision_guard.sql
// The REAL app code is exercised: supabaseBackend() from src/lib/supabase.ts and reconcile() from src/lib/sync.ts,
// plus the legacy client's push copied verbatim from the pre-Phase-3 source. Executing the SQL itself in
// PostgreSQL remains a deployment step (see the report).
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

registerHooks({ resolve(s, c, n) { if ((s.startsWith("./") || s.startsWith("../")) && !/\.[a-z]+$/i.test(s)) { try { return n(`${s}.ts`, c); } catch {} } return n(s, c); } });
globalThis.window = {}; const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = process.cwd();
const dataFiles = new Map(["quran", "layout", "juz", "divisions"].map((n) => [n, resolve(root, `public/data/${n}.json`)]));
globalThis.fetch = async (url) => { const name = String(url).split("/").at(-1).replace(/\.json(?:\?.*)?$/, ""); const p = dataFiles.get(name); if (!p) return { ok: false, status: 404 }; const json = JSON.parse(await readFile(p, "utf8")); return { ok: true, json: async () => json }; };

const quran = await import("../src/lib/quran.ts"); await quran.loadCore();
const store = await import("../src/lib/store.ts");
const sync = await import("../src/lib/sync.ts");
const journey = await import("../src/lib/journey.ts");
const supa = await import("../src/lib/supabase.ts");
const sql = await readFile(resolve(root, "supabase/migrations/20261114_b4_user_state_revision_guard.sql"), "utf8");

// ------------------------------------------------------------------ fake Postgres + PostgREST + RLS
const err = (code, message) => ({ code, message, details: null, hint: null });
class GuardError extends Error { constructor(m) { super(m); this.pg = err("P0001", m); } }
class FakeDb {
  constructor({ guard = true } = {}) { this.rows = new Map(); this.guard = guard; this.clock = Date.parse("2026-11-14T10:00:00Z"); this.beforeWrite = null; this.failNext = null; this.writes = 0; }
  now() { this.clock += 1000; return new Date(this.clock).toISOString(); }
  cols() { return this.guard ? ["user_id", "state", "updated_at", "revision", "sync_protocol"] : ["user_id", "state", "updated_at"]; }
  /** Port of public.user_state_guard(). */
  trigger(op, NEW, OLD) {
    if (!this.guard) { return NEW; }
    if (op === "INSERT") {
      if ((NEW.sync_protocol ?? 1) < 2) throw new GuardError("HIFZ_SYNC_OUTDATED_CLIENT: this app version cannot create cloud progress; please update the app");
      if (NEW.revision !== 1) throw new GuardError(`HIFZ_SYNC_REVISION_CONFLICT: a new cloud row must start at revision 1 (got ${NEW.revision})`);
    } else {
      if (NEW.revision === OLD.revision) throw new GuardError("HIFZ_SYNC_OUTDATED_CLIENT: this app version cannot update cloud progress safely; please update the app");
      if (NEW.revision !== OLD.revision + 1) throw new GuardError(`HIFZ_SYNC_REVISION_CONFLICT: expected revision ${OLD.revision + 1}, got ${NEW.revision}`);
      if ((NEW.sync_protocol ?? 1) < (OLD.sync_protocol ?? 1) || (NEW.sync_protocol ?? 1) < 2) throw new GuardError(`HIFZ_SYNC_OUTDATED_CLIENT: sync protocol ${NEW.sync_protocol} is not accepted (row is at ${OLD.sync_protocol})`);
      if (NEW.user_id !== OLD.user_id) throw new GuardError("HIFZ_SYNC_FORBIDDEN: user_id cannot change");
    }
    NEW.updated_at = this.now(); // server time; client-supplied timestamps are ignored
    return NEW;
  }
  defaults(row) { return this.guard ? { revision: 0, sync_protocol: 1, updated_at: this.now(), ...row } : { updated_at: this.now(), ...row }; }
}
/** supabase-js–shaped client for one authenticated user (uid). */
function client(db, uid) {
  const unknownCol = (obj) => Object.keys(obj).find((k) => !db.cols().includes(k));
  const pre = async () => { if (db.failNext) { const f = db.failNext; db.failNext = null; throw f; } };
  const hook = async () => { if (db.beforeWrite) { const h = db.beforeWrite; db.beforeWrite = null; await h(); } };
  return { from: (table) => {
    assert.equal(table, "user_state");
    return {
      select(cols) {
        const filters = []; const q = {
          eq(c, v) { filters.push([c, v]); return q; },
          async maybeSingle() { await pre(); const bad = cols.split(",").map((s) => s.trim()).find((c) => !db.cols().includes(c)); if (bad) return { data: null, error: err("42703", `column user_state.${bad} does not exist`) };
            const r = [...db.rows.values()].find((row) => row.user_id === uid && filters.every(([c, v]) => row[c] === v));
            return { data: r ? Object.fromEntries(cols.split(",").map((s) => s.trim()).map((c) => [c, structuredClone(r[c])])) : null, error: null }; },
        }; return q;
      },
      async insert(row) {
        await pre(); await hook();
        if (unknownCol(row)) return { error: err("PGRST204", `Could not find the '${unknownCol(row)}' column of 'user_state' in the schema cache`) };
        if (row.user_id !== uid) return { error: err("42501", "new row violates row-level security policy") };
        if (db.rows.has(row.user_id)) return { error: err("23505", "duplicate key value violates unique constraint") };
        try { db.rows.set(row.user_id, db.trigger("INSERT", db.defaults(structuredClone(row)), null)); db.writes++; return { error: null }; } catch (e) { return { error: e.pg || err("XX000", String(e)) }; }
      },
      async upsert(row) { // INSERT … ON CONFLICT (user_id) DO UPDATE SET <columns sent>
        await pre(); await hook();
        if (unknownCol(row)) return { error: err("PGRST204", `Could not find the '${unknownCol(row)}' column`) };
        if (row.user_id !== uid) return { error: err("42501", "new row violates row-level security policy") };
        const old = db.rows.get(row.user_id);
        try {
          if (!old) db.rows.set(row.user_id, db.trigger("INSERT", db.defaults(structuredClone(row)), null));
          else db.rows.set(row.user_id, db.trigger("UPDATE", { ...structuredClone(old), ...structuredClone(row) }, old));
          db.writes++; return { error: null };
        } catch (e) { return { error: e.pg || err("XX000", String(e)) }; }
      },
      update(vals) {
        const filters = []; let selCols = null;
        const run = async () => {
          await pre(); await hook();
          if (unknownCol(vals)) return { data: null, error: err("PGRST204", `Could not find the '${unknownCol(vals)}' column`) };
          const hit = [...db.rows.values()].filter((row) => row.user_id === uid && filters.every(([c, v]) => row[c] === v)); // RLS + WHERE
          try {
            const out = hit.map((old) => { const n = db.trigger("UPDATE", { ...structuredClone(old), ...structuredClone(vals) }, old); db.rows.set(old.user_id, n); db.writes++; return n; });
            return { data: selCols ? out.map((r) => Object.fromEntries(selCols.split(",").map((c) => [c.trim(), r[c.trim()]]))) : null, error: null };
          } catch (e) { return { data: null, error: e.pg || err("XX000", String(e)) }; }
        };
        const q = { eq(c, v) { filters.push([c, v]); return q; }, select(c) { selCols = c; return q; }, then(res, rej) { return run().then(res, rej); } };
        return q;
      },
    };
  } };
}
/** The legacy client's sync, copied verbatim from the pre-Phase-3 supabase.ts (push + startup pull). */
async function legacyPush(sb, userId, snapshot) {
  const { error } = await sb.from("user_state").upsert({ user_id: userId, state: snapshot, updated_at: new Date(snapshot.t || Date.now()).toISOString() });
  return error;
}
async function legacyStart(sb, userId, local) {
  const { data, error } = await sb.from("user_state").select("state").eq("user_id", userId).maybeSingle();
  if (error) return { local, error };
  const remote = data?.state;
  if (remote && (remote.t || 0) > (local.t || 0)) return { local: remote, error: null };
  return { local, error: local.t ? await legacyPush(sb, userId, local) : null };
}

// ------------------------------------------------------------------ helpers
const A = "user-a", B = "user-b";
const hydrate = (s) => store.hydrateState(s);
let vtok = 0; const nextV = () => `v${++vtok}`;
const modern = (db, uid) => supa.supabaseBackend(client(db, uid), uid);
const practiced = (st, s, a, at, result = "ok") => { const r = st.mem[`${s}:${a}`] ||= { iv: 0, due: 0, last: 0, reps: 0, successes: 0, failures: 0 }; r.history = [...(r.history || []), { at, result, interval: 1 }]; r.reps++; if (result === "ok") r.successes++; else r.failures++; return st; };
const state = (t, fn) => { const s = store.defaultState(); s.t = t; fn?.(s); return s; };

test("SQL migration matches the mocked trigger rules (sanity on the shipped file)", () => {
  for (const needle of ["add column if not exists revision bigint not null default 0", "add column if not exists sync_protocol integer not null default 1",
    "before insert or update on public.user_state", "new.revision = old.revision", "new.revision is distinct from old.revision + 1", "HIFZ_SYNC_OUTDATED_CLIENT", "HIFZ_SYNC_REVISION_CONFLICT",
    "new.updated_at := now()", "coalesce(new.sync_protocol, 1) < 2", "new.revision is distinct from 1", "hifz.admin_override"]) assert.ok(sql.includes(needle), needle);
  assert.ok(!/disable row level security|drop policy/i.test(sql), "RLS untouched");
});

test("1. legacy client cannot overwrite a modern cloud row; the row is unchanged", async () => {
  const db = new FakeDb();
  const modernState = state(100, (s) => practiced(s, 1, 1, 10)); await sync.reconcile(modern(db, A), modernState, hydrate, nextV);
  const before = structuredClone(db.rows.get(A));
  const legacyLocal = state(999999, (s) => practiced(s, 9, 9, 5)); // an old device with a newer-looking clock
  const e = await legacyPush(client(db, A), A, legacyLocal);
  assert.match(e.message, /HIFZ_SYNC_OUTDATED_CLIENT/);
  assert.deepEqual(db.rows.get(A), before, "cloud row untouched");
});

test("2. a legacy timestamp-based overwrite (updated_at far in the future) is rejected; the server owns updated_at", async () => {
  const db = new FakeDb(); await sync.reconcile(modern(db, A), state(1, (s) => practiced(s, 1, 2, 1)), hydrate, nextV);
  const e = await client(db, A).from("user_state").upsert({ user_id: A, state: state(4102444800000), updated_at: "2099-12-31T00:00:00Z" });
  assert.match(e.error.message, /OUTDATED_CLIENT/);
  assert.notEqual(db.rows.get(A).updated_at, "2099-12-31T00:00:00Z");
  // A legacy client that also sends a guessed revision still cannot skip or replay revisions.
  const rev = db.rows.get(A).revision;
  const skip = await client(db, A).from("user_state").upsert({ user_id: A, state: state(5), updated_at: "2099-01-01", revision: rev + 5 });
  assert.match(skip.error.message, /REVISION_CONFLICT/);
});

test("3. concurrent modern clients cannot overwrite each other: compare-and-swap + retry merges both", async () => {
  const db = new FakeDb();
  await sync.reconcile(modern(db, A), state(10, (s) => practiced(s, 1, 1, 1)), hydrate, nextV);
  const dev1 = state(20, (s) => { practiced(s, 1, 1, 1); practiced(s, 2, 2, 20); });
  const dev2 = state(30, (s) => { practiced(s, 1, 1, 1); practiced(s, 3, 3, 30); });
  db.beforeWrite = async () => { await sync.reconcile(modern(db, A), dev2, hydrate, nextV); }; // dev2 lands between dev1's read and write
  const final1 = await sync.reconcile(modern(db, A), dev1, hydrate, nextV);
  const cloud = hydrate(db.rows.get(A).state);
  for (const k of ["1:1", "2:2", "3:3"]) { assert.ok(cloud.mem[k], `cloud has ${k}`); assert.ok(final1.mem[k], `device 1 adopted ${k}`); }
  assert.equal(db.rows.get(A).revision, 3, "insert(1) + dev2(2) + dev1 retry(3)");
});

test("4. an offline modern client reconnecting merges its offline work with what others wrote meanwhile", async () => {
  const db = new FakeDb();
  const base = state(10, (s) => practiced(s, 1, 1, 1)); await sync.reconcile(modern(db, A), base, hydrate, nextV);
  const offline = structuredClone(base); offline.t = 50; practiced(offline, 5, 5, 50);           // edited while offline
  await sync.reconcile(modern(db, A), state(40, (s) => { practiced(s, 1, 1, 1); practiced(s, 6, 6, 40); }), hydrate, nextV); // another device
  const merged = await sync.reconcile(modern(db, A), offline, hydrate, nextV);
  for (const k of ["1:1", "5:5", "6:6"]) assert.ok(merged.mem[k] && hydrate(db.rows.get(A).state).mem[k], k);
});

test("5. stale revisions are rejected: the filtered update matches 0 rows; a mismatched revision is refused by the trigger", async () => {
  const db = new FakeDb(); const be = modern(db, A);
  await sync.reconcile(be, state(1), hydrate, nextV); await sync.reconcile(modern(db, A), state(2, (s) => practiced(s, 1, 1, 2)), hydrate, nextV);
  const current = db.rows.get(A).revision; assert.equal(current, 2);
  assert.equal(await be.replaceIf("1", state(3), "x"), false, "stale expected revision → 0 rows → caller re-reads and merges");
  const r = await client(db, A).from("user_state").update({ state: state(4), revision: current + 2, sync_protocol: 2 }).eq("user_id", A).eq("revision", current).select("revision");
  assert.match(r.error.message, /REVISION_CONFLICT/);
  assert.equal(db.rows.get(A).revision, 2, "nothing written");
});

test("6. claim and path tombstones survive sync and cannot be resurrected by an older copy", async () => {
  const db = new FakeDb();
  const withClaim = state(10, (s) => { s.studentJourney = journey.createStudentJourney(s, 1); s.studentJourney.claims = [{ ...journey.makeClaim("Juz 30", "comfortable", [{ start: { s: 78, a: 1 }, end: { s: 114, a: 6 } }], 5), id: "c1" }]; });
  await sync.reconcile(modern(db, A), withClaim, hydrate, nextV);
  const deleted = structuredClone(withClaim); deleted.t = 20; deleted.studentJourney = journey.tombstoneClaim(deleted.studentJourney, "c1", 20);
  await sync.reconcile(modern(db, A), deleted, hydrate, nextV);
  const stale = await sync.reconcile(modern(db, A), withClaim, hydrate, nextV); // an older device still has the live claim
  assert.ok(stale.studentJourney.claims[0].deletedAt && hydrate(db.rows.get(A).state).studentJourney.claims[0].deletedAt);
  assert.match(await legacyPush(client(db, A), A, withClaim).then((e) => e.message), /OUTDATED/, "legacy client cannot resurrect it either");
});

test("7. memorization and revision history from every modern device is preserved through sync", async () => {
  const db = new FakeDb();
  await sync.reconcile(modern(db, A), state(1, (s) => practiced(s, 2, 255, 100)), hydrate, nextV);
  await sync.reconcile(modern(db, A), state(2, (s) => practiced(s, 2, 255, 200, "bad")), hydrate, nextV);
  const h = hydrate(db.rows.get(A).state).mem["2:255"].history.map((x) => x.at);
  assert.deepEqual(h, [100, 200]);
});

test("8. account isolation: another user can neither read nor write this row (RLS), and cannot insert as them", async () => {
  const db = new FakeDb(); await sync.reconcile(modern(db, A), state(1, (s) => practiced(s, 1, 1, 1)), hydrate, nextV);
  assert.equal(await modern(db, B).read(), null, "B sees no row");
  const r = await client(db, B).from("user_state").update({ state: state(2), revision: 2, sync_protocol: 2 }).eq("user_id", A).eq("revision", 1).select("revision");
  assert.deepEqual(r.data, [], "B's update matches 0 rows"); assert.equal(db.rows.get(A).revision, 1);
  const ins = await client(db, B).from("user_state").insert({ user_id: A, state: state(3), revision: 1, sync_protocol: 2 });
  assert.equal(ins.error.code, "42501");
  await sync.reconcile(modern(db, B), state(1, (s) => practiced(s, 7, 7, 1)), hydrate, nextV);
  assert.ok(!hydrate(db.rows.get(A).state).mem["7:7"] && hydrate(db.rows.get(B).state).mem["7:7"]);
});

test("9. missing or outdated protocol: legacy inserts, protocol-1 updates and downgrades are refused", async () => {
  const db = new FakeDb();
  assert.match((await legacyStart(client(db, A), A, state(5, (s) => practiced(s, 1, 1, 1)))).error.message, /OUTDATED_CLIENT/, "legacy client cannot create a row");
  assert.equal(db.rows.size, 0);
  await sync.reconcile(modern(db, A), state(6), hydrate, nextV);
  const r1 = await client(db, A).from("user_state").update({ state: state(7), revision: 2, sync_protocol: 1 }).eq("user_id", A).eq("revision", 1).select("revision");
  assert.match(r1.error.message, /OUTDATED_CLIENT/);
  const r2 = await client(db, A).from("user_state").update({ state: state(7), revision: 2 }).eq("user_id", A).eq("revision", 1).select("revision");
  assert.equal(r2.error, null, "protocol unchanged (2) with correct revision is accepted");
});

test("10. network failure leaves local state untouched; a later retry succeeds", async () => {
  const db = new FakeDb(); const local = state(5, (s) => practiced(s, 4, 4, 5)); const copy = structuredClone(local);
  db.failNext = new TypeError("Failed to fetch");
  await assert.rejects(() => sync.reconcile(modern(db, A), local, hydrate, nextV));
  assert.deepEqual(local, copy); assert.equal(db.rows.size, 0);
  const m = await sync.reconcile(modern(db, A), local, hydrate, nextV); assert.ok(m.mem["4:4"] && db.rows.get(A));
});

test("11. a server refusal surfaces as SyncRejected (actionable), never as success, and local state is untouched", async () => {
  const db = new FakeDb(); await sync.reconcile(modern(db, A), state(1), hydrate, nextV);
  db.rows.get(A).sync_protocol = 3; // server now requires a newer protocol than this build speaks
  const local = state(9, (s) => practiced(s, 8, 8, 9)); const copy = structuredClone(local);
  await assert.rejects(() => sync.reconcile(modern(db, A), local, hydrate, nextV), (e) => e instanceof supa.SyncRejected && /OUTDATED_CLIENT/.test(e.message));
  assert.deepEqual(local, copy);
});

test("12. repeated synchronization is idempotent: no further writes, revision unchanged", async () => {
  const db = new FakeDb(); const m = await sync.reconcile(modern(db, A), state(3, (s) => practiced(s, 1, 1, 3)), hydrate, nextV);
  const rev = db.rows.get(A).revision, writes = db.writes;
  await sync.reconcile(modern(db, A), m, hydrate, nextV); await sync.reconcile(modern(db, A), m, hydrate, nextV);
  assert.equal(db.rows.get(A).revision, rev); assert.equal(db.writes, writes);
});

test("13. existing pre-migration row (revision 0): first protocol-2 write moves it to revision 1 and keeps its data; legacy is then blocked", async () => {
  const db = new FakeDb(); db.rows.set(A, { user_id: A, state: state(50, (s) => practiced(s, 3, 3, 50)), updated_at: "2026-01-01T00:00:00Z", revision: 0, sync_protocol: 1 });
  const m = await sync.reconcile(modern(db, A), state(60, (s) => practiced(s, 4, 4, 60)), hydrate, nextV);
  assert.ok(m.mem["3:3"] && m.mem["4:4"]); assert.equal(db.rows.get(A).revision, 1); assert.equal(db.rows.get(A).sync_protocol, 2);
  assert.match((await legacyPush(client(db, A), A, state(70))).message, /OUTDATED_CLIENT/);
});

test("14. before the migration is deployed the app falls back to updated_at CAS — and legacy clients can STILL overwrite (B4 depends on deployment)", async () => {
  const db = new FakeDb({ guard: false });
  const be = modern(db, A);
  await sync.reconcile(be, state(10, (s) => practiced(s, 1, 1, 10)), hydrate, nextV);
  assert.equal(supa.getCloudProtection(), "not-installed");
  const e = await legacyPush(client(db, A), A, state(999, (s) => practiced(s, 9, 9, 999)));
  assert.equal(e, null, "without the server guard the legacy overwrite succeeds");
  assert.ok(!hydrate(db.rows.get(A).state).mem["1:1"], "…and the modern progress is gone from the cloud (devices keep it locally)");
});
