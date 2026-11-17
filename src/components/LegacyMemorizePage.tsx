"use client";
// Hifz: next lesson, daily revision, weak ayat, tracker for all 114 surahs, calendar and targets.
import Link from "next/link";
import { useEffect, useState } from "react";
import Practice from "@/components/Practice";
import { Bar, Sheet } from "@/components/Shell";
import { dueCount, dueRuns, juzProgress, markJuz, markRange, memorizedCount, nextLesson, STATUS_COLOR, STATUS_LABEL, surahStatus, weakDue, type PracticeKind, type Status } from "@/lib/hifz";
import { count, key, nextAyah, pageOf, parseKey, Q, ref, sname, TOTAL_AYAT } from "@/lib/quran";
import { today, update, useStore } from "@/lib/store";
import { MIND_MAPS } from "@/lib/mindMaps";
import PersonalizedJourney from "@/components/PersonalizedJourney";
import TodayPlan from "@/components/TodayPlan";
import TutorHub from "@/components/TutorHub";
import PageTracker from "@/components/PageTracker";
import TeachingPrefs from "@/components/TeachingPrefs";
import { isVerified } from "@/lib/coverage";
import { setDailyPrefs } from "@/lib/prefs";

type Session = { items: [number, number][]; title: string; kind: PracticeKind; difficulty?: "guided" | "challenge"; continueAt?: [number, number]; continueEnd?: [number, number]; pathId?: string; pathRange?: number };
const rangeItems = (s: number, a: number, b: number): [number, number][] => Array.from({ length: b - a + 1 }, (_, i) => [s, a + i]);
function passageItems(start: { s: number; a: number }, end: { s: number; a: number }): [number, number][] {
  const out: [number, number][] = []; let here: [number, number] | null = [start.s, start.a];
  while (here && out.length < TOTAL_AYAT) {
    out.push(here);
    if (here[0] === end.s && here[1] === end.a) return out;
    here = nextAyah(here[0], here[1]);
    if (here && (here[0] > end.s || (here[0] === end.s && here[1] > end.a))) return [];
  }
  return [];
}

