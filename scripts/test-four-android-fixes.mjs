// Regression tests for the four Android fixes: Hijri date, Ayah long-press quick sheet, two-task Revision,
// simplified New Learning. Same harness as test-learning-features.mjs (real Quran data from public/data).
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
const dataFiles = new Map(["quran", "layout", "juz", "divisions", "tr-ur-maududi", "tr-ur-jalandhry"].map((n) => [n, resolve(root, `public/data/${n}.json`)]));
globalThis.fetch = async (url) => {
  const name = String(url).split("/").at(-1).replace(/\.json(?:\?.*)?$/, "");
  const path = dataFiles.get(name);
  if (!path) return { ok: false, status: 404 };
  const json = JSON.parse(await readFile(path, "utf8"));
  return { ok: true, json: async () => json };
};
const quran = await import("../src/lib/quran.ts");
await quran.loadCore();
const lt = await import("../src/lib/localTime.ts");
const quick = await import("../src/lib/ayahQuick.ts");
const urdu = await import("../src/lib/urduSpeech.ts");
const store = await import("../src/lib/store.ts");
const planner = await import("../src/lib/planner.ts");
const rs = await import("../src/lib/revisionSession.ts");
const pp = await import("../src/lib/passagePick.ts");
const chunking = await import("../src/lib/chunking.ts");
const src = (p) => readFile(resolve(root, p), "utf8");

// ============================================================== TASK 1 — Hijri date
const NOV17 = "2026-11-17T10:00:00Z";
const at = (iso, extra = {}) => lt.headerTime(new Date(iso), { timeZone: "Asia/Riyadh", locale: "en-US", ...extra });

test("Hijri: Android screenshot case — Umm al-Qura 17 Nov 2026 is 7 Jumada al-Akhirah 1448 AH, never 'June 7, 1448 BC'", () => {
  const h = at(NOV17).hijri;
  assert.equal(h, "7 Jumada al-Akhirah 1448 AH");
  assert.doesNotMatch(h, /\b(BC|AD|BCE|CE)\b|June|January|July/);
});

test("Hijri: Android-style trimmed ICU (islamic calendar formats with Gregorian month/era names) does not leak into the result", () => {
  const Real = Intl.DateTimeFormat;
  // Reproduces the WebView: an islamic-calendar formatter that claims the calendar but prints Gregorian symbols.
  const Fake = function (locale, opts) {
    const f = new Real(String(locale || "en").replace(/-u-ca-[a-z-]+/, ""), opts);
    if (/-u-ca-islamic/.test(String(locale))) return { format: () => "June 7, 1448 BC", formatToParts: () => [], resolvedOptions: () => ({ ...f.resolvedOptions(), calendar: String(locale).split("-u-ca-")[1] }) };
    return f;
  };
  Fake.prototype = Real.prototype; Fake.supportedLocalesOf = Real.supportedLocalesOf;
  Intl.DateTimeFormat = Fake;
  try {
    const t = at(NOV17);
    assert.equal(t.hijri, "7 Jumada al-Akhirah 1448 AH");
    assert.ok(t.hijriSupported);
    assert.match(t.date, /Tuesday, November 17, 2026/, "Gregorian date unchanged");
  } finally { Intl.DateTimeFormat = Real; }
});

test("Hijri: all four calendar methods agree with full ICU on every day 1925–2095", () => {
  for (const cal of ["islamic-umalqura", "islamic", "islamic-civil", "islamic-tbla"]) {
    const f = new Intl.DateTimeFormat("en-u-ca-" + cal, { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });
    let bad = 0;
    for (let e = Math.floor(Date.UTC(1925, 0, 1) / 864e5); e < Math.floor(Date.UTC(2095, 0, 1) / 864e5); e++) {
      const p = f.formatToParts(new Date(e * 864e5 + 432e5)); const g = (t) => Number(p.find((x) => x.type === t).value);
      const h = lt.toHijri(e, cal);
      if (!h || h.year !== g("year") || h.month !== g("month") || h.day !== g("day")) bad++;
    }
    assert.equal(bad, 0, `${cal}: ${bad} days disagree with ICU`);
  }
});

