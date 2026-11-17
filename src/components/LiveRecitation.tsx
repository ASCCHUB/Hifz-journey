"use client";
// Live recitation: microphone -> speech engine -> word alignment against the canonical Quran text.
// Recognition can be wrong. Every flagged word is a suspicion until the user confirms it; nothing here edits the Quran text.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "@/components/Audio";
import MiniMushafPage from "@/components/MiniMushafPage";
import ControlIcon from "@/components/ControlIcon";
import { installAndroidSpeech } from "@/lib/androidSpeech";

// Direct /recite opens this component without the old passage picker; install the native microphone adapter here.
installAndroidSpeech();
import { arNum, juzOf, key, pageOf, ref, sarabic, sname, words } from "@/lib/quran";
import { align, buildExpected, summarize, type Alignment, type ExpStatus, type HeardResult, type HeardToken, type Verdict } from "@/lib/recitationAlign";
import { browserSpeechAvailable, checkLocalAsr, createSession, DEFAULT_ASR_URL, getAsrUrl, playPcm, setAsrUrl, type AsrHealth, type AsrSession, type EngineKind, type FinalSegment } from "@/lib/quranAsr";
import { assessAyahs, saveRecitation } from "@/lib/recitationResults";
import { locate } from "@/lib/quranLocate";
import { update, useStore } from "@/lib/store";

type Status = "idle" | "starting" | "listening" | "paused" | "finishing" | "stopped";
type Run = { anchor: number; fromSeg: number };
type Merged = Alignment & { runOf: number[]; ranges: [number, number][] };

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
const STATUS_TEXT: Record<ExpStatus, string> = { pending: "Not recited yet", correct: "Matched", incorrect: "Possibly incorrect", missing: "Possibly skipped", uncertain: "Unclear recognition" };
const WORD_CLASS: Record<ExpStatus, string> = {
  pending: "", correct: "text-strong", incorrect: "text-weak bg-weak/10 rounded-md",
  missing: "text-revise bg-revise/15 rounded-md", uncertain: "text-muted bg-veil/60 rounded-md",
};

