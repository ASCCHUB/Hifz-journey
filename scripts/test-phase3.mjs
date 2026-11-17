// Phase 3.1A–3.6 tests: sync reconciliation, preferences, coverage, chunking, lessons, planner, assessment, maps.
// Same harness as test-hifz.mjs: Node 24 strips TS types; Quran JSON is served from public/data; storage is in memory.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch {}
    }
    return nextResolve(specifier, context);
  },
});
const root = process.cwd();
const inMemoryStorage = new Map();
globalThis.window = {};
globalThis.localStorage = { getItem: (k) => inMemoryStorage.get(k) ?? null, setItem: (k, v) => inMemoryStorage.set(k, String(v)), removeItem: (k) => inMemoryStorage.delete(k) };
const dataFiles = new Map(["quran", "layout", "juz", "divisions"].map((n) => [n, resolve(root, `public/data/${n}.json`)]));
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/maps/")) { const p = resolve(root, "public", u.replace(/^\//, "").split("?")[0]); try { const json = JSON.parse(await readFile(p, "utf8")); return { ok: true, json: async () => json }; } catch { return { ok: false, status: 404 }; } }
  const name = u.split("/").at(-1).replace(/\.json(?:\?.*)?$/, "");
  const path = dataFiles.get(name);
  if (!path) return { ok: false, status: 404 };
  const json = JSON.parse(await readFile(path, "utf8"));
  return { ok: true, json: async () => json };
};

const quran = await import("../src/lib/quran.ts");
await quran.loadCore();
const store = await import("../src/lib/store.ts");
const sync = await import("../src/lib/sync.ts");
const prefs = await import("../src/lib/prefs.ts");
const coverage = await import("../src/lib/coverage.ts");
const journey = await import("../src/lib/journey.ts");
const hifz = await import("../src/lib/hifz.ts");
export const ctx = { quran, store, sync, prefs, coverage, journey, hifz, inMemoryStorage, root };
const { defaultState, hydrateState, today } = store;
const { mergeStates, mergeMem, reconcile, sameData } = sync;
const k = (s, a) => `${s}:${a}`;
const clone = (x) => structuredClone(x);
const day = today();
const practice = (st, s, a, result, at) => {
  const r = st.mem[k(s, a)] ||= { iv: 0, due: day, last: day, reps: 0, successes: 0, failures: 0 };
  r.history = [...(r.history || []), { at, result, interval: result === "ok" ? 3 : 0 }]; r.reps++; r.last = day;
  if (result === "ok") r.successes++; else r.failures++;
};

// =========================================================== Phase 3.1A — sync & consistency
test("3.1A merge: two offline devices keep each other's independent practice, claims and paths", () => {
  const base = defaultState(); base.studentJourney = journey.createStudentJourney(base, 1);
  const A = clone(base), B = clone(base);
  practice(A, 1, 1, "ok", 1000); A.t = 2000;
  practice(B, 2, 1, "bad", 1500); B.weak[k(2, 1)] = { c: 0, d: day }; B.mw[k(2, 1)] = { "3": 1 };
  B.studentJourney.claims.push({ ...journey.makeClaim("Juz 30", "comfortable", [{ start: { s: 78, a: 1 }, end: { s: 114, a: 6 } }], 1600), id: "c1" });
  B.studentJourney.paths.push({ ...journey.makePath(quran.Q(), { kind: "surahs", name: "Mulk", selected: [67] }, 1600, "p1") });
  B.t = 1900;
  const m = mergeStates(A, B);
  assert.ok(m.mem[k(1, 1)] && m.mem[k(2, 1)], "both devices' Ayah records survive");
  assert.deepEqual(m.weak[k(2, 1)], B.weak[k(2, 1)]); assert.deepEqual(m.mw[k(2, 1)], { "3": 1 });
  assert.equal(m.studentJourney.claims.length, 1); assert.equal(m.studentJourney.paths.length, 1);
});

test("3.1A merge: conflicting practice on the same Ayah unions history; schedule follows the latest event", () => {
  const a = { iv: 3, due: 10, last: 5, reps: 2, successes: 2, failures: 0, history: [{ at: 100, result: "ok", interval: 1 }, { at: 200, result: "ok", interval: 3 }] };
  const b = { iv: 0, due: 6, last: 6, reps: 2, successes: 1, failures: 1, bad: 1, history: [{ at: 100, result: "ok", interval: 1 }, { at: 300, result: "bad", interval: 0 }] };
  const m = mergeMem(a, b);
  assert.deepEqual(m.history.map((h) => h.at), [100, 200, 300], "unique events from both sides, de-duplicated");
  assert.equal(m.bad, 1); assert.equal(m.iv, 0, "schedule from the record with the most recent event (the mistake)");
  assert.equal(m.successes, 2); assert.equal(m.failures, 1); assert.equal(m.reps, 3);
  assert.deepEqual(mergeMem(b, a), m, "order-independent");
  assert.deepEqual(mergeMem(m, a), m, "idempotent");
});

test("3.1A merge: a legacy 'mark memorized' record never replaces practice evidence", () => {
  const legacy = { iv: 3, due: 50, last: 0, reps: 0, successes: 0, failures: 0, confidence: 0 };
  const real = { iv: 7, due: 20, last: 10, reps: 3, successes: 3, history: [{ at: 5, result: "ok", interval: 7 }] };
  assert.deepEqual(mergeMem(legacy, real), real); assert.deepEqual(mergeMem(real, legacy), real);
});

test("3.1A merge: clock skew on one device cannot discard the other device's evidence", () => {
  const A = defaultState(), B = defaultState();
  practice(A, 3, 5, "ok", 1000); A.t = 1000;
  B.t = Date.now() + 10 * 365 * 86400000; // badly skewed clock, no practice
  B.settings.reciter = "Husary_64kbps";
  const m = mergeStates(A, B);
  assert.ok(m.mem[k(3, 5)], "A's evidence kept despite B's far-future timestamp");
  assert.equal(m.settings.reciter, "Husary_64kbps", "only preferences follow the newer timestamp (documented)");
});

test("3.1A merge: claim and path deletions are never resurrected, in either direction", () => {
  const base = defaultState(); base.studentJourney = journey.createStudentJourney(base, 1);
  const claim = { ...journey.makeClaim("Mulk", "needs_revision", [{ start: { s: 67, a: 1 }, end: { s: 67, a: 30 } }], 10), id: "c" };
  const A = clone(base), B = clone(base);
  A.studentJourney.claims = [claim]; B.studentJourney.claims = [{ ...claim, deletedAt: 20, updatedAt: 20 }];
  assert.ok(mergeStates(A, B).studentJourney.claims[0].deletedAt);
  assert.ok(mergeStates(B, A).studentJourney.claims[0].deletedAt);
});

test("3.1A merge: commutative and idempotent on a rich state (repeated sync adds nothing)", () => {
  const A = defaultState(), B = defaultState();
  practice(A, 1, 1, "ok", 10); practice(A, 1, 2, "hes", 11); A.bookmarks[k(1, 1)] = { t: 5, f: 1 }; A.readPages["1"] = day; A.hist = [{ t: 1, k: "x", l: "a", n: 1, m: 0 }]; A.t = 50;
  practice(B, 1, 1, "bad", 20); B.bookmarks[k(1, 1)] = { t: 9, f: 0 }; B.readPages["2"] = day; B.hist = [{ t: 2, k: "y", l: "b", n: 1, m: 0 }]; B.lastLocation = { s: 2, a: 255, t: 99 }; B.lastPage = 42; B.t = 40;
  const ab = mergeStates(A, B), ba = mergeStates(B, A);
  assert.ok(sameData(ab, ba), "commutative");
  assert.ok(sameData(mergeStates(ab, A), ab) && sameData(mergeStates(ab, B), ab) && sameData(mergeStates(ab, ab), ab), "idempotent");
  assert.equal(ab.hist.length, 2); assert.equal(ab.bookmarks[k(1, 1)].t, 9); assert.deepEqual(ab.lastLocation, { s: 2, a: 255, t: 99 }); assert.equal(ab.lastPage, 42);
});

/** In-memory stand-in for the Supabase row with the same compare-and-swap contract. */
function fakeBackend() {
  const server = { row: null, writes: 0 };
  const hooks = { beforeWrite: null, failRead: false };
  const api = {
    async read() { if (hooks.failRead) throw new Error("network"); return server.row ? clone(server.row) : null; },
    async insert(state, version) { if (hooks.beforeWrite) { const h = hooks.beforeWrite; hooks.beforeWrite = null; await h(); } if (server.row) return false; server.row = { state: clone(state), version }; server.writes++; return true; },
    async replaceIf(expected, state, version) { if (hooks.beforeWrite) { const h = hooks.beforeWrite; hooks.beforeWrite = null; await h(); } if (!server.row || server.row.version !== expected) return false; server.row = { state: clone(state), version }; server.writes++; return true; },
  };
  return { server, hooks, api };
}
let v = 0; const nextV = () => `v${++v}`;

