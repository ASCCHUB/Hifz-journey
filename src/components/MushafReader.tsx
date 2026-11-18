"use client";
// The mushaf: 604 pages in the Madinah 15-line layout, with zoom, search, bookmarks, audio and a memorize mode.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AyahSheet from "@/components/AyahSheet";
import AyahQuickSheet from "@/components/AyahQuickSheet";
import { LONG_PRESS_MS, LongPress, quickAccess } from "@/lib/ayahQuick";
import { useAudio } from "@/components/Audio";
import Practice from "@/components/Practice";
import SearchDialog from "@/components/SearchDialog";
import LocationNavigator from "@/components/LocationNavigator";
import { arNum, isValidAyah, juzOf, key, pageContent, pageOf, Q, ref, sarabic, sname, text } from "@/lib/quran";
import { readerBackAction, scrollMotion } from "@/lib/readerMode";
import ControlIcon from "@/components/ControlIcon";
import { addHist, logAdd, markRead, today, update, useStore } from "@/lib/store";
import Link from "next/link";
import { SaveLine } from "@/components/SaveStatus";
import type { Mark, PracticeKind } from "@/lib/hifz";
import { useMushafLesson } from "@/components/MushafLesson";
import { headOf } from "@/lib/mushafLesson";
import { pageHalves, parsePageAyahSelection, savePageRecall, type RecallHelp, type RecallRatings } from "@/lib/pageRecall";
import MushafRecitation from "@/components/MushafRecitation";
import ReciteToggle, { keepAboveDock } from "@/components/ReciteToggle";
import SimilarSheet, { SimilarButton } from "@/components/SimilarAyahs";
import { matchesFor } from "@/lib/mutashabihat";
import { AyahList, useLearnView, ViewSwitch, type WordState } from "@/components/LearnView";

type Fit = { id: string; font: number };
type Mode = "read" | "learn" | "recall";
const MARK_LABEL: Record<Mark, string> = { ok: "Recited correctly", hes: "Needed help", bad: "Could not recall" };

