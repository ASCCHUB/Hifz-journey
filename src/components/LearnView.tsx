"use client";
// Ayah View / Mushaf View — one shared implementation for every learning, recall and revision screen.
//
// • One preference: settings.learnView ("ayah" | "mushaf"). When it is not set, each screen keeps its own usual
//   view (Practice and /learn: Ayah; the Mushaf lesson and Mushaf Recall: Mushaf).
// • The switch only changes rendering for the current session; "Use this view for all sessions" saves it.
// • Both views draw the same word states supplied by the screen, so switching never changes lesson state,
//   hints, ratings or evidence, and never saves anything.
import { useEffect, useState } from "react";
import { arNum, key, words } from "@/lib/quran";
import { headOf } from "@/lib/mushafLesson";
import { update, useStore } from "@/lib/store";

export type LearnViewKind = "ayah" | "mushaf";
/** Word appearance used by both views. "head" = first letter only (rest kept at full width, transparent). */
export type WordState = "show" | "hide" | "head" | "dim";

export function useLearnView(native: LearnViewKind = "ayah") {
  const st = useStore();
  const def: LearnViewKind = st.settings.learnView || native;
  const [view, setView] = useState<LearnViewKind>(def);
  return { view, setView, defaultView: def };
}

export function ViewSwitch({ view, setView, defaultView, className = "" }: { view: LearnViewKind; setView: (v: LearnViewKind) => void; defaultView: LearnViewKind; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    <div className="inline-flex rounded-xl border border-line bg-surface p-0.5" role="radiogroup" aria-label="View">
      {(["ayah", "mushaf"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} className={`rounded-lg px-3 py-1 text-sm font-semibold ${view === v ? "bg-accent text-white" : "text-muted"}`} onClick={() => setView(v)}>{v === "ayah" ? "Ayah view" : "Mushaf view"}</button>)}
    </div>
    {view !== defaultView && <button type="button" className="text-xs underline" onClick={() => update((d) => { d.settings.learnView = view; })}>Use this view for all sessions</button>}
  </div>;
}

// Width of a word in em, measured on a canvas: concealed words are drawn as empty boxes of this width, so the
// hidden Quran text is never put in the page (same rule as the Mushaf page), while positions stay stable.
const QURAN_FONT = '"KFGQPC Hafs", "Amiri Quran", serif';
let ctx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
export function wordEm(txt: string): number {
  const hit = widthCache.get(txt); if (hit !== undefined) return hit;
  if (ctx === undefined) { try { ctx = document.createElement("canvas").getContext("2d"); } catch { ctx = null; } }
  let em = Math.max(0.6, txt.length * 0.42); // fallback estimate
  if (ctx) { ctx.font = `100px ${QURAN_FONT}`; em = ctx.measureText(txt).width / 100 || em; }
  if (typeof document !== "undefined" && document.fonts?.status === "loaded") widthCache.set(txt, em);
  return em;
}

/** One word in either view. Concealed words are empty boxes at the word's width; no hidden text is rendered. */
export function Word({ txt, state, active, className = "" }: { txt: string; state: WordState; active?: boolean; className?: string }) {
  if (state === "hide") return <span className={`w ph ${active ? "act" : ""} ${className}`} aria-hidden="true" style={{ width: `${wordEm(txt)}em` }} />;
  if (state === "head") return <span className={`w ph head ${active ? "act" : ""} ${className}`} aria-hidden="true" style={{ width: `${wordEm(txt)}em` }}>{headOf(txt)}</span>;
  return <span className={`w ${active ? "act" : ""} ${state === "dim" ? "opacity-40" : ""} ${className}`}>{txt}</span>;
}

/** Ayah-by-Ayah list of the given Ayahs, drawing each word from the screen's own word state. */
export function AyahList({ ayahs, state, active, marks, onWord }: {
  ayahs: [number, number][]; state: (s: number, a: number, w: number) => WordState; active?: string | null;
  marks?: Record<string, string>; onWord?: (s: number, a: number, w: number) => void;
}) {
  // Keep the active Ayah in sight, as the page view does.
  useEffect(() => { if (active) document.getElementById(`list-ayah-${active.replace(":", "-")}`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  return <div className="flex flex-col gap-1" dir="rtl" lang="ar">
    {ayahs.map(([s, a]) => {
      const k = key(s, a), cur = active === k;
      return <div key={k} id={`list-ayah-${s}-${a}`} className={`rounded-xl px-3 py-1 ${cur ? "bg-accent-soft" : ""}`}>
        <span className="q text-[26px] leading-[2.2]">
          {words(s, a).map((w, i) => <span key={i} onClick={onWord ? () => onWord(s, a, i) : undefined}><Word txt={w} state={state(s, a, i)} active={cur} /> </span>)}
          <span className={`mx-1 inline-grid h-[26px] min-w-[26px] place-items-center rounded-full border border-accent px-1 align-middle font-ui text-xs font-bold text-accent ${marks?.[k] || ""}`} dir="ltr">{arNum(a)}</span>
        </span>
      </div>;
    })}
  </div>;
}