test("3.1A cloud: concurrent pushes from two devices both land (compare-and-swap retry)", async () => {
  const { server, hooks, api } = fakeBackend();
  const A = defaultState(), B = defaultState();
  practice(A, 1, 1, "ok", 100); A.t = 100;
  practice(B, 2, 2, "ok", 200); B.t = 200;
  await reconcile(api, A, hydrateState, nextV); // A creates the row
  const staleA = defaultState(); practice(staleA, 1, 1, "ok", 100); practice(staleA, 5, 5, "hes", 300); staleA.t = 300;
  // B pushes while A's second push is between its read and its write: A's write must be refused and retried.
  hooks.beforeWrite = async () => { await reconcile(api, B, hydrateState, nextV); };
  const finalA = await reconcile(api, staleA, hydrateState, nextV);
  const cloud = hydrateState(server.row.state);
  for (const key of [k(1, 1), k(2, 2), k(5, 5)]) { assert.ok(cloud.mem[key], `cloud has ${key}`); assert.ok(finalA.mem[key], `device A adopts ${key}`); }
});

test("3.1A cloud: network failure leaves local state untouched; a later sync completes", async () => {
  const { server, hooks, api } = fakeBackend();
  const A = defaultState(); practice(A, 9, 1, "ok", 1); const before = clone(A);
  hooks.failRead = true;
  await assert.rejects(() => reconcile(api, A, hydrateState, nextV));
  assert.deepEqual(A, before); assert.equal(server.row, null);
  hooks.failRead = false;
  const m = await reconcile(api, A, hydrateState, nextV); assert.ok(m.mem[k(9, 1)]); assert.ok(server.row);
  const writes = server.writes; await reconcile(api, m, hydrateState, nextV);
  assert.equal(server.writes, writes, "nothing new → no extra write (repeat sync is a no-op)");
});

test("3.1A cloud: an old v1 save from another device merges without losing either side", () => {
  const legacy = hydrateState(JSON.parse(JSON.stringify({ v: 1, t: 5, mem: { "1:1": { iv: 3, due: 1, last: 1, reps: 1 } }, journey: { start: { s: 1, a: 1 }, end: { s: 1, a: 7 } } })));
  const modern = defaultState(); modern.studentJourney = journey.createStudentJourney(modern, 9); practice(modern, 1, 2, "ok", 9);
  const m = mergeStates(legacy, modern);
  assert.ok(m.mem[k(1, 1)] && m.mem[k(1, 2)] && m.studentJourney);
});

test("3.1A snapshots: backup restore and guest merge keep an undoable local copy (max 3)", async () => {
  inMemoryStorage.clear(); store.setProfile(null);
  store.update((d) => { practice(d, 4, 4, "ok", 1); });
  const backup = defaultState(); backup.mem[k(7, 7)] = { iv: 1, due: 1, last: 1, reps: 1, successes: 1 };
  store.restoreBackup(backup);
  assert.ok(store.getState().mem[k(7, 7)] && !store.getState().mem[k(4, 4)]);
  const snaps = await store.listSnapshots(); assert.equal(snaps.length, 1); assert.ok(snaps[0].state.mem[k(4, 4)]);
  assert.ok(await store.restoreSnapshot(0)); assert.ok(store.getState().mem[k(4, 4)], "undo restored the pre-restore state");
  for (let i = 0; i < 5; i++) await store.saveSnapshot(`s${i}`);
  assert.equal((await store.listSnapshots()).length, 3);
  assert.ok(!JSON.stringify(await store.listSnapshots()).includes("access_token"), "no credentials in snapshots");
});
test("3.1A preferences: one authoritative source, legacy mirrors never drift, evidence untouched", () => {
  const st = defaultState(); practice(st, 1, 1, "ok", 1); const ev = JSON.stringify({ mem: st.mem, weak: st.weak, mw: st.mw });
  prefs.setDailyPrefs(st, { studyMinutes: 45 }); // legacy user (no studentJourney)
  assert.equal(st.journey.studyMinutes, 45); assert.equal(prefs.dailyPrefs(st).studyMinutes, 45);
  st.studentJourney = journey.createStudentJourney(st, 2);
  prefs.setDailyPrefs(st, { studyMinutes: 30, learningDays: [5, 1, 1, 9], newAmount: 1, newUnit: "pages", revisionAmount: 10, revisionUnit: "pages" });
  const p = prefs.dailyPrefs(st);
  assert.equal(p.studyMinutes, 30); assert.equal(st.journey.studyMinutes, 30);
  assert.deepEqual(p.learningDays, [1, 5]); assert.deepEqual(st.journey.learningDays, [1, 5]);
  assert.equal(st.settings.newTarget, 15); assert.equal(st.settings.revTarget, 150);
  assert.equal(prefs.newPagesPerDay(p), 1); assert.equal(prefs.revisionPagesPerDay(p), 10);
  assert.equal(JSON.stringify({ mem: st.mem, weak: st.weak, mw: st.mw }), ev);
});

test("3.1A coverage: claimed, legacy-marked, learning, weak and retained stay distinct", () => {
  const st = defaultState(); st.studentJourney = journey.createStudentJourney(st, 1);
  st.studentJourney.claims = [journey.makeClaim("Ikhlas", "comfortable", [{ start: { s: 112, a: 1 }, end: { s: 112, a: 4 } }], 1)];
  hifz.markRange(st, 113, 1, 5, true); // legacy button
  practice(st, 1, 1, "ok", 1);
  practice(st, 1, 2, "bad", 1); st.mem[k(1, 2)].bad = 1;
  st.mem[k(1, 3)] = { iv: 30, due: day + 30, last: day, reps: 6, successes: 6, successDays: [1, 2, 3, 4, 5] };
  const c = coverage.coverageSummary(st);
  assert.equal(c.claimed, 4); assert.equal(c.legacy_marked, 5); assert.equal(c.learning, 1); assert.equal(c.weak, 1); assert.equal(c.retained, 1);
  assert.equal(coverage.isVerified(st.mem[k(113, 1)]), false, "legacy record is not verified");
  assert.equal(hifz.isMemorized(st.mem[k(113, 1)]), true, "existing SRS rule unchanged");
});

// =========================================================== Phase 3.2 — chunking & guided lessons
const chunking = await import("../src/lib/chunking.ts");
const lesson = await import("../src/lib/lesson.ts");

test("3.2 chunking: all 604 pages yield every Ayah exactly once, in order, and every word of each page", () => {
  const seen = []; let words = 0;
  for (let pg = 1; pg <= 604; pg++) {
    const ay = chunking.pageAyahs(pg); const flat = quran.pageContent(pg).flat;
    // the page's words are exactly the whole words of its Ayahs (no Ayah is split across a page here)
    const fromAyahs = ay.flatMap(([s, a]) => quran.words(s, a));
    assert.deepEqual(flat.map((w) => w.txt), fromAyahs, `page ${pg}`);
    seen.push(...ay.map(([s, a]) => `${s}:${a}`)); words += flat.length;
  }
  assert.equal(seen.length, 6236); assert.equal(new Set(seen).size, 6236);
  const expected = []; quran.Q().n.forEach((n, i) => { for (let a = 1; a <= n[2]; a++) expected.push(`${i + 1}:${a}`); });
  assert.deepEqual(seen, expected, "canonical order");
  assert.equal(words, quran.Q().v.flat().reduce((t, x) => t + x.split(" ").length, 0));
});

test("3.2 chunking: long Ayahs split into ordered, complete, non-overlapping units preferring waqf marks", () => {
  let checked = 0, waqfCuts = 0, cuts = 0;
  quran.Q().v.forEach((ayat, si) => ayat.forEach((_, ai) => {
    const s = si + 1, a = ai + 1, ws = quran.words(s, a), units = chunking.unitsForAyah(s, a);
    assert.equal(units[0].from, 0); assert.equal(units.at(-1).to, ws.length - 1);
    for (let i = 1; i < units.length; i++) { assert.equal(units[i].from, units[i - 1].to + 1); cuts++; if (/[ۖ-ۜ]/.test(ws[units[i - 1].to])) waqfCuts++; }
    units.forEach((u) => assert.ok(u.to - u.from + 1 <= 12 || units.length === 1, `${s}:${a} unit too long`));
    assert.deepEqual(units.flatMap((u) => chunking.unitWords(u)), ws, "words unchanged and in order");
    checked++;
  }));
  assert.equal(checked, 6236);
  const u282 = chunking.unitsForAyah(2, 282); assert.ok(u282.length >= 11, "2:282 (128 words) is broken into practice units");
  assert.ok(waqfCuts / cuts > 0.5, `most cuts fall on waqf-marked words (${waqfCuts}/${cuts})`);
});