function Stepper({ label, hint, value, step, min, max, onChange }: { label: string; hint: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div><div>{label}</div><div className="text-sm text-muted">{hint}</div></div>
      <div className="flex items-center gap-2">
        <button className="btn btn-sm" aria-label={`Less: ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <b className="min-w-[32px] text-center tabular-nums">{value}</b>
        <button className="btn btn-sm" aria-label={`More: ${label}`} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

export default function MemorizePage() {
  const st = useStore(); const t = today();
  const [session, setSession] = useState<Session | null>(null);
  // ?page=N opens that page in the 604-page tracker (links from Home, the Mushaf and Today's Hifz).
  const [trackerPage, setTrackerPage] = useState<number | null>(null);
  useEffect(() => { const n = Number(new URLSearchParams(window.location.search).get("page")); if (Number.isInteger(n) && n >= 1 && n <= 604) { setTrackerPage(n); window.setTimeout(() => document.getElementById("pages")?.scrollIntoView({ block: "start" }), 50); } }, []);
  const [view, setView] = useState<"surah" | "juz">("surah");
  const [open, setOpen] = useState<number | null>(null);
  const [prefer, setPrefer] = useState<number | undefined>(undefined);
  const [mr, setMr] = useState({ a: 1, b: 1 });
  const [recoverMode, setRecoverMode] = useState<"surah" | "juz">(st.journey.recoverMode);
  const [recoverId, setRecoverId] = useState(st.journey.recoverId);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("s") || !q.has("a")) return;
    const start = { s: Number(q.get("s")), a: Number(q.get("a")) };
    const end = { s: Number(q.get("endS") || q.get("s")), a: Number(q.get("endA") || q.get("a")) };
    if (![start.s, start.a, end.s, end.a].every(Number.isInteger) || start.s < 1 || start.s > 114 || end.s < 1 || end.s > 114 || start.a < 1 || start.a > count(start.s) || end.a < 1 || end.a > count(end.s)) return;
    const items = passageItems(start, end); if (!items.length) return;
    const chunk = items.slice(0, 30), mode = q.get("mode") === "revise" ? "rev" : "new";
    setSession({ items: chunk, title: `${ref(start.s, start.a)} - ${ref(...chunk[chunk.length - 1])}${items.length > chunk.length ? ` · section 1 of ${Math.ceil(items.length / 30)}` : ""}`, kind: mode, continueAt: items.length > chunk.length ? items[chunk.length] : undefined, continueEnd: [end.s, end.a], pathId: q.get("pathId") || undefined, pathRange: q.has("pathRange") ? Number(q.get("pathRange")) : undefined });
  }, []);

  if (session) return <Practice {...session} onClose={() => setSession(null)} onComplete={(results) => {
    const failedIndex = session.items.findIndex((_, i) => results[i] !== "ok");
    const last = session.items[session.items.length - 1];
    const nextPoint = failedIndex >= 0 ? session.items[failedIndex] : session.continueAt || (last ? nextAyah(last[0], last[1]) : null);
    update((d) => {
      d.journey.last = nextPoint ? { s: nextPoint[0], a: nextPoint[1] } : null;
      d.journey.lastEnd = session.continueAt && session.continueEnd ? { s: session.continueEnd[0], a: session.continueEnd[1] } : nextPoint ? { s: nextPoint[0], a: nextPoint[1] } : null;
      if (session.pathId && Number.isInteger(session.pathRange) && d.studentJourney) {
        const path = d.studentJourney.paths.find((p) => p.id === session.pathId && !p.deletedAt);
        const index = session.pathRange!;
        if (path && path.ranges[index]) {
          const failed = failedIndex >= 0 ? session.items[failedIndex] : null;
          const point = failed || session.continueAt;
          const nextRangeIndex = point ? index : index + 1;
          const range = path.ranges[nextRangeIndex];
          path.cursor = point ? { rangeIndex: index, s: point[0], a: point[1] } : range ? { rangeIndex: nextRangeIndex, ...range.start } : null;
          path.updatedAt = Date.now(); d.studentJourney.updatedAt = path.updatedAt;
        }
      }
    });
  }} />;

  const recited = Object.values(st.mem).filter(isVerified).length;
  const mem = memorizedCount(st), lesson = nextLesson(st, prefer), runs = dueRuns(st), weak = weakDue(st);
  const activeToday = st.journey.learningDays.includes(new Date(t * 86400000).getUTCDay());
  const log = st.log[String(t)] || {};
  let budget = Math.max(0, Math.min(st.settings.revTarget, st.journey.studyMinutes * 2) - (log.rev || 0));
  const todays = runs.filter((r) => { if (budget <= 0) return false; budget -= r.b - r.a + 1; return true; });
  const shown = todays.length ? todays : runs.slice(0, 1);
  const statuses = Q().n.map((_, i) => surahStatus(st, i + 1));
  const tally = statuses.reduce((m, x) => { m[x.status]++; return m; }, { none: 0, learning: 0, memorized: 0, revise: 0, strong: 0 } as Record<Status, number>);
  const cal = Array.from({ length: 35 }, (_, i) => { const d = t - 34 + i + (6 - new Date(t * 86400000).getUTCDay()); const l = st.log[String(d)]; return { d, future: d > t, nw: l?.nw || 0, rev: l?.rev || 0, date: new Date(d * 86400000).getUTCDate() }; });
  const os = open ? statuses[open - 1] : null;
  const begin = (next: Session) => {
    const first = next.items[0];
    if (first) update((d) => {
      const point = first;
      const end = next.continueEnd || next.items[next.items.length - 1];
      d.journey.last = { s: point[0], a: point[1] };
      d.journey.lastEnd = { s: end[0], a: end[1] };
    });
    setSession(next);
  };
  const saved = st.journey.last;
  const recovery = recoverMode === "surah"
    ? { start: { s: recoverId, a: 1 }, end: { s: recoverId, a: count(recoverId) }, label: `${sname(recoverId)} diagnostic` }
    : (() => { const [[s, a], [es, ea]] = Q().juz[recoverId - 1]; return { start: { s, a }, end: { s: es, a: ea }, label: `Juz ${recoverId} diagnostic` }; })();
  const recoveryAll = passageItems(recovery.start, recovery.end);
  const recoveryItems = recoveryAll.slice(0, 30);
  const customItems = passageItems(st.journey.start, st.journey.end);
  const customChunk = customItems.slice(0, 30);
  const continueItems = saved && st.journey.lastEnd ? passageItems(saved, st.journey.lastEnd) : saved ? [[saved.s, saved.a] as [number, number]] : [];
  const continueChunk = continueItems.slice(0, 30);
  const continueAfter = continueItems.length > continueChunk.length && continueChunk.length ? nextAyah(...continueChunk[continueChunk.length - 1]) : null;
  const tracked = Object.keys(st.mem);
  const dailyRun = todays[0];
  const dueMap = MIND_MAPS.find((m) => st.mapProgress[m.id] && st.mapProgress[m.id].due <= Date.now());
  const revisionMinutes = Math.min(st.journey.studyMinutes, dueCount(st) / 2);
  const newAyahBudget = Math.floor((st.journey.studyMinutes - revisionMinutes) / 1.5);
  const dailyNext = dailyRun
    ? { items: rangeItems(dailyRun.s, dailyRun.a, dailyRun.b), title: `${sname(dailyRun.s)} ${dailyRun.a}–${dailyRun.b} · due revision`, kind: "rev" as const }
    : weak.length
      ? { items: weak.slice(0, Math.max(1, st.settings.revTarget)).slice(0, 15).map(parseKey), title: "Weak ayah recall", kind: "weak" as const }
      : dueMap ? { mapId: dueMap.id }
      : lesson && activeToday && (log.nw || 0) < st.settings.newTarget && dueCount(st) <= st.settings.revTarget && newAyahBudget > 0 ? { items: rangeItems(lesson.s, lesson.a, Math.min(lesson.b, lesson.a + newAyahBudget - 1)), title: `${sname(lesson.s)} ${lesson.a}-${lesson.b} - new lesson`, kind: "new" as const }
      : tracked.length ? { items: tracked.slice(0, st.settings.quizLength).map(parseKey), title: "Final mixed recall quiz", kind: "custom" as const, difficulty: st.settings.quizDifficulty } : null;
  const strong = Object.values(st.mem).filter((r) => (r.successDays?.length ?? 0) >= 5 && r.iv >= 30 && !r.bad).length;
  const weekAyat = Object.entries(st.log).filter(([day]) => +day >= t - 6 && +day <= t).reduce((n, [, l]) => n + (l.a || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">My Hifz Journey</h1>
        <p className="text-sm text-muted">{recited.toLocaleString()} of 6,236 ayat recited in this app · {((recited / TOTAL_AYAT) * 100).toFixed(1)}%{mem > recited ? ` · ${(mem - recited).toLocaleString()} more marked earlier, not yet recited here` : ""}</p>
        <div className="mt-2"><Bar value={(recited / TOTAL_AYAT) * 100} color="var(--gold)" /></div>
      </header>
      <PersonalizedJourney />
      <TutorHub />
      <PageTracker initialPage={trackerPage} />

      <h2 className="label" id="juz">My Hifz tracker: all 114 Surahs and 30 Juz</h2>
      <section className="card flex flex-col gap-3">
        <div className="grid grid-cols-2 rounded-xl border border-line overflow-hidden">
          {(["surah", "juz"] as const).map((v) => <button key={v} aria-pressed={view === v} className={`py-2.5 font-semibold ${view === v ? "bg-accent text-accent-ink" : "text-muted"}`} onClick={() => setView(v)}>By {v}</button>)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {(Object.keys(STATUS_LABEL) as Status[]).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block border border-line" style={{ background: STATUS_COLOR[k] }} />{STATUS_LABEL[k]} {tally[k]}</span>)}
        </div>
        {view === "surah" ? (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
            {statuses.map((x, i) => (
              <button key={i} onClick={() => { setOpen(i + 1); setMr({ a: 1, b: count(i + 1) }); }} title={`${sname(i + 1)}: ${STATUS_LABEL[x.status]}`} aria-label={`${i + 1} ${sname(i + 1)}: ${STATUS_LABEL[x.status]}, ${x.done} of ${x.total} ayat`}
                className="aspect-square rounded-lg border border-line text-sm font-bold tabular-nums"
                style={x.status === "none" ? undefined : { background: STATUS_COLOR[x.status], color: "#fff", borderColor: "transparent" }}>{i + 1}</button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {Q().juz.map((_, i) => { const p = juzProgress(st, i + 1); const full = p.done === p.total; return (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="flex-1"><div className="font-semibold">Juz {i + 1}</div><Bar value={(p.done / p.total) * 100} /><div className="text-xs text-muted pt-1">{p.done} of {p.total} ayat</div></div>
                <button className="btn btn-sm" onClick={() => { if (full && !window.confirm(`Clear Juz ${i + 1}? This permanently deletes the memorization and revision history of every ayah in this Juz. To change what you said you memorized before, use “What have you memorized before?” instead — that never deletes history.`)) return; update((d) => markJuz(d, i + 1, !full)); }}>{full ? "Clear" : "Mark memorized"}</button>
              </div>
            ); })}
          </div>
        )}
      </section>
      <TodayPlan compact />
      <TeachingPrefs />

      <details className="rounded-card border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">More practice tools · recovery diagnostic, custom ranges, quizzes, weak-ayah drill</summary><div className="mt-3 flex flex-col gap-4">
      <section className="card flex flex-col gap-4 border-accent/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="label">Today's recommended journey</div><p className="text-sm text-muted">Overdue ayahs first, then weak ayahs, due visual maps, a time-sized new lesson, and a mixed recall challenge.</p></div>
          {dailyNext && <button className="btn-primary" onClick={() => "mapId" in dailyNext ? window.location.assign(`/mind-maps?map=${dailyNext.mapId}`) : begin(dailyNext)}>{"mapId" in dailyNext ? "Review due visual map" : "Start today's journey"}</button>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-line p-3"><b>{dueCount(st)}</b><div className="text-xs text-muted">Due for revision</div></div>
          <div className="rounded-xl border border-line p-3"><b>{weak.length}</b><div className="text-xs text-muted">Weak ayahs</div></div>
          <div className="rounded-xl border border-line p-3"><b>{strong}</b><div className="text-xs text-muted">Strong ayahs</div></div>
          <div className="rounded-xl border border-line p-3"><b>{weekAyat}</b><div className="text-xs text-muted">Ayahs practised this week</div></div>
        </div>
        {dueCount(st) > st.settings.revTarget && <p className="rounded-lg bg-accent-soft p-3 text-sm">Your revision backlog is larger than today's target. Consider lowering new ayahs until due revision is under control.</p>}
        {!activeToday && !dailyRun && !weak.length && <p className="text-sm text-muted">Today is set as a rest day. You can still choose a lesson or quiz below.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="btn text-left" disabled={!saved} onClick={() => saved && begin({ items: continueChunk, title: `Continue · ${ref(saved.s, saved.a)}${continueChunk.length > 1 ? `–${ref(...continueChunk[continueChunk.length - 1])}` : ""}`, kind: st.mem[key(saved.s, saved.a)] ? "custom" : "new", continueAt: continueAfter || undefined, continueEnd: st.journey.lastEnd ? [st.journey.lastEnd.s, st.journey.lastEnd.a] : undefined })}>Continue where I left off{saved ? ` · ${ref(saved.s, saved.a)}` : " · start a session to save a point"}</button>
          <button className="btn text-left" disabled={!tracked.length} onClick={() => { const pool = tracked.map(parseKey); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } begin({ items: pool.slice(0, Math.min(st.settings.quizLength, pool.length)), title: "Mixed recall quiz", kind: "custom", difficulty: st.settings.quizDifficulty }); }}>Final mixed recall quiz</button>
          <Link className="btn text-left" href="/mind-maps">Visual Maps · seven-step learning</Link>
          <button className="btn text-left" onClick={() => document.getElementById("custom-journey")?.scrollIntoView({ behavior: "smooth" })}>Choose a starting point and range</button>
        </div>
      </section>

      <section id="custom-journey" className="card flex flex-col gap-3">
        <div><h2 className="text-lg font-bold">Choose your journey range</h2><p className="text-sm text-muted">Set and save the exact passage to learn or recite. Quran text is loaded from the bundled Hafs dataset.</p></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-muted">Start Surah<select className="field mt-1" value={st.journey.start.s} onChange={(e) => { const s = +e.target.value; update((d) => { d.journey.start = { s, a: 1 }; if (d.journey.end.s < s) d.journey.end = { s, a: count(s) }; }); }}>{Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>
          <label className="text-sm text-muted">Start Ayah<input className="field mt-1" type="number" min={1} max={count(st.journey.start.s)} value={st.journey.start.a} onChange={(e) => update((d) => { d.journey.start.a = Math.max(1, Math.min(count(d.journey.start.s), +e.target.value || 1)); })} /></label>
          <label className="text-sm text-muted">End Surah<select className="field mt-1" value={st.journey.end.s} onChange={(e) => { const s = +e.target.value; update((d) => { d.journey.end = { s, a: count(s) }; }); }}>{Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select></label>
          <label className="text-sm text-muted">End Ayah<input className="field mt-1" type="number" min={1} max={count(st.journey.end.s)} value={st.journey.end.a} onChange={(e) => update((d) => { d.journey.end.a = Math.max(1, Math.min(count(d.journey.end.s), +e.target.value || 1)); })} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted">Jump start to Juz <select className="field mt-1" defaultValue="" onChange={(e) => { if (!e.target.value) return; const [[s, a], [es, ea]] = Q().juz[+e.target.value - 1]; update((d) => { d.journey.start = { s, a }; d.journey.end = { s: es, a: ea }; }); e.currentTarget.value = ""; }}><option value="">Choose Juz</option>{Q().juz.map((_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>)}</select></label>
          <button className="btn-primary" disabled={!customChunk.length} onClick={() => begin({ items: customChunk, title: `${ref(st.journey.start.s, st.journey.start.a)} – ${ref(...customChunk[customChunk.length - 1])}${customItems.length > customChunk.length ? ` · section 1 of ${Math.ceil(customItems.length / 30)}` : ""}`, kind: customChunk.some(([s, a]) => !st.mem[key(s, a)]) ? "new" : "custom", continueAt: customItems.length > customChunk.length ? customItems[customChunk.length] : undefined, continueEnd: [st.journey.end.s, st.journey.end.a] })}>Start selected passage · {customChunk.length} of {customItems.length} ayahs</button>
          {!customItems.length && <span className="text-sm text-weak">Choose an ending ayah after the starting ayah.</span>}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm text-muted">Daily study time <select className="field max-w-32" value={st.journey.studyMinutes} onChange={(e) => update((d) => { setDailyPrefs(d, { studyMinutes: +e.target.value }); })}>{[...new Set([10, 15, 20, 30, 45, 60, st.journey.studyMinutes])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm text-muted">Mixed quiz length<select className="field mt-1" value={st.settings.quizLength} onChange={(e) => update((d) => { d.settings.quizLength = +e.target.value; })}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} ayahs</option>)}</select></label><label className="text-sm text-muted">Quiz difficulty<select className="field mt-1" value={st.settings.quizDifficulty} onChange={(e) => update((d) => { d.settings.quizDifficulty = e.target.value as "guided" | "challenge"; })}><option value="guided">Guided · hints available</option><option value="challenge">Challenge · no hints</option></select></label></div>
        <div><div className="text-sm font-semibold">Learning days</div><div className="flex flex-wrap gap-2 pt-2">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => <button key={day} className={`btn btn-sm ${st.journey.learningDays.includes(i) ? "!border-accent !text-accent" : ""}`} aria-pressed={st.journey.learningDays.includes(i)} onClick={() => update((d) => { d.journey.learningDays = d.journey.learningDays.includes(i) ? d.journey.learningDays.filter((x) => x !== i) : [...d.journey.learningDays, i].sort(); })}>{day}</button>)}</div><p className="pt-1 text-xs text-muted">On rest days the due revision queue remains available; new lessons are still optional.</p></div>
      </section>

      <section className="card flex flex-col gap-3">
        <div><h2 className="text-lg font-bold">Recover my old memorization</h2><p className="text-sm text-muted">A diagnostic hides the ayahs first. Your ratings decide what gets scheduled; selecting a range never marks it memorized.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <select className="field" value={recoverMode} onChange={(e) => { const m = e.target.value as "surah" | "juz"; setRecoverMode(m); setRecoverId(1); update((d) => { d.journey.recoverMode = m; d.journey.recoverId = 1; }); }}><option value="surah">Select Surah</option><option value="juz">Select Juz</option></select>
          <select className="field" value={recoverId} onChange={(e) => { const id = +e.target.value; setRecoverId(id); update((d) => { d.journey.recoverId = id; }); }}>{Array.from({ length: recoverMode === "surah" ? 114 : 30 }, (_, i) => <option key={i} value={i + 1}>{recoverMode === "surah" ? `${i + 1}. ${sname(i + 1)}` : `Juz ${i + 1}`}</option>)}</select>
        </div>
        <button className="btn-primary self-start" onClick={() => begin({ items: recoveryItems, title: `${recovery.label} - ayahs ${recoveryItems[0]?.[1] || 1}-${recoveryItems[recoveryItems.length - 1]?.[1] || 1}`, kind: "assessment", continueAt: recoveryAll[recoveryItems.length], continueEnd: [recovery.end.s, recovery.end.a] })}>Start or resume complete hidden-text assessment - {recovery.label} ({recoveryAll.length} ayahs total, 30 per session)</button>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <a className="card !p-3" href="#lesson"><div className="font-semibold">Continue new lesson</div><div className="text-sm text-muted">Listen, learn, recall</div></a>
        <a className="card !p-3" href="#revise"><div className="font-semibold">Revision due today</div><div className="text-sm text-muted">{dueRuns(st).reduce((n, r) => n + r.b - r.a + 1, 0)} ayahs due</div></a>
        <a className="card !p-3" href="#weak"><div className="font-semibold">Weak ayahs</div><div className="text-sm text-muted">{weakDue(st).length} to strengthen</div></a>
        <a className="card !p-3" href="#juz"><div className="font-semibold">My memorized Juz</div><div className="text-sm text-muted">Track all 30 Juz</div></a>
        <button className="card !p-3 text-left" disabled={!mem} onClick={() => {
          const saved = Object.keys(st.mem);
          const [s, a] = parseKey(saved[Math.floor(Math.random() * saved.length)]);
          const direction = Math.random() < 0.5 ? "continue from" : "recall";
          begin({ items: rangeItems(s, a, a), title: `Random challenge · ${direction} ${sname(s)} ${a}`, kind: "custom" });
        }}><div className="font-semibold">Random recall challenge</div><div className="text-sm text-muted">Start from a surprise ayah</div></button>
        <button className="card !p-3 text-left" disabled={!mem} onClick={() => {
          const pool = Object.keys(st.mem).filter((k) => { const [s, a] = parseKey(k); return a < count(s); });
          const [s, a] = parseKey(pool[Math.floor(Math.random() * pool.length)] || Object.keys(st.mem)[0]);
          const target = a < count(s) ? a + 1 : a;
          begin({ items: rangeItems(s, target, target), title: `Daily quiz · Continue ${sname(s)} ${a}`, kind: "custom" });
        }}><div className="font-semibold">Daily continuation quiz</div><div className="text-sm text-muted">Recall what follows a memorized ayah</div></button>
        <a className="card !p-3" href="#analytics"><div className="font-semibold">Memory progress</div><div className="text-sm text-muted">{mem.toLocaleString()} ayahs tracked</div></a>
      </section>

      <section id="lesson" className="card flex flex-col gap-3">
        <div className="label">Next new lesson</div>
        {lesson ? <>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-lg font-bold">{sname(lesson.s)} {lesson.a}{lesson.b > lesson.a ? `–${lesson.b}` : ""}</div><div className="text-sm text-muted">{lesson.b - lesson.a + 1} ayat · today {log.nw || 0} of {st.settings.newTarget} done</div></div>
            <button className="btn-primary" onClick={() => begin({ items: rangeItems(lesson.s, lesson.a, lesson.b), title: `${sname(lesson.s)} ${lesson.a}–${lesson.b}`, kind: "new" })}>Start</button>
          </div>
          <label className="text-sm text-muted">Memorize a different surah next
            <select className="field mt-1" value={prefer || ""} onChange={(e) => setPrefer(e.target.value ? +e.target.value : undefined)}>
              <option value="">Recommended: {sname(nextLesson(st)?.s || 1)}</option>
              {Q().n.map((n, i) => statuses[i].done < statuses[i].total ? <option key={i} value={i + 1}>{i + 1}. {n[1]}</option> : null)}
            </select>
          </label>
        </> : <p className="text-muted">Every ayah is marked as memorized. Alhamdulillah.</p>}
      </section>

      <h2 className="label" id="revise">Revision due · {runs.reduce((n, r) => n + r.b - r.a + 1, 0)} ayat</h2>
      {shown.length ? (
        <section className="card flex flex-col divide-y divide-line !py-1">
          {shown.map((r) => (
            <button key={`${r.s}:${r.a}`} className="flex items-center justify-between gap-3 py-3 text-left" onClick={() => begin({ items: rangeItems(r.s, r.a, r.b), title: `${sname(r.s)} ${r.a}–${r.b}`, kind: "rev" })}>
              <div><div className="font-semibold">{sname(r.s)} {r.a}{r.b > r.a ? `–${r.b}` : ""}</div><div className="text-sm text-muted">{r.b - r.a + 1} ayat · page {pageOf(r.s, r.a)}</div></div>
              <span className="pill">Revise</span>
            </button>
          ))}
          {runs.length > shown.length && <p className="py-3 text-sm text-muted">{runs.length - shown.length} more portions are waiting after today's target.</p>}
        </section>
      ) : <div className="card text-sm text-muted">{mem ? "Nothing is due. Everything memorized is on schedule." : "Mark what you have already memorized in the tracker below, and your revision plan appears here."}</div>}

      {weak.length > 0 && (
        <section id="weak" className="card flex flex-col gap-3">
          <div className="flex items-center justify-between"><div><b>Weak ayat · {weak.length}</b><p className="text-sm text-muted">Three clean days in a row clears each one.</p></div></div>
          <div className="flex flex-wrap gap-2">{weak.slice(0, 12).map((k) => { const [s, a] = parseKey(k); return <span key={k} className="pill">{ref(s, a)}</span>; })}{weak.length > 12 && <span className="text-sm text-muted">+{weak.length - 12} more</span>}</div>
          <button className="btn-primary" onClick={() => begin({ items: weak.slice(0, 15).map(parseKey), title: "Weak ayat drill", kind: "weak" })}>Start the drill</button>
        </section>
      )}
      </div></details>


      <details className="flex flex-col gap-3"><summary className="cursor-pointer text-sm font-semibold text-muted">Activity charts and daily targets</summary>
      <h2 className="label" id="analytics">Memory activity</h2>
      <section className="card">
        <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="New lessons and revision over the last five weeks">
          {cal.map((c) => (
            <div key={c.d} className="aspect-square rounded-lg border border-line grid place-items-center text-xs relative" style={{ visibility: c.future ? "hidden" : "visible", background: c.nw ? "var(--accent-soft)" : undefined, fontWeight: c.d === t ? 700 : 400 }} title={`${c.nw} new, ${c.rev} revised`}>
              {c.date}{c.rev > 0 && <i className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)" }} />}
            </div>
          ))}
        </div>
        <p className="text-sm text-muted pt-2">Shaded days had a new lesson. A gold dot marks a day with revision.</p>
      </section>

      <h2 className="label">Daily targets</h2>
      <section className="card flex flex-col gap-4">
        <Stepper label="New ayat each day" hint="Set to a small number you can keep up." value={st.settings.newTarget} step={1} min={1} max={40} onChange={(v) => update((d) => { setDailyPrefs(d, { newAmount: v, newUnit: "ayahs" }); })} />
        <Stepper label="Ayat to revise each day" hint="About 150 ayat is one juz." value={st.settings.revTarget} step={10} min={10} max={600} onChange={(v) => update((d) => { setDailyPrefs(d, { revisionAmount: v, revisionUnit: "ayahs" }); })} />
      </section>
      </details>

      {open && os && (
        <Sheet title={`${open}. ${sname(open)}`} onClose={() => setOpen(null)}>
          <p className="text-sm text-muted">{STATUS_LABEL[os.status]} · {os.done} of {os.total} ayat memorized</p>
          <Bar value={(os.done / os.total) * 100} color={STATUS_COLOR[os.status] === "transparent" ? "var(--line)" : STATUS_COLOR[os.status]} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => { setPrefer(open); setOpen(null); window.scrollTo(0, 0); }} disabled={os.done === os.total}>Memorize this next</button>
            <Link className="btn" href={`/mushaf?p=${pageOf(open, 1)}`}>Open in mushaf</Link>
          </div>
          <div className="label pt-2">I already know these ayat</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-muted">From<input type="number" min={1} max={os.total} className="field mt-1" value={mr.a} onChange={(e) => setMr({ ...mr, a: +e.target.value })} /></label>
            <label className="text-sm text-muted">To<input type="number" min={1} max={os.total} className="field mt-1" value={mr.b} onChange={(e) => setMr({ ...mr, b: +e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" disabled={!(mr.a >= 1 && mr.b >= mr.a && mr.b <= os.total)} onClick={() => update((d) => markRange(d, open, mr.a, mr.b, true))}>Mark as memorized</button>
            <button className="btn" disabled={!(mr.a >= 1 && mr.b >= mr.a && mr.b <= os.total)} onClick={() => { if (!window.confirm(`Clear ayat ${mr.a}–${mr.b}? This permanently deletes their memorization and revision history.`)) return; update((d) => markRange(d, open, mr.a, mr.b, false)); }}>Clear these ayat</button>
          </div>
          <button className="btn" disabled={!(mr.a >= 1 && mr.b >= mr.a && mr.b <= os.total) || mr.b - mr.a > 99} onClick={() => { begin({ items: rangeItems(open, mr.a, mr.b), title: `${sname(open)} ${mr.a}–${mr.b}`, kind: "custom" }); setOpen(null); }}>Practise this range from memory</button>
        </Sheet>
      )}
    </div>
  );
}
