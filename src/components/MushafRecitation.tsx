"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkLocalAsr, browserSpeechAvailable, createSession, type AsrErrorCode, type AsrSession, type EngineKind, type FinalSegment } from "@/lib/quranAsr";
import { feedbackIsVisible, feedbackLabel, recognitionEngineLabel, reviewMushafRecitation, type MushafMode, type MushafReview } from "@/lib/mushafRecitation";
import { installAndroidSpeech } from "@/lib/androidSpeech";
import { ref } from "@/lib/quran";

installAndroidSpeech();
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const errorText: Record<AsrErrorCode, string> = {
  "not-allowed": "Microphone permission was denied. Allow microphone access in your browser or device settings, then try again.",
  "audio-capture": "No usable microphone was found. Connect or enable a microphone, then try again.",
  network: "The speech recognizer could not be reached. Check the network or the local Quran speech server and try again.",
  unsupported: "Speech recognition is not available on this device.",
  other: "The microphone or speech recognizer could not start. Check microphone access and try again.",
};

export default function MushafRecitation({ items, page, mode, directStart = false, onStart, onHelp }: { items: [number, number][]; page: number; mode: MushafMode; directStart?: boolean; onStart?: () => void; onHelp?: () => void }) {
  const [open, setOpen] = useState(false);
  const [engine, setEngine] = useState<EngineKind>("local");
  const [hasLocal, setHasLocal] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "recording" | "processing" | "review">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<FinalSegment[]>([]);
  const [review, setReview] = useState<MushafReview | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, "confirmed" | "dismissed">>({});
  const [error, setError] = useState("");
  const session = useRef<AsrSession | null>(null);
  const finalSegments = useRef<FinalSegment[]>([]);
  const generation = useRef(0);
  const elapsedRef = useRef(0);
  const alive = useRef(true);
  const startAt = useRef(0);
  const feedbackVisible = feedbackIsVisible(mode);
  const expected = useMemo(() => review?.alignment.exp.map((s, i) => verdicts[i] === "dismissed" ? "correct" as const : s) ?? [], [review, verdicts]);

  useEffect(() => {
    alive.current = true;
    void checkLocalAsr().then((h) => {
      if (!alive.current) return;
      setHasLocal(!!h);
      setEngine(h ? "local" : "browser");
    });
    return () => {
      alive.current = false;
      generation.current++;
      const s = session.current; session.current = null;
      void s?.stop(); // stop microphone tracks when the page/session ends
    };
  }, []);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed(elapsedRef.current + Math.floor((Date.now() - startAt.current) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [status]);

  const start = async () => {
    if (hasLocal === null) return;
    if (!hasLocal && !browserSpeechAvailable()) { setOpen(true); setError("Speech recognition is unavailable on this device."); return; }
    const runId = ++generation.current;
    setOpen(true); setError(""); setReview(null); setVerdicts({}); setSegments([]); finalSegments.current = []; setElapsed(0); elapsedRef.current = 0; setStatus("starting");
    let parts: FinalSegment[] = [];
    const s = createSession(engine, {
      onPartial: () => { /* no interim transcript is shown on the Mushaf */ },
      onFinal: (segment) => { if (generation.current !== runId) return; parts = [...parts.filter((x) => x.id !== segment.id), segment]; finalSegments.current = parts; if (alive.current) setSegments(parts); },
      onError: (code) => { if (alive.current && generation.current === runId) { setError(errorText[code]); const failed = session.current; session.current = null; void failed?.stop(); setStatus((x) => x === "starting" || x === "recording" ? "idle" : x); } },
      onLevel: () => {},
    }, { keepAudio: false });
    session.current = s;
    try {
      await s.start();
      if (!alive.current || generation.current !== runId) { await s.stop(); return; }
      onStart?.(); startAt.current = Date.now(); setStatus("recording");
    } catch {
      if (alive.current && generation.current === runId) setStatus("idle");
      if (session.current === s) session.current = null;
    }
  };

  const stop = async (cancel = false) => {
    if (status !== "recording" && status !== "starting" && status !== "idle") return;
    if (cancel && status === "starting") {
      generation.current++;
      const pending = session.current; session.current = null;
      await pending?.stop();
      if (alive.current) { setError(""); setStatus("idle"); setSegments([]); finalSegments.current = []; setReview(null); }
      return;
    }
    setStatus("processing");
    const s = session.current; session.current = null;
    await s?.stop();
    if (!alive.current) return;
    if (cancel) { setSegments([]); setReview(null); setStatus("idle"); setElapsed(0); elapsedRef.current = 0; return; }
    if (startAt.current) { elapsedRef.current += Math.floor((Date.now() - startAt.current) / 1000); startAt.current = 0; }
    setElapsed(elapsedRef.current);
    const result = reviewMushafRecitation(items, finalSegments.current);
    setReview(result); setStatus("review"); onHelp?.(); // advisory feedback is available; Recall/Revise records it as help
  };

  const statusFor = (i: number) => feedbackVisible ? expected[i] : undefined;
  const findings = review?.alignment.exp.map((s, i) => ({ s, w: i })).filter((x) => x.s === "incorrect" || x.s === "missing" || x.s === "uncertain") ?? [];
  const unmatched = review?.alignment.heard.filter((h) => h.status === "extra") ?? [];

  return <section className="mushaf-recitation" aria-label="Recite on this Mushaf page">
    <div className="mushaf-recitation-launch">
      <div className="min-w-0 flex-1"><b>{directStart ? "Recite the Quran" : `Recite on page ${page}`}</b><div className="text-xs text-muted">The Mushaf stays in place. Feedback appears after you stop.</div></div>
      <button className={`mushaf-mic-button ${directStart ? "mushaf-mic-primary" : ""}`} disabled={directStart && (hasLocal === null || (!hasLocal && !browserSpeechAvailable()) || status === "starting" || status === "processing")} aria-label={directStart ? status === "recording" ? `Stop recording, ${clock(elapsed)}` : `Start reciting on page ${page}` : open ? "Close recitation controls" : `Start reciting on page ${page}`} aria-expanded={directStart ? undefined : open} onClick={() => {
        if (directStart) {
          if (status === "recording") void stop(false);
          else if (status === "idle" || status === "review") void start();
        } else { setOpen((v) => !v); if (status === "review") setStatus("idle"); }
      }}>
        <span aria-hidden="true">{status === "recording" ? "●" : "🎙"}</span><span>{status === "recording" ? `${directStart ? "Stop · " : ""}${clock(elapsed)}` : directStart ? "Start reciting" : "Recite"}</span>
      </button>
    </div>
    {open && <div className="mushaf-recitation-panel card" aria-live="polite">
      {mode === "recall" && <p className="text-sm text-muted">Microphone use counts as help for the current Recall Ayah. Recognized words are hidden here so concealed Quran text stays concealed.</p>}
      {mode === "revise" && <p className="text-sm text-muted">This is advisory only. Using the microphone counts as help in the current revision step; it does not replace your rating.</p>}
      {(status === "idle" || status === "review") && <>
        <p className="text-sm text-muted">{hasLocal ? "Audio is sent in short chunks to the local Quran speech model on this computer, processed in memory, and not saved." : "Audio is handled by your browser or phone speech provider, which may send it to its service. The app does not save it. A desktop localhost model is not assumed to be available on Android."}</p>
        <button className="btn-primary min-h-[52px] w-full text-base" onClick={() => void start()} disabled={hasLocal === null || (!hasLocal && !browserSpeechAvailable())}>🎙 Start recording</button>
        {!hasLocal && hasLocal !== null && !browserSpeechAvailable() && <p role="alert" className="text-sm text-weak">{error || "Speech recognition is unavailable. You can continue reading without it."}</p>}
      </>}
      {status === "starting" && <div className="flex items-center justify-between gap-2"><p className="font-semibold" aria-live="assertive">Requesting microphone permission…</p><button className="btn" onClick={() => void stop(true)}>Cancel</button></div>}
      {status === "recording" && <div className="flex flex-wrap items-center gap-2">
        <span className="pill !bg-weak/15 !text-weak"><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-weak" />Recording · {clock(elapsed)}</span>
        <span className="text-xs text-muted">{recognitionEngineLabel(engine)} · no live word highlighting</span>
        <button className="btn-primary ml-auto" onClick={() => void stop(false)}>■ Stop and review</button>
        <button className="btn" onClick={() => void stop(true)}>Cancel</button>
      </div>}
      {status === "processing" && <p className="font-semibold">Processing the completed speech segments…</p>}
      {error && <p role="alert" className="text-sm text-weak">{error}</p>}
      {status === "review" && review && <div className="mushaf-review" aria-label="Post-recording recognition feedback">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>Post-recording feedback</b><span className="pill">{review.heardCount} recognized words</span></div>
        <p className="text-xs text-muted">Possible recognition findings only. There are no acoustic word timestamps; no Tajweed or pronunciation assessment is made. Check each finding yourself.</p>
      {mode === "recall" || mode === "revise" ? <p className="text-sm">{findings.length || unmatched.length ? `${findings.length + unmatched.length} possible recognition issue${findings.length + unmatched.length === 1 ? "" : "s"} found. Quran text and transcript remain hidden in ${mode === "recall" ? "Recall" : "Revise"} mode.` : `Recognition finished. Quran text and transcript remain hidden in ${mode === "recall" ? "Recall" : "Revise"} mode.`}</p>
          : findings.length || unmatched.length ? <ul className="max-h-36 space-y-2 overflow-auto text-sm">{findings.slice(0, 40).map(({ s, w }) => {
            const e = review.alignment; const got = e.heardFor[w]; const item = review.expected[w];
            return <li key={w} className="rounded-lg border border-line p-2">
              <div>{`${ref(item.s, item.a)} · word ${item.w + 1}: ${verdicts[w] === "confirmed" ? "You confirmed a possible slip" : verdicts[w] === "dismissed" ? "You marked this as recited correctly" : feedbackLabel(s)}`}{got !== null && got !== undefined && e.heard[got]?.raw ? <span className="ml-1 q" dir="rtl">Heard: {e.heard[got].raw}</span> : null}</div>
              {s !== "uncertain" && !verdicts[w] && <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={() => setVerdicts((v) => ({ ...v, [w]: "dismissed" }))}>I recited this correctly</button>
                <button className="btn btn-sm" onClick={() => setVerdicts((v) => ({ ...v, [w]: "confirmed" }))}>I confirm a slip</button>
              </div>}
            </li>;
          })}{unmatched.length > 0 && <li className="rounded-lg border border-line p-2"><b>Unmatched speech:</b> {unmatched.slice(0, 30).map((h) => h.raw).join(" ")}<div className="text-xs text-muted">The recognizer returned words that did not align with this passage.</div></li>}</ul> : <p className="text-sm">No possible mismatches found in the recognized portion. The unrecited remainder was not assessed.</p>}
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Matches {review.summary.correct} · possible mismatches {review.summary.incorrect + review.summary.missing} · unmatched {review.summary.extra} · unclear {review.summary.uncertain}</span><button className="btn btn-sm ml-auto" onClick={() => { setReview(null); setSegments([]); finalSegments.current = []; setVerdicts({}); setElapsed(0); elapsedRef.current = 0; setStatus("idle"); }}>Done</button></div>
      </div>}
    </div>}
    <span className="sr-only" aria-live="polite">{status === "recording" ? `Recording ${clock(elapsed)}` : status === "processing" ? "Processing recording" : status === "review" ? "Post-recording feedback ready" : ""}</span>
    <FeedbackBridge statuses={status === "review" && feedbackVisible ? expected : null} onStatus={statusFor} />
  </section>;
}

function FeedbackBridge({ statuses, onStatus }: { statuses: import("@/lib/recitationAlign").ExpStatus[] | null; onStatus: (i: number) => import("@/lib/recitationAlign").ExpStatus | undefined }) {
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".mushaf-page-shell [data-wi]").forEach((el) => {
      const i = Number(el.dataset.wi); const status = statuses && onStatus(i);
      el.classList.remove("recite-match", "recite-uncertain", "recite-possible-error");
      if (!status || status === "pending") { el.removeAttribute("aria-label"); return; }
      if (status === "correct") el.classList.add("recite-match");
      else if (status === "uncertain") el.classList.add("recite-uncertain");
      else if (status === "missing" || status === "incorrect") el.classList.add("recite-possible-error");
      el.setAttribute("aria-label", `${el.textContent || "Quran word"}: ${feedbackLabel(status)}`);
    });
    return () => document.querySelectorAll<HTMLElement>(".mushaf-page-shell [data-wi]").forEach((el) => { el.classList.remove("recite-match", "recite-uncertain", "recite-possible-error"); el.removeAttribute("aria-label"); });
  }, [statuses, onStatus]);
  return null;
}
