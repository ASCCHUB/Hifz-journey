import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// Node's built-in test runner is sufficient here; resolve the extensionless TS imports
// used by the app, while Node 24 strips TypeScript types at runtime.
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
globalThis.localStorage = {
  getItem: (key) => inMemoryStorage.get(key) ?? null,
  setItem: (key, value) => inMemoryStorage.set(key, String(value)),
  removeItem: (key) => inMemoryStorage.delete(key),
};
const dataFiles = new Map(["quran", "layout", "juz", "divisions"].map((name) => [name, resolve(root, `public/data/${name}.json`)]));
globalThis.fetch = async (url) => {
  const name = String(url).split("/").at(-1).replace(/\.json(?:\?.*)?$/, "");
  const path = dataFiles.get(name);
  if (!path) return { ok: false, status: 404 };
  const json = JSON.parse(await readFile(path, "utf8"));
  return { ok: true, json: async () => json };
};

const [{ loadCore, Q, resolveLocation }, hifz, store, recitation, { align }, journey, { MIND_MAPS }] = await Promise.all([
  import("../src/lib/quran.ts"),
  import("../src/lib/hifz.ts"),
  import("../src/lib/store.ts"),
  import("../src/lib/recitationResults.ts"),
  import("../src/lib/recitationAlign.ts"),
  import("../src/lib/journey.ts"),
  import("../src/lib/mindMaps.ts"),
]);
await loadCore();
const { defaultState, today, hydrateState, mergeGuestProgress, setProfile, getState, update, guestProgress } = store;
const { applyResults, markRange, markJuz, juzProgress, isMemorized, isAyahDue, dueRuns, weakDue } = hifz;
const { saveRecitation, assessAyahs } = recitation;
const { createStudentJourney, makePath, makeRanges, makeClaim, rangeFromPageBounds, pathStart, partialJuzRange, expandRanges, previousAyah, tombstoneClaim, archivePath } = journey;
const k = (s, a) => `${s}:${a}`;

test("Quran UI labels use readable Surah, Juz, and page references", async () => {
  const { pageAyahsStart, surahPageLabel, juzName } = await import("../src/lib/quranView.ts");
  assert.equal(surahPageLabel("Al-Fatihah", 7, 1, 1), "Al-Fatihah | 7 Ayahs | Page 1");
  assert.equal(surahPageLabel("Al-Baqarah", 286, 2, 49), "Al-Baqarah | 286 Ayahs | Pages 2-49");
  assert.equal(juzName(30), "Juz 30");
  assert.equal(pageAyahsStart(1), "Al-Fatihah 1");
});

test("Mushaf text visibility follows the selected lesson sequence and only adds concealment", async () => {
  const { applyTextVisibility } = await import("../src/lib/mushafLesson.ts");
  const portion = [[2, 10], [2, 11], [2, 12]];
  const step = { kind: "read", units: [{ s: 2, a: 11, from: 0, to: 1, whole: false }], label: "part", instruction: "part", phase: "learn", ayahIndex: 2, ayahCount: 3 };
  const show = { state: "show", active: false };
  assert.equal(applyTextVisibility(show, "unlearned", portion, step, 2, 10, 0).state, "show");
  assert.equal(applyTextVisibility(show, "unlearned", portion, step, 2, 11, 2).state, "hide");
  assert.equal(applyTextVisibility(show, "unlearned", portion, step, 2, 12, 0).state, "hide");
  assert.equal(applyTextVisibility(show, "current", portion, step, 2, 10, 0).state, "hide");
  assert.equal(applyTextVisibility(show, "current", portion, step, 2, 11, 1).state, "show");
  const hidden = { state: "hide", active: true };
  assert.deepEqual(applyTextVisibility(hidden, "full", portion, step, 2, 11, 1), hidden);
  assert.deepEqual(applyTextVisibility(hidden, "unlearned", portion, step, 2, 11, 1), hidden);
  const pageTest = { ...step, kind: "recall", scope: "page", units: [] };
  assert.equal(applyTextVisibility(show, "current", portion, pageTest, 2, 11, 0, [2, 11]).state, "show");
  assert.equal(applyTextVisibility(show, "current", portion, pageTest, 2, 10, 0, [2, 11]).state, "hide");
});

