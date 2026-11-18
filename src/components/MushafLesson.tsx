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
    // Tap the Ayah to begin its first guided step; never mark intervening Ayahs as learned.
    const next = steps.findIndex((st) => st.kind === "listen" && st.units.some((u) => u.s === s && u.a === a));
    if (next >= 0 && next !== stepIdx) { player.stop(); goStep(next); }
    return true;
  };

  // ------------------------------------------------------------ chooser (above the page)
  let chooser: ReactNode = null;
  // Page selection is sufficient. Tap an Ayah to begin at that Ayah, or press Start for the full page.
  if (o.enabled && !running && savedCount === null && !(lesson?.completedAt && portion)) {
    chooser = <section className="mushaf-lesson-chooser flex items-center gap-2 rounded-xl border border-line bg-surface p-2" aria-label="Learn this page">
      <span className="min-w-0 flex-1 text-sm">Page {page} · Tap an Ayah to learn it</span>
      <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => start()}>Start page</button>
    </section>;
  }

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
      panel = <section ref={(el) => { panelRef.current = el; }} data-compact={compact} className="mushaf-lesson-panel mushaf-lesson-compact card" aria-label="Manual lesson controls">
        <div className="lesson-compact-heading flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold">${sel ? `${sname(sel[0])} ${sel[1]}` : `Page ${page} · Tap an Ayah`}</span>
          <button type="button" className="btn btn-sm" aria-expanded={!compact} onClick={() => setCompact(!compact)}><ControlIcon name="settings" /> More</button>
        </div>
        {sel ? <>
          <div className="lesson-compact-actions grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-sm" onClick={() => player.playing ? player.stop() : player.play([sel], repeat)}><ControlIcon name={player.playing ? "pause" : "play"} /> ${player.playing ? "Stop" : `Listen ×${repeat}`}</button>
            <button type="button" className="btn btn-sm" onClick={() => setManualFade({ ...manualFade, [kk(sel)]: ((f + 1) % 4) as 0 | 1 | 2 | 3 })}><ControlIcon name="eye-off" /> ${["Hide half", "First letters", "Hide all", "Show text"][f]}</button>
          </div>
          <div className="lesson-dock-ratings grid grid-cols-3 gap-1.5">${(["bad", "hes", "ok"] as Mark[]).map((m) => <button key={m} type="button" className={`btn btn-sm !px-1 !text-xs ${r === m ? "btn-on" : ""}`} onClick={() => update((d) => { const l = d.lessons?.[meta.id]; if (!l) return; l.results[finalKey(sel[0], sel[1])] = m; l.updatedAt = Date.now(); })}>${MARK_LABEL[m]}</button>)}</div>
        </> : <button type="button" className="btn btn-sm" onClick={() => start(true)}>Restart guided lesson</button>}
        {!compact && <div className="lesson-dock-more flex flex-wrap items-center gap-2">
          <label className="text-xs">Repeat <select className="field !w-auto !py-1 text-sm" aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>${[1, 3, 5, 7, 10].map(n => <option key={n} value={n}>${n}×</option>)}</select></label>
          <button type="button" className="btn btn-sm" onClick={() => setVisibility(visibility === "full" ? "unlearned" : "full")}>${visibility === "full" ? "Hide rest" : "Show page"}</button>
          <Link className="btn btn-sm" href={reciteHref([{ s: sel?.[0] ?? portion[0][0], a: sel?.[1] ?? portion[0][1] }])}><ControlIcon name="mic" /> Microphone</Link>
          <button type="button" className="btn btn-sm" onClick={finish} disabled={!rated}>Save ratings (${rated})</button>
          ${exit}
        </div>}
        ${player.err && <p role="alert" className="text-xs text-weak">${player.err}</p>}
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
      panel = <section ref={(el) => { panelRef.current = el; }} data-compact={compact} className="mushaf-lesson-panel mushaf-lesson-compact card" aria-label="Guided learning controls" aria-live="polite">
        <div className="lesson-compact-heading flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs font-semibold">${activeAyah ? `${sname(activeAyah[0])} ${activeAyah[1]}` : cur ? `${sname(cur[0])} ${cur[1]}` : `Page ${page}`} <span className="text-muted">· ${act} · ${stepIdx + 1}/${steps.length}</span></div>
          <button type="button" className="btn btn-sm" aria-expanded={!compact} onClick={() => setCompact(!compact)}><ControlIcon name="settings" /> More</button>
        </div>
        <div className="lesson-compact-actions flex gap-2">
          {(step.kind === "listen" || step.kind === "read") && <button type="button" className="btn btn-sm flex-1" onClick={() => player.playing ? player.stop() : player.play(stepAyahs, repeat)}><ControlIcon name={player.playing ? "pause" : "play"} /> ${player.playing ? "Stop" : `Listen ×${repeat}`}</button>}
          {step.kind === "fade" && <button type="button" className="btn btn-sm flex-1" onClick={() => setFadeLevel((v) => v < 3 ? (v + 1) as 1 | 2 | 3 : 1)}><ControlIcon name="eye-off" /> ${fadeLevel === 3 ? "Show clues" : "Hide more"}</button>}
          {canRecall && !shown && <>
            ${hintsAllowed && <button type="button" className="btn btn-sm flex-1" disabled={reveal >= limit} onClick={() => setReveal((v) => Math.min(v + 1, limit))}>Hint</button>}
            <button type="button" className="btn-primary btn-sm flex-1" onClick={() => setShown(true)}><ControlIcon name="eye" /> Check</button>
          </>}
          {prep && <button type="button" className="btn-primary btn-sm flex-1" onClick={() => { player.stop(); goStep(stepIdx + 1); }}>Next <ControlIcon name="arrow-right" /></button>}
          {allRated && <button type="button" className="btn-primary btn-sm flex-1" onClick={finish}>Finish & save</button>}
        </div>
        {canRecall && shown && <div className="lesson-dock-ratings grid grid-cols-3 gap-1.5">${(["bad","hes","ok"] as Mark[]).map(m => <button type="button" key={m} className={`btn btn-sm !px-1 !text-xs ${m === "bad" ? "!border-weak !text-weak" : m === "hes" ? "!border-revise !text-revise" : "!border-strong !text-strong"}`} onClick={() => rate(m)}>${MARK_LABEL[m]}</button>)}</div>}
        {!compact && <div className="lesson-dock-more flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <label className="text-xs">Repeat <select className="field !w-auto !py-1 text-sm" aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>${[1,3,5,7,10].map(n => <option value={n} key={n}>${n}×</option>)}</select></label>
          <button type="button" className="btn btn-sm" onClick={() => setVisibility(visibility === "full" ? "unlearned" : "full")}>${visibility === "full" ? "Hide rest" : "Show page"}</button>
          <button type="button" className="btn btn-sm" disabled={stepIdx === 0} onClick={() => goStep(stepIdx - 1)}>Back</button>
          ${prep && <button type="button" className="btn btn-sm" onClick={() => goStep(nextRecallStep(steps, stepIdx))}>Skip preparation</button>}
          ${canRecall && <Link className="btn btn-sm" href={reciteHref(units)}><ControlIcon name="mic" /> Microphone</Link>}
          ${prep && <button type="button" className="btn btn-sm" onClick={() => setShowMeaning(v => !v)}>Meaning</button>}
          ${prep && matchedJuz && <Link className="btn btn-sm" href={visualMapHref}>Memory map</Link>}
          ${exit}
          <p className="w-full text-xs text-muted">${step.instruction}</p>
          ${showMeaning && "units" in step && <Meaning units={step.units} />}
        </div>}
        ${player.err && <p role="alert" className="text-xs text-weak">${player.err}</p>}
      </section>;
    }
  }
  return { view, onTap, chooser, panel, running };
}