/** `auto`: items is the whole Quran; the starting point is detected from what is recited. */
export default function LiveRecitation({ items, title, onClose, auto = false }: { items: [number, number][]; title: string; onClose: () => void; auto?: boolean }) {
  const st = useStore();
  const audio = useAudio();
  const exp = useMemo(() => buildExpected(items, words), [items]);
  const [locating, setLocating] = useState("");
  const [health, setHealth] = useState<AsrHealth | null | undefined>(undefined);
  const [engine, setEngine] = useState<EngineKind>("local");
  const [status, setStatus] = useState<Status>("idle");
  const [segments, setSegments] = useState<Map<number, FinalSegment>>(new Map());
  const [partial, setPartial] = useState("");
  const initialRuns = (): Run[] => (auto ? [] : [{ anchor: 0, fromSeg: 0 }]);
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState(auto);
  const [keepAudio, setKeepAudio] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [queue, setQueue] = useState({ pending: 0, failed: 0 });
  const [latency, setLatency] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ rescheduled: number } | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const session = useRef<AsrSession | null>(null);
  const segIdBase = useRef(0); // keeps segment ids unique across engine restarts
  const startedAt = useRef<number | null>(null);
  const before = useRef(0);
  const currentNode = useRef<HTMLSpanElement>(null);
  const browserOk = useMemo(() => browserSpeechAvailable(), []);

  const probe = useCallback(async () => {
    setHealth(undefined);
    const h = await checkLocalAsr();
    setHealth(h);
    setEngine((e) => (h ? "local" : browserOk ? "browser" : e));
  }, [browserOk]);
  useEffect(() => { setUrlDraft(getAsrUrl()); void probe(); }, [probe]);

  // ---- alignment over all runs (a run restarts alignment at a chosen ayah: retry / jump / prev / next)
  const tokens = useMemo<HeardToken[]>(() => [...segments.values()].sort((a, b) => a.id - b.id).flatMap((seg) =>
    seg.text.split(/\s+/).filter(Boolean).map((raw, i) => ({ id: `${seg.id}:${i}`, raw, seg: seg.id, confidence: seg.confidence }))), [segments]);
  const merged = useMemo<Merged>(() => {
    const out: Merged = { exp: exp.map(() => "pending"), heardFor: exp.map(() => null), heard: [], cursor: 0, lost: false, runOf: [], ranges: [] };
    const ayahStart = (i: number) => i - exp[i].w;
    const ayahEnd = (i: number) => { let e = i; while (e + 1 < exp.length && exp[e + 1].w !== 0) e++; return e; };
    runs.forEach((run, ri) => {
      const end = runs[ri + 1]?.fromSeg | Infinity;
      const a = align(exp, tokens.filter((t) => t.seg >= run.fromSeg && t.seg < end), run.anchor);
      const offset = out.heard.length;
      a.exp.forEach((s, e) => { if (s !== "pending") { out.exp[e] = s; out.heardFor[e] = a.heardFor[e] === null ? null : offset + a.heardFor[e]!; } });
      out.heard.push(...a.heard); out.runOf.push(...a.heard.map(() => ri));
      out.cursor = a.cursor; out.lost = a.lost;
      if (auto) { // show from the ayah where this run started to the ayah after the current one
        const last = Math.min(exp.length - 1, a.cursor), afterNext = ayahEnd(last) + 1 < exp.length ? ayahEnd(ayahEnd(last) + 1) : ayahEnd(last);
        out.ranges.push([ayahStart(run.anchor), afterNext]);
      }
    });
    if (!auto) out.ranges = [[0, exp.length - 1]];
    else { // merge overlapping ranges, keep recitation order
      const merged: [number, number][] = [];
      out.ranges.forEach(([a, b]) => { const m = merged.find(([x, y]) => a <= y + 1 && b >= x - 1); if (m) { m[0] = Math.min(m[0], a); m[1] = Math.max(m[1], b); } else merged.push([a, b]); });
      out.ranges = merged;
    }
    return out;
  }, [exp, tokens, runs, auto]);

  // ---- auto mode: find the recited place in the whole Quran, and find it again if the reciter moves elsewhere
  const lastLocate = useRef("");
  useEffect(() => {
    if (!auto || !tokens.length) return;
    const lostNow = runs.length > 0 && merged.lost;
    if (runs.length && !lostNow) { setLocating(""); return; }
    const fromSeg = runs.length ? runs[runs.length - 1].fromSeg : 0;
    const pool = tokens.filter((t) => t.seg >= fromSeg);
    const window = lostNow ? pool.slice(-12) : pool.slice(-30);
    const sig = window.map((t) => t.id).join(",");
    if (sig === lastLocate.current) return;
    lastLocate.current = sig;
    const r = locate(exp, window);
    if (!r) { setLocating(runs.length ? "Lost your place — listening for where you are…" : "Listening… recite a few words to find your place"); return; }
    if (r.ambiguous) { setLocating(`These words appear in more than one place (${r.reason}). Keep reciting…`); return; }
    const startTok = window[r.tokenIndex];
    setLocating("");
    setRuns((prev) => prev.some((p) => p.anchor === r.start && p.fromSeg === startTok.seg) ? prev : [...prev, { anchor: r.start, fromSeg: startTok.seg }]);
  }, [auto, tokens, runs, merged.lost, exp]);
  const summary = useMemo(() => summarize(merged, verdicts), [merged, verdicts]);
  const cursor = Math.min(merged.cursor, exp.length - 1);
  const cur = exp[cursor];
  const done = merged.cursor >= exp.length;

  // ---- timer
  useEffect(() => {
    if (status !== "listening") return;
    const id = setInterval(() => { if (startedAt.current) setElapsed(before.current + Math.floor((Date.now() - startedAt.current) / 1000)); }, 500);
    return () => clearInterval(id);
  }, [status]);
  const stopClock = () => { if (startedAt.current) { before.current += Math.floor((Date.now() - startedAt.current) / 1000); startedAt.current = null; setElapsed(before.current); } };
  useEffect(() => { currentNode.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [cursor]);
  useEffect(() => () => { void session.current?.stop(); }, []);

  // ---- engine control
  const start = async () => {
    if (auto) setHidden(true); // memory test: text hides immediately after Recite is pressed
    setError(""); setStatus("starting");
    const base = segIdBase.current;
    const s = createSession(engine, {
      onPartial: setPartial,
      onFinal: (seg) => {
        const id = base + seg.id; segIdBase.current = Math.max(segIdBase.current, id + 1);
        if (seg.ms !== undefined) setLatency(seg.ms);
        setSegments((m) => new Map(m).set(id, { ...seg, id }));
      },
      onError: (code, message) => {
        setError(message);
        if (code !== "other") { stopClock(); setStatus((x) => (x === "listening" || x === "starting" ? "paused" : x)); }
      },
      onLevel: setLevel,
      onQueue: (pending, failed) => setQueue({ pending, failed }),
    }, { keepAudio });
    try {
      await s.start();
      session.current = s; startedAt.current = Date.now(); setStatus("listening");
    } catch { setStatus("idle"); }
  };
  const pause = () => { session.current?.pause(); stopClock(); setStatus("paused"); setLevel(0); };
  const resume = async () => {
    setError("");
    if (!session.current) return start();
    await session.current.resume(); startedAt.current = Date.now(); setStatus("listening");
  };
  const finish = async () => {
    setStatus("finishing"); stopClock(); setPartial(""); setLevel(0);
    await session.current?.stop();
    setStatus("stopped"); setSelected(null);
  };
  const retryRecognition = () => { setError(""); session.current?.retryFailed(); };
  /** Start aligning again from the start of a given ayah (retry, jump, prev/next). */
  const restartAt = (wordIndex: number) => {
    const ayahStart = exp.findIndex((w) => w.s === exp[wordIndex].s && w.a === exp[wordIndex].a);
    setRuns((r) => [...r, { anchor: ayahStart, fromSeg: segIdBase.current }]);
    setPartial("");
  };
  const ayahStep = (dir: 1 | -1) => {
    const startOfCur = exp.findIndex((w) => w.s === cur.s && w.a === cur.a);
    const target = dir === 1 ? exp.findIndex((w, i) => i > startOfCur && w.w === 0) : (() => { for (let i = startOfCur - 1; i >= 0; i--) if (exp[i].w === 0) return i; return 0; })();
    if (target >= 0) restartAt(target);
  };

  const heardFor = (e: number): HeardResult | undefined => { const h = merged.heardFor[e]; return h === null ? undefined : merged.heard[h]; };
  const save = () => {
    let res = { rescheduled: 0 };
    // In auto mode, record only the ayahs actually recited, and name the session after them.
    const touched = auto ? items.filter(([s, a]) => merged.exp.some((x, i) => x !== "pending" && exp[i].s === s && exp[i].a === a)) : items;
    if (!touched.length) return;
    const autoTitle = auto ? [...new Set(touched.map(([s]) => s))].map((s) => { const ay = touched.filter(([x]) => x === s).map(([, a]) => a); return `${sname(s)} ${Math.min(...ay)}–${Math.max(...ay)}`; }).join(", ") : title;
    update((d) => { res = saveRecitation(d, { exp, al: merged, verdicts, summary, heardText: (e) => heardFor(e)?.raw, title: autoTitle, engine, secs: elapsed, items: touched }); });
    setSaved(res);
  };
  const setVerdict = (e: number, v: Verdict | null) => setVerdicts((x) => { const n = { ...x }; if (v) n[e] = v; else delete n[e]; return n; });

  // ---- view helpers
  const pg = pageOf(cur.s, cur.a), juz = juzOf(cur.s, cur.a), bmKey = key(cur.s, cur.a), bookmarked = !!st.bookmarks[bmKey];
  // Align the recognized word states back to the original fixed 15-line Quran page.
  // These are advisory speech-recognition results, not confirmed Tajweed or Hifz grading.
  const visibleWordIndex = useMemo(() => {
    const index = new Map<string, number>();
    if (auto && runs.length) exp.forEach((w, i) => { if (pageOf(w.s, w.a) === pg) index.set(`${w.s}:${w.a}:${w.w}`, i); });
    return index;
  }, [auto, runs.length, exp, pg]);
  const mistakes = summary.incorrect + summary.missing;
  const listening = status === "listening";
  const ayahsInfo = useMemo(() => status === "stopped" ? assessAyahs(exp, merged, verdicts) : {}, [status, exp, merged, verdicts]);
  const weakAyahs = Object.entries(ayahsInfo).filter(([, v]) => v === "confirmed" || v === "suspected").map(([k]) => k);

  const sel = selected !== null ? exp[selected] : null;
  const selStatus = selected !== null ? merged.exp[selected] : "pending";
  const selHeard = selected !== null ? heardFor(selected) : undefined;
  const selAudio = selHeard && session.current?.audioFor(selHeard.seg);

  const renderWord = (w: (typeof exp)[number], i: number) => {
    const s = merged.exp[i], v = verdicts[i];
    const showText = !hidden || s !== "pending" || status === "stopped";
    const cls = v === "dismissed" ? WORD_CLASS.correct : WORD_CLASS[s];
    return <span key={i}>
      <span ref={i === cursor && !done ? currentNode : undefined} role="button" tabIndex={0}
        onClick={() => setSelected(i)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(i); }}
        className={`cursor-pointer px-0.5 ${cls} ${v === "confirmed" ? "underline decoration-2 underline-offset-8" : ""} ${i === cursor && !done && status !== "idle" && runs.length ? "rounded-md ring-2 ring-accent" : ""} ${showText ? "" : "text-transparent border-b-2 border-line"}`}
        aria-label={`${w.txt}: ${STATUS_TEXT[s]}`}>{w.txt}</span>{" "}
      {i === exp.length - 1 || exp[i + 1].a !== w.a || exp[i + 1].s !== w.s
        ? <button className="mx-1 inline-grid h-9 min-w-9 place-items-center rounded-full border border-accent/50 px-1 align-middle font-ui text-sm text-accent" title={`Continue from ${ref(w.s, w.a)}`}
            onClick={() => (status === "listening" || status === "paused") ? restartAt(i - w.w) : audio.play(w.s, w.a)}>{arNum(w.a)}</button>
        : null}
    </span>;
  };

  return <div className="-mx-4 -mt-4 flex min-h-[calc(100dvh-4rem)] flex-col bg-bg sm:mx-0 sm:mt-0">
    {/* ---- top toolbar */}
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur">
      <button className="btn btn-sm" onClick={async () => { await session.current?.stop(); onClose(); }} aria-label="Back">←</button>
      <div className="min-w-0 flex-1">
        {auto && !runs.length
          ? <><div className="truncate font-bold">Recite from anywhere</div><div className="truncate text-xs text-muted">Your place in the Quran is detected from your recitation</div></>
          : <><div className="truncate font-bold">{sname(cur.s)} <span className="q text-base font-normal">{sarabic(cur.s)}</span></div>
            <div className="truncate text-xs text-muted">Page {pg} · Juz {juz} · Ayah {cur.a}{auto ? " · detected" : ` · ${title}`}</div></>}
      </div>
      <button className={`btn btn-sm ${bookmarked ? "btn-on" : ""}`} aria-label={bookmarked ? "Remove bookmark" : "Bookmark this ayah"} title={`Bookmark ${ref(cur.s, cur.a)}`}
        onClick={() => update((d) => { if (d.bookmarks[bmKey]) delete d.bookmarks[bmKey]; else d.bookmarks[bmKey] = { t: Date.now(), f: 0 }; })}>{bookmarked ? "★" : "☆"}</button>
      <button className={`btn btn-sm ${showSettings ? "btn-on" : ""}`} aria-label="Recitation settings" onClick={() => setShowSettings((v) => !v)}><ControlIcon name="settings" /></button>
    </header>

    {/* ---- settings / engine */}
    {showSettings && <section className="m-3 card flex flex-col gap-3 text-sm">
      <div className="font-bold">Speech recognition</div>
      <label className={`flex items-start gap-2 rounded-xl border p-3 ${engine === "local" ? "border-accent bg-accent-soft/50" : "border-line"}`}>
        <input type="radio" name="engine" className="mt-1" checked={engine === "local"} disabled={!health || status !== "idle"} onChange={() => setEngine("local")} />
        <span><b>Quran model on your speech server</b> {health === undefined ? <span className="text-muted">· checking…</span> : health ? <span className="text-strong">· connected</span> : <span className="text-weak">· not running</span>}<br />
          <span className="text-muted">tarteel-ai/whisper-base-ar-quran (Apache-2.0), trained on Quran recitation. Audio goes only to the server at <code dir="ltr">{getAsrUrl()}</code>; it is processed in memory and not saved.</span></span>
      </label>
      <label className={`flex items-start gap-2 rounded-xl border p-3 ${engine === "browser" ? "border-accent bg-accent-soft/50" : "border-line"}`}>
        <input type="radio" name="engine" className="mt-1" checked={engine === "browser"} disabled={!browserOk || status !== "idle"} onChange={() => setEngine("browser")} />
        <span><b>Browser / phone speech recognition</b> {browserOk ? "" : <span className="text-weak">· not available here</span>}<br />
          <span className="text-muted">Generic Arabic, not trained on Quran recitation, so it mishears more. Your browser or phone provider (e.g. Google) processes the audio.</span></span>
      </label>
      {!health && health !== undefined && <p className="rounded-xl bg-revise/10 p-3 text-revise">Start the server on this computer: <code dir="ltr">powershell -ExecutionPolicy Bypass -File speech-server\start.ps1</code>, then <button className="underline" onClick={() => void probe()}>check again</button>.</p>}
      <details><summary className="cursor-pointer text-muted">Server address</summary>
        <div className="mt-2 flex gap-2"><input className="field flex-1" dir="ltr" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} />
          <button className="btn btn-sm" onClick={() => { setAsrUrl(urlDraft.trim() || DEFAULT_ASR_URL); void probe(); }}>Save</button></div></details>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={keepAudio} disabled={status !== "idle" || engine !== "local"} onChange={(e) => setKeepAudio(e.target.checked)} />
        <span>Keep my audio until I leave this screen, so I can replay what was heard for a word. <span className="text-muted">Held in memory only, never saved or uploaded anywhere else.</span></span></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hide the text I have not recited yet (memory test)</label>
      <p className="text-xs text-muted">This checks which words were recognized, not Tajweed, harakat or pronunciation. Flagged words can be recognition errors. A qualified teacher remains the authority on your recitation.</p>
    </section>}

    {error && <div role="alert" className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-weak/40 bg-weak/10 p-3 text-sm text-weak">
      <span className="flex-1">{error}</span>
      {queue.failed > 0 && <button className="btn btn-sm" onClick={retryRecognition}>Retry recognition ({queue.failed})</button>}
    </div>}
    {auto && locating && (listening || status === "paused") && <div className="mx-3 mt-3 rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-sm text-accent" aria-live="polite">{locating}</div>}
    {!auto && merged.lost && listening && <div className="mx-3 mt-3 rounded-xl border border-revise/40 bg-revise/10 p-3 text-sm text-revise">I can’t match the last words to this passage. Tap the ayah number you are reciting to continue from there.</div>}

    {/* ---- Quran text */}
    <main className="flex-1 overflow-auto px-3 py-4">
      {auto && !runs.length && status !== "stopped" && <p className="mt-10 text-center text-muted">{status === "idle" ? "Press Start, then recite any ayah from memory. The text appears once your place is found." : "Listening… after a few words your place in the Quran will appear here."}</p>}
      {auto && runs.length > 0 && <div className="mx-auto max-w-3xl" aria-label={`Detected Mushaf page ${pg}`} data-testid="detected-mushaf-page">
        <MiniMushafPage page={pg} active={`${cur.s}:${cur.a}`}
          state={(f) => {
            const i = visibleWordIndex.get(`${f.s}:${f.a}:${f.w}`);
            if (i === undefined) return hidden ? "hide" : "show";
            return hidden && merged.exp[i] === "pending" && status !== "stopped" ? "hide" : "show";
          }}
          wordClass={(f) => {
            const i = visibleWordIndex.get(`${f.s}:${f.a}:${f.w}`);
            if (i === undefined) return "";
            const result = merged.exp[i];
            return verdicts[i] === "dismissed" ? "text-strong" :
              result === "incorrect" ? "text-weak !text-weak bg-weak/15 rounded" :
              result === "missing" || result === "uncertain" ? "text-revise bg-revise/15 rounded" :
              result === "correct" ? "text-strong" : "";
          }}
/>
        <p className="mt-2 text-center text-xs text-muted">Page ${pg} · Matching words appear as you recite. <span className="text-weak">Red = possible mismatch</span>, not a confirmed mistake.</p>
      </div>}
      {!auto && merged.ranges.map(([from, to], ri) => <p key={`${from}-${ri}`} className={`q text-[26px] leading-[2.35] sm:text-[31px] ${ri ? "mt-6 border-t border-line pt-4" : ""}`} dir="rtl">
        {auto && <span className="mb-2 block text-center font-ui text-sm text-muted" dir="ltr">{sname(exp[from].s)} · from ayah {exp[from].a}</span>}
        {exp.slice(from, to + 1).map((w, k) => {
          const i = from + k;
          if (auto && w.w === 0 && w.a === 1 && i !== from) return <span key={i}><span className="my-2 block text-center font-ui text-sm text-muted" dir="ltr">{sname(w.s)}</span>{renderWord(w, i)}</span>;
          return renderWord(w, i);
        })}
      </p>)}
      {partial && listening && <p className="q mt-3 rounded-xl bg-gold/10 px-3 py-1 text-xl text-gold" dir="rtl" aria-live="polite">… {partial}</p>}
      {status === "stopped" && <Summary summary={summary} secs={elapsed} weak={weakAyahs} saved={saved} onSave={save} onRetry={() => { setStatus("idle"); setSegments(new Map()); setRuns(initialRuns()); setVerdicts({}); setSaved(null); setElapsed(0); before.current = 0; session.current = null; segIdBase.current = 0; lastLocate.current = ""; }} onClose={onClose} />}
    </main>

    {/* ---- word detail panel */}
    {sel && <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-xl rounded-t-3xl border border-line bg-surface p-4 shadow-2xl" role="dialog" aria-label="Word details">
      <div className="mb-2 flex items-center justify-between"><b>{ref(sel.s, sel.a)} · word {sel.w + 1}</b><button className="btn btn-sm" onClick={() => setSelected(null)}>Close</button></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-2"><div className="label">Quran text</div><div className="q text-3xl">{sel.txt}</div></div>
        <div className="rounded-xl border border-line p-2"><div className="label">Recognized</div><div className="q text-3xl">{selHeard?.raw ?? <span className="font-ui text-base text-muted">{selStatus === "missing" ? "nothing (skipped?)" : "—"}</span>}</div></div>
      </div>
      <div className="mt-2 text-sm"><b>{verdicts[selected!] === "confirmed" ? "Confirmed mistake" : verdicts[selected!] === "dismissed" ? "Marked correct by you" : STATUS_TEXT[selStatus]}</b>
        {selHeard?.confidence !== undefined && <span className="text-muted"> · recognizer certainty {Math.round(selHeard.confidence * 100)}% (about the recognition, not your recitation)</span>}</div>
      {(selStatus === "incorrect" || selStatus === "missing") && !verdicts[selected!] && <p className="mt-1 text-sm text-muted">The correct word is <span className="q text-lg text-ink">{sel.txt}</span>. Listen to the ayah, then decide — speech recognition can mishear.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => audio.play(sel.s, sel.a)}>▶ Correct recitation</button>
        {selAudio && <button className="btn btn-sm" onClick={() => playPcm(selAudio)}>▶ My recording</button>}
        {selStatus !== "pending" && selStatus !== "correct" && <>
          <button className={`btn btn-sm ${verdicts[selected!] === "confirmed" ? "btn-on" : ""}`} onClick={() => setVerdict(selected!, verdicts[selected!] === "confirmed" ? null : "confirmed")}>I made this mistake</button>
          <button className={`btn btn-sm ${verdicts[selected!] === "dismissed" ? "btn-on" : ""}`} onClick={() => setVerdict(selected!, verdicts[selected!] === "dismissed" ? null : "dismissed")}>I recited it correctly</button>
        </>}
      </div>
    </div>}

    {/* ---- bottom bar */}
    {status !== "stopped" && <footer className="sticky bottom-0 z-30 border-t border-line bg-surface/95 px-3 pb-3 pt-2 backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="pill !bg-weak/15 !text-weak" title="Possible incorrect or skipped words (unconfirmed)">⚑ {mistakes}</span>
        <span className="pill" title="Matched ÷ (matched + possibly incorrect + possibly skipped), uncertain words excluded">{summary.accuracy === null ? "–" : `${summary.accuracy}%`}</span>
        <span className="pill !bg-transparent border border-line !text-ink tabular-nums"><span className={`mr-1 inline-block h-2 w-2 rounded-full ${listening ? "bg-weak animate-pulse" : "bg-muted"}`} />{mmss(elapsed)}</span>
        {listening && <span className="h-2 w-16 overflow-hidden rounded-full bg-line" aria-label="Microphone level"><span className="block h-full bg-strong transition-[width]" style={{ width: `${Math.min(100, level * 900)}%` }} /></span>}
        {engine === "local" && queue.pending > 0 && <span className="text-xs text-muted">recognizing…</span>}
        {latency !== null && <span className="ml-auto text-xs text-muted">{engine === "local" ? `model ${latency} ms` : ""}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-sm" onClick={() => setHidden((v) => !v)} aria-label={hidden ? "Show Quran text" : "Hide Quran text"} aria-pressed={!hidden} title="Eye: show or hide Quran text"><ControlIcon name={hidden ? "eye" : "eye-off"} /> {hidden ? "Show" : "Hide"}</button>
        {!auto && <div className="flex gap-1">
          <button className="btn btn-sm" disabled={status === "idle"} onClick={() => ayahStep(-1)} aria-label="Previous ayah">‹ Prev</button>
          <button className="btn btn-sm" disabled={status === "idle"} onClick={() => restartAt(cursor)} title="Recite the current ayah again">Retry ayah</button>
          <button className="btn btn-sm" disabled={status === "idle"} onClick={() => ayahStep(1)} aria-label="Next ayah">Next ›</button>
        </div>}
        {status === "idle" && <button className="btn-primary" disabled={(engine === "local" && !health) || (engine === "browser" && !browserOk)} onClick={() => void start()}><ControlIcon name="mic" /> Recite</button>}
        {status === "starting" && <button className="btn-primary" disabled>Starting…</button>}
        {listening && <button className="btn-primary" onClick={pause}>❚❚ Pause</button>}
        {status === "paused" && <button className="btn-primary" onClick={() => void resume()}>● Resume</button>}
      </div>
      {(listening || status === "paused" || status === "finishing") && <button className="btn mt-2 w-full" disabled={status === "finishing"} onClick={() => void finish()}>{status === "finishing" ? "Finishing recognition…" : "■ Stop and review"}</button>}
    </footer>}
  </div>;
}