test("3.2 lesson plan (refined): Ayah-by-Ayah cumulative linking 1–2, 1–3 …, explained steps, final test and connection", () => {
  const ayahs = chunking.pageAyahs(1); // Al-Fatihah 1–7, short Ayahs → one running block
  const steps = lesson.buildSteps(ayahs, "guided");
  const links = steps.filter((s) => s.phase === "link").map((s) => s.units.map((u) => u.a));
  assert.deepEqual(links, [[1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7]], "each new Ayah is joined with everything before it");
  assert.equal(steps.find((s) => s.phase === "link" && s.units.length === 3).instruction, "Now recite Ayahs 1–3 together without looking.");
  assert.ok(steps.every((s) => s.instruction && s.instruction.length > 15 && s.ayahIndex >= 1 && s.ayahIndex <= s.ayahCount), "every step explains itself and reports Ayah progress");
  assert.ok(steps.some((s) => s.kind === "fade" && s.phase === "hide"), "guided level hides the text gradually");
  const final = steps.filter((s) => s.scope === "page"); assert.equal(final.length, 1); assert.equal(final[0].units.length, 7);
  assert.equal(steps.some((s) => s.scope === "connect"), false, "nothing before 1:1");
  const p2 = lesson.buildSteps(chunking.pageAyahs(2), "guided");
  assert.ok(p2.at(-1).scope === "connect" && p2.at(-1).units[0].a === 7, "page 2 connects to 1:7");
  // A long page restarts the running block and reviews everything so far, keeping joins manageable.
  const p3 = lesson.buildSteps(chunking.pageAyahs(3), "guided");
  const joinedWords = p3.filter((s) => s.phase === "link").map((s) => s.units.reduce((n, u) => n + u.to - u.from + 1, 0));
  assert.ok(Math.max(...joinedWords) <= 60 + 40, "joined recitations stay manageable");
  assert.ok(p3.some((s) => s.phase === "review"), "a review of everything so far when the block restarts");
  // Fewer, clearer steps than before (page 3 previously had 81 steps at the guided level).
  assert.ok(p3.length < 60, `page 3 guided lesson has ${p3.length} steps`);
  const challenge = lesson.buildSteps(chunking.pageAyahs(2), "challenge");
  assert.ok(challenge.length < p2.length && !challenge.some((s) => s.kind === "fade"));
  const long = lesson.buildSteps([[2, 282]], "standard");
  assert.ok(long.some((s) => s.phase === "join" && s.instruction.startsWith("Now join parts 1–")), "long Ayah practised in parts with cumulative joins");
});

test("Refinement: teaching preferences persist, merge by updatedAt, and never touch Hifz records", () => {
  const st = defaultState(); practice(st, 1, 1, "ok", 1); const ev = JSON.stringify({ mem: st.mem, weak: st.weak, mw: st.mw });
  assert.deepEqual({ mode: st.tutor.mode, level: st.tutor.level, portion: st.tutor.portion, repeat: st.tutor.repeat }, { mode: "guided", level: "guided", portion: "page", repeat: 3 });
  const old = hydrateState(JSON.parse(JSON.stringify({ v: 1, mem: {} }))); assert.equal(old.tutor.mode, "guided", "older saves get defaults");
  const A = clone(st), B = clone(st);
  A.tutor = { ...A.tutor, mode: "manual", updatedAt: 10 }; B.tutor = { ...B.tutor, level: "challenge", introDismissedAt: 5, updatedAt: 20 };
  assert.equal(mergeStates(A, B).tutor.level, "challenge"); assert.equal(mergeStates(B, A).tutor.introDismissedAt, 5);
  assert.equal(JSON.stringify({ mem: A.mem, weak: A.weak, mw: A.mw }), ev);
});
test("3.2 evidence: only final ratings save; hinted passes count as hesitation; saving is once-only", () => {
  const st = defaultState(); const ayahs = chunking.pageAyahs(2);
  const unit = { kind: "page", page: 2, start: { s: 2, a: 1 }, end: { s: 2, a: 5 } };
  const L = lesson.newLesson("learn", unit, "Page 2", "guided", "guided", 100);
  st.lessons[L.id] = L;
  L.results["recall:3"] = "ok"; // practice step: not evidence
  assert.equal(lesson.saveLessonEvidence(st, L.id, ayahs), 0, "interrupted lesson (no final ratings) saves nothing");
  assert.deepEqual(st.mem, {});
  L.results[lesson.finalKey(2, 1)] = "ok"; L.results[lesson.finalKey(2, 2)] = "ok"; L.hinted[lesson.finalKey(2, 2)] = true; L.results[lesson.finalKey(2, 3)] = "bad";
  assert.equal(lesson.saveLessonEvidence(st, L.id, ayahs), 3);
  assert.equal(st.mem[k(2, 1)].successes, 1); assert.equal(st.mem[k(2, 2)].history.at(-1).result, "hes", "hinted ok → hes");
  assert.equal(st.mem[k(2, 3)].bad, 1); assert.ok(st.weak[k(2, 3)]);
  assert.equal(st.mem[k(2, 4)], undefined, "unrated Ayahs are not saved as ok");
  const before = JSON.stringify(st.mem);
  assert.equal(lesson.saveLessonEvidence(st, L.id, ayahs), 0); assert.equal(JSON.stringify(st.mem), before, "second save is a no-op");
});

test("3.2 resume: lesson step and ratings survive a restart (hydration) and sync merge", () => {
  const st = defaultState(); const unit = { kind: "range", start: { s: 18, a: 1 }, end: { s: 18, a: 10 } };
  const L = lesson.newLesson("learn", unit, "Kahf 1–10", "guided", "standard", 1); L.step = 17; L.results["s5"] = "hes"; st.lessons[L.id] = L;
  const back = hydrateState(JSON.parse(JSON.stringify(st)));
  assert.equal(back.lessons[L.id].step, 17); assert.equal(back.lessons[L.id].results.s5, "hes");
  const other = defaultState(); other.lessons[L.id] = { ...L, step: 9, updatedAt: 0 };
  assert.equal(mergeStates(back, other).lessons[L.id].step, 17, "newer lesson progress wins");
});

test("3.2 path cursor: Continue opens the cursor's page; advancing moves forward, then into the next range", () => {
  const core = quran.Q();
  const path = journey.makePath(core, { kind: "reverse_juz", name: "Rev" }, 1, "r");
  const first = journey.nextPathLesson(core, path, quran.pageOf);
  assert.deepEqual(first.start, { s: 78, a: 1 }); assert.equal(first.page, quran.pageOf(78, 1));
  assert.ok(quran.pageOf(first.end.s, first.end.a) === first.page && journey.compare(first.end, first.start) >= 0);
  const c1 = journey.advanceCursor(core, path, first.end);
  assert.equal(c1.rangeIndex, 0); assert.deepEqual({ s: c1.s, a: c1.a }, quran.nextAyah(first.end.s, first.end.a).reduce((o, v, i) => (i ? { ...o, a: v } : { s: v }), {}));
  const endOf30 = path.ranges[0].end; const c2 = journey.advanceCursor(core, path, endOf30);
  assert.equal(c2.rangeIndex, 1); assert.deepEqual({ s: c2.s, a: c2.a }, path.ranges[1].start, "after Juz 30 comes the start of Juz 29 (Ayahs forward)");
  assert.equal(journey.advanceCursor(core, path, path.ranges.at(-1).end), null, "path complete");
});

// =========================================================== Phase 3.3 — daily planner
const planner = await import("../src/lib/planner.ts");
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 16, 9); // a Monday
const D = planner.planDay(NOW);
const known = (st, s, a, opts = {}) => { st.mem[k(s, a)] = { iv: opts.iv ?? 14, due: opts.due ?? D + 5, last: opts.last ?? D - 3, reps: 4, successes: 4, successDays: opts.successDays ?? [D - 40, D - 30, D - 20, D - 10], history: [{ at: opts.firstAt ?? NOW - 60 * DAY, result: "ok", interval: 1 }], ...(opts.bad ? { bad: 1 } : {}) }; };
const fillPage = (st, pg, opts) => chunking.pageAyahs(pg).forEach(([s, a]) => known(st, s, a, opts));
const withPrefs = (st, p) => { st.studentJourney = journey.createStudentJourney(st, 1); prefs.setDailyPrefs(st, { learningDays: [0, 1, 2, 3, 4, 5, 6], ...p }); return st; };

