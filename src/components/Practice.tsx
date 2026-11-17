"use client";
// Ayah-by-ayah practice: the text is hidden, the user recites, reveals, and marks each ayah.
// Used for new lessons, revision, custom ranges and the weak-ayat drill.
// Two views of the same session state: Ayah by Ayah, or the full 15-line Mushaf page. Switching view only
// changes rendering — index, hints, revealed words and ratings are untouched, and nothing is saved by it.
import { useEffect, useMemo, useRef, useState } from "react";
import MiniMushafPage from "./MiniMushafPage";
import SimilarSheet, { SimilarButton } from "./SimilarAyahs";
import { useLearnView, ViewSwitch } from "./LearnView";
import { applyResults, type Mark, type PracticeKind } from "@/lib/hifz";
import { key, loadSet, pageOf, ref, SETS, text, words } from "@/lib/quran";
import { update, useStore } from "@/lib/store";
import { useAudio } from "./Audio";
import { SaveLine } from "./SaveStatus";
import ReciteToggle, { keepAboveDock } from "./ReciteToggle";

type Props = { items: [number, number][]; title: string; kind: PracticeKind; difficulty?: "guided" | "challenge"; onClose: () => void; onComplete?: (results: Record<number, Mark>) => void };

export default function Practice({ items, title, kind, difficulty = "guided", onClose, onComplete }: Props) {
  const audio = useAudio();
  const st = useStore();
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"read" | "test" | "done">(kind === "new" ? "read" : "test");
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [res, setRes] = useState<Record<number, Mark>>({});
  const [hinted, setHinted] = useState<Record<number, boolean>>({});
  const { view, setView, defaultView } = useLearnView();
  const [similar, setSimilar] = useState(false);
  const itemIndex = useMemo(() => new Map(items.map(([s, a], i) => [key(s, a), i])), [items]);
  // Focus mode: hide the app's bottom navigation while a session is open (Back / Done stay in the lesson).
  useEffect(() => { document.documentElement.classList.add("lesson-focus"); return () => document.documentElement.classList.remove("lesson-focus"); }, []);

  useEffect(() => {
    let live = true;
    loadSet(st.settings.tr).then((set) => {
      if (!live) return;
      const next: Record<string, string> = {};
      items.forEach(([s, a]) => { next[key(s, a)] = set[s - 1]?.[a - 1] || ""; });
      setTranslations(next);
    }).catch(() => {});
    return () => { live = false; };
  }, [items, st.settings.tr]);

  // One save per session: a synchronous guard, because a fast double tap on the last rating can fire twice
  // before React re-renders (which applied every result twice). "Recite again" starts a new session.
  const savedRef = useRef(false);
  const restart = () => { savedRef.current = false; setMode("test"); setIdx(0); setShown(0); setRevealed(false); setRes({}); setHinted({}); };
  const mark = (m: Mark) => {
    if (savedRef.current) return;
    const next = { ...res, [idx]: m }; setRes(next); setShown(0); setRevealed(false);
    if (idx + 1 >= items.length) { savedRef.current = true; update((d) => applyResults(d, items, next, kind, title)); onComplete?.(next); setMode("done"); }
    else setIdx(idx + 1);
  };
  const missed = Object.values(res).filter((r) => r !== "ok").length;
  // Keep the current Ayah visible above the action dock as the session moves on or the view changes.
  useEffect(() => {
    if (mode !== "test") return;
    const id = window.setTimeout(() => keepAboveDock(document.getElementById("practice-current") || document.querySelector(".mpage .act"), document.querySelector(".practice-actions")), 60);
    return () => clearTimeout(id);
  }, [idx, mode, view]);
  const [fs, fa] = items[0];
  const border: Record<Mark, string> = { ok: "border-strong", hes: "border-revise", bad: "border-weak" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button className="btn btn-sm" onClick={onClose}>Back</button>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{title}</div>
          <div className="text-sm text-muted">{mode === "read" ? "Read and listen, then hide the text" : mode === "done" ? "Finished" : `Ayah ${idx + 1} of ${items.length} · recite, then check`}</div>
        </div>
        <button className="btn btn-sm" onClick={() => audio.play(fs, fa, items.length > 1 && items.every(([s]) => s === fs) ? { s: fs, a: fa, b: items[items.length - 1][1] } : null)}>Listen</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitch view={view} setView={setView} defaultView={defaultView} />
        {mode !== "done" && <SimilarButton s={items[mode === "test" ? idx : 0][0]} a={items[mode === "test" ? idx : 0][1]} className="ms-auto"
          onOpen={() => { if (mode === "test" && !revealed) setHinted((h) => ({ ...h, [idx]: true })); setSimilar(true); }} />}
      </div>
      {similar && <SimilarSheet s={items[mode === "test" ? idx : 0][0]} a={items[mode === "test" ? idx : 0][1]} onClose={() => setSimilar(false)} />}

      {mode === "test" && <ReciteToggle
        key={`practice-${items[idx]?.[0]}-${items[idx]?.[1]}-${idx}`}
        page={pageOf(items[idx][0], items[idx][1])}
        mode="revise"
        items={items.slice(idx)}
        onStart={() => { if (audio.cur) audio.stop(); }}
        onHelp={() => setHinted((h) => ({ ...h, [idx]: true }))}
      />}

      {view === "mushaf" && <MiniMushafPage
        page={pageOf(items[mode === "test" ? idx : 0][0], items[mode === "test" ? idx : 0][1])}
        active={mode === "test" ? key(items[idx][0], items[idx][1]) : null}
        marks={Object.fromEntries(Object.entries(res).map(([i, m]) => [key(items[+i][0], items[+i][1]), m === "ok" ? "text-strong" : m === "hes" ? "text-revise" : "text-weak"]))}
        state={(f) => {
          const i = itemIndex.get(key(f.s, f.a));
          if (i === undefined) return "dim";
          if (mode !== "test" || i < idx) return "show";
          if (i === idx) return revealed || f.w < shown ? "show" : "hide";
          return "hide";
        }} />}

      {view === "ayah" && mode === "test" && idx === 0 && fa > 1 && kind !== "weak" && (
        <div className="card"><div className="text-sm text-muted">Previous ayah, as your cue</div><div className="q text-[22px]">{text(fs, fa - 1)}</div></div>
      )}

      {view === "ayah" && <div className="flex flex-col gap-1">
        {items.map(([s, a], i) => {
          const ws = words(s, a);
          const past = mode !== "test" || i < idx, cur = mode === "test" && i === idx;
          if (kind === "weak" && mode === "test" && i > idx) return null;
          return (
            <div key={key(s, a)}>
              {kind === "weak" && (cur || past) && a > 1 && <div className="pt-3 text-sm text-muted">{ref(s, a)} comes after:<div className="q text-[20px] opacity-80">{text(s, a - 1)}</div></div>}
              <div id={cur ? "practice-current" : undefined} className={`rounded-xl px-3 py-1 border-s-4 ${cur ? "bg-accent-soft border-transparent" : res[i] && past ? border[res[i]] : "border-transparent"} ${!past && !cur ? "opacity-50" : ""}`}>
                <span className="q text-[26px]">
                  {past ? text(s, a)
                    : cur ? ws.map((w, k) => <span key={k}><span className={`w ${revealed || k < shown ? "" : "hid"}`}>{w}</span> </span>)
                    : <span className="w hid">{ws.slice(0, 4).join(" ")}</span>}
                  <span className="inline-grid place-items-center min-w-[26px] h-[26px] mx-2 px-1 rounded-full border border-accent text-accent text-xs font-bold align-middle font-ui" dir="ltr">{a}</span>
                </span>
              </div>
              {mode === "read" && translations[key(s, a)] && <div className={`px-3 pb-2 text-sm text-muted ${SETS[st.settings.tr].lang === "ur" ? "ur text-[16px]" : "leading-relaxed"}`} dir={SETS[st.settings.tr].lang === "ur" ? "rtl" : "ltr"}>{translations[key(s, a)]}</div>}
              {mode === "read" && a === items[0][1] && s === items[0][0] && <div className="px-3 pb-2 text-xs text-muted">Study in short phrases: read 3–5 words at a time, repeat them, then join the phrases. Audio is available for the complete ayah.</div>}
            </div>
          );
        })}
      </div>}

      {mode === "done" && (
        <div className="card">
          <SaveLine />
          <b>{missed ? `${missed} ayah${missed === 1 ? "" : "s"} to work on` : "Clean recitation"}</b>
          <p className="text-sm text-muted">{missed ? "They were added to your weak ayat list and will come back sooner." : kind === "new" ? "These ayat are now in your revision plan." : "Nothing was added to your weak ayat."}</p>
        </div>
      )}

      <div className="practice-actions sticky bottom-[72px] lg:bottom-4 z-10 bg-bg py-3 flex flex-wrap gap-2 border-t border-line">
        {mode === "test" && <p className="w-full text-xs text-muted" aria-live="polite">{revealed ? "Compare, then rate yourself honestly." : `Recite ${ref(items[idx][0], items[idx][1])} from memory.`}{hinted[idx] ? " Help used: a correct answer counts as hesitated." : ""}</p>}
        {mode === "read" && <button className="btn-primary flex-1" onClick={restart}>Hide the text and recite</button>}
        {mode === "test" && !revealed && <>
          {difficulty === "guided" && <button className="btn flex-1" onClick={() => { setHinted({ ...hinted, [idx]: true }); const n = shown + 1; setShown(n); if (n >= words(items[idx][0], items[idx][1]).length) setRevealed(true); }}>Hint: next word</button>}
          <button className="btn-primary flex-1" onClick={() => setRevealed(true)}>Check ayah</button>
        </>}
        {mode === "test" && revealed && <>
          <button className="btn flex-1 !border-weak !text-weak" onClick={() => mark("bad")}>Mistake</button>
          <button className="btn flex-1 !border-revise !text-revise" onClick={() => mark("hes")}>Hesitated</button>
          <button className="btn flex-1 !border-strong !text-strong" onClick={() => mark(hinted[idx] ? "hes" : "ok")}>Correct</button>
        </>}
        {mode === "done" && <>
          <button className="btn flex-1" onClick={restart}>Recite again</button>
          <button className="btn-primary flex-1" onClick={onClose}>Done</button>
        </>}
      </div>
    </div>
  );
}
