"use client";
// Details for one ayah: translation (switchable), tafsir (kept separate from translation), bookmark, audio.
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchTafsir, key, loadSet, pageOf, ref, REMOTE_TAFSIR, SETS, text, type RemoteTafsir, type SetName } from "@/lib/quran";
import { update, useStore } from "@/lib/store";
import { useAudio } from "./Audio";
import { Sheet } from "./Shell";
import SimilarSheet, { SimilarButton } from "./SimilarAyahs";

const TR: SetName[] = ["tr-ur-maududi", "tr-ur-jalandhry", "tr-en-sahih"];
type TafsirChoice = "" | "tafsir-ar-muyassar" | RemoteTafsir;

export default function AyahSheet({ s, a, onClose, onPractise }: { s: number; a: number; onClose: () => void; onPractise?: () => void }) {
  const st = useStore(); const audio = useAudio();
  const k = key(s, a), bm = st.bookmarks[k];
  const [tr, setTr] = useState(""); const [trErr, setTrErr] = useState(false);
  const [taf, setTaf] = useState<TafsirChoice>("");
  const [tafText, setTafText] = useState(""); const [tafState, setTafState] = useState<"idle" | "loading" | "error">("idle");
  const set = st.settings.tr;
  const [similar, setSimilar] = useState(false);

  useEffect(() => {
    let live = true; setTr(""); setTrErr(false);
    loadSet(set).then((d) => { if (live) setTr(d[s - 1][a - 1]); }).catch(() => { if (live) setTrErr(true); });
    return () => { live = false; };
  }, [set, s, a]);

  useEffect(() => {
    if (!taf) return;
    let live = true; setTafText(""); setTafState("loading");
    const p = taf === "tafsir-ar-muyassar" ? loadSet(taf).then((d) => d[s - 1][a - 1]) : fetchTafsir(taf, s, a);
    p.then((t) => { if (live) { setTafText(t || "No tafsir text is available for this ayah in this source."); setTafState("idle"); } })
      .catch(() => { if (live) setTafState("error"); });
    return () => { live = false; };
  }, [taf, s, a]);

  const lang = SETS[set].lang;
  return (
    <>{similar && <SimilarSheet s={s} a={a} onClose={() => setSimilar(false)} />}
    <Sheet title={ref(s, a)} onClose={onClose}>
      <div className="q text-[26px]">{text(s, a)}</div>

      <label className="label" htmlFor="trsel">Translation</label>
      <select id="trsel" className="field" value={set} onChange={(e) => update((d) => { d.settings.tr = e.target.value as SetName; })}>
        {TR.map((n) => <option key={n} value={n}>{SETS[n].label}</option>)}
      </select>
      {trErr ? <p className="text-sm text-weak">The translation could not be loaded.</p>
        : tr ? <p className={lang === "ur" ? "ur text-[17px]" : "leading-relaxed"} dir={lang === "ur" ? "rtl" : "ltr"}>{tr}</p>
        : <p className="text-sm text-muted">Loading…</p>}

      <label className="label" htmlFor="tafsel">Tafsir</label>
      <select id="tafsel" className="field" value={taf} onChange={(e) => setTaf(e.target.value as TafsirChoice)}>
        <option value="">Choose a tafsir…</option>
        <option value="tafsir-ar-muyassar">{SETS["tafsir-ar-muyassar"].label}</option>
        {(Object.keys(REMOTE_TAFSIR) as RemoteTafsir[]).map((n) => <option key={n} value={n}>{REMOTE_TAFSIR[n]}</option>)}
      </select>
      {taf && (tafState === "loading" ? <p className="text-sm text-muted">Loading the tafsir…</p>
        : tafState === "error" ? <p className="text-sm text-weak">This tafsir could not be loaded. It needs an internet connection.</p>
        : <div className={`card max-h-72 overflow-auto ${taf === "tafsir-ar-muyassar" ? "ar text-[17px]" : "ur text-[16px]"}`} dir="rtl">{tafText}</div>)}

      <div className="grid grid-cols-2 gap-2">
        <button className={`btn ${bm ? "btn-on" : ""}`} onClick={() => update((d) => { if (d.bookmarks[k]) delete d.bookmarks[k]; else d.bookmarks[k] = { t: Date.now(), f: 0 }; })}>{bm ? "Bookmarked" : "Bookmark"}</button>
        <button className={`btn ${bm?.f ? "btn-on" : ""}`} onClick={() => update((d) => { const b = d.bookmarks[k] || (d.bookmarks[k] = { t: Date.now(), f: 0 }); b.f = b.f ? 0 : 1; })}>{bm?.f ? "Favourite" : "Add to favourites"}</button>
        <button className="btn" onClick={() => audio.play(s, a)}>Play this ayah</button>
        <button className="btn" onClick={() => { audio.setRepeat("ayah"); audio.play(s, a); }}>Play on repeat</button>
        <Link className="btn" href={`/recite?s=${s}&a=${a}&endS=${s}&endA=${a}`}>Recite this ayah</Link>
        <Link className="btn-primary col-span-2" href={`/mushaf?p=${pageOf(s, a)}&mode=learn`}>Learn this page (page {pageOf(s, a)}) step by step</Link>
        <Link className="btn" href={`/mushaf?p=${pageOf(s, a)}&mode=learn&from=${s}:${a}&to=${s}:${a}`}>Learn this ayah</Link>
        <Link className="btn" href={`/learn?s=${s}&a=${a}&endS=${s}&endA=${a}`}>Memorize this ayah</Link>
        <Link className="btn" href={`/memorize?s=${s}&a=${a}&endS=${s}&endA=${a}&mode=revise`}>Revise this ayah</Link>
        {onPractise && <button className="btn-primary col-span-2" onClick={onPractise}>Practise this ayah from memory</button>}
        <SimilarButton s={s} a={a} className="col-span-2" onOpen={() => setSimilar(true)} />
      </div>
    </Sheet></>
  );
}