test("3.3 planner: recent pages daily, weak first-class, due by overdue, each page once", () => {
  const st = withPrefs(defaultState(), { studyMinutes: 60 });
  fillPage(st, 300, { firstAt: NOW - 3 * DAY, last: D - 1 });          // recent
  fillPage(st, 301, {}); st.weak[k(...chunking.pageAyahs(301)[0])] = { c: 0, d: D - 1 }; // weak
  fillPage(st, 302, { due: D - 9 }); fillPage(st, 303, { due: D - 2 });  // due, 302 more overdue
  fillPage(st, 300, { firstAt: NOW - 3 * DAY, last: D - 1, due: D - 1 }); // also due, but recent wins
  const plan = planner.buildPlan(st, NOW);
  const kinds = plan.tasks.map((t) => `${t.kind}:${t.page}`);
  assert.ok(kinds.includes("recent:300") && kinds.includes("weak:301"));
  assert.ok(kinds.indexOf("due:302") < kinds.indexOf("due:303"), "most overdue first");
  assert.equal(new Set(plan.tasks.map((t) => t.page)).size, plan.tasks.length, "no page twice");
  assert.deepEqual(plan.tasks.find((t) => t.kind === "weak").ayahs, [chunking.pageAyahs(301)[0]], "weak task targets the weak Ayahs");
  assert.ok(plan.tasks.every((t) => t.status === "todo"), "building a plan never marks anything done");
  assert.ok(plan.tasks.every((t) => t.reason.length > 10), "every task explains why it is there");
});

test("3.3 planner: rotation brings every memorized page round within the cycle; different Juz mix in one day", () => {
  const st = withPrefs(defaultState(), { studyMinutes: 20 });
  const pages = [...Array(40)].map((_, i) => 2 + i * 15); // pages spread over many Juz
  pages.forEach((pg) => fillPage(st, pg, { due: D + 400, last: D - 100 }));
  const seen = new Map(); let cycle = 0;
  for (let d = 0; d < 60; d++) {
    const now = NOW + d * DAY, today = planner.planDay(now);
    const plan = planner.buildPlan(st, now, null); cycle = plan.cycleDays;
    if (d === 0) assert.ok(new Set(plan.tasks.map((t) => quran.juzOf(...chunking.pageAyahs(t.page)[0]))).size > 1, "several Juz in one day");
    plan.tasks.filter((t) => t.kind === "rotation").forEach((t) => { seen.set(t.page, d); t.ayahs.forEach(([s, a]) => { st.mem[k(s, a)].last = today; }); });
  }
  assert.equal(seen.size, pages.length, "every page came round");
  assert.ok(cycle <= 30 && cycle >= 7);
});

test("3.3 planner: a missed fortnight is capped to the day's budget and carried over, not dumped", () => {
  const st = withPrefs(defaultState(), { studyMinutes: 30 });
  for (let pg = 100; pg < 220; pg++) fillPage(st, pg, { due: D - 14 });
  const plan = planner.buildPlan(st, NOW);
  assert.ok(plan.revisionMinutes <= 30); assert.ok(plan.carriedOver > 50); assert.ok(plan.overloaded);
});

test("3.3 planner: heavy revision pauses new memorization by recommendation; the learner can override", () => {
  const st = withPrefs(defaultState(), { studyMinutes: 30, newAmount: 1, newUnit: "half_pages" });
  st.studentJourney.paths = [{ ...journey.makePath(quran.Q(), { kind: "surahs", name: "Mulk", selected: [67] }, 1, "p"), isPrimary: true }]; st.studentJourney.primaryPathId = "p";
  const light = planner.buildPlan(st, NOW);
  assert.ok(light.tasks.some((t) => t.kind === "new" && /^\/mushaf\?p=\d+&mode=learn&from=67:1&/.test(t.href)), "new lesson from the primary path");
  for (let pg = 100; pg < 140; pg++) fillPage(st, pg, { due: D - 2 });
  const heavy = planner.buildPlan(st, NOW);
  assert.ok(heavy.newPaused && !heavy.tasks.some((t) => t.kind === "new"));
  planner.setOverrideNew(st, D, true);
  assert.ok(planner.buildPlan(st, NOW).tasks.some((t) => t.kind === "new"), "informed override");
  const sunday = withPrefs(clone(st), { learningDays: [1, 2, 3, 4, 5] });
  assert.ok(planner.buildPlan(sunday, NOW - DAY).restDay, "non-learning day is a rest day for new material");
});

test("3.3 planner: claims become a sampling check, never revision or evidence; partial pages use only known Ayahs", () => {
  const st = withPrefs(defaultState(), { studyMinutes: 45 });
  st.studentJourney.claims = [journey.makeClaim("Juz 30", "comfortable", [{ start: { s: 78, a: 1 }, end: { s: 114, a: 6 } }], 1)];
  const [s0, a0] = chunking.pageAyahs(300)[0]; known(st, s0, a0, { due: D - 1 });
  const plan = planner.buildPlan(st, NOW);
  const assess = plan.tasks.filter((t) => t.kind === "assess"); assert.equal(assess.length, 1); assert.ok(assess[0].href.startsWith("/assess?page="));
  assert.equal(plan.tasks.filter((t) => t.kind !== "assess" && t.page >= 582).length, 0, "claimed pages are not scheduled as revision");
  assert.deepEqual(plan.tasks.find((t) => t.page === 300).ayahs, [[s0, a0]], "only the memorized Ayah of a partly known page");
  assert.equal(Object.keys(st.mem).length, 1, "planning creates no records");
});

test("3.3 planner: completing, skipping and deferring are recorded per day; measured time replaces the default", () => {
  const st = withPrefs(defaultState(), { studyMinutes: 30 });
  fillPage(st, 50, { due: D - 1 });
  const t = planner.buildPlan(st, NOW).tasks[0];
  planner.markTask(st, D, t.id, "done");
  assert.equal(planner.buildPlan(st, NOW).tasks[0].status, "done");
  assert.equal(planner.buildPlan(st, NOW + DAY).tasks[0]?.status ?? "todo", "todo", "a new day starts fresh");
  assert.equal(planner.buildPlan(st, NOW).estimateSource, "default");
  for (let d = D - 10; d <= D; d++) st.log[String(d)] = { t: 600, a: 10 };
  const m = planner.buildPlan(st, NOW); assert.equal(m.estimateSource, "measured"); assert.equal(m.minutesPerPage, 15);
});

// =========================================================== Phase 3.4 — assessment & recovery
const assessment = await import("../src/lib/assessment.ts");

test("3.4 check: two prompts per page, deterministic, targets on the page; single-Ayah pages get one", () => {
  for (const pg of [2, 50, 300, 582, 604]) {
    const ps = assessment.assessmentPrompts(pg, 0); const ay = chunking.pageAyahs(pg).map(([s, a]) => `${s}:${a}`);
    assert.equal(ps[0].kind, "page_start"); assert.equal(`${ps[0].target}`, `${chunking.pageAyahs(pg)[0]}`);
    ps.forEach((p) => assert.ok(ay.includes(`${p.target[0]}:${p.target[1]}`)));
    if (ps[1]) { const i = ay.indexOf(`${ps[1].target[0]}:${ps[1].target[1]}`); assert.equal(`${ps[1].cue[0]}:${ps[1].cue[1]}`, ay[i - 1], "cue is the preceding Ayah"); }
    assert.deepEqual(assessment.assessmentPrompts(pg, 0), ps);
  }
  const single = [...Array(604)].map((_, i) => i + 1).find((pg) => chunking.pageAyahs(pg).length === 1);
  if (single) assert.equal(assessment.assessmentPrompts(single).length, 1);
});

test("3.4 check: saves evidence only for prompted Ayahs; a clean page check never verifies the rest", () => {
  const st = defaultState(); st.studentJourney = journey.createStudentJourney(st, 1);
  st.studentJourney.claims = [journey.makeClaim("Juz 30", "comfortable", [{ start: { s: 78, a: 1 }, end: { s: 114, a: 6 } }], 1)];
  const pg = 582; const ps = assessment.assessmentPrompts(pg);
  assert.equal(assessment.saveAssessment(st, pg, ps, ps.map(() => "ok")), "clean");
  assert.equal(Object.keys(st.mem).length, ps.length, "records only for the recited Ayahs");
  const other = chunking.pageAyahs(pg).find(([s, a]) => !ps.some((p) => p.target[0] === s && p.target[1] === a));
  assert.equal(coverage.coverageOf(st, k(...other), coverage.claimedAyahs(st)), "claimed", "untested Ayahs stay self-reported");
  ps.forEach((p) => assert.equal(coverage.isRetained(st.mem[k(...p.target)]), false, "one clean prompt is not long-term retention"));
  assert.equal(st.assessments[String(pg)].attempts, 1);
});