function Summary({ summary: s, secs, weak, saved, onSave, onRetry, onClose }: { summary: ReturnType<typeof summarize>; secs: number; weak: string[]; saved: { rescheduled: number } | null; onSave: () => void; onRetry: () => void; onClose: () => void }) {
  const row = (label: string, v: string | number, hint?: string) => <div className="flex justify-between gap-3 py-1.5"><span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span><b className="tabular-nums">{v}</b></div>;
  return <section className="card mt-6 flex flex-col gap-1 text-sm">
    <h2 className="text-lg font-bold">Session review</h2>
    <div className="divide-y divide-line">
      {row("Recitation time", mmss(secs))}
      {row("Words reached", s.reached)}
      {row("Matched", s.correct)}
      {row("Incorrect words", s.incorrect, "flagged by recognition or confirmed by you")}
      {row("Skipped words", s.missing)}
      {row("Mistakes you confirmed", s.confirmed)}
      {row("Unclear recognition", s.uncertain, "not counted as mistakes")}
      {row("Extra words heard", s.extra)}
      {row("Repeated words", s.repeats)}
      {row("Still to review", s.review, "tap red/orange words to confirm or dismiss")}
      {row("Match rate", s.accuracy === null ? "–" : `${s.accuracy}%`, "matched ÷ (matched + possibly incorrect + possibly skipped); unclear words excluded")}
    </div>
    {weak.length > 0 && <p className="mt-2"><b>Ayahs to revise:</b> {weak.map((k) => { const [a, b] = k.split(":"); return `${a}:${b}`; }).join(", ")}</p>}
    <p className="mt-2 text-xs text-muted">Saving updates revision only for ayahs you already track: confirmed mistakes send an ayah to the weak queue and reset its interval; unconfirmed suspicions only count if they recur on another day; clean ayahs count as a successful review.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {saved ? <span className="pill">Saved · {saved.rescheduled} ayahs updated</span> : <button className="btn-primary" onClick={onSave}>Save to my Hifz progress</button>}
      <button className="btn" onClick={onRetry}>Recite again</button>
      <button className="btn" onClick={onClose}>Done</button>
    </div>
  </section>;
}
