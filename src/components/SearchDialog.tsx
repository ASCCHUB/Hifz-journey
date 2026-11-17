"use client";
import { useMemo, useState } from "react";
import { pageOf, sarabic, search, text, type SearchHit } from "@/lib/quran";
import Sheet from "./Sheet";

const cut = (t: string, n: number) => { const w = t.split(" "); return w.length > n ? w.slice(0, n).join(" ") + " …" : t; };

export default function SearchDialog({ onClose, onGo }: { onClose: () => void; onGo: (hit: SearchHit) => void }) {
  const [q, setQ] = useState("");
  const res = useMemo(() => search(q), [q]);
  return (
    <Sheet title="Search the Quran" onClose={onClose}>
      <input autoFocus type="search" className="field" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
        placeholder="Surah name, 2:255, page or juz number, or Arabic words" />
      {!q.trim() && <p className="text-sm text-muted">Type a surah name, a reference such as 2:255, a number, or Arabic words without vowel marks.</p>}
      {q.trim() && !res.hits.length && <p className="text-sm text-muted">Nothing found for that search.</p>}
      {res.total > res.hits.length && <p className="text-sm text-muted">Showing {res.hits.length} of {res.total} ayat.</p>}
      <div className="flex flex-col divide-y divide-line">
        {res.hits.map((h, i) => (
          <button key={i} className="text-left py-3" onClick={() => onGo(h)}>
            <div className="font-semibold">{h.label}</div>
            {h.ayah ? <div className="q text-[21px] !leading-[2]">{cut(text(h.s!, h.a!), 12)}</div>
              : h.s ? <div className="text-sm text-muted">{sarabic(h.s)} · page {pageOf(h.s, h.a!)}</div> : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