test("3.4 verdicts and recovery: forgot → recovery list; repeated failed recovery recommends relearning; success is tracked separately", () => {
  assert.equal(assessment.verdictOf(["ok", "ok"]), "clean"); assert.equal(assessment.verdictOf(["bad", "bad"]), "forgot"); assert.equal(assessment.verdictOf(["ok", "bad"]), "needs_help");
  const st = defaultState(); const pg = 300; const ps = assessment.assessmentPrompts(pg);
  assessment.saveAssessment(st, pg, ps, ps.map(() => "bad"));
  let list = assessment.recoveryList(st); assert.equal(list[0].page, pg); assert.match(list[0].reason, /could not recall/); assert.equal(list[0].recommendRelearn, false);
  assessment.recordRecovery(st, pg, ["ok", "bad"]); assessment.recordRecovery(st, pg, ["hes"]);
  list = assessment.recoveryList(st); assert.equal(list[0].recommendRelearn, true, "two unsuccessful recoveries → relearn");
  assessment.recordRecovery(st, pg, ["ok", "ok"]);
  list = assessment.recoveryList(st); assert.equal(list[0].recovered, true); assert.equal(list[0].recommendRelearn, false);
  assert.equal(st.assessments[String(pg)].verdict, "forgot", "the original diagnostic is kept separately from recovery progress");
  // Weak-Ayah clusters also surface pages for recovery
  const st2 = defaultState(); const [a1, a2] = chunking.pageAyahs(10); st2.mem[k(...a1)] = { iv: 0, due: 0, last: 0, reps: 1, failures: 1, bad: 1 }; st2.mem[k(...a2)] = { ...st2.mem[k(...a1)] };
  st2.weak[k(...a1)] = { c: 0, d: 1 }; st2.weak[k(...a2)] = { c: 0, d: 1 };
  assert.equal(assessment.recoveryList(st2)[0].page, 10);
});

test("3.4 recovery lesson: recovery template rebuilds order, uses first-letter clues, ends with a whole test", () => {
  const ayahs = chunking.pageAyahs(300); const steps = lesson.buildSteps(ayahs, "standard", "recover");
  assert.ok(steps.some((s) => s.kind === "fade" && s.fade === 2)); assert.ok(steps.some((s) => s.kind === "order"));
  assert.equal(steps.at(-1).scope, "page"); assert.equal(steps.at(-1).units.length, ayahs.length);
  const st = defaultState(); const L = lesson.newLesson("recover", { kind: "page", page: 300, start: {}, end: {} }, "Recover 300", "guided", "standard", 1);
  st.lessons[L.id] = L; ayahs.forEach(([s, a]) => { L.results[lesson.finalKey(s, a)] = "ok"; });
  assert.equal(lesson.saveLessonEvidence(st, L.id, ayahs), ayahs.length);
  assert.ok(st.mem[k(...ayahs[0])], "recovery creates records for previously untracked (claimed) Ayahs via 'assessment'");
});

// =========================================================== Phase 3.5 — Visual Maps catalog
const maps = await import("../src/lib/mapCatalog.ts");
const { MIND_MAPS } = await import("../src/lib/mindMaps.ts");

test("3.5 maps: stable IDs; JSON documents match the bundled maps exactly; manifest is versioned and valid", async () => {
  assert.deepEqual(MIND_MAPS.map((m) => m.id), ["al-fatihah", "al-baqarah-1-5", "al-baqarah-21-29"]);
  const manifest = JSON.parse(await readFile(resolve(root, "public/maps/manifest.json"), "utf8"));
  assert.deepEqual(await maps.reviewedMapsForLocation(1, 3), [], "the runtime lesson lookup respects the production review manifest");
  assert.equal(manifest.schema, 1); assert.ok(manifest.version >= 1);
  for (const m of MIND_MAPS) {
    const doc = JSON.parse(await readFile(resolve(root, `public/maps/${m.id}.json`), "utf8"));
    assert.deepEqual(doc, JSON.parse(JSON.stringify(m)), `${m.id}.json is in sync with mindMaps.ts (run scripts/build-map-docs.mjs)`);
    assert.deepEqual(maps.validateMapDoc(doc), []);
    const e = manifest.maps.find((x) => x.id === m.id); assert.ok(e && e.file === `maps/${m.id}.json` && e.review && e.license && e.source);
  }
});

test("3.5 maps: validation rejects out-of-range references and embedded Quran text", () => {
  const good = JSON.parse(JSON.stringify(MIND_MAPS[0]));
  assert.ok(maps.validateMapDoc({ ...good, to: 99 }).some((e) => e.includes("out of bounds")));
  assert.ok(maps.validateMapDoc({ ...good, nodes: [{ ayah: 12, cue: "x", symbol: "*", color: "#000" }] }).some((e) => e.includes("outside")));
  assert.ok(maps.validateMapDoc({ ...good, nodes: [{ ...good.nodes[0], cue: quran.text(1, 1) }] }).some((e) => e.includes("Quran text")));
});

test("3.5 maps: lazy lookup by Ayah; unknown maps and uncovered Ayahs return nothing (lessons unaffected)", async () => {
  assert.deepEqual((await maps.mapsForAyah(1, 5)).map((e) => e.id), ["al-fatihah"]);
  assert.deepEqual((await maps.mapsForAyah(2, 25)).map((e) => e.id), ["al-baqarah-21-29"]);
  assert.deepEqual(await maps.mapsForAyah(67, 1), []);
  assert.equal(await maps.loadMap("no-such-map"), null);
  assert.equal((await maps.loadMap("al-fatihah")).nodes.length, 7);
  assert.ok(lesson.buildSteps(chunking.pageAyahs(562), "guided").length > 0, "a page without any map still builds a full lesson");
});

test("Stage 2 map integration: canonical reviewed coverage only; map-assisted recall is not clean evidence", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "public/maps/manifest.json"), "utf8"));
  // These authored starter maps are explicitly unreviewed, so none can teach a lesson yet.
  assert.deepEqual(manifest.maps.flatMap((e) => maps.reviewedMapsForAyah([e], e.surah, e.from)), []);
  const verifiedEntry = { ...manifest.maps[0], review: { status: "teacher_reviewed", reviewer: "fixture", reviewedAt: "2026-01-01" } };
  assert.deepEqual(maps.reviewedMapsForAyah([verifiedEntry], 1, 3).map((e) => e.id), ["al-fatihah"]);
  assert.deepEqual(maps.reviewedMapsForAyah([verifiedEntry], 2, 3), [], "surah mismatch is not a match");
  assert.deepEqual(maps.reviewedMapsForAyah([verifiedEntry], 1, 8), [], "range mismatch is not a match");
  assert.deepEqual(maps.reviewedMapsForAyah([verifiedEntry], 1, 0), [], "invalid location is rejected");
  const doc = await maps.loadMap(verifiedEntry.id);
  assert.ok(doc.nodes.some((n) => n.ayah === 3), "canonical map document has an Ayah branch to focus");

  const l = lesson.newLesson("learn", { kind: "range", start: { s: 1, a: 1 }, end: { s: 1, a: 3 } }, "Al-Fatihah", "guided", "guided");
  l.results[lesson.finalKey(1, 3)] = "ok";
  l.hinted[lesson.finalKey(1, 3)] = true; // View visual map during recall/test.
  const evidence = lesson.evidenceFromLesson(l, [[1, 1], [1, 2], [1, 3]]);
  assert.deepEqual(evidence.items, [[1, 3]]);
  assert.equal(evidence.res[0], "hes", "map-assisted Ayah cannot be recorded as unaided recall");
  assert.equal(lesson.markWithAssistance("ok", true), "hes", "manual ratings also count map viewing as assistance");
  assert.equal(lesson.markWithAssistance("ok", false), "ok", "unassisted correct recall stays clean");
});

