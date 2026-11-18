"use client";
// Guided Ayah-by-Ayah learning on the Mushaf page (UX Stage 2).
// Reuses the existing lesson engine: buildSteps() for the method, LessonState in the store for progress/resume
// (same lesson ids as /learn), finishLesson() for the one-time evidence save. The Mushaf page draws the words;
// this hook supplies (a) how each word looks for the current step and (b) the compact teaching panel.
import { scrollMotion } from "@/lib/readerMode";
import ControlIcon from "@/components/ControlIcon";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MapCue from "@/components/MapCue";
import MethodIntro from "@/components/MethodIntro";
import { Meaning, useRepeatPlayer } from "@/components/LessonPlayer";
import { SaveLine } from "@/components/SaveStatus";
import type { Ayah, Unit } from "@/lib/chunking";
import { buildSteps, finalKey, newLesson, type Level, type Step } from "@/lib/lesson";
import { finishLesson } from "@/lib/lessonFinish";
import { activity, applyTextVisibility, finalCursor, hintLimit, manualWordView, nextRecallStep, portionLesson, wordView, type TextVisibility, type WordView } from "@/lib/mushafLesson";
import { juzOf, ref, sname, words } from "@/lib/quran";
import { ACTIVE_RECALL_PDF_KEY, listRefPdfs, PENDING_RECALL_PDF_KEY, REFERENCE_JUZ } from "@/lib/refPdfs";
import { referenceJuzForAyah, referenceMapHref } from "@/lib/refPdfLearn";
import { update, useStore, type LessonState } from "@/lib/store";

type Mark = "ok" | "hes" | "bad";
const MARK_LABEL: Record<Mark, string> = { ok: "Recited correctly", hes: "Needed help", bad: "Could not recall" };
type Portion = "first" | "second" | "page";

export type MushafLessonApi = {
  /** Word appearance for the running lesson, or null when no lesson is running (normal page). */
  view: ((s: number, a: number, w: number) => WordView) | null;
  /** Tap on a word while a lesson runs (manual: select the Ayah). Returns true if handled. */
  onTap: (s: number, a: number) => boolean;
  chooser: ReactNode;   // portion chooser / start card, shown above the page
  panel: ReactNode;     // teaching panel, shown below the page in place of the page controls
  running: boolean;
};