function MushafView({ reciteLanding = false }: { reciteLanding?: boolean }) {
  const router = useRouter(); const params = useSearchParams(); const st = useStore(); const audio = useAudio();
  const [readDockOpen, setReadDockOpen] = useState(false);
  const [recallExtras, setRecallExtras] = useState(false);
  const queryS = Number(params.get("s")), queryA = Number(params.get("a"));
  const deepLink = params.has("s") && params.has("a") && isValidAyah(Q(), queryS, queryA);
  const pg = deepLink ? pageOf(queryS, queryA) : Math.min(604, Math.max(1, parseInt(params.get("p") || "", 10) || st.lastPage || 1));
  const c = useMemo(() => pageContent(pg), [pg]);
  const zoom = st.settings.zoom || 1;
  const [mem, setMem] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [reciteHidden, setReciteHidden] = useState(false);
  const [ptr, setPtr] = useState(0); const [miss, setMiss] = useState<Record<number, 1>>({});
  const [peek, setPeek] = useState(0); const [fin, setFin] = useState(false);
  const [sheet, setSheet] = useState<[number, number] | null>(null);
  // Long-press quick sheet (recitation + Urdu translation) and its "not now" notice.
  const [quick, setQuick] = useState<[number, number] | null>(null);
  const [quickNote, setQuickNote] = useState("");
  const press = useRef(new LongPress()); const pressTimer = useRef(0); const pressKind = useRef("");
  const [searching, setSearching] = useState(params.get("search") === "1");
  const [navigator, setNavigator] = useState(false);
  const [readerFocus, setReaderFocus] = useState(false);
  const [focusAyah, setFocusAyah] = useState<[number, number] | null>(deepLink ? [queryS, queryA] : null);
  const [practise, setPractise] = useState<[number, number] | null>(null);
  const [width, setWidth] = useState(0); const [fit, setFit] = useState<Fit | null>(null);
  const wrap = useRef<HTMLDivElement>(null); const page = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; d: number; r: number } | null>(null);
  const readerFocusRef = useRef(false); const focusReturnUrl = useRef("");
  const sheetHistoryRef = useRef(false);

  // ---- Unified Mushaf modes: Read (default) ? Learn ? Recall. Kept in the URL so the page and mode survive reloads.
  const mode: Mode = params.get("mode") === "recall" ? "recall" : params.get("mode") === "learn" ? "learn" : "read";
  const revisionMode = params.get("mode") === "revise";
  const revisionKind: PracticeKind = params.get("kind") === "weak" ? "weak" : "rev";
  const pageAyahs = c.ayat.map(([s, a]) => [s, a] as [number, number]);
  const revisionAyahs = revisionMode ? parsePageAyahSelection(pageAyahs, params.get("ayahs")) : null;
  const recall = mode === "recall";
  // Recall state (per page): current Ayah, ratings, help used (hint/peek), hint words shown, checked Ayahs.
  const [rIdx, setRIdx] = useState(0);
  const [ratings, setRatings] = useState<RecallRatings>({});
  const [help, setHelp] = useState<RecallHelp>({});
  const [hints, setHints] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, true>>({});
  const [saved, setSaved] = useState<number | null>(null);
  const [weakRun, setWeakRun] = useState<[number, number][] | null>(null);
  const [similarOf, setSimilarOf] = useState<[number, number] | null>(null);
  // Ayah View / Mushaf View (shared preference). Only rendering changes: lesson and recall state stay as they are.
  const learnView = useLearnView("mushaf");
  // Focus mode during an unsaved Recall: hide the app's bottom navigation (Back to Read stays in the page modes).
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (!t.closest(".mushaf-tools-button, .mushaf-tools-menu")) setToolsOpen(false);
      if (!t.closest(".mushaf-reading-dock")) setReadDockOpen(false);
      if (!t.closest(".mushaf-recall-dock")) setRecallExtras(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const recallFocus = mode === "recall" && saved === null;
  useEffect(() => { document.documentElement.classList.toggle("lesson-focus", recallFocus); return () => document.documentElement.classList.remove("lesson-focus"); }, [recallFocus]);
  const similarOnPage = useMemo(() => c.ayat.filter(([s, a]) => matchesFor(s, a, !!st.settings.mutashabihatPending).length > 0).length, [c, st.settings.mutashabihatPending]);
  // An unfinished recall survives a trip to Recite (mic check) and back: kept in sessionStorage for this tab only.
  // It is a convenience copy, never evidence; evidence is saved only when every Ayah is rated.
  const recallKey = `hifz-mushaf-recall:${params.get("p") || ""}`;
  useEffect(() => {
    if (params.get("mode") !== "recall") return;
    try { const v = JSON.parse(sessionStorage.getItem(recallKey) || "null"); if (v && v.saved == null) { setRIdx(v.rIdx || 0); setRatings(v.ratings || {}); setHelp(v.help || {}); setHints(v.hints || {}); setChecked(v.checked || {}); } } catch { /* storage unavailable */ }
  }, [recallKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (params.get("mode") !== "recall") return;
    try { if (saved !== null || !Object.keys(ratings).length && !Object.keys(help).length) sessionStorage.removeItem(recallKey); else sessionStorage.setItem(recallKey, JSON.stringify({ rIdx, ratings, help, hints, checked, saved })); } catch { /* storage unavailable */ }
  }, [recallKey, rIdx, ratings, help, hints, checked, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const recallSavedRef = useRef(false);
  const resetRecall = () => { recallSavedRef.current = false; setRIdx(0); setRatings({}); setHelp({}); setHints({}); setChecked({}); setSaved(null); };
  // Word widths (in em) measured from the real page, so hidden words keep their exact place on each line.
  const [wordEm, setWordEm] = useState<{ id: string; em: number[] } | null>(null);

  const enterReaderFocus = () => {
    if (readerFocusRef.current) return;
    focusReturnUrl.current = `${window.location.pathname}${window.location.search}`;
    window.history.pushState({ ...window.history.state, hifzReaderFocus: true }, "", focusReturnUrl.current);
    readerFocusRef.current = true; setReaderFocus(true);
  };
  const exitReaderFocus = () => {
    if (readerFocusRef.current && window.history.state?.hifzReaderFocus) window.history.back();
    else { readerFocusRef.current = false; setReaderFocus(false); }
  };
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reader-focus", readerFocus);
    const onPop = () => {
      const action = readerBackAction(window.history.state, sheetHistoryRef.current, readerFocusRef.current);
      if (action === "close-sheet") {
        sheetHistoryRef.current = false; setSheet(null); setQuick(null); return;
      }
      if (action !== "exit-reader-focus") return;
      readerFocusRef.current = false; setReaderFocus(false);
      const target = focusReturnUrl.current;
      if (target && `${window.location.pathname}${window.location.search}` !== target) router.replace(target, { scroll: false });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sheet && !navigator && !searching) exitReaderFocus(); };
    window.addEventListener("popstate", onPop); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); root.classList.remove("reader-focus"); };
  }, [readerFocus, router, sheet, navigator, searching]);
  const closeAyahSheet = () => {
    if (sheetHistoryRef.current && window.history.state?.hifzAyahSheet) window.history.back();
    else { sheetHistoryRef.current = false; setSheet(null); setQuick(null); }
  };

  const go = useCallback((p: number, keepMem = false, nextMode?: Mode) => {
    const n = Math.min(604, Math.max(1, p));
    setPtr(0); setMiss({}); setPeek(0); setFin(false); if (!keepMem) setMem(false);
    setFocusAyah(null); resetRecall(); setWeakRun(null);
    const m = nextMode ?? (new URLSearchParams(window.location.search).get("mode") as Mode ?? null) ?? "read";
    const target = reciteLanding ? `/recite?p=${n}` : `/mushaf?p=${n}${m && m !== "read" ? `&mode=${m}` : ""}`;
    if (readerFocusRef.current) focusReturnUrl.current = target;
    router.replace(target, { scroll: !readerFocusRef.current });
  }, [router, reciteLanding]);

  useEffect(() => {
    if (mode !== "read" || revisionMode) return;
    if (st.lastPage !== pg || (deepLink && (st.lastLocation?.s !== queryS || st.lastLocation?.a !== queryA))) update((d) => {
      d.lastPage = pg;
      if (deepLink) d.lastLocation = { s: queryS, a: queryA, t: Date.now() };
      else if (st.lastPage !== pg) d.lastLocation = { s: c.first[0], a: c.first[1], t: Date.now() };
    });
  }, [mode, revisionMode, pg, st.lastPage, deepLink, queryS, queryA, c.first[0], c.first[1], st.lastLocation?.s, st.lastLocation?.a]);
  // Fit the page to the available width: measure every line at a base size, then scale.
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady(1)); }, []);
  // Font size and line positions are page geometry, not a mode-specific layout. Keeping mode
  // out of this key means Read, Learn and Recall all use the same measured Mushaf positions.
  const fitId = `${pg}|${zoom}|${width}|${fontsReady}`;
  useLayoutEffect(() => {
    const el = page.current; if (!el || !width || fit?.id === fitId) return;
    const cs = getComputedStyle(el), inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // Measure the canonical Quran words, not the current DOM: Recall/Learn concealment may
    // replace words with placeholders while this fit runs. A hidden mode must never resize a line.
    const measure = document.createElement("div");
    measure.setAttribute("aria-hidden", "true");
    measure.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:max-content;direction:rtl;font-family:${cs.fontFamily};font-size:30px;font-kerning:normal;white-space:nowrap`;
    for (const line of c.lines) {
      if (line.t === "h" || line.t === "b") continue;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;width:max-content;direction:rtl;gap:6px;white-space:nowrap;align-items:baseline;line-height:normal";
      for (const i of line.idx) {
        const word = c.flat[i]; const token = document.createElement("span"); token.textContent = word.txt; row.append(token);
        if (word.last) { const mark = document.createElement("span"); mark.className = "mnum"; mark.textContent = arNum(word.a); row.append(mark); }
      }
      measure.append(row);
    }
    document.body.append(measure);
    const mx = Math.max(...Array.from(measure.children, (row) => row.getBoundingClientRect().width), 1);
    measure.remove();
    const horizontal = ((30 * inner) / mx) * 0.99;
    setFit({ id: fitId, font: Math.max(15, Math.min(30, horizontal)) });
  }, [fitId, fit, width]);
  const fitMeasured = fit?.id === fitId;
  // After the page is fitted, measure every word once (in em of the fitted size). Recall draws hidden words as
  // empty boxes of exactly these widths: line breaks and word positions are identical to the visible page,
  // while the hidden Quran text is not present in the page at all.
  useLayoutEffect(() => {
    const el = page.current; if (!el || !fitMeasured || wordEm?.id === fitId) return;
    const em: number[] = []; const px = fit!.font;
    el.querySelectorAll<HTMLElement>("[data-wi]").forEach((w) => { em[Number(w.dataset.wi)] = w.getBoundingClientRect().width / px; });
    setWordEm({ id: fitId, em });
  }, [fitId, fitMeasured, wordEm, fit]);
  const wordsMeasured = wordEm?.id === fitId;
  const measured = fitMeasured && (!(recall || mode === "learn" || (reciteLanding && reciteHidden)) || wordsMeasured);
  useEffect(() => {
    if (!deepLink || !measured) return;
    setFocusAyah([queryS, queryA]);
    const timer = window.setTimeout(() => document.getElementById(`ayah-${queryS}-${queryA}`)?.scrollIntoView({ behavior: scrollMotion(), block: "center" }), 120);
    const clear = window.setTimeout(() => setFocusAyah(null), 4500);
    return () => { clearTimeout(timer); clearTimeout(clear); };
  }, [deepLink, queryS, queryA, measured]);

  const finish = (m: Record<number, 1>) => {
    setFin(true);
    update((d) => {
      const bad = new Set(Object.keys(m).map((i) => key(c.flat[+i].s, c.flat[+i].a)));
      bad.forEach((k) => { d.weak[k] = { c: 0, d: today() - 1 }; });
      logAdd(d, "a", c.ayat.length); markRead(d, pg); addHist(d, "Mushaf page", `Page ${pg}`, c.ayat.length, Object.keys(m).length);
    });
  };
  const advance = (n: number, m = miss) => { const p = Math.min(c.flat.length, n); setPtr(p); if (p >= c.flat.length) finish(m); };
  const toggleMiss = (i: number) => {
    const f = c.flat[i], k = key(f.s, f.a), on = !miss[i];
    const next = { ...miss }; if (on) next[i] = 1; else delete next[i]; setMiss(next);
    update((d) => { const x = d.mw[k] || (d.mw[k] = {}); const w = String(f.w); x[w] = Math.max(0, (x[w] || 0) + (on ? 1 : -1)); if (!x[w]) delete x[w]; if (!Object.keys(x).length) delete d.mw[k]; });
  };
  // ---- Recall on the page
  const ayahs = pageAyahs;
  const halves = useMemo(() => pageHalves(c), [c]);
  const lesson = useMushafLesson({
    enabled: mode === "learn", page: pg, pageAyahs: ayahs, halves,
    from: params.get("from"), to: params.get("to"), portionParam: params.get("portion"), pathId: params.get("pathId") || undefined,
    returnUrl: `/mushaf?${params.toString().replace(/%3A/gi, ":")}`,
    setPortion: (x) => router.replace(`/mushaf?p=${pg}&mode=learn${x ? `&from=${x.from}&to=${x.to}` : ""}${params.get("pathId") && x ? `&pathId=${encodeURIComponent(params.get("pathId")!)}` : ""}`, { scroll: false }),
  });
  const cur = ayahs[rIdx]; const curK = cur ? key(cur[0], cur[1]) : "";
  const rated = Object.keys(ratings).length;
  const nextUnrated = (r: RecallRatings, from: number) => {
    for (let n = 1; n <= ayahs.length; n++) { const x = ayahs[(from + n) % ayahs.length]; if (!r[key(x[0], x[1])]) return (from + n) % ayahs.length; }
    return from;
  };
  const rate = (m: Mark) => {
    if (!cur || saved !== null || recallSavedRef.current) return;
    const next = { ...ratings, [curK]: m }; setRatings(next); setChecked((v) => ({ ...v, [curK]: true }));
    if (ayahs.every((x) => next[key(x[0], x[1])])) {
      recallSavedRef.current = true; // synchronous guard: a double tap must not save the page twice
      let n = 0; update((d) => { n = savePageRecall(d, pg, ayahs, next, help); });
      setSaved(n);
    } else setRIdx(nextUnrated(next, rIdx));
  };
  const hint = () => { if (!cur) return; setHints((h) => ({ ...h, [curK]: (h[curK] || 0) + 1 })); setHelp((h) => ({ ...h, [curK]: true })); };
  const peekAyah = () => { if (!cur) return; setChecked((v) => ({ ...v, [curK]: true })); setHelp((h) => ({ ...h, [curK]: true })); };
  // Recall dock: keep the current Ayah visible above it whenever the Ayah changes.
  useEffect(() => {
    if (!recall || saved !== null || !cur) return;
    const id = window.setTimeout(() => keepAboveDock(document.getElementById(`list-ayah-${cur[0]}-${cur[1]}`) || document.getElementById(`ayah-${cur[0]}-${cur[1]}`), document.querySelector(".mushaf-recall-dock")), 80);
    return () => clearTimeout(id);
  }, [recall, saved, rIdx, learnView.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (f: { s: number; a: number; w: number }) => { const k = key(f.s, f.a); return !!checked[k] || saved !== null || f.w < (hints[k] || 0); };
  const weakAyahs = saved !== null ? ayahs.filter((x) => { const r = ratings[key(x[0], x[1])]; return r === "bad" || r === "hes" || (r === "ok" && help[key(x[0], x[1])]); }) : [];
  const setMode = (m: Mode) => { if (audio.cur) audio.stop(); go(pg, false, m); window.dispatchEvent(new CustomEvent("hifz-mushaf-mode", { detail: m })); };

  // ---- Long-press an Ayah: the quick sheet. Opens only when assistance cannot expose concealed text (see ayahQuick).
  const openQuick = (s: number, a: number) => {
    const k = key(s, a);
    const lessonAyahVisible = mode === "learn" && lesson.running ? c.flat.every((f) => f.s !== s || f.a !== a || (lesson.view?.(s, a, f.w)?.state ?? "show") === "show") : true;
    const access = quickAccess({ mode, memorizing: mem && !fin, reciteHidden: reciteLanding && reciteHidden, recallSaved: saved !== null, ayahRated: !!ratings[k], lessonRunning: lesson.running, lessonAyahVisible });
    if (!access.ok) { setQuickNote(access.reason); window.setTimeout(() => setQuickNote(""), 3200); return; }
    try { window.navigator.vibrate?.(15); } catch { /* optional */ }
    if (!sheetHistoryRef.current) { window.history.pushState({ ...window.history.state, hifzAyahSheet: true }, "", `${window.location.pathname}${window.location.search}`); sheetHistoryRef.current = true; }
    setQuick([s, a]);
  };
  const pressAyah = (t: EventTarget | null) => { const el = (t as HTMLElement | null)?.closest?.("[data-qa]"); const v = el?.getAttribute("data-qa")?.split(":").map(Number); return v && v.length === 2 ? v as [number, number] : null; };
  const endPress = () => { press.current.cancel(); clearTimeout(pressTimer.current); };
  const pressHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      pressKind.current = e.pointerType; endPress();
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      const at = pressAyah(e.target); if (!at) return;
      press.current.start(e.clientX, e.clientY, Date.now());
      pressTimer.current = window.setTimeout(() => { if (press.current.fire(Date.now())) openQuick(at[0], at[1]); }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => { if (!press.current.move(e.clientX, e.clientY)) clearTimeout(pressTimer.current); },
    onPointerUp: endPress, onPointerCancel: endPress, onPointerLeave: endPress, onScroll: endPress,
    // The click that follows a long-press must not also open the tap action.
    onClickCapture: (e: React.MouseEvent) => { if (press.current.swallowClick()) { e.stopPropagation(); e.preventDefault(); } },
    // No text-selection callout on a long-press; a desktop right-click opens the same sheet.
    onContextMenu: (e: React.MouseEvent) => { const at = pressAyah(e.target); if (!at) return; e.preventDefault(); if (pressKind.current === "mouse") openQuick(at[0], at[1]); },
  };

  const onWord = (i: number) => {
    const f = c.flat[i];
    if (mode === "learn" && lesson.onTap(f.s, f.a)) return;
    if (recall) { if (saved === null) { const at = ayahs.findIndex((x) => x[0] === f.s && x[1] === f.a); if (at >= 0 && !ratings[key(f.s, f.a)]) setRIdx(at); return; } }
    if (!mem) {
      update((d) => { d.lastLocation = { s: f.s, a: f.a, t: Date.now() }; d.lastPage = pg; });
      if (!sheetHistoryRef.current) { window.history.pushState({ ...window.history.state, hifzAyahSheet: true }, "", `${window.location.pathname}${window.location.search}`); sheetHistoryRef.current = true; }
      setSheet([f.s, f.a]); return;
    }
    if (!fin && i >= ptr) { setPeek(peek + i + 1 - ptr); advance(i + 1); } else toggleMiss(i);
  };

  if (weakRun) return <Practice items={weakRun} title={`Page ${pg} ? weak ayahs`} kind="weak" onClose={() => setWeakRun(null)} />;
  if (practise) return <Practice items={[practise]} title={ref(practise[0], practise[1])} kind="custom" onClose={() => setPractise(null)} />;
  if (revisionMode) {
    if (!revisionAyahs?.length) return <section className="card" role="alert"><b>Revision selection not valid</b><p className="text-sm text-muted">The selected Ayahs do not belong to Mushaf page {pg}.</p><Link className="btn mt-3" href={`/quran?tab=page&page=${pg}`}>Back to page tracker</Link></section>;
    return <Practice items={revisionAyahs} title={`Page ${pg} ? ${revisionKind === "weak" ? "weak Ayah revision" : "revision"}`} kind={revisionKind} onClose={() => router.push(`/quran?tab=page&page=${pg}`)} />;
  }

  const j = juzOf(c.first[0], c.first[1]); const nm = Object.keys(miss).length;
  // In Recall the microphone is a compact optional action; Read and the Recite screen keep the full panel.
  const RecitePanel = recall && !reciteLanding ? ReciteToggle : MushafRecitation;
  // The switch is offered while a session is active on this page: a running guided lesson, or Recall before saving.
  const viewable = (mode === "learn" && lesson.running) || (recall && saved === null);
  const ayahView = viewable && learnView.view === "ayah";
  const listState = (s: number, a: number, w: number): WordState => {
    if (mode === "learn") { const lv = lesson.view?.(s, a, w); return lv ? lv.state : "show"; }
    return shown({ s, a, w }) ? "show" : "hide";
  };
  const listActive = mode === "learn" ? (() => { const hit = c.ayat.find(([s, a]) => lesson.view?.(s, a, 0)?.active); return hit ? key(hit[0], hit[1]) : null; })() : curK;
  const listMarks = recall ? Object.fromEntries(Object.entries(ratings).map(([k, m]) => [k, m === "bad" ? "!border-weak !text-weak" : m === "hes" || help[k] ? "!border-revise !text-revise" : "!border-strong !text-strong"])) : undefined;
  const onListWord = (s: number, a: number, w: number) => { const i = c.flat.findIndex((f) => f.s === s && f.a === a && f.w === w); if (i >= 0) onWord(i); };
  const playing = audio.cur ? key(audio.cur[0], audio.cur[1]) : "";
  let li = -1;
  return (
    <div className="flex flex-col gap-3">
    <div className={`mushaf-root flex flex-col gap-3 ${readerFocus ? "mushaf-root-focus" : ""} ${reciteLanding ? "mushaf-root-reciting" : ""}`}>
      {!reciteLanding && !readerFocus && <nav className="mushaf-location-topbar sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 p-2 backdrop-blur" aria-label="Mushaf quick navigation">
        <label className="min-w-0 flex-1 text-xs font-semibold">Surah
          <select className="field mt-1 !py-2 text-sm" aria-label="Jump to Surah" value={c.first[0]} onChange={(e) => {
            const s = +e.target.value;
            router.replace(`/mushaf?s=${s}&a=1`, { scroll: true });
            setToolsOpen(false);
          }}>{Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}</select>
        </label>
        <label className="min-w-[5.8rem] flex-1 text-xs font-semibold">Juz
          <select className="field mt-1 !py-2 text-sm" aria-label="Jump to Juz" value={juzOf(c.first[0], c.first[1])} onChange={(e) => {
            const [s, a] = Q().juz[+e.target.value - 1][0];
            router.replace(`/mushaf?s=${s}&a=${a}`, { scroll: true });
            setToolsOpen(false);
          }}>{Array.from({length: 30}, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
        </label>
        <label className="min-w-[5.5rem] flex-1 text-xs font-semibold">Page
          <select className="field mt-1 !py-2 text-sm" aria-label="Jump to Mushaf page" value={pg} onChange={(e) => { go(+e.target.value); setToolsOpen(false); }}>
            {Array.from({ length: 604 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm self-end" onClick={() => setShowLocationPicker(true)}><ControlIcon name="location" /> Go to Ayah</button>
      </nav>}
      <div className={`mushaf-header flex items-center gap-2 ${reciteLanding ? "mushaf-recite-header" : ""}`}>
        <div className="flex-1 min-w-0">
          {reciteLanding ? <h1 className="text-xl font-bold">{sname(c.first[0])}</h1> : <h2 className="text-xl font-bold">Page {pg} <span className="text-muted font-medium text-base">of 604</span></h2>}
          <div className="text-sm text-muted truncate">Juz {j} · {c.surahs.map(sname).join(", ")}</div>
        </div>
        <button className="btn btn-sm" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => update((d) => { d.settings.zoom = Math.max(1, zoom - 0.5); })}>−</button>
        <button className="btn btn-sm" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => update((d) => { d.settings.zoom = Math.min(4, zoom + 0.5); })}>+</button>
      </div>

      {readerFocus && <div className="mushaf-focus-bar flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-2 py-1.5">
        <div className="min-w-0"><div className="truncate text-xs text-muted">{sname(c.first[0])} · Juz {j}</div><div className="font-semibold" aria-live="polite">Page {pg} of 604</div></div>
        <div className="flex items-center gap-1">
          <button className="btn btn-sm" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => update((d) => { d.settings.zoom = Math.max(1, zoom - 0.5); })}>−</button>
          <button className="btn btn-sm" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => update((d) => { d.settings.zoom = Math.min(4, zoom + 0.5); })}>+</button>
          <button className="btn btn-sm" aria-pressed={st.settings.readerAyahHighlight !== false} onClick={() => update((d) => { d.settings.readerAyahHighlight = d.settings.readerAyahHighlight === false; })}>Highlight</button>
          <button className="btn btn-sm" onClick={exitReaderFocus}>Exit reading</button>
        </div>
      </div>}

      {reciteLanding && <div className="mushaf-recite-nav flex flex-wrap items-center gap-2" aria-label="Mushaf page navigation">
        <button className="btn btn-sm" aria-label="Previous Mushaf page" disabled={pg <= 1} onClick={() => go(pg - 1)}>Previous</button>
        <label className="flex items-center gap-2 text-sm text-muted">Page
          <input key={pg} type="number" min={1} max={604} defaultValue={pg} aria-label="Mushaf page number" className="field !w-20 !py-1.5 text-center" onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === "Enter") go(parseInt(e.currentTarget.value, 10) || pg); }} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v && v !== pg) go(v); }} />
        </label>
        <button className="btn btn-sm" aria-label="Next Mushaf page" disabled={pg >= 604} onClick={() => go(pg + 1)}>Next</button>
        <select className="field !w-auto !py-1.5 text-sm" aria-label="Choose surah" value="" onChange={(e) => e.target.value && go(pageOf(+e.target.value, 1))}>
          <option value="">Surah</option>{Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}
        </select>
        <button className="btn btn-sm" aria-label="Choose Quran location" onClick={() => setNavigator(true)}>Go to</button>
      </div>}

      {!readerFocus && !reciteLanding && <div className="mushaf-modes grid grid-cols-3 gap-1 rounded-xl border border-line p-1" role="tablist" aria-label="Mushaf mode">
        {(["read", "learn", "recall"] as Mode[]).map((m) => <button key={m} role="tab" aria-selected={mode === m} className={`btn btn-sm ${mode === m ? "btn-on" : "border-transparent"}`} onClick={() => mode !== m && setMode(m)}>{m === "read" ? "Read" : m === "learn" ? "Learn" : "Recall"}</button>)}
      </div>}

      {mode === "read" && !readerFocus && !reciteLanding && <section
        className="mushaf-reading-dock" aria-label="Movable reading controls">
        <div className="flex flex-wrap items-center gap-1">
          }
          <button type="button" className="btn btn-sm" aria-expanded={readDockOpen} onClick={() => setReadDockOpen((v) => !v)}><ControlIcon name={readDockOpen ? "chevron-up" : "chevron-down"} /> {readDockOpen ? "Hide reading controls" : "Reading controls"}</button>
        </div>
        {readDockOpen && <div className="mt-2 flex flex-wrap gap-2">
          <span className="self-center text-sm font-semibold">Page {pg}</span>
          <button type="button" className="btn btn-sm" disabled={pg <= 1} onClick={() => go(pg - 1)}>Previous page</button>
          <button type="button" className="btn btn-sm" disabled={pg >= 604} onClick={() => go(pg + 1)}>Next page</button>
          <button type="button" className="btn btn-sm" disabled={zoom <= 1} onClick={() => update((d) => { d.settings.zoom = Math.max(1, zoom - 0.5); })}>Smaller text</button>
          <button type="button" className="btn btn-sm" disabled={zoom >= 4} onClick={() => update((d) => { d.settings.zoom = Math.min(4, zoom + 0.5); })}>Larger text</button>
        </div>}
      </section>}
      {/* Live recitation: kept in Read, Recall and the Recite screen; not shown while choosing a lesson in Learn,
          so the page sits right under the lesson chooser (Recite stays one tab away). */}
      {(mode !== "learn" || reciteLanding) && <RecitePanel
        key={`${pg}-${mode}-${revisionMode ? params.get("ayahs") || "all" : "page"}`}
        page={pg}
        mode={reciteLanding && reciteHidden ? "recall" : mode}
        directStart={reciteLanding}
        items={recall && saved === null ? ayahs.slice(rIdx) : ayahs}
        onStart={() => { if (audio.cur) audio.stop(); }}
        onHelp={!reciteLanding && recall && cur ? () => setHelp((h) => ({ ...h, [curK]: true })) : undefined}
      />}

      {reciteLanding && <div className="recite-page-options flex flex-wrap gap-2">
        <button className="btn btn-sm" aria-pressed={reciteHidden} onClick={() => setReciteHidden((v) => !v)}>{reciteHidden ? "Reveal Quran text" : "Hide Quran text"}</button>
        <Link className="btn btn-sm" href={`/recite?choose=1&returnTo=${encodeURIComponent(`/recite?p=${pg}`)}`}>Choose passage</Link>
        <Link className="btn btn-sm" href={`/recite?choose=1&auto=1&returnTo=${encodeURIComponent(`/recite?p=${pg}`)}`}>Recite from anywhere</Link>
      </div>}

      {mode === "learn" && lesson.chooser}

      {showLocationPicker && <LocationNavigator initial={c.first as [number, number]} onClose={() => setShowLocationPicker(false)} onOpen={(s, a) => router.replace(`/mushaf?s=${s}&a=${a}`)} />}
      {similarOf && <SimilarSheet s={similarOf[0]} a={similarOf[1]} onClose={() => setSimilarOf(null)} />}
      {similarOnPage > 0 && <p className="text-xs text-muted">{similarOnPage} Ayah{similarOnPage === 1 ? "" : "s"} on this page {similarOnPage === 1 ? "has" : "have"} listed similar Ayahs. In Recall, use the Similar Ayahs button; in Read, tap an Ayah.</p>}
      {recall && <section className={`card flex flex-col gap-2 ${saved === null ? "mushaf-recall-dock" : ""}`} aria-label="Recall this page" aria-live="polite">
        {saved === null ? <>
          <div className="flex flex-wrap items-center justify-between gap-2"><b>Recite page {pg} from memory</b><span className="text-sm text-muted">{rated} of {ayahs.length} rated</span><div className="flex flex-wrap gap-1"><button type="button" className="btn btn-sm" aria-expanded={recallExtras} onClick={() => setRecallExtras((v) => !v)}><ControlIcon name={recallExtras ? "chevron-up" : "chevron-down"} /> {recallExtras ? "Less" : "More"}</button></div></div>
          {cur && <>
            <p className="text-xs text-muted">Now: <b>{sname(cur[0])} {cur[1]}</b> · {rated}/{ayahs.length}</p>
            <div className="flex flex-wrap gap-2">
              {recallExtras && <button className="btn btn-sm" onClick={hint}>Hint (next word)</button>}
              <button className="btn btn-sm" onClick={peekAyah} disabled={!!checked[curK]}><ControlIcon name="eye" /> Reveal</button>
              {/* Opening Similar Ayahs shows the Ayah's text, so it counts as help, like a hint. */}
              {recallExtras && <SimilarButton s={cur[0]} a={cur[1]} onOpen={() => { setHelp((h) => ({ ...h, [curK]: true })); setSimilarOf(cur); }} />}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-primary" onClick={() => rate("ok")}>{MARK_LABEL.ok}</button>
              <button className="btn" onClick={() => rate("hes")}>{MARK_LABEL.hes}</button>
              <button className="btn" onClick={() => rate("bad")}>{MARK_LABEL.bad}</button>
            </div>
            {recallExtras && <p className="text-xs text-muted">{help[curK] ? "Help used: this Ayah counts as “Needed help”. " : ""}Saved only when every Ayah is rated.</p>}
          </>}
        </> : <>
          <b>{saved} ayah{saved === 1 ? "" : "s"} saved from page {pg}</b>
          <p className="text-sm text-muted">{ayahs.filter((x) => ratings[key(x[0], x[1])] === "ok" && !help[key(x[0], x[1])]).length} recited correctly · {weakAyahs.length} need more practice. Yellow = needed help, red = could not recall.</p>
          <SaveLine />
          <div className="flex flex-wrap gap-2">
            {weakAyahs.length > 0 && <button className="btn-primary" onClick={() => setWeakRun(weakAyahs)}>Practise weak ayahs</button>}
            <button className="btn" onClick={resetRecall}>Recall again</button>
          </div>
        </>}
      </section>}

      <div className={`mushaf-toolbar flex flex-wrap gap-2 ${reciteLanding ? "recite-mushaf-toolbar" : "rounded-2xl border border-line bg-surface p-2"}`}>
        {reciteLanding ? <>
          <button className="btn btn-sm" onClick={() => setSearching(true)}>Search Quran</button>
          <button className="btn btn-sm" onClick={enterReaderFocus}>Distraction-free reading</button>
          <button className={`btn btn-sm ${st.settings.readerAyahHighlight === false ? "" : "btn-on"}`} aria-pressed={st.settings.readerAyahHighlight !== false} onClick={() => update((d) => { d.settings.readerAyahHighlight = d.settings.readerAyahHighlight === false; })}>Ayah highlight</button>
        </> : <div className="w-full">
        <div className="mushaf-page-turn flex items-center gap-2" dir="rtl" aria-label="Mushaf page navigation">
          <button className="btn btn-sm" disabled={pg <= 1} onClick={() => go(pg - 1, mem)} aria-label="Previous Mushaf page">Previous</button>
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted">Page
            <input key={pg} type="number" min={1} max={604} defaultValue={pg} aria-label="Mushaf page number" className="field !w-[4.5rem] !py-1.5 text-center" onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === "Enter") go(parseInt(e.currentTarget.value, 10) || pg, mem); }} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v && v !== pg) go(v, mem); }} />
          </label>
          <button className="btn btn-sm" disabled={pg >= 604} onClick={() => { if (mem) go(pg + 1, true); else { update((d) => markRead(d, pg)); go(pg + 1); } }} aria-label="Next Mushaf page">Next</button>
          <button className={`btn btn-sm mushaf-tools-button ${toolsOpen ? "btn-on" : ""}`} aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)}><ControlIcon name="settings" /> Tools <ControlIcon name={toolsOpen ? "chevron-up" : "chevron-down"} /></button>
        </div>
        {toolsOpen && <div className="mushaf-tools-menu flex flex-wrap gap-2 mt-2">
        {mem && <button className="btn btn-sm btn-on" aria-pressed onClick={() => { setMem(false); setPtr(0); setMiss({}); setPeek(0); setFin(false); }}>Exit old memorize mode</button>}
        <Link className="btn btn-sm" href={`/quran?tab=page&page=${pg}`}>Page status</Link>
        <button className="btn btn-sm" onClick={() => setSearching(true)}>Search</button>
        <button className="btn btn-sm" onClick={() => setNavigator(true)}>Go to Quran location</button>
        <button className="btn btn-sm" onClick={enterReaderFocus}>Distraction-free reading</button>
        <button className={`btn btn-sm ${st.settings.readerAyahHighlight === false ? "" : "btn-on"}`} aria-pressed={st.settings.readerAyahHighlight !== false} onClick={() => update((d) => { d.settings.readerAyahHighlight = d.settings.readerAyahHighlight === false; })}>Ayah highlight</button>
        <button className="btn btn-sm" disabled={(recall && saved === null) || lesson.running} title={recall && saved === null ? "Audio is off during Recall" : lesson.running ? "Use the lesson panel to listen" : undefined} onClick={() => audio.play(c.ayat[0][0], c.ayat[0][1])}>Play page</button>
        <select className="field !w-auto !py-1.5 text-sm" aria-label="Go to surah" value="" onChange={(e) => e.target.value && go(pageOf(+e.target.value, 1))}>
          <option value="">Surah…</option>{Q().n.map((n, i) => <option key={i} value={i + 1}>{i + 1}. {n[1]}</option>)}
        </select>
        <select className="field !w-auto !py-1.5 text-sm" aria-label="Go to juz" value="" onChange={(e) => { if (e.target.value) { const f = Q().juz[+e.target.value - 1][0]; go(pageOf(f[0], f[1])); } }}>
          <option value="">Juz…</option>{Q().juz.map((_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>)}
        </select>
        </div>}
        </div>}
      </div>

      {mode === "read" && !mem && !reciteLanding && <p className="mushaf-helper text-xs text-muted">Tap an Ayah for translation, tafsir and bookmark. Press and hold for recitation and Urdu translation.</p>}
      {mem && !fin && <p className="mushaf-helper text-sm text-muted">Recite from memory. Tap Word or Ayah to check yourself, tap a hidden word to peek, and tap any word you got wrong to mark it.</p>}
      {mem && fin && <div className="mushaf-result card"><b>{nm ? `${nm} mistake${nm === 1 ? "" : "s"} on this page` : "Clean page"}</b><p className="text-sm text-muted">{peek ? `${peek} word${peek === 1 ? "" : "s"} peeked. ` : ""}{nm ? "The ayat with mistakes went to your weak ayat list, and the words stay underlined here." : ""}</p></div>}

      {viewable && <ViewSwitch className="mushaf-view-switch" view={learnView.view} setView={learnView.setView} defaultView={learnView.defaultView} />}
      <div className={mode === "learn" ? "mushaf-learning-columns" : "mushaf-content-columns"}>
      {/* Ayah view: same word states as the page. The page stays mounted (hidden) so its measured geometry is kept. */}
      {ayahView && <div className="mushaf-page-shell mushaf-ayah-list overflow-y-auto rounded-2xl border border-line bg-surface py-2" aria-label={`Page ${pg}, Ayah by Ayah`}>
        <AyahList ayahs={c.ayat} state={listState} active={listActive} marks={listMarks} onWord={onListWord} />
      </div>}
      <div ref={wrap} style={ayahView ? { display: "none" } : undefined} className="mushaf-page-shell overflow-x-auto rounded-2xl border border-line bg-surface" dir="rtl" lang="ar" aria-label={`Madani Mushaf page ${pg}`} tabIndex={-1}
        onTouchStart={(e) => { const t = e.touches; touch.current = t.length === 2 ? { x: 0, y: 0, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), r: 1 } : { x: t[0].clientX, y: t[0].clientY, d: 0, r: 1 }; }}
        onTouchMove={(e) => { const t = e.touches, s = touch.current; if (s?.d && t.length === 2) s.r = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) / s.d; }}
        onTouchEnd={(e) => {
          const s = touch.current; touch.current = null; if (!s) return;
          if (s.d) { const nz = Math.min(4, Math.max(1, Math.round(zoom * s.r * 4) / 4)); if (nz !== zoom) update((d) => { d.settings.zoom = nz; }); return; }
          if (mem || zoom > 1 || lesson.running) return;
          const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 40) { if (dx < 0 && pg < 604) { update((d) => markRead(d, pg)); go(pg + 1); } else if (dx > 0 && pg > 1) go(pg - 1); }
        }}>
        <div ref={page} className="mpage px-3 py-4" {...pressHandlers} style={{ width: `${zoom * 100}%`, fontSize: fitMeasured ? fit!.font : 30, visibility: measured ? "visible" : "hidden" }}>
          {c.lines.map((l, n) => {
            if (l.t === "h") return <div key={n} className="mhead" dir="rtl" lang="ar">سورة {sarabic(l.s)}</div>;
            li++;
            if (l.t === "b") return <div key={n} data-b="1" className="mline c">{reciteLanding && reciteHidden ? <span aria-hidden="true" className="w ph" style={{ width: "15em" }} /> : <span>{text(1, 1)}</span>}</div>;
            return (
              <div key={n} className="mline c">
                {l.idx.map((i) => {
                  const f = c.flat[i], k = key(f.s, f.a);
                  const lv = mode === "learn" ? lesson.view?.(f.s, f.a, f.w) : undefined;
                  if (lv && wordsMeasured && lv.state !== "show") {
                    // Concealed lesson word: empty box (or first letter only) at the measured width; no hidden text in the page.
                    return <span key={i} data-qa={`${f.s}:${f.a}`} id={f.w === 0 ? `ayah-${f.s}-${f.a}` : undefined} onClick={() => onWord(i)} aria-hidden="true"><span className={`w ph ${lv.state === "head" ? "head" : ""} ${lv.active ? "act" : ""}`} style={{ width: `${wordEm!.em[i]}em` }}>{lv.state === "head" ? headOf(f.txt) : null}</span>{f.last && <span className="mnum">{arNum(f.a)}</span>}</span>;
                  }
                  if (recall && wordsMeasured && !shown(f)) {
                    // Hidden word: an empty box of the measured width; the Quran text itself is not rendered.
                    return <span key={i} data-qa={`${f.s}:${f.a}`} id={f.w === 0 ? `ayah-${f.s}-${f.a}` : undefined} onClick={() => onWord(i)} aria-hidden="true"><span className={`w ph ${k === curK ? "cur" : ""}`} style={{ width: `${wordEm!.em[i]}em` }} />{f.last && <span className="mnum">{arNum(f.a)}</span>}</span>;
                  }
                  if (reciteLanding && reciteHidden && wordsMeasured) {
                    // Recite hide mode preserves measured word slots but removes Quran text from the DOM/AX tree.
                    return <span key={i} data-qa={`${f.s}:${f.a}`} aria-hidden="true"><span className="w ph" style={{ width: `${wordEm!.em[i]}em` }} />{f.last && <span className="mnum">{arNum(f.a)}</span>}</span>;
                  }
                  const hid = mem && !fin && i >= ptr;
                  const r = recall ? ratings[k] : undefined;
                  const rc = r === "bad" ? "r-bad" : r === "hes" || (r === "ok" && help[k]) ? "r-hes" : "";
                  const cls = hid ? "hid" : rc || (miss[i] ? "bad" : st.mw[k]?.[String(f.w)] ? "hm" : playing === k ? "play" : "");
                  const focused = st.settings.readerAyahHighlight !== false && focusAyah?.[0] === f.s && focusAyah?.[1] === f.a;
                  const picked = quick?.[0] === f.s && quick?.[1] === f.a;
                  return <span key={i} data-qa={`${f.s}:${f.a}`} id={f.w === 0 ? `ayah-${f.s}-${f.a}` : undefined} onClick={() => onWord(i)} onKeyDown={f.w === 0 ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWord(i); } } : undefined} role={f.w === 0 ? "button" : undefined} tabIndex={f.w === 0 ? 0 : undefined} aria-label={f.w === 0 ? `Open ${sname(f.s)} ayah ${f.a} actions` : undefined} aria-haspopup={f.w === 0 ? "dialog" : undefined}><span data-wi={i} className={`w ${cls} ${focused ? "ayah-focus" : ""} ${picked ? "quick-sel" : ""} ${lv?.active ? "act" : ""}`}>{f.txt}</span>{f.last && <span className={`mnum ${st.bookmarks[k] ? "bm" : ""}`}>{arNum(f.a)}</span>}</span>;
                })}
              </div>
            );
          })}
          <div className="flex justify-between text-xs text-muted pt-2 font-ui" dir="ltr"><span>{sname(c.first[0])}</span><span>{pg}</span><span>Juz {j}</span></div>
        </div>
      </div>

      {mode === "learn" && lesson.panel}
      </div>
      {!reciteLanding && mem && !fin && <div className="mushaf-page-controls flex gap-2 border-t border-line bg-bg py-3">
        <button className="btn flex-1" onClick={() => advance(ptr + 1)}>Word</button>
        <button className="btn-primary flex-1" onClick={() => { let i = ptr; while (i < c.flat.length && !c.flat[i].last) i++; advance(i + 1); }}>Ayah</button>
        <button className="btn" onClick={() => { setPeek(peek + c.flat.length - ptr); advance(c.flat.length); }}>Show all</button>
      </div>}
      {!reciteLanding && mem && fin && <div className="mushaf-page-controls flex gap-2 border-t border-line bg-bg py-3">
        <button className="btn flex-1" onClick={() => { setPtr(0); setMiss({}); setPeek(0); setFin(false); }}>Recite again</button>
      </div>}

      {sheet && <AyahSheet s={sheet[0]} a={sheet[1]} onClose={closeAyahSheet} onPractise={() => { if (readerFocusRef.current) { readerFocusRef.current = false; setReaderFocus(false); } closeAyahSheet(); setPractise(sheet); }} />}
      {quick && <AyahQuickSheet s={quick[0]} a={quick[1]} onClose={closeAyahSheet} />}
      {quickNote && <div className="ayah-quick-note fixed inset-x-3 bottom-[84px] z-50 mx-auto max-w-md rounded-xl bg-[var(--ink)] px-4 py-3 text-sm text-[var(--bg)] shadow-lg lg:bottom-6" role="status" onClick={() => setQuickNote("")}>{quickNote}</div>}
      {navigator && <LocationNavigator initial={focusAyah || [c.first[0], c.first[1]]} onClose={() => setNavigator(false)} onOpen={(s, a) => { setFocusAyah([s, a]); router.push(`${reciteLanding ? "/recite" : "/mushaf"}?s=${s}&a=${a}`); }} />}
      {searching && <SearchDialog onClose={() => setSearching(false)} onGo={(h) => { setSearching(false); if (h.s && h.a) router.push(`${reciteLanding ? "/recite" : "/mushaf"}?s=${h.s}&a=${h.a}`); else if (h.pg) go(h.pg); }} />}
    </div>
    </div>
  );
}

export default function MushafReader({ reciteLanding = false }: { reciteLanding?: boolean }) {
  return <Suspense fallback={<div className="card text-muted">Opening the mushaf…</div>}><MushafView reciteLanding={reciteLanding} /></Suspense>;
}