test("Visual Map review workflow: technical checks stay separate from teacher and permission approval", async () => {
  const base = JSON.parse(await readFile(resolve(root, "public/maps/manifest.json"), "utf8"));
  const review = JSON.parse(await readFile(resolve(root, "public/maps/review-manifest.json"), "utf8"));
  assert.equal(review.approvalPolicy.technicalValidationIsNotTeacherApproval, true);
  assert.deepEqual(review.maps.map((x) => x.id).sort(), base.maps.map((x) => x.id).sort());
  for (const record of review.maps) {
    const entry = base.maps.find((x) => x.id === record.id);
    assert.deepEqual(record.ayahCoverage, { surah: entry.surah, from: entry.from, to: entry.to });
    assert.ok(["technically_valid", "technical_issues"].includes(record.technicalStatus));
    assert.ok(["unresolved", "cleared", "denied"].includes(record.permissionStatus));
    assert.ok(Array.isArray(record.outstandingIssues));
  }
  const entry = base.maps.find((x) => x.id === "al-fatihah");
  const approved = { ...review, maps: review.maps.map((x) => x.id === entry.id ? { ...x, status: "teacher_reviewed", reviewer: "Synthetic reviewer", reviewedAt: "2026-11-14", permissionStatus: "cleared", outstandingIssues: [] } : x) };
  assert.deepEqual(maps.reviewedMapsForAyah(maps.applyReviewManifest(base, approved).maps, 1, 4).map((x) => x.id), [entry.id], "isolated approval fixture reaches lesson lookup without changing production status");
  const technicallyInvalid = { ...approved, maps: approved.maps.map((x) => x.id === entry.id ? { ...x, technicalStatus: "technical_issues" } : x) };
  assert.deepEqual(maps.reviewedMapsForAyah(maps.applyReviewManifest(base, technicallyInvalid).maps, 1, 4), [], "technical issues fail closed independently");
  const permissionPending = { ...approved, maps: approved.maps.map((x) => x.id === entry.id ? { ...x, permissionStatus: "unresolved" } : x) };
  assert.deepEqual(maps.reviewedMapsForAyah(maps.applyReviewManifest(base, permissionPending).maps, 1, 4), [], "teacher review alone does not bypass unresolved rights");
  const wrongRange = { ...approved, maps: approved.maps.map((x) => x.id === entry.id ? { ...x, ayahCoverage: { surah: 1, from: 1, to: 6 } } : x) };
  assert.deepEqual(maps.reviewedMapsForAyah(maps.applyReviewManifest(base, wrongRange).maps, 1, 4), [], "approval for a stale range cannot be reused against changed coverage");
  const issueOpen = { ...approved, maps: approved.maps.map((x) => x.id === entry.id ? { ...x, outstandingIssues: ["one unresolved issue"] } : x) };
  assert.deepEqual(maps.reviewedMapsForAyah(maps.applyReviewManifest(base, issueOpen).maps, 1, 4), [], "open review findings block lesson use");
  assert.deepEqual(maps.reviewedMapsForAyah(maps.applyReviewManifest(base, null).maps, 1, 4), [], "missing editorial manifest fails closed");
});

test("Visual Map content audit: canonical branch/group coverage is complete and no ayah text is embedded", async () => {
  const { MIND_MAPS } = await import("../src/lib/mindMaps.ts");
  for (const map of MIND_MAPS) {
    const expected = Array.from({ length: map.to - map.from + 1 }, (_, i) => map.from + i);
    assert.deepEqual(map.nodes.map((n) => n.ayah), expected, `${map.id} has one ordered branch per ayah`);
    const grouped = map.groups.flatMap((g) => g.ayahs).sort((a, b) => a - b);
    assert.deepEqual(grouped, expected, `${map.id} group branches cover the range exactly once`);
    const serialized = JSON.stringify(map);
    for (const ayah of expected) assert.ok(!serialized.includes(quran.text(map.surah, ayah)), `${map.id} ${map.surah}:${ayah} text is sourced from Quran data, not duplicated`);
  }
});

test("3.5 maps: map progress (even 'strong') never counts as memorization evidence", () => {
  const st = defaultState();
  st.mapProgress["al-fatihah"] = { status: "strong", due: 0, last: 1, reps: 9, intervalDays: 60, quizAttempts: 20, quizCorrect: 20, assessmentSuccesses: 5 };
  const c = coverage.coverageSummary(st);
  assert.equal(c.retained + c.learning + c.weak + c.legacy_marked + c.claimed, 0);
  assert.equal(planner.buildPlan(st, NOW).tasks.length, 0, "no revision is scheduled from map activity alone");
});

// =========================================================== UX Stage 1 — Recall on the Mushaf page
const pageRecall = await import("../src/lib/pageRecall.ts");

test("UX1 page recall: nothing is saved until every Ayah is rated; help turns ok into hes; saved once via applyResults", () => {
  const st = defaultState(); const ayahs = chunking.pageAyahs(2);
  const ratings = {}; const help = {};
  ratings["2:1"] = "ok"; ratings["2:2"] = "ok"; help["2:2"] = true; ratings["2:3"] = "bad";
  assert.equal(pageRecall.savePageRecall(st, 2, ayahs, ratings, help), 0, "incomplete → nothing saved");
  assert.deepEqual(st.mem, {});
  ratings["2:4"] = "hes"; ratings["2:5"] = "ok";
  assert.equal(pageRecall.savePageRecall(st, 2, ayahs, ratings, help), 5);
  assert.equal(st.mem["2:1"].history.at(-1).result, "ok");
  assert.equal(st.mem["2:2"].history.at(-1).result, "hes", "a hint/peek/listen during the test is not unassisted recall");
  assert.equal(st.mem["2:3"].bad, 1); assert.ok(st.weak["2:3"]);
  assert.equal(st.hist[0].l, "Recall page 2 · Mushaf");
});

test("UX1 page halves: every page splits into two non-empty, ordered, complete halves (single-Ayah pages excepted)", () => {
  let checked = 0;
  for (let pg = 1; pg <= 604; pg++) {
    const c = quran.pageContent(pg); const { first, second } = pageRecall.pageHalves(c);
    const all = [...first, ...second].map(([s, a]) => `${s}:${a}`);
    assert.deepEqual(all, c.ayat.map(([s, a]) => `${s}:${a}`), `page ${pg} halves cover the page in order`);
    if (c.ayat.length >= 2) { assert.ok(first.length && second.length, `page ${pg} has two halves`); checked++; }
  }
  assert.ok(checked > 550);
  const h1 = pageRecall.pageHalves(quran.pageContent(1)); assert.ok(h1.first.length >= 3 && h1.second.length >= 2, "Al-Fatihah splits sensibly");
});

// ---------------------------------------------------------------- UX Stage 2: guided learning on the Mushaf
const ml = await import("../src/lib/mushafLesson.ts");
const lessonFinish = await import("../src/lib/lessonFinish.ts");
const K = (x) => `${x[0]}:${x[1]}`;
const pageWords = (pg) => quran.pageContent(pg).flat;
const ctx0 = (ayahs, results = {}) => ({ lessonAyahs: ayahs, results, shown: false, reveal: 0, fadeLevel: 1 });

test("UX2 Ayah-by-Ayah progression with cumulative joins 1-2, 1-3 and a final full-page test", () => {
  const ay = chunking.pageAyahs(2); const steps = lesson.buildSteps(ay, "guided");
  const ayahOrder = steps.filter((s) => s.kind === "listen").map((s) => K([s.units[0].s, s.units[0].a]));
  assert.deepEqual([...new Set(ayahOrder)], ay.map(K), "listen steps visit Ayahs in Mushaf order");
  const joins = steps.filter((s) => s.kind === "recall" && (s.scope === "link" || s.scope === "group")).map((s) => s.units.map((u) => u.a));
  assert.deepEqual(joins[0], [ay[0][1], ay[1][1]], "1-2 together"); assert.deepEqual(joins[1], [ay[0][1], ay[1][1], ay[2][1]], "1-3 together");
  const final = steps.findIndex((s) => s.kind === "recall" && s.scope === "page");
  assert.ok(final > 0 && steps.slice(final + 1).every((s) => s.scope === "connect"), "page test is last (before the optional connect)");
  assert.deepEqual([...new Set(steps.map((s) => ml.activity(s)))].sort(), ["Hide", "Join", "Listen", "Page test", "Recall"].sort());
});

test("UX2 long Ayahs use phrase chunks and cumulative phrase joins before full-Ayah recall", () => {
  const steps = lesson.buildSteps([[2, 282]], "standard");
  const recalls = steps.filter((s) => s.kind === "recall");
  const parts = recalls.filter((s) => s.scope === "phrase" && s.units.length === 1);
  assert.ok(parts.length > 3, "several phrase recalls");
  const joins = recalls.filter((s) => s.scope === "phrase" && s.units.length > 1);
  joins.forEach((j, i) => assert.equal(j.units.length, i + 2, "joins grow 1-2, 1-3 ..."));
  let next = 0;
  parts.map((s) => s.units[0]).forEach((u) => { assert.equal(u.from, next); next = u.to + 1; });
  assert.equal(next, quran.words(2, 282).length, "phrases cover the Ayah once, in order");
});

