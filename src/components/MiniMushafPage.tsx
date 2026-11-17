"use client";
// A read-only 15-line Mushaf page (the existing reconstructed layout from pageContent) for lesson screens.
// Each word gets a state from the caller: "show", "hide" (kept at its exact width, text transparent and hidden
// from assistive tech, so positions never move) or "dim" (outside the session). One Ayah can be highlighted.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { arNum, juzOf, key, pageContent, sarabic, sname, text, type PageWord } from "@/lib/quran";
import { Word, type WordState } from "./LearnView";

export type MiniWordState = WordState;
type Props = {
  page: number;
  state: (w: PageWord) => MiniWordState;
  active?: string | null;            // "s:a" to highlight
  marks?: Record<string, string>;    // "s:a" → extra class for the Ayah number (e.g. a rating colour)
  wordClass?: (w: PageWord) => string; // recitation feedback colour, never changes the Quran source text
  onAyah?: (s: number, a: number) => void;
};

export default function MiniMushafPage({ page, state, active, marks, wordClass, onAyah }: Props) {
  const c = useMemo(() => pageContent(page), [page]);
  const box = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Fit the longest line to the width: measured at 30px with the real words, so hidden words never change it.
  useLayoutEffect(() => {
    const el = box.current; if (!el || !width) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-fit]"));
    // Centered nowrap rows overflow on both sides, so scrollWidth under-reports: measure at max-content width.
    const prev = el.style.fontSize; el.style.fontSize = "30px";
    rows.forEach((r) => { r.style.width = "max-content"; });
    const mx = Math.max(1, ...rows.map((r) => r.getBoundingClientRect().width));
    rows.forEach((r) => { r.style.width = ""; });
    el.style.fontSize = prev;
    setFont(Math.max(14, Math.min(30, (30 * (width - 16)) / mx * 0.98)));
  }, [width, page]);

  return <div ref={box} className="mpage rounded-xl border border-line bg-surface px-2 py-2" style={{ fontSize: font ?? 30, visibility: font ? "visible" : "hidden" }} lang="ar">
    {c.lines.map((l, n) => {
      if (l.t === "h") return <div key={n} className="mhead" dir="rtl">سورة {sarabic(l.s)}</div>;
      if (l.t === "b") return <div key={n} className="mline c"><span>{text(1, 1)}</span></div>;
      return <div key={n} className="mline c" data-fit="1">
        {l.idx.map((i) => {
          const f = c.flat[i], k = key(f.s, f.a), s = state(f);
          return <span key={i} onClick={onAyah ? () => onAyah(f.s, f.a) : undefined}>
            <Word txt={f.txt} state={s} active={active === k} className={wordClass?.(f) ?? ""} />
            {f.last && <span className={`mnum ${marks?.[k] || ""}`}>{arNum(f.a)}</span>}
          </span>;
        })}
      </div>;
    })}
    <div className="flex justify-between pt-1 font-ui text-xs text-muted" dir="ltr"><span>{sname(c.first[0])}</span><span>Page {page}</span><span>Juz {juzOf(c.first[0], c.first[1])}</span></div>
  </div>;
}