test("applyResults preserves correct, hesitant and mistake scheduling/history", () => {
  const st = defaultState(); st.hist.push({ t: 5, k: "prior", l: "prior", n: 1, m: 0 });
  applyResults(st, [[1, 1], [1, 2], [1, 3]], { 0: "ok", 1: "hes", 2: "bad" }, "new", "fixture");
  const t = today();
  assert.equal(st.mem[k(1, 1)].iv, 1); assert.equal(st.mem[k(1, 1)].due, t + 1);
  assert.equal(st.mem[k(1, 2)].iv, 1); assert.ok(st.mem[k(1, 2)].dueAt > Date.now());
  assert.equal(st.mem[k(1, 3)].iv, 0); assert.equal(st.mem[k(1, 3)].bad, 1);
  assert.equal(st.weak[k(1, 2)].c, 0); assert.equal(st.weak[k(1, 3)].c, 0);
  assert.equal(st.hist.at(-1).l, "prior"); assert.equal(st.hist[0].l, "fixture");
  assert.equal(st.log[String(t)].a, 3);
});

test("same-day successes increment recalls without advancing the interval twice", () => {
  const st = defaultState();
  applyResults(st, [[1, 1]], { 0: "ok" }, "new", "one");
  applyResults(st, [[1, 1]], { 0: "ok" }, "rev", "same day");
  assert.equal(st.mem[k(1, 1)].successes, 2); assert.equal(st.mem[k(1, 1)].iv, 1);
  st.mem[k(1, 1)].successDays = [today() - 1];
  applyResults(st, [[1, 1]], { 0: "ok" }, "rev", "next interval");
  assert.equal(st.mem[k(1, 1)].iv, 3);
});

test("weak queue includes overdue mistakes; clean weak work does not erase early", () => {
  const st = defaultState();
  applyResults(st, [[2, 1]], { 0: "bad" }, "new", "mistake");
  st.weak[k(2, 1)].d = today() - 1;
  assert.deepEqual(weakDue(st), [k(2, 1)]);
  applyResults(st, [[2, 1]], { 0: "ok" }, "weak", "clean once");
  assert.ok(st.weak[k(2, 1)]); assert.equal(st.weak[k(2, 1)].c, 1);
  st.weak[k(2, 1)] = { c: 2, d: today() - 1, lastCleanDay: today() - 1 };
  applyResults(st, [[2, 1]], { 0: "ok" }, "weak", "third consecutive clean");
  assert.equal(st.weak[k(2, 1)], undefined);
});

test("word mistakes remain keyed by Ayah and word; uncertainty is not confirmed", () => {
  const st = defaultState();
  st.mem[k(1, 1)] = { iv: 7, due: today() + 7, last: today(), reps: 1, successes: 1 };
  st.mw[k(1, 2)] = { "4": 2 };
  const exp = [{ s: 1, a: 1, w: 2, txt: "x", k: "x", sk: "x" }, { s: 1, a: 2, w: 4, txt: "y", k: "y", sk: "y" }];
  const al = { exp: ["incorrect", "uncertain"], heardFor: [0, null], heard: [], cursor: 0, lost: false };
  const summary = { reached: 2, correct: 0, incorrect: 1, missing: 0, uncertain: 1, extra: 0, repeats: 0, confirmed: 0, review: 2, accuracy: null };
  const out = saveRecitation(st, { exp, al, verdicts: {}, summary, heardText: () => undefined, title: "fixture", engine: "local", secs: 4, items: [[1, 1], [1, 2]] });
  assert.equal(out.ayahs[k(1, 1)], "suspected"); assert.equal(out.ayahs[k(1, 2)], "uncertain");
  assert.equal(st.mw[k(1, 2)]["4"], 2); assert.equal(st.mw[k(1, 1)], undefined);
  assert.equal(st.mem[k(1, 1)].iv, 7); assert.equal(st.mem[k(1, 2)], undefined);
  assert.equal(st.rsus[k(1, 1)].n, 1);
  exp[0].w = 2;
  const confirmed = assessAyahs(exp.slice(0, 1), { ...al, exp: ["incorrect"] }, { 0: "confirmed" });
  assert.equal(confirmed[k(1, 1)], "confirmed");
  const confirmedSummary = { ...summary, confirmed: 1 };
  saveRecitation(st, { exp: exp.slice(0, 1), al: { ...al, exp: ["incorrect"] }, verdicts: { 0: "confirmed" }, summary: confirmedSummary, heardText: () => "heard", title: "confirmed", engine: "local", secs: 4, items: [[1, 1]] });
  assert.equal(st.mw[k(1, 1)]["2"], 1); assert.equal(st.mw[k(1, 2)]["4"], 2); assert.equal(st.mem[k(1, 1)].bad, 1);
});