test("UX2 page view: only the step passage is concealed; other Ayahs stay visible", () => {
  const pg = 2, ay = chunking.pageAyahs(pg), flat = pageWords(pg); const steps = lesson.buildSteps(ay, "guided");
  const recall1 = steps.find((s) => s.kind === "recall" && s.scope === "ayah");
  flat.forEach((f) => {
    const v = ml.wordView(recall1, ctx0(ay), f.s, f.a, f.w);
    const inStep = f.s === recall1.units[0].s && f.a === recall1.units[0].a;
    assert.equal(v.state, inStep ? "hide" : "show"); assert.equal(v.active, inStep);
  });
  assert.ok(flat.every((f) => ml.wordView(steps[0], ctx0(ay), f.s, f.a, f.w).state === "show"), "listen step conceals nothing");
  const fade = steps.find((s) => s.kind === "fade"); const u = fade.units[0];
  const fw = flat.filter((f) => f.s === u.s && f.a === u.a && f.w >= u.from && f.w <= u.to);
  assert.deepEqual(fw.map((f) => ml.wordView(fade, ctx0(ay), f.s, f.a, f.w).state), fw.map((f) => (f.w - u.from) % 2 === 0 ? "show" : "hide"));
  assert.ok(fw.every((f) => ml.wordView(fade, { ...ctx0(ay), fadeLevel: 2 }, f.s, f.a, f.w).state === "head"));
  assert.ok(fw.every((f) => ml.wordView(fade, { ...ctx0(ay), fadeLevel: 3 }, f.s, f.a, f.w).state === "hide"));
  assert.equal(ml.headOf("بِسۡمِ"), "بِ");
});

test("UX2 hints reveal words in reading order across a cumulative passage; show reveals all", () => {
  const ay = chunking.pageAyahs(2); const steps = lesson.buildSteps(ay, "guided");
  const join = steps.find((s) => s.kind === "recall" && s.scope === "link");
  const flat = pageWords(2).filter((f) => join.units.some((u) => u.s === f.s && u.a === f.a));
  const shownWith = (reveal, shown = false) => flat.filter((f) => ml.wordView(join, { ...ctx0(ay), reveal, shown }, f.s, f.a, f.w).state === "show").map((f) => K([f.a, f.w]));
  assert.deepEqual(shownWith(0), []);
  const n1 = join.units[0].to + 1;
  assert.deepEqual(shownWith(n1 + 1), flat.slice(0, n1 + 1).map((f) => K([f.a, f.w])), "hint crosses into the 2nd Ayah in order");
  assert.equal(shownWith(0, true).length, flat.length);
  assert.equal(ml.hintLimit(join, ctx0(ay), (s, a) => quran.words(s, a).length), flat.length);
});

test("UX2 page test view and hint-assisted evidence", () => {
  const ay = chunking.pageAyahs(2); const fin = lesson.buildSteps(ay, "guided").find((s) => s.scope === "page");
  const results = { [lesson.finalKey(...ay[0])]: "ok" };
  assert.equal(ml.finalCursor(ay, results), 1);
  const v = (x, w = 0, c = {}) => ml.wordView(fin, { ...ctx0(ay, results), ...c }, x[0], x[1], w);
  assert.deepEqual(v(ay[0]), { state: "show", active: false });
  assert.deepEqual(v(ay[1]), { state: "hide", active: true });
  assert.deepEqual(v(ay[2]), { state: "hide", active: false }, "later Ayahs stay hidden");
  assert.equal(v(ay[1], 0, { reveal: 1 }).state, "show"); assert.equal(v(ay[1], 1, { reveal: 1 }).state, "hide");
  const L = { results: { [lesson.finalKey(...ay[0])]: "ok", [lesson.finalKey(...ay[1])]: "ok" }, hinted: { [lesson.finalKey(...ay[1])]: true } };
  const ev = lesson.evidenceFromLesson(L, ay);
  assert.deepEqual(ev.items.map(K), [K(ay[0]), K(ay[1])], "unrated Ayahs excluded"); assert.deepEqual(ev.res, { 0: "ok", 1: "hes" });
});

test("UX2 halves and portions: same lesson ids as /learn; older range lessons resume", () => {
  const pg = 50, ay = chunking.pageAyahs(pg); const h = pageRecall.pageHalves(quran.pageContent(pg));
  assert.equal(ml.portionLesson(pg, ay, ay).id, `learn:page:${pg}`);
  const first = ml.portionLesson(pg, ay, h.first); assert.equal(first.id, `learn:range:${K(h.first[0])}-${K(h.first.at(-1))}`);
  assert.notEqual(first.id, ml.portionLesson(pg, ay, h.second).id, "halves keep separate progress");
  const rangeId = `learn:range:${K(ay[0])}-${K(ay.at(-1))}`;
  assert.equal(ml.portionLesson(pg, ay, ay, "learn", (id) => id === rangeId).id, rangeId);
  assert.deepEqual(ml.parsePortion(ay, K(h.second[0]), K(h.second.at(-1))).map(K), h.second.map(K));
  assert.equal(ml.parsePortion(ay, "1:1", "1:2"), null);
  assert.equal(ml.parsePortion(ay, K(ay[3]), K(ay[1])), null);
});

test("UX2 links: single-page Learn opens the Mushaf; recovery and multi-page ranges keep /learn", () => {
  const pageOf = quran.pageOf;
  assert.equal(ml.learnHref({ page: 7 }, pageOf), "/mushaf?p=7&mode=learn&portion=page");
  assert.equal(ml.learnHref({ page: 7, template: "recover" }, pageOf), "/learn?page=7&template=recover");
  assert.equal(ml.learnHref({ start: { s: 2, a: 1 }, end: { s: 2, a: 5 }, pathId: "p 1" }, pageOf), `/mushaf?p=${pageOf(2, 1)}&mode=learn&from=2:1&to=2:5&pathId=p%201`);
  assert.equal(ml.learnHref({ start: { s: 2, a: 1 }, end: { s: 2, a: 30 } }, pageOf), "/learn?s=2&a=1&endS=2&endA=30");
  const L = lesson.newLesson("learn", { kind: "page", page: 9, start: { s: 2, a: 49 }, end: { s: 2, a: 57 } }, "x", "guided", "guided");
  assert.equal(ml.lessonHref(L, pageOf), "/mushaf?p=9&mode=learn&portion=page");
});

test("UX2 resume and final-only evidence: finishing twice saves once; unattempted Ayahs untouched", () => {
  const ay = chunking.pageAyahs(2); const meta = ml.portionLesson(2, ay, ay); const steps = lesson.buildSteps(ay, "guided");
  const d = defaultState(); d.lessons = { [meta.id]: lesson.newLesson("learn", meta.unit, meta.title, "guided", "guided", 1) };
  d.lessons[meta.id].step = 6; d.lessons[meta.id].results["step:2"] = "ok";
  const reloaded = hydrateState(JSON.parse(JSON.stringify(d)));
  assert.equal(reloaded.lessons[meta.id].step, 6, "resumes at the same step after reload / mode switch");
  const h0 = JSON.stringify(reloaded.hist);
  assert.equal(lessonFinish.finishLesson(reloaded, meta.id, ay, meta.unit, "learn"), 0, "practice ratings alone save nothing");
  assert.equal(JSON.stringify(reloaded.hist), h0);
  const e = defaultState(); e.lessons = { [meta.id]: lesson.newLesson("learn", meta.unit, meta.title, "guided", "guided", 1) };
  const M = e.lessons[meta.id]; M.step = steps.findIndex((s) => s.scope === "page");
  M.results[lesson.finalKey(...ay[0])] = "ok"; M.results[lesson.finalKey(...ay[1])] = "bad";
  assert.equal(lessonFinish.finishLesson(e, meta.id, ay, meta.unit, "learn"), 2);
  const snap = JSON.stringify([e.hist, e.mem, e.weak]);
  assert.equal(lessonFinish.finishLesson(e, meta.id, ay, meta.unit, "learn"), 0, "second finish saves nothing");
  assert.equal(JSON.stringify([e.hist, e.mem, e.weak]), snap, "no duplicate SRS results");
  ay.slice(2).forEach(([s, a]) => assert.ok(!coverage.hasEvidence(e.mem[`${s}:${a}`]), `${s}:${a} unattempted, no evidence`));
  assert.ok(coverage.hasEvidence(e.mem[K(ay[0])]));
  assert.equal(e.mem[K(ay[0])].successes, 1); assert.ok(e.weak[K(ay[1])], "could-not-recall Ayah goes to weak");
});

test("UX2 skip preparation jumps to the next recall step", () => {
  const steps = lesson.buildSteps(chunking.pageAyahs(2), "guided");
  const j = ml.nextRecallStep(steps, 0); assert.equal(steps[j].kind, "recall");
  assert.ok(steps.slice(1, j).every((s) => s.kind !== "recall"));
});

test("UX2 manual view: per-Ayah concealment; selected Ayah active", () => {
  assert.deepEqual(ml.manualWordView({ "2:3": 3 }, [2, 3], 2, 3, 0), { state: "hide", active: true });
  assert.deepEqual(ml.manualWordView({ "2:3": 3 }, [2, 3], 2, 4, 0), { state: "show", active: false });
  assert.equal(ml.manualWordView({ "2:3": 1 }, [2, 3], 2, 3, 1).state, "hide");
  assert.equal(ml.manualWordView({ "2:3": 2 }, [2, 3], 2, 3, 1).state, "head");
});