export function useMushafLesson(o: {
  enabled: boolean; page: number; pageAyahs: Ayah[]; halves: { first: Ayah[]; second: Ayah[] };
  from: string | null; to: string | null; portionParam: string | null; pathId?: string;
  setPortion: (p: { from: string; to: string } | null) => void; returnUrl: string;
}): MushafLessonApi {
  const st = useStore(); const player = useRepeatPlayer();
  const { page, pageAyahs, halves } = o;
  const kk = (x: Ayah) => `${x[0]}:${x[1]}`;
  // Selected portion: explicit from/to, or ?portion=page|first|second (from Home/Journey links).
  const portion: Ayah[] | null = useMemo(() => {
    if (!o.enabled) return null;
    if (o.from && o.to) {
      const i = pageAyahs.findIndex((x) => kk(x) === o.from), j = pageAyahs.findIndex((x) => kk(x) === o.to);
      return i >= 0 && j >= i ? pageAyahs.slice(i, j + 1) : null;
    }
    if (o.portionParam === "page") return pageAyahs;
    if (o.portionParam === "first" && halves.second.length) return halves.first;
    if (o.portionParam === "second" && halves.second.length) return halves.second;
    return pageAyahs; // A chosen page is ready immediately; no extra portion chooser.
  }, [o.enabled, o.from, o.to, o.portionParam, pageAyahs, halves]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = portion ? portionLesson(page, pageAyahs, portion, "learn", (id) => !!st.lessons?.[id]) : null;
  const lesson = meta ? st.lessons?.[meta.id] : undefined;
  const [mode, setMode] = useState<LessonState["mode"]>("guided");
  const [level, setLevel] = useState<Level>(st.tutor?.level ?? "guided");
  const [repeat, setRepeatState] = useState([1,3,5,7,10].includes(st.tutor?.repeat ?? 3) ? st.tutor!.repeat : 3);
  const visibility: TextVisibility = st.tutor?.visibility ?? "full";
  const setVisibility = (value: TextVisibility) => update((d) => { d.tutor = { ...(d.tutor || { mode: "guided", level: "guided", portion: "page", repeat: 3, updatedAt: 0 }), visibility: value, updatedAt: Date.now() }; });
  const setRepeat = (n: number) => { if (![1,3,5,7,10].includes(n)) return; player.stop(); setRepeatState(n); update((d) => { d.tutor = { ...(d.tutor || { mode: "guided", level: "guided", portion: "page", repeat: 3, updatedAt: 0 }), repeat: n, updatedAt: Date.now() }; }); };
  const [shown, setShown] = useState(false); const [reveal, setReveal] = useState(0); const [fadeLevel, setFadeLevel] = useState<1 | 2 | 3>(1);
  const [savedCount, setSavedCount] = useState<number | null>(null); const [showMethod, setShowMethod] = useState(false); const [showMeaning, setShowMeaning] = useState(false);
  const running = !!(lesson && portion && !lesson.completedAt && savedCount === null);
  const [manualSel, setManualSel] = useState<Ayah | null>(null); const [manualFade, setManualFade] = useState<Record<string, 0 | 1 | 2 | 3>>({});
  const [availableRefJuz, setAvailableRefJuz] = useState<number[]>([]); const [pdfAssistedStep, setPdfAssistedStep] = useState(false);
  const steps = useMemo<Step[]>(() => lesson && portion ? buildSteps(portion, lesson.level, lesson.template) : [], [portion, lesson?.level, lesson?.template]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepIdx = lesson ? Math.min(lesson.step, Math.max(0, steps.length - 1)) : 0;
  const step = lesson && lesson.mode === "guided" && !lesson.completedAt ? steps[stepIdx] : undefined;
  const prep = !!step && (step.kind === "listen" || step.kind === "read" || step.kind === "fade");
  const activeAyah = step && portion ? portion[Math.max(0, Math.min(portion.length - 1, step.ayahIndex - 1))] : null;
  const visualJuz = prep && activeAyah ? juzOf(activeAyah[0], activeAyah[1]) : null;
  const cursor = portion && lesson ? finalCursor(portion, lesson.results) : 0;
  // A fresh step (or the next Ayah in the page test) starts hidden with no hints.
  useEffect(() => { setShown(false); setReveal(0); setFadeLevel(1); setShowMeaning(false); player.stop(); }, [meta?.id, stepIdx, cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSavedCount(null); setManualSel(null); setManualFade({}); }, [meta?.id]);
  // Compact panel (default on narrow screens): instruction and notes collapse; every action stays. Remembered per device.
  const [compact, setCompactState] = useState(true); // Always start with only the primary commands visible.
  const setCompact = (v: boolean) => setCompactState(v);
  const panelRef = useRef<HTMLElement | null>(null);
  // A tap outside the instruction window collapses optional controls, keeping the lesson running.
  useEffect(() => {
    if (!running) return;
    const collapseOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".mushaf-lesson-panel")) return;
      setCompactState(true);
      setShowMeaning(false);
    };
    document.addEventListener("pointerdown", collapseOnOutside);
    return () => document.removeEventListener("pointerdown", collapseOnOutside);
  }, [running]);
  // Keep the active passage visible in the space ABOVE the panel (not just the screen centre, which the panel may cover).
  useEffect(() => {
    if (!step && !manualSel) return;
    let t = 0;
    const keepActiveVisible = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
      const acts = document.querySelectorAll<HTMLElement>(".mpage .act"); if (!acts.length) return;
      const top = Math.min(...[...acts].map((e) => e.getBoundingClientRect().top)), bottom = Math.max(...[...acts].map((e) => e.getBoundingClientRect().bottom));
      const shell = document.querySelector<HTMLElement>(".mushaf-page-shell");
      const phoneLayout = window.matchMedia("(max-width: 820px), (max-height: 480px) and (max-width: 1000px)").matches && running;
      const bounds = phoneLayout && shell ? shell.getBoundingClientRect() : null;
      const limitTop = bounds ? bounds.top + 8 : 8;
      const limitBottom = Math.min(bounds?.bottom ?? window.innerHeight, panelRef.current?.getBoundingClientRect().top ?? window.innerHeight) - 8;
      if (top >= limitTop && bottom <= limitBottom) return;
      const delta = bottom - top > limitBottom - limitTop ? top - limitTop : (top + bottom) / 2 - (limitTop + limitBottom) / 2;
      if (phoneLayout && shell) shell.scrollBy({ top: delta, behavior: scrollMotion() });
      else window.scrollBy({ top: delta, behavior: scrollMotion() });
      }, 120);
    };
    keepActiveVisible();
    const ro = new ResizeObserver(keepActiveVisible);
    const shell = document.querySelector(".mushaf-page-shell");
    const dock = panelRef.current;
    if (shell) ro.observe(shell);
    if (dock) ro.observe(dock);
    window.addEventListener("resize", keepActiveVisible, { passive: true });
    return () => { window.clearTimeout(t); ro.disconnect(); window.removeEventListener("resize", keepActiveVisible); };
  }, [step, cursor, compact, manualSel, running]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.toggle("guided-mushaf-lesson", running);
    return () => document.documentElement.classList.remove("guided-mushaf-lesson");
  }, [running]);
  useEffect(() => {
    let live = true;
    if (!visualJuz || !REFERENCE_JUZ.some((item) => item.juz === visualJuz)) { setAvailableRefJuz([]); return; }
    listRefPdfs().then((pdfs) => { if (live) setAvailableRefJuz(pdfs.map((pdf) => pdf.juz)); }).catch(() => { if (live) setAvailableRefJuz([]); });
    return () => { live = false; };
  }, [visualJuz]);
  useEffect(() => {
    if (!running || !lesson || !meta || !step || step.kind !== "recall") {
      try { sessionStorage.removeItem(ACTIVE_RECALL_PDF_KEY); } catch { /* session storage can be unavailable */ }
      setPdfAssistedStep(false); return;
    }
    const context = { lessonId: meta.id, step: stepIdx, at: Date.now() };
    try {
      sessionStorage.setItem(ACTIVE_RECALL_PDF_KEY, JSON.stringify(context));
      const pending = JSON.parse(sessionStorage.getItem(PENDING_RECALL_PDF_KEY) || "null") as typeof context | null;
      const assisted = pending?.lessonId === context.lessonId && pending.step === context.step && Date.now() - pending.at < 30 * 60_000;
      setPdfAssistedStep(!!assisted);
      if (assisted) sessionStorage.removeItem(PENDING_RECALL_PDF_KEY);
    } catch { setPdfAssistedStep(false); }
  }, [running, lesson?.id, meta?.id, step?.kind, stepIdx]);
  const patch = (fn: (l: LessonState) => void) => update((d) => { const l = meta && d.lessons?.[meta.id]; if (!l) return; fn(l); l.updatedAt = Date.now(); });
  const goStep = (n: number) => patch((l) => { l.step = Math.max(0, Math.min(steps.length - 1, n)); });
  const start = (restart = false, at?: Ayah) => { if (!meta || !portion) return; update((d) => {
    d.lessons ||= {}; if (restart || !d.lessons[meta.id] || d.lessons[meta.id].completedAt) d.lessons[meta.id] = newLesson("learn", meta.unit, meta.title, "guided", level, Date.now(), o.pathId);
    if (at) { const first = buildSteps(portion, level).findIndex((step) => step.kind === "listen" && step.units.some((u) => u.s === at[0] && u.a === at[1])); if (first >= 0) d.lessons[meta.id].step = first; }
    d.tutor = { ...(d.tutor || { mode, level, portion: "page", repeat, updatedAt: 0 }), mode, level, portion: portion && portion.length < pageAyahs.length ? "half_page" : "page", updatedAt: Date.now() };
  }); setSavedCount(null); };
  const finish = () => { if (!meta || !portion) return; let n = 0; update((d) => { n = finishLesson(d, meta.id, portion, meta.unit, "learn", o.pathId ?? d.lessons?.[meta.id]?.pathId); }); setSavedCount(n); player.stop(); };

  const rate = (m: Mark) => {
    if (!lesson || !step || step.kind !== "recall" || !portion) return;
    const i = stepIdx;
    if (step.scope === "page") {
      const x = portion[cursor]; if (!x) return;
      patch((l) => { l.results[finalKey(x[0], x[1])] = m; if (reveal > 0 || pdfAssistedStep) l.hinted[finalKey(x[0], x[1])] = true; });
      if (cursor + 1 >= portion.length) goStep(i + 1);
      return;
    }
    patch((l) => { l.results[`step:${i}`] = m; if (reveal > 0 || pdfAssistedStep) l.hinted[`step:${i}`] = true; });
    if (m === "bad" && !lesson.results[`retry:${i}`]) { const back = steps.slice(0, i).map((s, j) => [s, j] as const).reverse().find(([s]) => s.kind === "listen"); patch((l) => { l.results[`retry:${i}`] = "bad"; }); if (back) { goStep(back[1]); return; } }
    goStep(i + 1);
  };

  const view = useMemo(() => {
    if (!running || !lesson || !portion) return null;
    if (lesson.mode === "manual") {
      const idx = manualSel ? portion.findIndex((x) => x[0] === manualSel[0] && x[1] === manualSel[1]) : 0;
      const manualStep: Step = { kind: "read", units: manualSel ? [{ s: manualSel[0], a: manualSel[1], from: 0, to: words(manualSel[0], manualSel[1]).length - 1, whole: true }] : [], label: "Manual", instruction: "Manual learning", phase: "learn", ayahIndex: idx + 1, ayahCount: portion.length };
      return (s: number, a: number, w: number) => applyTextVisibility(manualWordView(manualFade, manualSel, s, a, w), visibility, portion, manualStep, s, a, w);
    }
    if (!step) return null;
    const ctx = { lessonAyahs: portion, results: lesson.results, shown, reveal, fadeLevel };
    return (s: number, a: number, w: number) => applyTextVisibility(wordView(step, ctx, s, a, w), visibility, portion, step, s, a, w, step.kind === "recall" && step.scope === "page" ? portion[cursor] : null);
  }, [running, lesson, portion, step, shown, reveal, fadeLevel, manualFade, manualSel, visibility, cursor]);
  const onTap = (s: number, a: number) => {
    if (!o.enabled || !pageAyahs.some(([ps, pa]) => ps === s && pa === a)) return false;
    if (!running) { if (!lesson?.completedAt) start(false, [s,a]); else start(true, [s,a]); return true; }
    if (lesson?.mode === "manual") { if (portion?.some((x) => x[0] === s && x[1] === a)) setManualSel([s, a]); return true; }
    return true; // guided: taps never open translations or reveal anything mid-step
  };

  // ------------------------------------------------------------ chooser (above the page)
  const half = (label: string, xs: Ayah[], p: Portion) => <button key={p} aria-pressed={!!(portion && portion.length === xs.length && kk(portion[0]) === kk(xs[0]))} className={`btn btn-sm !min-h-[52px] flex-col !items-start justify-center text-left leading-tight ${portion && portion.length === xs.length && kk(portion[0]) === kk(xs[0]) ? "btn-on" : ""}`} onClick={() => o.setPortion({ from: kk(xs[0]), to: kk(xs[xs.length - 1]) })}>
    <span><b>{label}</b><br /><span className="text-xs text-muted">{xs.length} ayah{xs.length === 1 ? "" : "s"}{lessonBadge(xs)}</span></span></button>;
  const lessonBadge = (xs: Ayah[]) => { const l = st.lessons?.[portionLesson(page, pageAyahs, xs, "learn", (id) => !!st.lessons?.[id]).id]; return !l ? "" : l.completedAt ? " · learned" : ` · in progress (step ${l.step + 1})`; };
  let chooser: ReactNode = null;
  // Compact chooser so the page stays close: portion on one row, one Start button, options collapsed.
  if (o.enabled && !running && savedCount === null && !(lesson?.completedAt && portion)) chooser = <section className="mushaf-lesson-chooser card flex flex-col gap-2 !py-3" aria-label="Learn this page">
    <b>Learn page {page}</b>
    <div className={`grid gap-2 ${halves.second.length > 0 ? "grid-cols-3" : "grid-cols-1"}`}>
      {halves.second.length > 0 && half("First half", halves.first, "first")}
      {halves.second.length > 0 && half("Second half", halves.second, "second")}
      {half("Whole page", pageAyahs, "page")}
    </div>
    {portion && meta && !lesson && <>
      <button className="btn-primary" onClick={() => start()}>Start {mode === "guided" ? "guided" : "manual"} lesson · {portion.length} ayah{portion.length === 1 ? "" : "s"}</button>
      <details className="text-sm"><summary className="cursor-pointer font-semibold text-accent">Lesson options</summary>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How do you want to learn?">
            {([["guided", "Guided"], ["manual", "Manual"]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={mode === v} className={`btn btn-sm ${mode === v ? "btn-on" : ""}`} onClick={() => setMode(v)}>{l}</button>)}
            {mode === "guided" && <select className="field !w-auto !py-1 text-sm" aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value as Level)}><option value="guided">Guided level · most help</option><option value="standard">Standard level</option><option value="challenge">Challenge · no hints</option></select>}
          </div>
          <p className="text-xs text-muted">{mode === "guided" ? "Listen → understand → repeat → hide → recall each Ayah, joining 1–2, 1–3 … then a full recitation. Only that final recitation is saved to your Hifz record." : "Tap an Ayah on the page, then play, hide and rate it yourself. Only Ayahs you rate are saved."}</p>
          {halves.second.length > 0 && <p className="text-xs text-muted">Halves split at the first Ayah that starts on line 8 or later of the 15 lines, so a half is never cut mid-Ayah.</p>}
          <button className="self-start text-sm underline" onClick={() => setShowMethod((v) => !v)}>How this method works</button>
        </div>
      </details>
    </>}
    {showMethod && <MethodIntro onClose={() => setShowMethod(false)} />}
  </section>;

  // ------------------------------------------------------------ finished
  let panel: ReactNode = null;
  if (o.enabled && portion && meta && lesson && (lesson.completedAt || savedCount !== null)) {
    const nextHalf = halves.second.length && kk(portion[0]) === kk(halves.first[0]) && portion.length === halves.first.length ? halves.second : null;
    chooser = <section className="card flex flex-col gap-2" aria-live="polite">
      <b>Lesson complete · {meta.title}</b>
      <SaveLine />
      <p className="text-sm">{(savedCount ?? 0) > 0 || lesson.savedToHifz ? "Your final recitation ratings were added to your Hifz record and scheduled for revision." : "No final ratings were given, so nothing was added to your Hifz record."}</p>
      <ul className="text-sm text-muted">{portion.map(([s, a]) => { const r = lesson.results[finalKey(s, a)]; return r ? <li key={`${s}:${a}`}>{ref(s, a)} · {MARK_LABEL[r]}{r === "ok" && lesson.hinted[finalKey(s, a)] ? " (hint used → counted as needed help)" : ""}</li> : null; })}</ul>
      <div className="flex flex-wrap gap-2">
        {nextHalf && <button className="btn-primary" onClick={() => o.setPortion({ from: kk(nextHalf[0]), to: kk(nextHalf[nextHalf.length - 1]) })}>Learn the second half</button>}
        <button className="btn" onClick={() => start(true)}>Learn again</button>
        <button className="btn" onClick={() => o.setPortion(null)}>Choose another portion</button>
      </div>
    </section>;
  }

  // ------------------------------------------------------------ teaching panel (running)
  if (running && lesson && portion && meta) {
    const exit = <button className="btn btn-sm" onClick={() => { player.stop(); o.setPortion(null); }} title="Your place is saved after every step">Save &amp; exit</button>;
    const reciteHref = (units: { s: number; a: number }[]) => `/recite?s=${units[0].s}&a=${units[0].a}&endS=${units[units.length - 1].s}&endA=${units[units.length - 1].a}&return=${encodeURIComponent(o.returnUrl)}`;
    if (lesson.mode === "manual") {
      const rated = portion.filter(([s, a]) => lesson.results[finalKey(s, a)]).length;
      const sel = manualSel; const f = sel ? manualFade[kk(sel)] | 0 : 0; const r = sel ? lesson.results[finalKey(sel[0], sel[1])] : undefined;
      panel = <section ref={(el) => { panelRef.current = el; }} data-compact={compact} data-moved={floatingDock.moved} style={floatingDock.style} className={`mushaf-lesson-panel card sticky bottom-[72px] z-10 flex max-h-[45vh] flex-col overflow-y-auto overscroll-contain lg:bottom-4 ${compact ? "gap-1.5 !p-2.5" : "gap-2"}`} aria-label="Manual learning" aria-live="polite">
        <div className="lesson-dock-header flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-xs font-bold uppercase tracking-wide text-accent">Manual learning</div><div className="truncate text-sm font-semibold">{meta.title} · {rated} of {portion.length} rated</div></div><div className="flex shrink-0 flex-wrap gap-1"><button type="button" className="btn btn-sm" {...floatingDock.handle}><ControlIcon name="pin" /> Move</button>{floatingDock.moved && <button type="button" className="btn btn-sm" onClick={floatingDock.reset}>Reset</button>}<button className="btn btn-sm" aria-expanded={!compact} aria-label={compact ? "Expand lesson controls" : "Collapse lesson controls"} onClick={() => setCompact(!compact)}><ControlIcon name={compact ? "chevron-down" : "chevron-up"} /> {compact ? "Expand" : "Collapse"}</button>{exit}</div></div>
        <button type="button" className={`btn btn-sm self-start ${visibility === "full" ? "" : "btn-on"}`} aria-pressed={visibility !== "full"} onClick={() => setVisibility(visibility === "full" ? "unlearned" : "full")}>{visibility === "full" ? "Hide rest of page" : "Show full page"}</button><details className="text-xs"><summary className="cursor-pointer font-semibold text-muted">Display options</summary><label className="mt-2 flex flex-wrap items-center gap-2 text-sm">Text visibility<select className="field !w-auto !min-w-0 !py-1 text-sm" aria-label="Text visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as TextVisibility)}><option value="full">Show full page</option><option value="unlearned">Hide unlearned Ayahs</option><option value="current">Current Ayah only</option></select></label></details>
        <div className="lesson-dock-active text-sm"><b>{sel ? `${sname(sel[0])} ${sel[1]}` : "Choose an Ayah"}</b></div>
        {!sel ? <p className="lesson-dock-instruction text-sm text-muted">Tap an Ayah on the page to work on it.</p> : <>
          <p className="text-sm"><b>{sname(sel[0])} {sel[1]}</b>{r ? ` · ${MARK_LABEL[r]}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => player.playing ? player.stop() : player.play([sel], repeat)}>{player.playing ? "■ Stop" : `▶ ×${repeat}`}</button>
            <select className="field !w-auto !py-1 text-sm" aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(+e.target.value)}>{[1, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}×</option>)}</select>
            <button className="btn btn-sm" onClick={() => setManualFade({ ...manualFade, [kk(sel)]: ((f + 1) % 4) as 0 | 1 | 2 | 3 })}>{["Hide half", "First letters", "Hide all", "Show text"][f]}</button>
            <Link className="btn btn-sm" href={reciteHref([{ s: sel[0], a: sel[1] }])}>Check with microphone</Link>
          </div>
          <div className="lesson-dock-ratings grid grid-cols-3 gap-2">{(["bad", "hes", "ok"] as Mark[]).map((m) => <button key={m} className={`btn btn-sm ${r === m ? "btn-on" : ""}`} onClick={() => update((d) => { const l = d.lessons?.[meta.id]; if (!l) return; l.results[finalKey(sel[0], sel[1])] = m; l.updatedAt = Date.now(); })}>{MARK_LABEL[m]}</button>)}</div>
        </>}
        {player.err && <p className="text-sm text-weak">{player.err}</p>}
        <button className="btn-primary" disabled={!rated} onClick={finish}>Save my ratings ({rated}) and finish</button>
        {!compact && <p className="text-xs text-muted">Rate an Ayah only after reciting it with the text hidden. Unrated Ayahs are not added to your record.</p>}
      </section>;
    } else if (step) {
      const act = activity(step); const isFinal = step.kind === "recall" && step.scope === "page";
      const cur = isFinal ? portion[cursor] : null;
      const units: Unit[] = isFinal && cur ? [{ s: cur[0], a: cur[1], from: 0, to: words(cur[0], cur[1]).length - 1, whole: true }] : "units" in step ? step.units : [];
      const stepAyahs: Ayah[] = [...new Map(units.map((u) => [`${u.s}:${u.a}`, [u.s, u.a] as Ayah])).values()];
      const limit = hintLimit(step, { lessonAyahs: portion, results: lesson.results }, (s, a) => words(s, a).length);
      const hintsAllowed = lesson.level !== "challenge";
      const allRated = cursor >= portion.length;
      const canRecall = step.kind === "recall" && (!isFinal || !!cur);
      const pct = Math.round(((stepIdx + 1) / steps.length) * 100);
      const partial = units.some((u) => !u.whole);
      const prep = step.kind === "listen" || step.kind === "read" || step.kind === "fade";
      const matchedJuz = activeAyah ? referenceJuzForAyah(activeAyah[0], activeAyah[1], availableRefJuz) : null;
      const visualMapHref = matchedJuz ? referenceMapHref(matchedJuz, o.returnUrl) : "";
      panel = <section ref={(el) => { panelRef.current = el; }} data-compact={compact} data-moved={floatingDock.moved} style={floatingDock.style} className={`mushaf-lesson-panel card sticky bottom-[72px] z-10 flex max-h-[45vh] flex-col overflow-y-auto overscroll-contain lg:bottom-4 ${compact ? "gap-1.5 !p-2.5" : "gap-2"}`} aria-label="Lesson" aria-live="polite">
        <div className="lesson-dock-header flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="text-xs font-bold uppercase tracking-wide text-accent">{act}{isFinal && cur ? ` · ${cursor + 1} of ${portion.length}` : ` · Ayah ${step.ayahIndex} of ${step.ayahCount}`}</div>
            <div className="truncate text-xs text-muted">{meta.title} · step {stepIdx + 1} of {steps.length}</div></div>
          <div className="flex shrink-0 flex-wrap gap-1"><button type="button" className="btn btn-sm" {...floatingDock.handle}><ControlIcon name="pin" /> Move</button>{floatingDock.moved && <button type="button" className="btn btn-sm" onClick={floatingDock.reset}>Reset</button>}<button className="btn btn-sm" aria-expanded={!compact} aria-label={compact ? "Expand lesson controls" : "Collapse lesson controls"} onClick={() => setCompact(!compact)}><ControlIcon name={compact ? "chevron-down" : "chevron-up"} /> {compact ? "Expand" : "Collapse"}</button>{exit}</div>
        </div>
        <div className="lesson-dock-active flex items-center justify-between gap-2 text-sm"><b>{activeAyah ? `${sname(activeAyah[0])} ${activeAyah[1]}` : isFinal && cur ? `${sname(cur[0])} ${cur[1]}` : `Ayah ${step.ayahIndex}`}</b><span className="text-xs text-muted">{stepIdx + 1} / {steps.length}</span></div>
        <div className="lesson-dock-progress h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Lesson progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
        <button type="button" className={`btn btn-sm self-start ${visibility === "full" ? "" : "btn-on"}`} aria-pressed={visibility !== "full"} onClick={() => setVisibility(visibility === "full" ? "unlearned" : "full")}>{visibility === "full" ? "Hide rest of page" : "Show full page"}</button><details className="text-xs"><summary className="cursor-pointer font-semibold text-muted">Display options</summary><label className="mt-2 flex flex-wrap items-center gap-2 text-sm">Text visibility<select className="field !w-auto !min-w-0 !py-1 text-sm" aria-label="Text visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as TextVisibility)}><option value="full">Show full page</option><option value="unlearned">Hide unlearned Ayahs</option><option value="current">Current Ayah only</option></select></label></details>
        {compact && <p className="lesson-dock-instruction truncate text-sm font-semibold" title={step.instruction}>{isFinal && cur ? `Page test · ${ref(cur[0], cur[1])}: recite, show, rate.` : step.instruction}</p>}
        {!compact && <p className="lesson-dock-instruction text-sm font-semibold leading-snug">{isFinal && cur ? `Page test · ${ref(cur[0], cur[1])}: recite it without looking, then show it and rate yourself honestly. Only this test is saved.` : step.instruction}</p>}

        {(step.kind === "listen" || step.kind === "read") && <div className="lesson-audio-controls flex flex-wrap items-center gap-2">
          <button className="btn btn-sm" onClick={() => player.playing ? player.stop() : player.play(stepAyahs, repeat)}>{player.playing ? "■ Stop" : `▶ Listen ×${repeat}`}</button>
          <select className="field !w-auto !py-1 text-sm" aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(+e.target.value)}>{[1, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}×</option>)}</select>
          <button className="btn btn-sm" aria-expanded={showMeaning} onClick={() => { setShowMeaning((v) => !v); if (compact) setCompact(false); }}>Meaning</button>
          {partial && !compact && <span className="text-xs text-muted">Audio plays the whole Ayah.</span>}
        </div>}
        {showMeaning && "units" in step && <><Meaning units={step.units} />{stepAyahs.slice(0, 1).map(([s, a]) => <MapCue key={`${s}:${a}`} s={s} a={a} />)}</>}
        {prep && matchedJuz && <Link className="btn btn-sm self-start" href={visualMapHref} aria-label={`View Juz ${matchedJuz} Mind Map for ${ref(activeAyah![0], activeAyah![1])}`}>Visual Memory Map · View Juz Mind Map</Link>}
        {player.err && <p className="text-sm text-weak">{player.err}</p>}
        {step.kind === "fade" && step.fade === 1 && <div className="flex flex-wrap items-center gap-2"><span className={`text-sm text-muted ${compact ? "sr-only" : ""}`}>{fadeLevel === 1 ? "Half the words are hidden." : fadeLevel === 2 ? "Only first letters are shown." : "All words are hidden."}</span>{fadeLevel < 3 && <button className="btn btn-sm" onClick={() => setFadeLevel((f) => (f + 1) as 1 | 2 | 3)}>Hide more</button>}</div>}

        {canRecall && !shown && <div className="lesson-recall-actions flex flex-wrap gap-2">
          {hintsAllowed && <button className="btn btn-sm" disabled={reveal >= limit} onClick={() => setReveal((r) => Math.min(r + 1, limit))}>Hint: next word</button>}
          <button className="btn-primary btn-sm" onClick={() => setShown(true)}>I have recited it · show</button>
          <Link className="btn btn-sm" href={reciteHref(units)}>Check with microphone</Link>
        </div>}
        {!compact && canRecall && !shown && partial && <p className="text-xs text-muted">The microphone checks whole Ayahs, so it will check all of {stepAyahs.map((x) => ref(x[0], x[1])).join(", ")}, not only this part.</p>}
        {canRecall && shown && <>
          {!compact && <p className="text-xs text-muted">Compare with the page. {reveal > 0 ? "You used a hint, so a correct recitation counts as needing help. " : ""}{isFinal ? "Final rating: saved when you finish." : "Practice rating: kept in this lesson only."}</p>}
          <div className="lesson-dock-ratings grid grid-cols-3 gap-2">{(["bad", "hes", "ok"] as Mark[]).map((m) => <button key={m} className={`btn btn-sm ${m === "bad" ? "!border-weak !text-weak" : m === "hes" ? "!border-revise !text-revise" : "!border-strong !text-strong"}`} onClick={() => rate(m)}>{MARK_LABEL[m]}</button>)}</div>
        </>}

        <div className="lesson-dock-primary flex gap-2">
          <button className="btn btn-sm" disabled={stepIdx === 0} onClick={() => goStep(stepIdx - 1)}>Back</button>
          {prep && <button className="btn btn-sm" title="Skipped steps are never counted as memorized" onClick={() => goStep(nextRecallStep(steps, stepIdx))}>Skip preparation</button>}
          {prep && <button className="btn-primary btn-sm flex-1" onClick={() => { player.stop(); goStep(stepIdx + 1); }}>Next</button>}
          {allRated && <button className="btn-primary btn-sm flex-1" onClick={finish}>Finish &amp; save</button>}
        </div>
      </section>;
    }
  }
  return { view, onTap, chooser, panel, running };
}