test("unconfirmed ASR mismatch without confidence cannot be saved as a confirmed mistake", () => {
  const st = defaultState(); st.mem[k(1, 1)] = { iv: 7, due: today() + 7, last: today(), reps: 1, successes: 1 };
  const exp = [{ s: 1, a: 1, w: 0, txt: "الْحَمْدُ", k: "الحمد", sk: "الحمد" }];
  const alignment = align(exp, [{ id: "segment-1", raw: "different", seg: 1 }]);
  const verdicts = {};
  assert.notEqual(assessAyahs(exp, alignment, verdicts)[k(1, 1)], "confirmed");
  const summary = { reached: 1, correct: 0, incorrect: 1, missing: 0, uncertain: 0, extra: 0, repeats: 0, confirmed: 0, review: 1, accuracy: 0 };
  saveRecitation(st, { exp, al: alignment, verdicts, summary, heardText: () => "different", title: "no verdict", engine: "local", secs: 2, items: [[1, 1]] });
  assert.equal(st.mem[k(1, 1)].iv, 7); assert.equal(st.mem[k(1, 1)].bad, undefined); assert.equal(st.mw[k(1, 1)], undefined);
});

test("markRange and overlapping marking preserve existing practice history", () => {
  const st = defaultState(); const t = today();
  st.settings.revTarget = 10;
  st.mem[k(1, 2)] = { iv: 14, due: t + 14, last: t, reps: 3, successes: 3, history: [{ at: 1, result: "ok", interval: 14 }] };
  st.weak[k(1, 3)] = { c: 0, d: t };
  markRange(st, 1, 1, 3, true);
  assert.ok(st.mem[k(1, 1)]); assert.equal(st.mem[k(1, 2)].iv, 14); assert.deepEqual(st.mem[k(1, 2)].history, [{ at: 1, result: "ok", interval: 14 }]);
  assert.ok(st.weak[k(1, 3)]);
  markRange(st, 1, 2, 4, true); assert.equal(st.mem[k(1, 2)].reps, 3); assert.ok(st.mem[k(1, 4)]);
});

test("markJuz supports partial progress and preserves existing records", () => {
  const st = defaultState(); const j = 30; const [[s1, a1], [s2, a2]] = Q().juz[j - 1];
  st.mem[k(s1, a1)] = { iv: 9, due: today() + 9, last: today(), reps: 4, successes: 4 };
  const before = juzProgress(st, j); assert.ok(before.total > before.done);
  markJuz(st, j, true); const after = juzProgress(st, j);
  assert.equal(after.total, before.total); assert.ok(after.done > before.done); assert.equal(st.mem[k(s1, a1)].iv, 9);
  assert.ok(st.mem[k(s2, a2)]);
});

test("mastery, legacy classifications and due/overdue states retain current rules", () => {
  assert.equal(isMemorized(undefined), false);
  assert.equal(isMemorized({ iv: 3, due: today(), last: 0, reps: 0 }), true);
  assert.equal(isMemorized({ iv: 0, due: today(), last: today(), reps: 1, successes: 0 }), false);
  assert.equal(isMemorized({ iv: 3, due: today(), last: today(), reps: 1 }), true);
  assert.equal(isMemorized({ iv: 30, due: today(), last: today(), reps: 5, successes: 0, bad: 1 }), false);
  assert.equal(isAyahDue({ iv: 1, due: today() - 1, last: today(), reps: 1 }), true);
  assert.equal(isAyahDue({ iv: 1, due: today() + 1, last: today(), reps: 1 }), false);
  const st = defaultState(); st.mem[k(1, 1)] = { iv: 1, due: today() - 1, last: today(), reps: 1 };
  assert.deepEqual(dueRuns(st), [{ s: 1, a: 1, b: 1 }]);
});

