"use client";
// Guided and manual lessons over a Mushaf page or Ayah range (Phase 3.2), and the recovery template (Phase 3.4).
// Practice ratings live in lesson state. Only the final whole-recitation ratings are saved as Hifz evidence,
// once, through applyResults() (see lib/lesson.ts). Opening or reading a lesson never records recall.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "@/components/Audio";
import { OFFLINE_NOT_SAVED_MESSAGE, playTrack } from "@/lib/audioPlayback";
import { arabicTrack } from "@/lib/audioSources";
import MapCue from "@/components/MapCue";
import MethodIntro from "@/components/MethodIntro";
import { SaveLine } from "@/components/SaveStatus";
import PageQuiz from "@/components/PageQuiz";
import { type Ayah, type Unit, unitWords } from "@/lib/chunking";
import { finishLesson } from "@/lib/lessonFinish";
import { buildSteps, finalKey, markWithAssistance, newLesson, PHASE_LABEL, type Level, type Step, type Template } from "@/lib/lesson";
import { arNum, loadSet, pageOf, ref, SETS, sname, words } from "@/lib/quran";
import { update, useStore, type LessonState } from "@/lib/store";
import { listRefPdfs } from "@/lib/refPdfs";
import { referenceJuzForAyah, referenceMapHref } from "@/lib/refPdfLearn";
import MiniMushafPage from "@/components/MiniMushafPage";
import { useLearnView, ViewSwitch, type WordState } from "@/components/LearnView";

type Mark = "ok" | "hes" | "bad";
const MARK_LABEL: Record<Mark, string> = { ok: "Recited correctly", hes: "Needed help", bad: "Could not recall" };

/** Sequential repeat-N player for a list of Ayahs using the selected reciter. Saved Ayahs play from the device
 *  (also offline); others stream and are saved automatically once they start (lib/audioCache.ts). */