test("Hijri: published Umm al-Qura anchors (1 Muharram 1446, 1 Ramadan 1446, 1 Ramadan 1447)", () => {
  assert.equal(at("2024-07-07T09:00:00Z").hijri, "1 Muharram 1446 AH");
  assert.equal(at("2025-03-01T09:00:00Z").hijri, "1 Ramadan 1446 AH");
  assert.equal(at("2026-02-18T09:00:00Z").hijri, "1 Ramadan 1447 AH");
});

test("Hijri: calendar methods give their own dates (Umm al-Qura / astronomical / civil / Thursday epoch)", () => {
  assert.equal(at(NOV17, { hijriCalendar: "islamic-umalqura" }).hijri, "7 Jumada al-Akhirah 1448 AH");
  assert.equal(at(NOV17, { hijriCalendar: "islamic" }).hijri, "8 Jumada al-Akhirah 1448 AH");
  assert.equal(at(NOV17, { hijriCalendar: "islamic-civil" }).hijri, "6 Jumada al-Akhirah 1448 AH");
  assert.equal(at(NOV17, { hijriCalendar: "islamic-tbla" }).hijri, "7 Jumada al-Akhirah 1448 AH");
});

test("Hijri: ±2 day adjustment, clamped", () => {
  assert.equal(at(NOV17, { hijriOffset: 1 }).hijri, "8 Jumada al-Akhirah 1448 AH");
  assert.equal(at(NOV17, { hijriOffset: -2 }).hijri, "5 Jumada al-Akhirah 1448 AH");
  assert.equal(at(NOV17, { hijriOffset: 9 }).hijri, at(NOV17, { hijriOffset: 2 }).hijri);
  // across a month boundary: 1 Ramadan 1447 − 1 day = last day of Sha'ban
  assert.match(at("2026-02-18T09:00:00Z", { hijriOffset: -1 }).hijri, /^(29|30) Sha'ban 1447 AH$/);
});

test("Hijri: rolls over at local midnight (Riyadh, London, New York)", () => {
  for (const [zone, before, after] of [["Asia/Riyadh", "2026-11-16T20:59:00Z", "2026-11-16T21:00:00Z"], ["Europe/London", "2026-11-16T23:59:00Z", "2026-11-17T00:00:00Z"], ["America/New_York", "2026-11-17T04:59:00Z", "2026-11-17T05:00:00Z"]]) {
    const a = lt.headerTime(new Date(before), { timeZone: zone, locale: "en" }).hijri, b = lt.headerTime(new Date(after), { timeZone: zone, locale: "en" }).hijri;
    assert.equal(a, "6 Jumada al-Akhirah 1448 AH", zone); assert.equal(b, "7 Jumada al-Akhirah 1448 AH", zone);
  }
});

test("Hijri: Arabic formatting uses Arabic month names, Arabic-Indic digits and هـ", () => {
  assert.equal(at(NOV17, { locale: "ar-SA" }).hijri, "٧ جمادى الآخرة ١٤٤٨ هـ");
  assert.equal(at("2026-02-18T09:00:00Z", { locale: "ar" }).hijri, "١ رمضان ١٤٤٧ هـ");
  assert.equal(lt.HIJRI_MONTHS_AR.length, 12); assert.equal(lt.HIJRI_MONTHS_EN.length, 12);
  // a non-Arabic locale that starts with "ar…" letters is not Arabic
  assert.match(lt.formatHijri({ year: 1448, month: 6, day: 7 }, "arn-CL"), /AH$/);
});

test("Hijri: dashboard and settings never format with Intl's islamic calendar any more", async () => {
  const code = await src("src/lib/localTime.ts");
  assert.doesNotMatch(code, /-u-ca-\$\{|u-ca-islamic/);
  assert.doesNotMatch(await src("src/lib/quran.ts"), /u-ca-islamic/);
});

// ============================================================== TASK 2 — Ayah long-press
test("Long-press: allowed in Read; blocked while text is concealed (Recall unrated, lesson hidden, memorize run, Recite hidden)", () => {
  assert.equal(quick.quickAccess({ mode: "read" }).ok, true);
  assert.equal(quick.quickAccess({ mode: "recall", recallSaved: false, ayahRated: false }).ok, false);
  assert.equal(quick.quickAccess({ mode: "recall", recallSaved: false, ayahRated: true }).ok, true, "after the learner's own rating its evidence is fixed");
  assert.equal(quick.quickAccess({ mode: "recall", recallSaved: true }).ok, true);
  assert.equal(quick.quickAccess({ mode: "learn", lessonRunning: true, lessonAyahVisible: false }).ok, false);
  assert.equal(quick.quickAccess({ mode: "learn", lessonRunning: true, lessonAyahVisible: true }).ok, true);
  assert.equal(quick.quickAccess({ mode: "learn", lessonRunning: false }).ok, true);
  assert.equal(quick.quickAccess({ mode: "read", memorizing: true }).ok, false);
  assert.equal(quick.quickAccess({ mode: "read", reciteHidden: true }).ok, false);
});

test("Long-press: a press must be held still; scrolling, early release or a moved finger cancels it", () => {
  const lp = new quick.LongPress();
  lp.start(100, 100, 0); assert.equal(lp.fire(quick.LONG_PRESS_MS - 1), false, "too early");
  lp.start(100, 100, 0); assert.ok(lp.move(105, 104)); assert.equal(lp.fire(quick.LONG_PRESS_MS), true, "small jitter is fine");
  assert.equal(lp.swallowClick(), true, "the trailing click is swallowed"); assert.equal(lp.swallowClick(), false, "only once");
  lp.start(100, 100, 0); assert.equal(lp.move(100, 140), false, "vertical scroll"); assert.equal(lp.fire(1000), false);
  lp.start(100, 100, 0); lp.cancel(); assert.equal(lp.fire(1000), false, "lifted / pointercancel");
  lp.start(100, 100, 0); assert.equal(lp.swallowClick(), false, "a normal tap is never swallowed");
});

test("Long-press: the quick sheet never renders Arabic text, reuses the shared player for one Ayah, and reads the attributed Urdu set", async () => {
  const c = await src("src/components/AyahQuickSheet.tsx");
  assert.doesNotMatch(c, /\btext\(|words\(|pageContent/, "no Quran text in the sheet");
  assert.match(c, /audio\.play\(s, a, \{ s, a, b: a \}\)/, "single-Ayah range on the existing AudioProvider");
  assert.doesNotMatch(c, /new Audio\(|<audio/, "no second audio player");
  assert.match(c, /tr-ur-maududi/); assert.match(c, /Tanzil/);
  assert.match(c, /dir="rtl" lang="ur"/);
  const r = await src("src/components/MushafReader.tsx");
  assert.match(r, /quickAccess\(/); assert.match(r, /data-qa=/); assert.match(r, /onClickCapture/);
  // concealed word spans keep data-qa (to explain why help is off) but still contain no Quran text
  for (const m of r.matchAll(/<span key=\{i\} data-qa=[^\n]*?className=\{`w ph[^\n]*/g)) assert.doesNotMatch(m[0], /\{f\.txt\}/);
});

test("Urdu translation text: verbatim from the bundled Tanzil sets (Maududi and Jalandhry) for 1:1 and 112:1", async () => {
  const m = await quran.loadSet("tr-ur-maududi"), j = await quran.loadSet("tr-ur-jalandhry");
  assert.equal(m.length, 114); assert.equal(j.length, 114);
  for (const set of [m, j]) { assert.ok(/[؀-ۿ]/.test(set[0][0])); assert.ok(set[111][0].length > 5); }
});

test("Urdu audio: only an Urdu voice is ever used — never an English fallback", async () => {
  assert.ok(urdu.isUrduLang("ur")); assert.ok(urdu.isUrduLang("ur-PK")); assert.ok(urdu.isUrduLang("ur_IN"));
  assert.ok(!urdu.isUrduLang("en-US")); assert.ok(!urdu.isUrduLang("hi-IN")); assert.ok(!urdu.isUrduLang("")); assert.ok(!urdu.isUrduLang("uz-UZ"));
  assert.equal(urdu.pickUrduVoice([{ lang: "en-US", name: "en" }, { lang: "ar-SA", name: "ar" }]), null);
  assert.equal(urdu.pickUrduVoice([{ lang: "ur-PK", name: "net", localService: false }, { lang: "ur-PK", name: "local", localService: true }]).name, "local");
  // Browser with English voices only → unavailable, with a clear message
  globalThis.speechSynthesis = { getVoices: () => [{ lang: "en-US", name: "English", localService: true }], speak() { throw new Error("must not speak"); }, cancel() {} };
  const v = await urdu.detectUrduVoice();
  assert.equal(v.ok, false); assert.match(v.reason, /No Urdu voice/);
  assert.equal(await urdu.speakUrdu("کچھ", () => {}), false);
  delete globalThis.speechSynthesis;
});

test("Urdu audio on Android: native bridge states, verbatim text, stop", async () => {
  const spoken = []; let stopped = 0;
  window.AndroidTTS = { status: () => JSON.stringify({ state: "no-urdu" }), speak: (t) => { spoken.push(t); return true; }, stop: () => { stopped++; } };
  let v = await urdu.detectUrduVoice(); assert.equal(v.ok, false); assert.match(v.reason, /No Urdu text-to-speech voice/);
  let n = 0; window.AndroidTTS.status = () => JSON.stringify(n++ < 2 ? { state: "pending" } : { state: "ok", voice: "ur-pk-x-cfn-local" });
  v = await urdu.detectUrduVoice(); assert.equal(v.ok, true); assert.equal(v.engine, "android"); assert.equal(v.canPause, false);
  const tr = (await quran.loadSet("tr-ur-maududi"))[0][0];
  const events = [];
  assert.equal(await urdu.speakUrdu(tr, (e) => events.push(e)), true);
  assert.equal(spoken.at(-1), tr, "spoken verbatim");
  window.__androidTts("end"); assert.deepEqual(events, ["end"]);
  urdu.stopUrdu(); assert.ok(stopped >= 1);
  delete window.AndroidTTS;
});

test("Android: TTS bridge registered, Urdu-only voice selection, stops on pause, shut down on destroy", async () => {
  const j = await src("android/app/src/main/java/com/hifzcompanion/MainActivity.java");
  assert.match(j, /addJavascriptInterface\(new TtsBridge\(\), "AndroidTTS"\)/);
  assert.match(j, /"ur"\.equals\(v\.getLocale\(\)\.getLanguage\(\)\)/);
  assert.match(j, /ttsState = urdu \? "ok" : "no-urdu"/);
  assert.match(j, /tts\.isSpeaking\(\)\) tts\.stop\(\)/); assert.match(j, /tts\.shutdown\(\)/);
  assert.match(j, /applicationId 'com\.hifzcompanion'|com\.hifzcompanion/);
});

// ============================================================== TASK 3 — Revision
const DAY = 86400000;
const NOW = Date.now();
const D = planner.planDay(NOW);
function withPages(pages, { daysAgo = 3 } = {}) {
  const d = store.defaultState();
  for (const p of pages) for (const [s, a] of chunking.pageAyahs(p)) {
    d.mem[`${s}:${a}`] = { iv: 1, due: D - 1, dueAt: NOW - DAY, last: D - daysAgo, reps: 1, successes: 1, successDays: [D - daysAgo], history: [{ at: NOW - daysAgo * DAY, result: "ok", interval: 1 }] };
  }
  d.settings.revTarget = 60; d.journey.studyMinutes = 120;
  return d;
}
const snapshotEvidence = (d) => JSON.stringify({ mem: d.mem, weak: d.weak, assessments: d.assessments });

test("Revision: zero tasks → empty pair", () => {
  const d = store.defaultState(); rs.startRevisionSession(d, NOW);
  assert.equal(rs.visiblePair(d, planner.buildPlan(d, NOW), NOW).length, 0);
});

test("Revision: one due task → exactly one card (no invented second task)", () => {
  const d = withPages([5]); rs.startRevisionSession(d, NOW);
  const pair = rs.visiblePair(d, planner.buildPlan(d, NOW), NOW);
  assert.equal(pair.length, 1); assert.equal(pair[0].page, 5);
});

test("Revision: two and more than two due → at most two shown, the rest stay queued", () => {
  const two = withPages([5, 6]); rs.startRevisionSession(two, NOW);
  assert.equal(rs.visiblePair(two, planner.buildPlan(two, NOW), NOW).length, 2);
  const many = withPages([5, 6, 7, 8, 9]); rs.startRevisionSession(many, NOW);
  const plan = planner.buildPlan(many, NOW);
  assert.equal(rs.visiblePair(many, plan, NOW).length, 2);
  assert.ok(rs.waitingRevision(many, plan, NOW).length >= 1, "others remain available");
});

test("Revision: Done removes the task at once, is not replaced while viewing, and is self-reported only", () => {
  const d = withPages([5, 6, 7, 8]); rs.startRevisionSession(d, NOW);
  const before = snapshotEvidence(d);
  const [a, b] = rs.visiblePair(d, planner.buildPlan(d, NOW), NOW);
  rs.completeRevisionItem(d, a.id, "self", NOW + 1000);
  const after = rs.visiblePair(d, planner.buildPlan(d, NOW + 1000), NOW + 1000);
  assert.deepEqual(after.map((x) => x.id), [b.id], "only the other task is left — no surprise replacement");
  assert.equal(snapshotEvidence(d), before, "mem / weak / assessments untouched: no clean recall, no SRS change");
  assert.equal(d.revisionSession.done[a.id].how, "self");
  assert.equal(d.hist[0].k, "Revision · self-reported");
  const t = planner.buildPlan(d, NOW + 1000).tasks.find((x) => x.page === a.page);
  assert.equal(t.status, "self", "plan shows it as self-reported, not as recited");
  // Done twice is a no-op
  const n = d.hist.length; rs.completeRevisionItem(d, a.id, "self", NOW + 2000); assert.equal(d.hist.length, n);
});

test("Revision: a new pair only on the next deliberate session start; the done page does not come back today", () => {
  const d = withPages([5, 6, 7, 8]); rs.startRevisionSession(d, NOW);
  const [a, b] = rs.visiblePair(d, planner.buildPlan(d, NOW), NOW);
  rs.completeRevisionItem(d, a.id, "self", NOW); rs.completeRevisionItem(d, b.id, "self", NOW);
  assert.equal(rs.visiblePair(d, planner.buildPlan(d, NOW), NOW).length, 0);
  rs.startRevisionSession(d, NOW + 5000);
  const next = rs.visiblePair(d, planner.buildPlan(d, NOW + 5000), NOW + 5000);
  assert.equal(next.length, 2);
  assert.ok(next.every((x) => x.page !== a.page && x.page !== b.page));
});

test("Revision: completion through the app uses the real practice result and marks the plan done", () => {
  const d = withPages([5, 6]); rs.startRevisionSession(d, NOW);
  const [a] = rs.visiblePair(d, planner.buildPlan(d, NOW), NOW);
  rs.completeRevisionItem(d, a.id, "app", NOW);
  assert.equal(d.revisionSession.done[a.id].how, "app");
  assert.equal(planner.buildPlan(d, NOW).tasks.find((x) => x.page === a.page).status, "done");
  assert.notEqual(d.hist[0]?.k, "Revision · self-reported");
});

test("Revision: unfinished tasks carry over to the next session, first", () => {
  const d = withPages([5, 6, 7]); rs.startRevisionSession(d, NOW);
  const [a, b] = rs.visiblePair(d, planner.buildPlan(d, NOW), NOW);
  rs.completeRevisionItem(d, a.id, "self", NOW);
  const tomorrow = NOW + DAY;
  rs.startRevisionSession(d, tomorrow);
  const pair = rs.visiblePair(d, planner.buildPlan(d, tomorrow), tomorrow);
  assert.equal(pair[0].id, b.id, "yesterday's unfinished task first");
  assert.equal(pair.length, 2);
});

test("Revision: state survives a save/restart (normalize) and older saves without it still load", () => {
  const d = withPages([5, 6]); rs.startRevisionSession(d, NOW);
  const [a] = rs.visiblePair(d, planner.buildPlan(d, NOW), NOW);
  rs.completeRevisionItem(d, a.id, "self", NOW);
  const restored = store.hydrateState(JSON.parse(JSON.stringify(d)));
  assert.ok(restored.revisionSession && restored.revisionSession.done[a.id], "persisted through hydrate");
  assert.equal("revisionSession" in store.hydrateState({}), false);
  assert.equal(rs.visiblePair(restored, planner.buildPlan(restored, NOW), NOW).some((x) => x.id === a.id), false);
  const legacy = JSON.parse(JSON.stringify(d)); delete legacy.revisionSession;
  assert.doesNotThrow(() => rs.visiblePair(legacy, planner.buildPlan(legacy, NOW), NOW));
});

test("Revision: sync keeps the newer revision session and never drops one", async () => {
  const sync = await import("../src/lib/sync.ts");
  const A = withPages([5, 6]), B = withPages([5, 6]);
  rs.startRevisionSession(A, NOW); rs.startRevisionSession(B, NOW);
  const [x] = rs.visiblePair(B, planner.buildPlan(B, NOW), NOW); rs.completeRevisionItem(B, x.id, "self", NOW + 10);
  const m = sync.mergeStates(A, B);
  assert.ok(m.revisionSession.done[x.id]);
  const plain = sync.mergeStates(store.defaultState(), store.defaultState());
  assert.equal("revisionSession" in plain, false, "absent stays absent (older saves unchanged)");
});

// ============================================================== TASK 4 — New Learning
const lesson = (id, updatedAt, extra = {}) => ({ id, title: id, unit: { kind: "page", page: Number(id.replace(/\D/g, "")) || 1, start: { s: 1, a: 1 }, end: { s: 1, a: 7 } }, template: "learn", mode: "guided", level: "guided", step: 2, results: {}, hinted: {}, startedAt: 0, updatedAt, ...extra });

test("New Learning: no / one / many unfinished lessons → one Continue lesson, the rest recoverable, none dropped", () => {
  assert.deepEqual(pp.continueChoice({}), { current: null, others: [] });
  assert.equal(pp.continueChoice({ a: lesson("p542", 5) }).current.id, "p542");
  const many = { a: lesson("p542", 50), b: lesson("p84", 40), c: lesson("p46", 30), d: lesson("p427", 20), e: lesson("p66", 10), f: lesson("p1", 60, { completedAt: 61 }), g: lesson("p7", 5) };
  const c = pp.continueChoice(many);
  assert.equal(c.current.id, "p542", "most recently used unfinished lesson");
  assert.deepEqual(c.others.map((l) => l.id), ["p84", "p46", "p427", "p66", "p7"], "all others kept (not capped at five)");
  assert.ok(!c.others.some((l) => l.id === "p1"), "completed lesson not offered");
});

test("New Learning: Continue resumes the exact saved lesson (same link as before) without creating a record", () => {
  const l = lesson("p542", 1, { unit: { kind: "page", page: 542, start: { s: 58, a: 1 }, end: { s: 58, a: 6 } } });
  const before = JSON.stringify(l);
  assert.equal(pp.continueHref(l), "/mushaf?p=542&mode=learn&portion=page");
  assert.equal(JSON.stringify(l), before);
  assert.match(pp.lessonPlace(l), /^Page 542 · Al-Mujadil/);
});

test("New Learning: select any of 30 Juz (start page or a page inside it)", () => {
  for (let j = 1; j <= 30; j++) { const r = pp.pickJuz(j); assert.ok(r.ok, `Juz ${j}`); assert.equal(r.passage.page, pp.juzPages(j)[0]); }
  const r = pp.pickJuz(30, 600); assert.ok(r.ok); assert.equal(r.passage.page, 600);
  assert.equal(pp.pickJuz(31).ok, false); assert.equal(pp.pickJuz(2, 1).ok, false, "page outside the Juz");
  const j2 = pp.pickJuz(2); assert.deepEqual(j2.passage.start, { s: 2, a: 142 }, "Juz 2 starts at 2:142, not the page start");
});

test("New Learning: select any of 114 Surahs; the page start is the Surah's first Ayah", () => {
  for (let s = 1; s <= 114; s++) { const r = pp.pickSurah(s); assert.ok(r.ok, `Surah ${s}`); assert.deepEqual(r.passage.start, { s, a: 1 }); }
  assert.equal(pp.pickSurah(0).ok, false); assert.equal(pp.pickSurah(115).ok, false);
});

test("New Learning: select any Mushaf page 1–604 (whole page)", () => {
  for (let p = 1; p <= 604; p++) { const r = pp.pickPage(p); assert.ok(r.ok && r.passage.fullPage, `page ${p}`); }
  for (const bad of [0, 605, 1.5, NaN]) assert.equal(pp.pickPage(bad).ok, false, String(bad));
});

test("New Learning: single Ayah and Ayah ranges, with validation", () => {
  const one = pp.pickAyahs(2, 255); assert.ok(one.ok); assert.equal(one.passage.label, "Al-Baqarah · Ayah 255");
  const range = pp.pickAyahs(18, 1, 10); assert.ok(range.ok);
  assert.equal(pp.pickAyahs(1, 8).ok, false, "1:8 does not exist");
  assert.equal(pp.pickAyahs(2, 10, 5).ok, false, "reversed");
  assert.equal(pp.pickAyahs(2, 1, 61).ok, false, "over 60 Ayahs");
  assert.equal(pp.pickAyahs(2, 1, 60).ok, true);
});

test("New Learning: Start Learning link follows the saved method and never silently changes the passage", () => {
  const page = pp.pickPage(542).passage;
  assert.deepEqual(pp.startLink(page, "mushaf"), { href: "/mushaf?p=542&mode=learn&portion=page", routed: false });
  assert.deepEqual(pp.startLink(page, "mushaf", "second"), { href: "/mushaf?p=542&mode=learn&portion=second", routed: false });
  assert.deepEqual(pp.startLink(page, "ayah"), { href: "/learn?page=542", routed: false });
  const ayah = pp.pickAyahs(2, 255).passage;
  assert.equal(pp.startLink(ayah, "mushaf").href, "/mushaf?p=42&mode=learn&from=2:255&to=2:255");
  const across = pp.pickAyahs(2, 1, 20).passage; // pages 2–4
  const l = pp.startLink(across, "mushaf");
  assert.equal(l.href, "/learn?s=2&a=1&endS=2&endA=20"); assert.equal(l.routed, true, "the UI says it opens in the tutor");
  assert.match(across.detail, /pages 2–4/);
});

test("New Learning: adjusting the starting Ayah stays inside the selected passage", () => {
  const p = pp.pickPage(50).passage;
  const later = pp.adjustStart(p, { s: p.end.s, a: p.end.a }); assert.ok(later.ok); assert.deepEqual(later.passage.start, p.end);
  assert.equal(pp.adjustStart(p, { s: 1, a: 1 }).ok, false);
  const r = pp.pickAyahs(18, 1, 10).passage; const adj = pp.adjustStart(r, { s: 18, a: 4 }); assert.ok(adj.ok); assert.deepEqual([adj.passage.start.a, adj.passage.end.a], [4, 10]);
});

test("New Learning: method preference is backwards compatible (absent → follows the global view preference)", async () => {
  const d = store.defaultState();
  assert.equal(d.tutor.method, undefined);
  const c = await src("src/components/NewLearning.tsx");
  assert.match(c, /st\.tutor\?\.method \?\? \(st\.settings\.learnView === "ayah" \? "ayah" : "mushaf"\)/);
  assert.doesNotMatch(c, /\.slice\(0, 5\)/, "no longer hides lessons beyond five");
  assert.doesNotMatch(c, /delete d\.lessons|lessons = \{\}/, "never deletes lessons");
});

test("Quran safety: canonical data files not touched by this change", async () => {
  const q = JSON.parse(await readFile(resolve(root, "public/data/quran.json"), "utf8"));
  assert.ok(q);
  const changed = ["src/lib/localTime.ts", "src/lib/hijriTables.ts", "src/lib/ayahQuick.ts", "src/lib/urduSpeech.ts", "src/lib/revisionSession.ts", "src/lib/passagePick.ts"];
  for (const f of changed) assert.doesNotMatch(await src(f), /public\/data\/quran|layout\.json/);
});