test("hydrateState defaults missing and malformed containers without changing v1", () => {
  const legacy = { v: 1, mem: { [k(1, 1)]: { iv: 2, due: 4, last: 3, reps: 1 } }, bookmarks: { [k(2, 255)]: { t: 7, f: 1 } }, hist: [{ t: 1, k: "x", l: "x", n: 1, m: 0 }], mapProgress: { "al-fatihah": { status: "learning", due: 2, last: 1, reps: 0, intervalDays: 0, quizAttempts: 0, quizCorrect: 0 } } };
  const hydrated = hydrateState(legacy);
  assert.equal(hydrated.v, 1); assert.deepEqual(hydrated.mem, legacy.mem); assert.deepEqual(hydrated.bookmarks, legacy.bookmarks);
  assert.deepEqual(hydrated.hist, legacy.hist); assert.deepEqual(hydrated.mapProgress, legacy.mapProgress); assert.ok(hydrated.settings); assert.deepEqual(hydrateState({ ...legacy, mem: null, mapProgress: [], hist: null }).mem, {});
  const restoredFromBackup = hydrateState(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(restoredFromBackup.mem, legacy.mem); assert.deepEqual(restoredFromBackup.mapProgress, legacy.mapProgress);
});

test("guest merge preserves bookmarks, map progress, history and the latest exact reading location", () => {
  setProfile(null); update((d) => {
    d.lastLocation = { s: 2, a: 255, t: 200 }; d.lastPage = 42;
    d.mem[k(1, 1)] = { iv: 7, due: 9, last: 200, reps: 2, successes: 2 };
    d.mapProgress["al-fatihah"] = { status: "learning", due: 10, last: 200, reps: 1, intervalDays: 1, quizAttempts: 1, quizCorrect: 1 };
    d.bookmarks[k(2, 255)] = { t: 200, f: 1 }; d.hist.push({ t: 200, k: "guest", l: "guest", n: 1, m: 0 });
  });
  const savedGuest = guestProgress(); assert.ok(savedGuest);
  setProfile("fixture-account"); update((d) => {
    d.lastLocation = { s: 1, a: 7, t: 100 }; d.lastPage = 2;
    d.mem[k(1, 1)] = { iv: 1, due: 1, last: 100, reps: 1, successes: 1 };
    d.mapProgress["al-fatihah"] = { status: "new", due: 1, last: 100, reps: 0, intervalDays: 0, quizAttempts: 0, quizCorrect: 0 };
  });
  assert.equal(mergeGuestProgress(), true);
  const merged = getState(); assert.equal(merged.lastLocation.s, 2); assert.equal(merged.lastLocation.a, 255); assert.equal(merged.lastPage, 42);
  assert.equal(merged.mem[k(1, 1)].last, 200); assert.equal(merged.mapProgress["al-fatihah"].last, 200);
  assert.deepEqual(merged.bookmarks[k(2, 255)], { t: 200, f: 1 }); assert.ok(merged.hist.some((h) => h.l === "guest"));
  update((d) => { d.lastLocation = { s: 3, a: 1, t: 300 }; d.lastPage = 50; });
  mergeGuestProgress(); assert.deepEqual(getState().lastLocation, { s: 3, a: 1, t: 300 }); assert.equal(getState().lastPage, 50);
  setProfile(null); assert.ok(guestProgress()); // guest backup remains intact
});

test("the three current Visual Maps keep their stable IDs and assessment layer", () => {
  assert.deepEqual(MIND_MAPS.map((m) => m.id), ["al-fatihah", "al-baqarah-1-5", "al-baqarah-21-29"]);
  assert.ok(MIND_MAPS.every((m) => m.nodes.length > 0));
});

test("Phase 3.1 Journey: profile creation, skip/resume state, and legacy range compatibility", () => {
  const legacy = defaultState();
  const initial = createStudentJourney(legacy, 500);
  assert.equal(initial.onboarding, "in_progress"); assert.equal(initial.primaryPathId, null); assert.equal(initial.preferences.studyMinutes, legacy.journey.studyMinutes);
  initial.onboarding = "skipped";
  const resumed = hydrateState(JSON.parse(JSON.stringify({ ...legacy, studentJourney: { ...initial, onboarding: "in_progress" } })));
  assert.equal(resumed.studentJourney.onboarding, "in_progress"); assert.equal(resumed.journey.start.a, 1);
  legacy.journey.start = { s: 18, a: 1 }; legacy.journey.end = { s: 18, a: 10 }; legacy.journey.last = { s: 18, a: 4 };
  const migrated = createStudentJourney(legacy, 501);
  assert.equal(migrated.primaryPathId, "legacy-custom"); assert.deepEqual(migrated.paths[0].cursor, { rangeIndex: 0, s: 18, a: 4 });
});

test("Phase 3.1 Journey: all path kinds resolve to verified canonical Ayah ranges", () => {
  const core = Q();
  const forward = makeRanges(core, { kind: "forward", name: "Forward" });
  assert.deepEqual(forward[0].start, { s: 1, a: 1 }); assert.deepEqual(forward[0].end, { s: 114, a: 6 });
  const reverse = makePath(core, { kind: "reverse_juz", name: "Reverse" }, 1, "rev");
  assert.equal(reverse.ranges.length, 30); assert.equal(reverse.traversal, "reverse_units"); assert.equal(reverse.ranges[0].label, "Juz 30"); assert.equal(reverse.ranges.at(-1).label, "Juz 1");
  reverse.ranges.forEach((r) => assert.ok(r.start.s < r.end.s || r.start.s === r.end.s && r.start.a <= r.end.a));
  const short = makePath(core, { kind: "short_surahs", name: "Short" }, 2, "short");
  assert.equal(short.traversal, "short_first"); assert.equal(short.ranges[0].start.s, 103); assert.equal(short.ranges[0].start.a, 1); assert.equal(short.ranges[0].end.a, core.n[102][2]);
  const surahs = makeRanges(core, { kind: "surahs", name: "Selected", selected: [67, 36, 18] });
  assert.deepEqual(surahs.map((r) => r.start.s), [67, 36, 18]);
  const juz = makeRanges(core, { kind: "juz", name: "Selected Juz", selected: [1, 5, 29, 30] });
  assert.deepEqual(juz.map((r) => r.label), ["Juz 1", "Juz 5", "Juz 29", "Juz 30"]);
  assert.equal(makeRanges(core, { kind: "collection", name: "Named", ranges: [surahs[0], juz[1]] }).length, 2);
});

test("Phase 3.1 Journey: page selections use resolver Ayah bounds, validate inputs, and keep passages in order", () => {
  const core = Q(); const first = rangeFromPageBounds(core, 100, 101); const start = resolveLocation(core, { kind: "page", id: 100 });
  const after = resolveLocation(core, { kind: "page", id: 102 });
  // Inclusive page range ends on the Ayah *before* page 102 begins, never on page 102's first Ayah.
  assert.deepEqual(first.start, { s: start.s, a: start.a }); assert.deepEqual(first.end, previousAyah(core, { s: after.s, a: after.a }));
  assert.equal(rangeFromPageBounds(core, 604, 604).end.s, 114); assert.equal(rangeFromPageBounds(core, 0, 1), null); assert.equal(rangeFromPageBounds(core, 40, 39), null);
  const path = makePath(core, { kind: "reverse_juz", name: "Reverse" }, 10, "reverse");
  assert.deepEqual(pathStart(path), { rangeIndex: 0, ...path.ranges[0].start });
});

test("Phase 3.1 Journey: self-reported non-contiguous and partial Juz claims never alter mastery", () => {
  const st = defaultState(); const [[s, a], [es, ea]] = Q().juz[4];
  const before = JSON.stringify({ mem: st.mem, weak: st.weak, mw: st.mw, hist: st.hist });
  const claims = [
    makeClaim("Part of Juz 5", "needs_revision", [{ start: { s, a }, end: { s, a: Math.min(a + 4, Q().n[s - 1][2]) }, label: "Juz 5 partial" }], 1),
    makeClaim("Juz 29–30", "mostly_forgotten", Q().juz.slice(28).map((bounds, i) => ({ start: { s: bounds[0][0], a: bounds[0][1] }, end: { s: bounds[1][0], a: bounds[1][1] }, label: `Juz ${i + 29}` })), 2),
  ];
  assert.equal(claims[0].provenance, "self_reported"); assert.equal(claims[0].ranges[0].end.a, Math.min(a + 4, Q().n[s - 1][2]));
  assert.equal(claims[1].ranges.length, 2); assert.ok(es > 0 && ea > 0);
  assert.equal(JSON.stringify({ mem: st.mem, weak: st.weak, mw: st.mw, hist: st.hist }), before);
  assert.equal(isMemorized(st.mem[k(s, a)]), false);
});

test("Phase 3.1 Journey: changing primary paths preserves overlapping Hifz records", () => {
  const core = Q(); const st = defaultState();
  st.mem[k(18, 1)] = { iv: 14, due: today() + 14, last: today(), reps: 4, successes: 4 };
  const recordBefore = structuredClone(st.mem[k(18, 1)]);
  const p1 = makePath(core, { kind: "surahs", name: "Surahs", selected: [18, 36] }, 10, "path-surahs");
  const p2 = makePath(core, { kind: "juz", name: "Juz", selected: [5] }, 11, "path-juz");
  const collection = makePath(core, { kind: "collection", name: "Overlapping", ranges: [...p1.ranges, ...p2.ranges] }, 12, "path-overlap");
  assert.equal(collection.ranges.length, 3); assert.deepEqual(st.mem[k(18, 1)], recordBefore);
  st.studentJourney = { ...createStudentJourney(st, 12), paths: [p1, p2, collection], primaryPathId: p1.id };
  st.studentJourney.primaryPathId = p2.id; // path choice changes only the path cursor/selection
  assert.deepEqual(st.mem[k(18, 1)], recordBefore); assert.equal(st.weak[k(18, 1)], undefined);
});

test("Phase 3.1 Journey: guest profile conflicts merge paths independently and repeatably", () => {
  const core = Q(); const base = createStudentJourney(defaultState(), 10);
  const guestPath = makePath(core, { kind: "surahs", name: "Guest only", selected: [67] }, 10, "guest-path");
  const sharedGuest = makePath(core, { kind: "custom", name: "Guest newer", ranges: [{ start: { s: 2, a: 1 }, end: { s: 2, a: 5 } }] }, 30, "shared-path");
  const sharedAccount = makePath(core, { kind: "custom", name: "Account older", ranges: [{ start: { s: 2, a: 1 }, end: { s: 2, a: 3 } }] }, 20, "shared-path");
  setProfile(null);
  update((d) => { d.studentJourney = { ...base, updatedAt: 50, learner: { ...base.learner, displayName: "Guest learner" }, paths: [guestPath, sharedGuest], primaryPathId: sharedGuest.id, claims: [makeClaim("Guest claim", "needs_revision", [guestPath.ranges[0]], 31)], preferences: { ...base.preferences, studyMinutes: 45, updatedAt: 10 } }; d.mem[k(2, 1)] = { iv: 7, due: 20, last: 30, reps: 3, successes: 3 }; });
  setProfile("journey-account");
  update((d) => { d.studentJourney = { ...base, updatedAt: 40, learner: { ...base.learner, displayName: "Account learner" }, paths: [sharedAccount], primaryPathId: sharedAccount.id, claims: [], preferences: { ...base.preferences, studyMinutes: 20, updatedAt: 20 } }; d.mem[k(2, 1)] = { iv: 3, due: 10, last: 20, reps: 2, successes: 2 }; });
  mergeGuestProgress(); const merged = getState().studentJourney;
  assert.equal(merged.learner.displayName, "Guest learner"); assert.equal(merged.preferences.studyMinutes, 20);
  assert.equal(merged.paths.find((p) => p.id === "shared-path").name, "Guest newer"); assert.ok(merged.paths.some((p) => p.id === "guest-path"));
  assert.equal(merged.primaryPathId, "shared-path"); assert.equal(merged.claims.length, 1); assert.equal(getState().mem[k(2, 1)].last, 30);
  mergeGuestProgress(); const again = getState().studentJourney;
  assert.equal(again.paths.length, merged.paths.length); assert.equal(again.claims.length, merged.claims.length); assert.equal(again.preferences.studyMinutes, 20);
  setProfile(null); assert.ok(guestProgress());
});

test("Phase 3.1 Journey: Quran dataset remains pinned and old backups retain optional-field defaults", async () => {
  const bytes = await readFile(resolve(root, "public/data/quran.json"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680");
  const old = hydrateState(JSON.parse(JSON.stringify({ v: 1, mem: {}, journey: { start: { s: 1, a: 1 }, end: { s: 1, a: 7 } } })));
  assert.equal(old.studentJourney, null); assert.ok(old.journey.learningDays.length); assert.deepEqual(old.mem, {});
});




// ---- Phase 3.1 completion tests (added when finishing the Codex implementation) ----
const evidenceSnapshot = (st) => JSON.stringify({ mem: st.mem, weak: st.weak, mw: st.mw, hist: st.hist, log: st.log, rsus: st.rsus });

test("Phase 3.1 Journey: page ranges cover every Ayah of the chosen pages exactly once, including Surah transitions", () => {
  const core = Q();
  for (const [p1, p2] of [[1, 1], [1, 2], [49, 50], [100, 101], [582, 583], [600, 604], [604, 604]]) {
    const r = rangeFromPageBounds(core, p1, p2);
    const ayahs = expandRanges(core, [r]);
    // Every Ayah starts on a page inside [p1, p2]; the next Ayah after the range starts on a later page.
    for (const x of ayahs) { const pg = resolveLocation(core, { kind: "ayah", surah: x.s, ayah: x.a }).page; assert.ok(pg >= p1 && pg <= p2, `${x.s}:${x.a} on page ${pg} outside ${p1}-${p2}`); }
    assert.equal(new Set(ayahs.map((x) => `${x.s}:${x.a}`)).size, ayahs.length);
    if (p2 < 604) { const nextStart = resolveLocation(core, { kind: "page", id: p2 + 1 }); assert.notDeepEqual(r.end, { s: nextStart.s, a: nextStart.a }); }
  }
});

test("Phase 3.1 Journey: reverse Juz path keeps every Ayah ascending inside each Juz and covers the Quran once", () => {
  const core = Q(); const path = makePath(core, { kind: "reverse_juz", name: "Reverse" }, 1, "rev");
  const all = expandRanges(core, path.ranges);
  assert.equal(all.length, 6236); assert.equal(new Set(all.map((x) => `${x.s}:${x.a}`)).size, 6236);
  assert.deepEqual(all[0], { s: 78, a: 1 }); assert.deepEqual(all.at(-1), { s: 2, a: 141 });
  path.ranges.forEach((range) => {
    const xs = expandRanges(core, [range]);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i].s > xs[i - 1].s || (xs[i].s === xs[i - 1].s && xs[i].a === xs[i - 1].a + 1), `order broken in ${range.label} at ${xs[i].s}:${xs[i].a}`);
  });
  const short = makePath(core, { kind: "short_surahs", name: "Short" }, 2, "short");
  const shortAyahs = expandRanges(core, short.ranges);
  assert.equal(new Set(shortAyahs.map((x) => x.s)).size, 37); assert.ok(shortAyahs.every((x) => x.s >= 78));
  short.ranges.forEach((range) => { const xs = expandRanges(core, [range]); xs.forEach((x, i) => assert.equal(x.a, i + 1)); });
});

test("Phase 3.1 Journey: partial Juz claims stay inside the Juz and never include the rest of it", () => {
  const core = Q(); const [[s, a], [es, ea]] = core.juz[4];
  const part = partialJuzRange(core, 5, { s, a }, { s, a: a + 9 });
  assert.ok(part); assert.match(part.label, /Part of Juz 5/);
  assert.equal(expandRanges(core, [part]).length, 10);
  assert.equal(partialJuzRange(core, 5, { s: 3, a: 1 }, { s, a: a + 2 }), null, "start before Juz 5 is rejected");
  assert.equal(partialJuzRange(core, 5, { s, a }, { s: es + 1, a: 1 }), null, "end after Juz 5 is rejected");
  assert.equal(partialJuzRange(core, 31, { s, a }, { s, a }), null);
  const whole = expandRanges(core, [{ start: { s, a }, end: { s: es, a: ea } }]);
  assert.ok(whole.length > 10, "a partial claim covers less than the Juz");
});

test("Phase 3.1 Journey: removing claims and archiving paths are tombstones that never touch Hifz evidence", () => {
  const core = Q(); const st = defaultState();
  st.mem[k(1, 1)] = { iv: 14, due: today() + 14, last: today(), reps: 5, successes: 5, successDays: [1, 2, 3, 4, 5], history: [{ at: 1, result: "ok", interval: 14 }] };
  st.weak[k(1, 2)] = { c: 1, d: today() - 1 }; st.mw[k(1, 2)] = { "0": 2 };
  const before = evidenceSnapshot(st);
  const claim = makeClaim("Fatiha", "comfortable", [{ start: { s: 1, a: 1 }, end: { s: 1, a: 7 } }], 10);
  const p1 = makePath(core, { kind: "surahs", name: "One", selected: [1] }, 10, "p1");
  const p2 = makePath(core, { kind: "juz", name: "Two", selected: [30] }, 11, "p2");
  let j = { ...createStudentJourney(st, 10), claims: [claim], paths: [{ ...p1, isPrimary: true }, p2], primaryPathId: "p1" };
  j = tombstoneClaim(j, claim.id, 50);
  assert.equal(j.claims.length, 1); assert.equal(j.claims[0].deletedAt, 50); assert.equal(j.claims[0].updatedAt, 50);
  j = archivePath(j, "p1", 60);
  assert.equal(j.paths.find((p) => p.id === "p1").deletedAt, 60); assert.equal(j.primaryPathId, "p2", "primary moves to a live path");
  assert.deepEqual(j.paths.filter((p) => p.isPrimary).map((p) => p.id), ["p2"]);
  j = archivePath(j, "p2", 70); assert.equal(j.primaryPathId, null);
  st.studentJourney = j;
  assert.equal(evidenceSnapshot(st), before, "mem/weak/mw/hist/log/rsus unchanged");
});

test("Phase 3.1 Journey: merge keeps deletion tombstones in both directions and is repeatable", () => {
  const core = Q(); const base = createStudentJourney(defaultState(), 1);
  const claimA = makeClaim("Juz 30", "comfortable", [{ start: { s: 78, a: 1 }, end: { s: 114, a: 6 } }], 10);
  const claimB = makeClaim("Mulk", "needs_revision", [{ start: { s: 67, a: 1 }, end: { s: 67, a: 30 } }], 10);
  claimA.id = "claim-a"; claimB.id = "claim-b";
  const path = makePath(core, { kind: "surahs", name: "Mulk", selected: [67] }, 10, "path-m");
  // Guest deleted claim A (newer); account deleted claim B (newer) and still has path; guest archived the path later.
  setProfile(null);
  update((d) => { d.studentJourney = { ...base, updatedAt: 100, claims: [tombstoneClaim({ ...base, claims: [claimA] }, "claim-a", 100).claims[0], claimB], paths: [{ ...path, deletedAt: 120, updatedAt: 120 }], primaryPathId: null }; d.mem[k(67, 1)] = { iv: 3, due: 5, last: 9, reps: 1, successes: 1 }; });
  setProfile("tombstone-account");
  update((d) => { d.studentJourney = { ...base, updatedAt: 90, claims: [claimA, tombstoneClaim({ ...base, claims: [claimB] }, "claim-b", 110).claims[0]], paths: [{ ...path, isPrimary: true }], primaryPathId: "path-m" }; d.mem[k(67, 1)] = { iv: 7, due: 20, last: 30, reps: 4, successes: 4 }; });
  const memBefore = structuredClone(getState().mem[k(67, 1)]);
  mergeGuestProgress();
  const once = getState().studentJourney;
  assert.ok(once.claims.find((c) => c.id === "claim-a").deletedAt, "guest deletion wins over older live account claim");
  assert.ok(once.claims.find((c) => c.id === "claim-b").deletedAt, "account deletion is not resurrected by older guest claim");
  assert.ok(once.paths.find((p) => p.id === "path-m").deletedAt, "newer path archive wins");
  assert.equal(once.primaryPathId, null, "archived path cannot stay primary");
  assert.deepEqual(getState().mem[k(67, 1)], memBefore, "newer account Hifz record kept");
  mergeGuestProgress();
  const twice = getState().studentJourney;
  const strip = (x) => JSON.stringify({ ...x, updatedAt: 0 });
  assert.equal(strip(twice), strip(once), "second merge changes nothing");
  setProfile(null);
});

test("Phase 3.1 Journey: a malformed guest journey cannot break or overwrite the account journey on merge", () => {
  const base = createStudentJourney(defaultState(), 1);
  setProfile(null);
  update((d) => { d.studentJourney = { schema: 1, paths: "broken", claims: null, updatedAt: 999 }; });
  setProfile("malformed-account");
  update((d) => { d.studentJourney = { ...base, learner: { ...base.learner, displayName: "Kept" } }; });
  assert.doesNotThrow(() => mergeGuestProgress());
  assert.equal(getState().studentJourney.learner.displayName, "Kept");
  setProfile(null);
});