export function useRepeatPlayer() {
  const st = useStore(); const global = useAudio();
  const el = useRef<HTMLAudioElement | null>(null); const [playing, setPlaying] = useState(false); const [err, setErr] = useState("");
  const run = useRef(0); // a new play() or stop() cancels the previous queue
  const stop = () => { run.current++; el.current?.pause(); setPlaying(false); };
  const play = (ayahs: Ayah[], times: number) => {
    global.stop(); stop(); setErr("");
    const queue: Ayah[] = []; for (let t = 0; t < times; t++) queue.push(...ayahs);
    if (!el.current) el.current = new Audio();
    const a = el.current; let i = 0;
    const my = run.current; const isCurrent = () => run.current === my;
    const next = () => {
      if (!isCurrent()) return;
      if (i >= queue.length) { setPlaying(false); return; }
      const [s, x] = queue[i++];
      playTrack(a, arabicTrack(st.settings.reciter, s, x), { rate: st.settings.speed, isCurrent }).catch((e: Error) => {
        if (e?.name === "StaleAudioRequest" || !isCurrent()) return;
        setErr(e?.name === "OfflineUnavailableError" ? `${OFFLINE_NOT_SAVED_MESSAGE} You can continue by reading.` : "Audio could not play (offline or blocked). You can continue by reading."); setPlaying(false);
      });
    };
    a.onended = next; a.onerror = () => { setErr("Audio is unavailable right now. You can continue by reading."); setPlaying(false); };
    setPlaying(true); next();
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { play, stop, playing, err };
}

/** Quran words of a unit with optional concealment. fade 0 = full, 1 = every other word hidden, 2 = first letters, 3 = hidden. */
function UnitText({ u, fade, reveal = Infinity }: { u: Unit; fade: 0 | 1 | 2 | 3; reveal?: number }) {
  const ws = unitWords(u);
  return <span>{ws.map((w, i) => {
    const shown = i < reveal;
    if (fade === 0 || shown) return <span key={i}>{w} </span>;
    if (fade === 1 && i % 2 === 0) return <span key={i}>{w} </span>;
    if (fade === 2) { const m = w.match(/^.[\u064b-\u065f\u0670\u06d6-\u06ed]*/u); const head = m ? m[0] : w[0]; return <span key={i}>{head}<span className="text-transparent">{w.slice(head.length)}</span> </span>; }
    return <span key={i} className="rounded-sm border-b-2 border-line text-transparent">{w} </span>;
  })}</span>;
}

/** `reveal` = number of words shown so far, counted in reading order across ALL units (hints reveal
 *  the first word of the whole passage, then the next …). Undefined/Infinity = everything shown. */
function AyahBlock({ units, fade, reveal = Infinity, showRefs = true }: { units: Unit[]; fade: 0 | 1 | 2 | 3; reveal?: number; showRefs?: boolean }) {
  let before = 0;
  return <p className="q text-[26px] leading-[2.3] sm:text-[30px]" dir="rtl">{units.map((u, i) => {
    const endsAyah = u.to === words(u.s, u.a).length - 1;
    const local = reveal === Infinity ? Infinity : Math.max(0, reveal - before);
    before += u.to - u.from + 1;
    return <span key={i}><UnitText u={u} fade={fade} reveal={local} />{showRefs && endsAyah && <span className="mx-1 inline-grid h-8 min-w-8 place-items-center rounded-full border border-accent/50 px-1 align-middle font-ui text-xs text-accent">{arNum(u.a)}</span>}</span>;
  })}</p>;
}

/** The same concealment as AyahBlock/UnitText, per word, for the Mushaf view. Words outside the units are dimmed. */
function unitWordState(units: Unit[], fade: 0 | 1 | 2 | 3, reveal = Infinity) {
  const at = new Map<string, number>(); let before = 0;
  units.forEach((u) => { for (let w = u.from; w <= u.to; w++) at.set(`${u.s}:${u.a}:${w}`, before + (w - u.from)); before += u.to - u.from + 1; });
  return (s: number, a: number, w: number): WordState => {
    const pos = at.get(`${s}:${a}:${w}`);
    if (pos === undefined) return "dim";
    if (fade === 0 || pos < reveal) return "show";
    // index within its unit, as UnitText counts it
    const u = units.find((x) => x.s === s && x.a === a && w >= x.from && w <= x.to)!;
    const i = w - u.from;
    if (fade === 1) return i % 2 === 0 ? "show" : "hide";
    return fade === 2 ? "head" : "hide";
  };
}

/** Quran area of a guided step in Mushaf view: every page the step touches, 15-line layout. */
function StepMushaf({ units, fade, reveal }: { units: Unit[]; fade: 0 | 1 | 2 | 3; reveal?: number }) {
  const state = unitWordState(units, fade, reveal);
  const pages = [...new Set(units.map((u) => pageOf(u.s, u.a)))];
  const first = units[0];
  return <div className="flex flex-col gap-2">{pages.map((p) => <MiniMushafPage key={p} page={p} active={first ? `${first.s}:${first.a}` : null} state={(f) => state(f.s, f.a, f.w)} />)}</div>;
}

export function Meaning({ units }: { units: Unit[] }) {
  const st = useStore(); const [open, setOpen] = useState(false); const [set, setSet] = useState<string[][] | null>(null);
  useEffect(() => { if (open && !set) loadSet(st.settings.tr).then(setSet).catch(() => setSet([])); }, [open, set, st.settings.tr]);
  const ayahs = [...new Set(units.map((u) => `${u.s}:${u.a}`))].map((x) => x.split(":").map(Number) as Ayah);
  const lang = SETS[st.settings.tr].lang;
  return <details className="rounded-xl border border-line p-2 text-sm" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
    <summary className="cursor-pointer font-semibold">Meaning ({SETS[st.settings.tr].label})</summary>
    {!set ? <p className="text-muted">Loading…</p> : set.length === 0 ? <p className="text-muted">Translation unavailable offline.</p> :
      ayahs.map(([s, a]) => <p key={`${s}:${a}`} className={`mt-1 ${lang === "ur" ? "ur text-[16px]" : ""}`} dir={lang === "ur" ? "rtl" : "ltr"}><b className="font-ui">{s}:{a}</b> {set[s - 1]?.[a - 1]}</p>)}
    <p className="mt-1 text-xs text-muted">Ayah-level translation from the bundled reviewed source. Word-by-word meanings are not shown: no reviewed word glossary is bundled yet.</p>
  </details>;
}

function OrderExercise({ ayahs, onDone }: { ayahs: Ayah[]; onDone: () => void }) {
  const shuffled = useMemo(() => { const x = [...ayahs]; for (let i = x.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }, [ayahs]);
  const [picked, setPicked] = useState<Ayah[]>([]); const [wrong, setWrong] = useState(false);
  const pick = (x: Ayah) => { const expect = ayahs[picked.length]; if (expect[0] === x[0] && expect[1] === x[1]) { setPicked([...picked, x]); setWrong(false); } else setWrong(true); };
  const doneAll = picked.length === ayahs.length;
  return <div className="flex flex-col gap-2">
    <p className="text-sm text-muted">Tap the Ayahs in the order they come in the Mushaf (practice only — not saved as recitation).</p>
    {shuffled.map((x) => { const used = picked.some((p) => p[0] === x[0] && p[1] === x[1]); return <button key={`${x[0]}:${x[1]}`} disabled={used} onClick={() => pick(x)} className={`rounded-xl border p-2 text-right ${used ? "border-strong/40 opacity-50" : "border-line"}`}><span className="q text-xl" dir="rtl">{words(x[0], x[1]).slice(0, 6).join(" ")} …</span></button>; })}
    {wrong && <p role="alert" className="text-sm text-weak">Not that one — think about what comes next.</p>}
    {doneAll && <button className="btn-primary" onClick={onDone}>Correct order · continue</button>}
  </div>;
}

export default function LessonPlayer({ unit, ayahs, title, template = "learn", pathId }: { unit: LessonState["unit"]; ayahs: Ayah[]; title: string; template?: Template; pathId?: string }) {
  const st = useStore(); const player = useRepeatPlayer();
  const id = `${template}:${unit.kind === "page" ? `page:${unit.page}` : `range:${unit.start.s}:${unit.start.a}-${unit.end.s}:${unit.end.a}`}`;
  const lesson = st.lessons?.[id];
  const [mode, setMode] = useState<LessonState["mode"]>(st.tutor?.mode ?? "guided"); const [level, setLevel] = useState<Level>(template === "recover" ? "standard" : st.tutor?.level ?? "guided");
  const [repeat, setRepeatState] = useState(st.tutor?.repeat ?? 3); const setRepeat = (n: number) => { setRepeatState(n); update((d) => { d.tutor = { ...(d.tutor || { mode: "guided", level: "guided", portion: "page", repeat: 3, updatedAt: 0 }), repeat: n, updatedAt: Date.now() }; }); };
  const learnView = useLearnView();
  const [fadeLevel, setFadeLevel] = useState<1 | 2 | 3>(1); const [showMethod, setShowMethod] = useState(false); const [reveal, setReveal] = useState(0); const [shown, setShown] = useState(false); const [finalIdx, setFinalIdx] = useState(0);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [availablePdfJuz, setAvailablePdfJuz] = useState<number[]>([]);
  useEffect(() => { let active = true; void listRefPdfs().then((rows) => { if (active) setAvailablePdfJuz(rows.map((x) => x.juz)); }).catch(() => { if (active) setAvailablePdfJuz([]); }); return () => { active = false; }; }, []);
  const steps = useMemo<Step[]>(() => lesson ? buildSteps(ayahs, lesson.level, lesson.template) : [], [ayahs, lesson?.level, lesson?.template]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = lesson ? steps[Math.min(lesson.step, steps.length - 1)] : null;
  useEffect(() => { setReveal(0); setShown(false); setFinalIdx(0); setFadeLevel(1); player.stop(); }, [lesson?.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (restart = false) => update((d) => {
    d.lessons ||= {}; if (restart || !d.lessons[id] || d.lessons[id].completedAt) d.lessons[id] = newLesson(template, unit, title, mode, level, Date.now(), pathId);
    if (template === "learn") d.tutor = { ...(d.tutor || { mode, level, portion: "page", repeat, updatedAt: 0 }), mode, level, updatedAt: Date.now() }; // remember the choice (single copy)
  });
  const patch = (fn: (l: LessonState) => void) => update((d) => { const l = d.lessons?.[id]; if (!l) return; fn(l); l.updatedAt = Date.now(); });
  const go = (n: number) => patch((l) => { l.step = Math.max(0, Math.min(steps.length - 1, n)); });
  const finish = () => {
    let n = 0;
    update((d) => { n = finishLesson(d, id, ayahs, unit, template, pathId); });
    setSavedCount(n);
  };
  const rate = (m: Mark) => {
    if (!lesson || !step || step.kind !== "recall") return;
    const i = lesson.step;
    if (step.scope === "page") {
      const [s, a] = ayahs[finalIdx];
      patch((l) => { l.results[finalKey(s, a)] = m; if (reveal > 0) l.hinted[finalKey(s, a)] = true; });
      if (finalIdx + 1 < ayahs.length) { setFinalIdx(finalIdx + 1); setReveal(0); setShown(false); } else go(i + 1);
      return;
    }
    patch((l) => { l.results[`step:${i}`] = m; if (reveal > 0) l.hinted[`step:${i}`] = true; });
    // Struggling: go back once to re-listen to this material before moving on.
    if (m === "bad" && !lesson.results[`retry:${i}`]) { const back = [...steps.slice(0, i)].map((s, j) => [s, j] as const).reverse().find(([s]) => s.kind === "listen"); patch((l) => { l.results[`retry:${i}`] = "bad"; }); if (back) { go(back[1]); return; } }
    go(i + 1);
  };

  // ---------------------------------------------------------------- start screen
  // Focus mode while a guided lesson is open: hide the app's bottom navigation (Save & exit stays in the header).
  const focused = !!lesson && !lesson.completedAt && savedCount === null && lesson.mode !== "manual";
  useEffect(() => { document.documentElement.classList.toggle("lesson-focus", focused); return () => document.documentElement.classList.remove("lesson-focus"); }, [focused]);
  if (!lesson) return <section className="card flex flex-col gap-4">
    <div><div className="label">{template === "recover" ? "Recovery" : "Learn"}</div><h1 className="text-xl font-bold">{title}</h1><p className="text-sm text-muted">{ayahs.length} ayah{ayahs.length === 1 ? "" : "s"} · {sname(ayahs[0][0])} {ayahs[0][1]}–{ayahs[ayahs.length - 1][0] !== ayahs[0][0] ? `${sname(ayahs[ayahs.length - 1][0])} ` : ""}{ayahs[ayahs.length - 1][1]} · Mushaf page {pageOf(ayahs[0][0], ayahs[0][1])}</p></div>
    {template === "learn" && mode === "guided" && (!st.tutor?.introDismissedAt || showMethod) && <MethodIntro compact />}
    {template === "learn" && st.tutor?.introDismissedAt && !showMethod && <button className="self-start text-sm underline" onClick={() => setShowMethod(true)}>How this method works</button>}
    <fieldset className="flex flex-col gap-2"><legend className="label">How do you want to learn?</legend>
      {([["guided", "Guided learning", "The app walks you through listening, reading, hiding and recalling, step by step."], ["manual", "Manual learning", "You choose what to repeat, hide and test for each Ayah."]] as const).map(([v, l, h]) => <label key={v} className={`flex gap-2 rounded-xl border p-3 ${mode === v ? "border-accent bg-accent-soft/40" : "border-line"}`}><input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} /><span><b>{l}</b><br /><span className="text-sm text-muted">{h}</span></span></label>)}
    </fieldset>
    {mode === "guided" && <fieldset className="flex flex-col gap-2"><legend className="label">Level</legend>
      {([["guided", "Guided", "Audio, gradual hiding, hints and more repetition."], ["standard", "Standard", "Less prompting, hidden recall and joining."], ["challenge", "Challenge", "Minimal prompts; larger groups; no hints."]] as const).map(([v, l, h]) => <label key={v} className={`flex gap-2 rounded-xl border p-3 ${level === v ? "border-accent bg-accent-soft/40" : "border-line"}`}><input type="radio" name="level" checked={level === v} onChange={() => setLevel(v)} /><span><b>{l}</b> <span className="text-sm text-muted">· {h}</span></span></label>)}
    </fieldset>}
    <button className="btn-primary" onClick={() => start()}>{template === "recover" ? "Start recovery" : "Start lesson"}</button>
    <p className="text-xs text-muted">Your place is saved after every step, so you can stop and continue later. Only your final recitation ratings are added to your Hifz record.</p>
  </section>;

  // ---------------------------------------------------------------- finished
  if (lesson.completedAt || savedCount !== null) {
    const nextPage = unit.kind === "page" && unit.page! < 604 ? unit.page! + 1 : null;
    return <section className="card flex flex-col gap-3">
      <h1 className="text-xl font-bold">Lesson complete</h1>
      <SaveLine />
      <p className="text-sm">{(savedCount ?? 0) > 0 || lesson.savedToHifz ? "Your final recitation ratings were recorded in your Hifz progress and scheduled for revision (the save status above shows whether they are stored on this device)." : "No final ratings were given, so nothing was added to your Hifz record."}</p>
      <ul className="text-sm text-muted">{ayahs.map(([s, a]) => { const r = lesson.results[finalKey(s, a)]; return r ? <li key={`${s}:${a}`}>{ref(s, a)} · {MARK_LABEL[r]}{r === "ok" && lesson.hinted[finalKey(s, a)] ? " (with a hint → counted as needed help)" : ""}</li> : null; })}</ul>
      <div className="flex flex-wrap gap-2">
        {nextPage && template === "learn" && <Link className="btn-primary" href={`/mushaf?p=${nextPage}&mode=learn`}>Learn page {nextPage}</Link>}
        <button className="btn" onClick={() => start(true)}>Do this lesson again</button>
        <Link className="btn" href="/journey">My Hifz Journey</Link>
      </div>
      {unit.kind === "page" && unit.page && template === "learn" && <details className="rounded-xl border border-line p-2"><summary className="cursor-pointer text-sm font-semibold">Optional: understanding &amp; order practice for this page</summary><div className="mt-2"><PageQuiz page={unit.page} /></div></details>}
    </section>;
  }

  // ---------------------------------------------------------------- manual mode
  if (lesson.mode === "manual") return <ManualLesson lessonId={id} ayahs={ayahs} lesson={lesson} onFinish={finish} player={player} />;

  // ---------------------------------------------------------------- guided step
  if (!step) return null;
  const pct = Math.round(((lesson.step + 1) / steps.length) * 100);
  const isFinal = step.kind === "recall" && step.scope === "page";
  const cur = isFinal ? ayahs[finalIdx] : null;
  const hintsAllowed = lesson.level !== "challenge";
  const recallUnits = isFinal && cur ? [{ s: cur[0], a: cur[1], from: 0, to: words(cur[0], cur[1]).length - 1, whole: true }] : step.kind === "recall" ? step.units : [];
  const lastLen = recallUnits.reduce((n, u) => n + u.to - u.from + 1, 0); // total words that hints can reveal
  const stepAyahs: Ayah[] = step.kind === "order" ? step.ayahs : [...new Map(("units" in step ? step.units : []).map((u) => [`${u.s}:${u.a}`, [u.s, u.a] as Ayah])).values()];
  const lessonReturnTo = unit.kind === "page" ? `/learn?page=${unit.page}${template === "recover" ? "&template=recover" : ""}` : `/learn?s=${unit.start.s}&a=${unit.start.a}&endS=${unit.end.s}&endA=${unit.end.a}${template === "recover" ? "&template=recover" : ""}`;
  const prepStep = step.kind === "listen" || step.kind === "read" || step.kind === "fade";
  const activePrepAyah = stepAyahs[0];
  const availableMapJuz = prepStep && activePrepAyah ? referenceJuzForAyah(activePrepAyah[0], activePrepAyah[1], availablePdfJuz) : null;

  return <section className="flex flex-col gap-3">
    <div className="flex items-center gap-2"><Link href="/journey" className="btn btn-sm" aria-label="Save and exit">Save &amp; exit</Link><div className="min-w-0 flex-1"><div className="truncate font-bold">{lesson.title}</div><div className="text-sm font-semibold text-accent">Ayah {step.ayahIndex} of {step.ayahCount} · {PHASE_LABEL[step.phase]}</div><div className="text-xs text-muted">step {lesson.step + 1} of {steps.length} · {lesson.level} level</div></div><button className="btn btn-sm" onClick={() => setShowMethod((v) => !v)} aria-expanded={showMethod} aria-label="How this method works">?</button></div>
    {showMethod && <MethodIntro onClose={() => setShowMethod(false)} />}
    {step.kind !== "order" && <ViewSwitch view={learnView.view} setView={learnView.setView} defaultView={learnView.defaultView} />}
    {availableMapJuz !== null && <Link className="btn btn-sm self-start" href={referenceMapHref(availableMapJuz, lessonReturnTo)}>Visual Memory Map · Juz {availableMapJuz}</Link>}
    <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
    <div className="card flex flex-col gap-3">
      <p className="rounded-xl bg-accent-soft/50 p-3 text-[15px] font-semibold leading-relaxed" aria-live="polite">{isFinal && cur ? `Page test · ${ref(cur[0], cur[1])} (${finalIdx + 1} of ${ayahs.length}): recite this Ayah without looking, then reveal it and rate yourself honestly.` : step.instruction}</p>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{step.label}</h2>
      {step.kind !== "order" && step.kind !== "recall" && (learnView.view === "mushaf"
        ? <StepMushaf units={step.units} fade={step.kind === "fade" ? (step.fade === 2 ? 2 : fadeLevel) : 0} />
        : <AyahBlock units={step.units} fade={step.kind === "fade" ? (step.fade === 2 ? 2 : fadeLevel) : 0} />)}
      {step.kind === "order" && <OrderExercise ayahs={step.ayahs} onDone={() => go(lesson.step + 1)} />}
      {step.kind === "recall" && (learnView.view === "mushaf"
        ? <StepMushaf units={recallUnits} fade={shown ? 0 : 3} reveal={shown ? Infinity : reveal} />
        : <AyahBlock units={recallUnits} fade={shown ? 0 : 3} reveal={shown ? Infinity : reveal} />)}
      {step.kind === "listen" && stepAyahs.slice(0, 2).map(([s, a]) => <MapCue key={`${s}:${a}`} s={s} a={a} returnTo={lessonReturnTo} />)}
      {step.kind === "recall" && recallUnits.slice(0, 2).map(({ s, a }) => <MapCue key={`${s}:${a}`} s={s} a={a} recall returnTo={lessonReturnTo} onAssisted={() => patch((l) => { l.hinted[finalKey(s, a)] = true; })} />)}

      {(step.kind === "listen" || step.kind === "read") && <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => player.playing ? player.stop() : player.play(stepAyahs, repeat)}>{player.playing ? "■ Stop" : `▶ Play ×${repeat}`}</button>
        <label className="text-sm text-muted">Repeat <select className="field ml-1 inline w-auto" value={repeat} onChange={(e) => setRepeat(+e.target.value)}>{[1, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}×</option>)}</select></label>
        {step.units.some((u) => !u.whole) && <span className="text-xs text-muted">Audio plays the whole Ayah.</span>}
      </div>}
      {player.err && <p className="text-sm text-weak">{player.err}</p>}
      {(step.kind === "listen" || step.kind === "read") && <Meaning units={step.units} />}

      {step.kind === "fade" && step.fade === 1 && <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted">{fadeLevel === 1 ? "Half the words are hidden." : fadeLevel === 2 ? "Only first letters are shown." : "All words are hidden."}</span>{fadeLevel < 3 && <button className="btn btn-sm" onClick={() => setFadeLevel((f) => (f + 1) as 1 | 2 | 3)}>Hide more</button>}</div>}

      {step.kind === "recall" && !shown && <div className="flex flex-wrap gap-2">
        {hintsAllowed && <button className="btn" onClick={() => setReveal((r) => Math.min(r + 1, lastLen))}>Hint: next word</button>}
        <button className="btn-primary" onClick={() => setShown(true)}>I have recited it · show text</button>
        <Link className="btn btn-sm self-center" href={`/recite?s=${recallUnits[0].s}&a=${recallUnits[0].a}&endS=${recallUnits[recallUnits.length - 1].s}&endA=${recallUnits[recallUnits.length - 1].a}`}>Check with live recitation</Link>
      </div>}
      {step.kind === "recall" && shown && <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">Compare with the text. How did your recitation go?{reveal > 0 ? " You used a hint, so a correct recitation is counted as needing help." : ""}</p>
        <div className="grid grid-cols-3 gap-2">{(["bad", "hes", "ok"] as Mark[]).map((m) => <button key={m} className={`btn ${m === "bad" ? "!border-weak !text-weak" : m === "hes" ? "!border-revise !text-revise" : "!border-strong !text-strong"}`} onClick={() => rate(m)}>{MARK_LABEL[m]}</button>)}</div>
        {!isFinal && <p className="text-xs text-muted">Practice rating — kept in this lesson only.</p>}
        {isFinal && <p className="text-xs text-muted">Final rating — this is saved to your Hifz record when the lesson ends.</p>}
      </div>}

      {(step.kind === "listen" || step.kind === "read" || step.kind === "fade") && <div className="flex gap-2">
        <button className="btn" disabled={lesson.step === 0} onClick={() => go(lesson.step - 1)}>Back</button>
        <button className="btn-primary flex-1" onClick={() => { player.stop(); go(lesson.step + 1); }}>Continue</button>
      </div>}
    </div>
    {lesson.step >= steps.length - 1 && !(step.kind === "recall" && !shown) && <button className="btn-primary" onClick={finish}>Finish lesson</button>}


  </section>;
}

function ManualLesson({ lessonId, ayahs, lesson, onFinish, player }: { lessonId: string; ayahs: Ayah[]; lesson: LessonState; onFinish: () => void; player: ReturnType<typeof useRepeatPlayer> }) {
  const [fade, setFade] = useState<Record<string, 0 | 1 | 2 | 3>>({}); const [times, setTimes] = useState(3);
  const rate = (s: number, a: number, m: Mark) => update((d) => { const l = d.lessons?.[lessonId]; if (!l) return; l.results[finalKey(s, a)] = markWithAssistance(m, !!l.hinted[finalKey(s, a)]); l.updatedAt = Date.now(); });
  const rated = ayahs.filter(([s, a]) => lesson.results[finalKey(s, a)]).length;
  return <section className="flex flex-col gap-3">
    <div className="flex items-center gap-2"><Link href="/journey" className="btn btn-sm">Save &amp; exit</Link><div className="min-w-0 flex-1"><div className="truncate font-bold">{lesson.title}</div><div className="text-xs text-muted">Manual learning · {rated} of {ayahs.length} rated</div></div>
      <label className="text-sm text-muted">Repeat <select className="field ml-1 inline w-auto" value={times} onChange={(e) => setTimes(+e.target.value)}>{[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}×</option>)}</select></label></div>
    <button className="btn self-start" onClick={() => player.playing ? player.stop() : player.play(ayahs, 1)}>{player.playing ? "■ Stop" : "▶ Play all"}</button>
    {player.err && <p className="text-sm text-weak">{player.err}</p>}
    {ayahs.map(([s, a]) => { const key = `${s}:${a}`, f = fade[key] ?? 0, r = lesson.results[finalKey(s, a)]; return <div key={key} className="card flex flex-col gap-2">
      <AyahBlock units={[{ s, a, from: 0, to: words(s, a).length - 1, whole: true }]} fade={f} />
      <MapCue s={s} a={a} returnTo={`/learn?s=${ayahs[0][0]}&a=${ayahs[0][1]}&endS=${ayahs.at(-1)![0]}&endA=${ayahs.at(-1)![1]}${lesson.template === "recover" ? "&template=recover" : ""}`} recall onAssisted={() => update((d) => { const l = d.lessons?.[lessonId]; if (l) l.hinted[finalKey(s, a)] = true; })} />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => player.play([[s, a]], times)}>▶ ×{times}</button>
        <button className="btn btn-sm" onClick={() => setFade({ ...fade, [key]: ((f + 1) % 4) as 0 | 1 | 2 | 3 })}>{["Hide half", "First letters", "Hide all", "Show text"][f]}</button>
        {(["bad", "hes", "ok"] as Mark[]).map((m) => <button key={m} className={`btn btn-sm ${r === m ? "btn-on" : ""}`} onClick={() => rate(s, a, m)}>{MARK_LABEL[m]}</button>)}
      </div>
    </div>; })}
    <button className="btn-primary" disabled={!rated} onClick={onFinish}>Save my ratings ({rated}) and finish</button>
    <p className="text-xs text-muted">Rate an Ayah only after reciting it from memory with the text hidden. Unrated Ayahs are not added to your record.</p>
  </section>;
}

