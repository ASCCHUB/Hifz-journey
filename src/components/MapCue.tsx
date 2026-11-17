"use client";
// Lesson-facing memory maps are opt-in and appear only when a canonical passage has a reviewed map.
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMap, reviewedMapsForLocation } from "@/lib/mapCatalog";
import type { MindMapLesson } from "@/lib/mindMaps";

type Hit = { map: MindMapLesson; node: MindMapLesson["nodes"][number] };
export default function MapCue({ s, a, returnTo, recall = false, onAssisted }: {
  s: number; a: number; returnTo?: string; recall?: boolean; onAssisted?: () => void;
}) {
  const [hit, setHit] = useState<Hit | null>(null);
  useEffect(() => {
    let live = true; setHit(null);
    reviewedMapsForLocation(s, a).then(async (entries) => {
      for (const e of entries) {
        const map = await loadMap(e.id); const node = map?.nodes.find((n) => n.ayah === a);
        if (map && node) { if (live) setHit({ map, node }); return; }
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [s, a]);
  if (!hit) return null;
  const group = hit.map.groups.find((g) => g.ayahs.includes(a));
  const mapHref = `/mind-maps?map=${encodeURIComponent(hit.map.id)}&ayah=${a}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  if (recall) return <Link className="btn btn-sm self-start" href={mapHref} onClick={onAssisted}>View visual map (counts as help)</Link>;
  const ordered = hit.map.nodes.map((n) => n.ayah).sort((x, y) => x - y);
  const index = ordered.indexOf(a);
  const prev = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index + 1 < ordered.length ? ordered[index + 1] : null;
  return <aside className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gold/60 p-3 text-sm" aria-label={`Reviewed visual memory map for ${s}:${a}`}>
    <span className="grid h-9 w-9 place-items-center rounded-full text-lg text-white" style={{ background: hit.node.color }} aria-hidden>{hit.node.symbol}</span>
    <span className="min-w-0 flex-1"><b>Visual Memory Map · {hit.map.title}</b><span className="block text-xs text-muted">Theme: {hit.map.subtitle}</span><span className="block">{hit.node.cue}{group ? ` · branch “${group.title}”` : ""}</span>
      <span className="block text-xs text-muted">Passage sequence: {prev ? `before ${s}:${prev} → ` : "beginning → "}{s}:{a}{next ? ` → after ${s}:${next}` : " → end"}</span>
      <span className="block text-xs text-muted">Reviewed memory aid; Quran text and Tafsir remain sourced separately.</span></span>
    <Link className="text-xs underline" href={mapHref}>Open map</Link>
  </aside>;
}