// ---------------------------------------------------------------- UX Stage 3: 604-page tracker
const pt = await import("../src/lib/pageTracker.ts");
const T = hifz.applyResults ? today() : 0;
const rec = (extra = {}) => ({ iv: 1, due: T + 1, last: T, reps: 1, successes: 1, failures: 0, confidence: 1, successDays: [T], ...extra });
const retainedRec = () => rec({ iv: 30, due: T + 30, successes: 6, successDays: [T - 50, T - 40, T - 30, T - 20, T - 10, T] });
const setPage = (st, pg, f) => chunking.pageAyahs(pg).forEach(([s, a], i) => { const r = f(i, s, a); if (r) st.mem[`${s}:${a}`] = r; });

test("UX3 all 604 pages exactly once, in order, with canonical Juz and Ayah coverage", () => {
  const pages = pt.pageTracker(defaultState(), quran.pageOf);
  assert.equal(pages.length, 604);
  assert.deepEqual(pages.map((p) => p.page), Array.from({ length: 604 }, (_, i) => i + 1));
  const all = pages.flatMap((p) => p.ayahs.map(([s, a]) => `${s}:${a}`));
  assert.equal(all.length, 6236); assert.equal(new Set(all).size, 6236, "every Ayah on exactly one page");
  pages.forEach((p) => { assert.equal(p.juz, quran.juzOf(p.first[0], p.first[1])); p.ayahs.forEach(([s, a]) => assert.equal(quran.pageOf(s, a), p.page)); });
  assert.equal(pages[0].juz, 1); assert.equal(pages[603].juz, 30); assert.deepEqual(pages[0].surahs, [1]);
});

test("UX3 empty account: every page Not started, nothing written", () => {
  const st = defaultState(); const snap = JSON.stringify(st);
  const c = pt.statusCounts(pt.pageTracker(st, quran.pageOf));
  assert.equal(c.none, 604); assert.equal(JSON.stringify(st), snap, "computing the tracker never writes state");
});

test("UX3 statuses: claimed, learned, strong, weak, due, learning, partial (mixed claim + recitation)", () => {
  const st = defaultState(); st.studentJourney = journey.createStudentJourney(st, 1);
  const claimP = 10, ay10 = chunking.pageAyahs(claimP);
  st.studentJourney.claims.push({ ...journey.makeClaim("p10", "comfortable", [{ start: { s: ay10[0][0], a: ay10[0][1] }, end: { s: ay10.at(-1)[0], a: ay10.at(-1)[1] } }], 1), id: "c10" });
  setPage(st, 20, () => rec());                                  // every Ayah clean once → learned
  setPage(st, 21, () => retainedRec());                          // every Ayah retained → strong
  setPage(st, 22, (i) => i === 0 ? rec({ bad: 1, successes: 0, failures: 1 }) : retainedRec()); // weak wins
  setPage(st, 23, (i) => i === 1 ? rec({ due: T - 3 }) : rec()); // due
  setPage(st, 24, (i) => i < 2 ? rec() : null);                  // half recited → partial
  // mixed: claimed page 30 where two Ayahs were independently recited
  const ay30 = chunking.pageAyahs(30);
  st.studentJourney.claims.push({ ...journey.makeClaim("p30", "comfortable", [{ start: { s: ay30[0][0], a: ay30[0][1] }, end: { s: ay30.at(-1)[0], a: ay30.at(-1)[1] } }], 2), id: "c30" });
  st.mem[`${ay30[0][0]}:${ay30[0][1]}`] = retainedRec(); st.mem[`${ay30[1][0]}:${ay30[1][1]}`] = retainedRec();
  // learning: an open lesson on page 40
  st.lessons = { x: lesson.newLesson("learn", { kind: "page", page: 40, start: { s: 1, a: 1 }, end: { s: 1, a: 1 } }, "Learn page 40", "guided", "guided", 5) };
  const P = pt.pageTracker(st, quran.pageOf);
  assert.equal(P[claimP - 1].status, "claimed"); assert.equal(P[claimP - 1].claimed, ay10.length); assert.equal(P[claimP - 1].assessed, 0);
  assert.equal(P[19].status, "learned"); assert.equal(P[20].status, "strong"); assert.equal(P[21].status, "weak");
  assert.equal(P[22].status, "due"); assert.deepEqual(P[22].dueAyahs.length, 1);
  assert.equal(P[23].status, "partial");
  const m = P[29]; assert.equal(m.status, "partial", "claims + some recitation = partly checked, not strong");
  assert.equal(m.assessed, 2); assert.equal(m.claimed, ay30.length - 2);
  assert.match(pt.evidenceLine(m), /2 of \d+ Ayahs recited and rated · 2 long-term · \d+ said memorized \(not checked\)/);
  assert.equal(P[39].status, "learning"); assert.ok(P[39].lesson);
});

test("UX3 a sampled assessment never makes a page Strong", async () => {
  const st = defaultState(); const pg = 300; const ay = chunking.pageAyahs(pg);
  // even perfect long-term records on the sampled Ayahs only → partial
  [ay[0], ay[3]].forEach(([s, a]) => { st.mem[`${s}:${a}`] = retainedRec(); });
  const p = pt.pageInfo(st, pg, quran.pageOf);
  assert.equal(p.status, "partial"); assert.equal(p.retained, 2);
  // a real sampled assessment through the existing flow
  const st2 = defaultState(); const prompts = assessment.assessmentPrompts(pg);
  assessment.saveAssessment(st2, pg, prompts, prompts.map(() => "ok"));
  const p2 = pt.pageInfo(st2, pg, quran.pageOf);
  assert.ok(p2.assessed < ay.length, "sample covers only part of the page");
  assert.notEqual(p2.status, "strong"); assert.notEqual(p2.status, "learned");
});

test("UX3 legacy 'Mark memorized' marks count as said-memorized, never as recited", () => {
  const st = defaultState(); setPage(st, 50, () => ({ iv: 0, due: T + 100, last: T, reps: 0, confidence: 0 }));
  const p = pt.pageInfo(st, 50, quran.pageOf);
  assert.equal(p.status, "claimed"); assert.equal(p.legacy, p.ayahs.length); assert.equal(p.assessed, 0);
});

test("UX3 fully populated account and large revision queue stay consistent and fast", () => {
  const st = defaultState();
  for (let pg = 1; pg <= 604; pg++) setPage(st, pg, (i) => pg % 3 === 0 ? rec({ due: T - 10 }) : pg % 3 === 1 ? retainedRec() : rec());
  const t0 = performance.now(); const P = pt.pageTracker(st, quran.pageOf); const ms = performance.now() - t0;
  const c = pt.statusCounts(P);
  assert.equal(c.due, 201); assert.equal(c.strong, 202); assert.equal(c.learned, 201); assert.equal(c.none, 0);
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), 604);
  assert.ok(ms < 1500, `computed in ${Math.round(ms)}ms`);
});

test("UX3 tracker navigation targets: Read / Learn / Recall / resume", () => {
  assert.equal(mlx().learnHref({ page: 12 }, quran.pageOf), "/mushaf?p=12&mode=learn&portion=page");
  const L = lesson.newLesson("learn", { kind: "range", start: { s: 2, a: 1 }, end: { s: 2, a: 3 } }, "x", "guided", "guided", 1); L.step = 4;
  const st = defaultState(); st.lessons = { [L.id]: L };
  const p = pt.pageInfo(st, quran.pageOf(2, 1), quran.pageOf);
  assert.equal(p.lesson.id, L.id, "open lesson attached to its page");
  assert.equal(mlx().lessonHref(p.lesson, quran.pageOf), `/mushaf?p=${quran.pageOf(2, 1)}&mode=learn&from=2:1&to=2:3`);
});
test("UX3 Mushaf revision selection accepts only unique Ayahs on the selected canonical page", () => {
  const ayahs = chunking.pageAyahs(2);
  assert.deepEqual(pageRecall.parsePageAyahSelection(ayahs, `${ayahs[1][0]}:${ayahs[1][1]},${ayahs[4][0]}:${ayahs[4][1]}`), [ayahs[1], ayahs[4]]);
  assert.deepEqual(pageRecall.parsePageAyahSelection(ayahs, null), ayahs, "ordinary full-page recall is unchanged");
  assert.equal(pageRecall.parsePageAyahSelection(ayahs, ""), null);
  assert.equal(pageRecall.parsePageAyahSelection(ayahs, "2:999"), null, "out-of-page Ayah rejected");
  assert.equal(pageRecall.parsePageAyahSelection(ayahs, `2:${ayahs[0][1]},2:${ayahs[0][1]}`), null, "duplicate Ayah rejected");
});
const mlx = () => ml;
