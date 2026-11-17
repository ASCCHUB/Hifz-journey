"use client";
// "Similar Ayahs (Mutashabihat)" — contextual button + bottom sheet with a stacked comparison, and an in-place
// Mushaf viewer for each match so the learner returns to the lesson without losing progress.
import { useState } from "react";
import MiniMushafPage from "./MiniMushafPage";
import { matchesFor, type Match, type Ref } from "@/lib/mutashabihat";
import { key, pageOf, ref, words } from "@/lib/quran";
import { useStore } from "@/lib/store";

const KIND: Record<Match["diff"]["kind"], string> = { exact: "Exact repetition", order: "Same words, different order", near: "Near-identical wording" };

export function useSimilar(s: number, a: number) {
  const st = useStore();
  return matchesFor(s, a, !!st.settings.mutashabihatPending);
}

/** Canonical words of an Ayah, marking shared words and differing words separately. */
function Compared({ r, marks }: { r: Ref; marks: boolean[] }) {
  return <p className="q text-[22px] leading-loose" dir="rtl" lang="ar">
    {words(r[0], r[1]).map((w, i) => <span key={i}><span className={`rounded px-0.5 ${marks[i] ? "bg-accent-soft" : "bg-[color-mix(in_srgb,var(--revise)_28%,transparent)] underline decoration-revise decoration-2 underline-offset-8"}`}>{w}</span> </span>)}
  </p>;
}

export function SimilarButton({ s, a, onOpen, className = "" }: { s: number; a: number; onOpen: () => void; className?: string }) {
  const m = useSimilar(s, a);
  if (!m.length) return null;
  return <button type="button" className={`btn btn-sm ${className}`} onClick={onOpen} aria-haspopup="dialog">Similar Ayahs ({m.length})</button>;
}

export default function SimilarSheet({ s, a, onClose }: { s: number; a: number; onClose: () => void }) {
  const matches = useSimilar(s, a);
  const [view, setView] = useState<Ref | null>(null);
  const pending = matches.some((m) => m.group.status !== "approved");

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Similar Ayahs" onClick={onClose}>
    <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        {view && <button className="btn btn-sm" onClick={() => setView(null)}>Back to comparison</button>}
        <h2 className="flex-1 text-lg font-bold">{view ? `${ref(view[0], view[1])} in the Mushaf` : "Similar Ayahs (Mutashabihat)"}</h2>
        <button className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      {view ? <MiniMushafPage page={pageOf(view[0], view[1])} state={() => "show"} active={key(view[0], view[1])} />
        : <>
          <p className="text-sm">Current: <b>{ref(s, a)}</b> ({s}:{a})</p>
          {pending && <p className="rounded-xl border border-revise p-2 text-xs">Awaiting review: these examples have not yet been checked by a qualified teacher. The Arabic is the app&apos;s verified text, and the highlighting is computed word by word. Use them as a study aid, not as authoritative guidance.</p>}
          <p className="text-xs text-muted"><span className="rounded bg-accent-soft px-1">Shaded</span> words are shared. <span className="rounded bg-[color-mix(in_srgb,var(--revise)_28%,transparent)] px-1 underline decoration-revise">Underlined</span> words differ.</p>
          {matches.map((m) => {
            const phrase = m.diff.phrase ? words(s, a).slice(m.diff.phrase[0], m.diff.phrase[1] + 1).join(" ") : "";
            return <article key={key(m.ref[0], m.ref[1])} className="card flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{ref(m.ref[0], m.ref[1])} <span className="font-normal text-muted">({m.ref[0]}:{m.ref[1]}) · page {pageOf(m.ref[0], m.ref[1])}</span></b><span className="text-xs text-muted">{KIND[m.diff.kind]}</span></div>
              {m.diff.kind !== "exact" && phrase && <div className="text-xs text-muted">Longest shared phrase:<div className="q text-[20px] text-ink" dir="rtl" lang="ar">{phrase}</div></div>}
              <div className="text-xs text-muted">Current · {ref(s, a)}</div><Compared r={[s, a]} marks={m.diff.a} />
              <div className="text-xs text-muted">Similar · {ref(m.ref[0], m.ref[1])}</div><Compared r={m.ref} marks={m.diff.b} />
              {m.group.note && <p className="text-xs text-muted">{m.group.note}</p>}
              <p className="text-[11px] text-muted">{m.group.status === "approved" ? `Reviewed by ${m.group.reviewer}${m.group.reviewedAt ? `, ${m.group.reviewedAt}` : ""}. ` : ""}Source: {m.group.source}</p>
              <button className="btn btn-sm self-start" onClick={() => setView(m.ref)}>Open in Mushaf</button>
            </article>;
          })}
          {!matches.length && <p className="text-sm text-muted">No reviewed similar Ayahs are listed for this Ayah.</p>}
        </>}
    </div>
  </div>;
}
