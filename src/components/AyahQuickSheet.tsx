"use client";
// Long-press quick sheet for one Ayah: Arabic recitation (the app's one shared audio player, selected reciter,
// this Ayah only), the attributed Urdu translation text, and Urdu translation audio. Urdu audio is a verified,
// licensed recording of the Maududi translation when one is configured (lib/audioSources.ts; played and saved
// offline through the same cache as recitation); otherwise, and whenever the recording cannot play, the device's
// Urdu text-to-speech voice, always labelled as such.
// It never shows the Arabic text, so it cannot expose concealed words; MushafReader decides when it may open
// (lib/ayahQuick.ts).
import { useEffect, useRef, useState } from "react";
import { loadSet, ref, SETS, type SetName } from "@/lib/quran";
import { update, useStore } from "@/lib/store";
import { detectUrduVoice, pauseUrdu, resumeUrdu, speakUrdu, stopUrdu, type UrduVoice } from "@/lib/urduSpeech";
import { resolveUrduAudio, URDU_TTS_LABEL } from "@/lib/audioSources";
import { pauseUrduRecording, playUrduRecording, resumeUrduRecording, stopUrduRecording } from "@/lib/urduRecording";
import PersonalSurahRecording from "./PersonalSurahRecording";
import { RECITERS, useAudio } from "./Audio";
import { Sheet } from "./Shell";

const URDU: SetName[] = ["tr-ur-maududi", "tr-ur-jalandhry"];
type Tts = "idle" | "checking" | "speaking" | "paused" | "done" | "unavailable" | "failed";

export default function AyahQuickSheet({ s, a, onClose }: { s: number; a: number; onClose: () => void }) {
  const st = useStore(); const audio = useAudio();
  const set: SetName = URDU.includes(st.settings.tr) ? st.settings.tr : "tr-ur-maududi";
  const [tr, setTr] = useState(""); const [trErr, setTrErr] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const [tts, setTts] = useState<Tts>("idle"); const [voice, setVoice] = useState<UrduVoice | null>(null);
  const startedHere = useRef(false);
  // A recording exists only for the Maududi translation, and only once a verified, licensed source is configured.
  const urduChoice = set === "tr-ur-maududi" ? resolveUrduAudio(s, a) : null;
  const recording = urduChoice?.type === "recording" ? urduChoice : null;
  const [urduMode, setUrduMode] = useState<"tts" | "recording">(recording ? "recording" : "tts"); // what plays (or played last)
  const [recNote, setRecNote] = useState("");
  const personalPlayer = useRef<HTMLAudioElement | null>(null);
  const recRun = useRef(0);
  const stopRecording = () => { recRun.current++; stopUrduRecording(); };

  useEffect(() => {
    let live = true; setTr(""); setTrErr(false);
    loadSet(set).then((d) => { if (live) setTr(d[s - 1]?.[a - 1] || ""); }).catch(() => { if (live) setTrErr(true); });
    return () => { live = false; };
  }, [set, s, a]);

  // Translation audio ends with the sheet, and when the app goes to the background.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") { stopUrdu(); stopRecording(); setTts((t) => (t === "speaking" || t === "paused" ? "idle" : t)); } };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stopUrdu(); stopRecording(); };
  }, []);

  const mine = !!audio.cur && audio.cur[0] === s && audio.cur[1] === a;
  const arabicState = mine ? (audio.playing ? "playing" : "paused") : "idle";
  const playArabic = () => { personalPlayer.current?.pause(); stopUrdu(); stopRecording(); setTts((t) => (t === "speaking" || t === "paused" ? "idle" : t)); startedHere.current = true; audio.play(s, a, { s, a, b: a }); };

  const playUrdu = async () => {
    personalPlayer.current?.pause();
    if (audio.playing) audio.toggle(); // one stream at a time: pause the recitation
    setRecNote("");
    if (recording) {
      stopUrdu(); stopRecording();
      const my = ++recRun.current; const isCurrent = () => recRun.current === my;
      setUrduMode("recording"); setTts("checking");
      const onRec = (ev: "start" | "end" | "error" | "stop") => {
        if (!isCurrent()) return;
        if (ev === "start") setTts("speaking");
        else if (ev === "end") setTts("done");
        else if (ev === "error") { recRun.current++; setRecNote("The recorded Urdu translation could not play, so the device voice is used instead."); void playTts(); }
      };
      try { await playUrduRecording(recording.track, onRec); return; }
      catch (e) {
        if ((e as Error)?.name === "StaleAudioRequest" || !isCurrent()) return;
        recRun.current++;
        setRecNote((e as Error)?.name === "OfflineUnavailableError" ? "The recorded Urdu translation for this Ayah isn't saved on this device yet, so the device voice is used instead." : "The recorded Urdu translation could not play, so the device voice is used instead.");
      }
    }
    await playTts();
  };
  const playTts = async () => {
    if (!tr) { setTts("idle"); return; }
    setUrduMode("tts");
    setTts("checking");
    const v = voice?.ok ? voice : await detectUrduVoice(); setVoice(v);
    if (!v.ok) { setTts("unavailable"); setShowTr(true); return; }
    const ok = await speakUrdu(tr, (e) => setTts(e === "start" ? "speaking" : e === "end" ? "done" : e === "error" ? "failed" : "idle"));
    setTts(ok ? "speaking" : "failed");
  };
  const stopUrduHere = () => { stopUrdu(); stopRecording(); setTts("idle"); };
  const canPause = urduMode === "recording" || (voice?.ok && voice.canPause);
  const togglePause = () => {
    if (urduMode === "recording") { if (tts === "paused") { resumeUrduRecording(); setTts("speaking"); } else { pauseUrduRecording(); setTts("paused"); } return; }
    if (tts === "paused") { resumeUrdu(); setTts("speaking"); } else { pauseUrdu(); setTts("paused"); }
  };

  const urdu = SETS[set].label.replace(/^Urdu:\s*/, "");
  return (
    <Sheet title={ref(s, a)} onClose={onClose}>
      <div className="ayah-quick grid gap-3" data-testid="ayah-quick">
        <section className="grid gap-2" aria-label="Arabic recitation">
          <div className="flex flex-wrap gap-2">
            {arabicState === "idle" ? <button className="btn-primary flex-1" onClick={playArabic}>Play Arabic Recitation</button>
              : <>
                <button className="btn-primary flex-1" onClick={audio.toggle}>{arabicState === "playing" ? "Pause recitation" : "Resume recitation"}</button>
                <button className="btn" onClick={playArabic}>Replay</button>
              </>}
          </div>
          <p className="text-xs text-muted">Quran recitation · {RECITERS[st.settings.reciter] || st.settings.reciter} · this Ayah only</p>
          {mine && audio.error && <p className="text-sm text-weak" role="alert">{audio.error}</p>}
        </section>

        <section className="grid gap-2 border-t border-line pt-3" aria-label="Urdu translation">
          <div className="flex flex-wrap gap-2">
            <button className={`btn flex-1 ${showTr ? "btn-on" : ""}`} aria-expanded={showTr} onClick={() => setShowTr((v) => !v)}>{showTr ? "Hide Urdu Translation" : "Read Urdu Translation"}</button>
            {tts === "speaking" || tts === "paused" ? <>
              {canPause && <button className="btn" onClick={togglePause}>{tts === "paused" ? "Resume" : "Pause"}</button>}
              <button className="btn" onClick={stopUrduHere}>Stop</button>
            </> : <button className="btn flex-1" disabled={(!tr && !recording) || tts === "checking"} onClick={playUrdu}>{tts === "checking" ? (urduMode === "recording" ? "Loading recorded translation…" : "Checking Urdu voice…") : tts === "done" ? "Replay Urdu Translation" : "Play Urdu Translation"}</button>}
          </div>
          {recording && urduMode === "recording" && tts !== "unavailable" && tts !== "failed"
            ? <p className="text-xs text-muted" role="status" data-testid="urdu-audio-label">{recording.label.en} — translation audio, not Quran recitation.</p>
            : <p className="text-xs text-muted" role="status" data-testid="urdu-audio-label"><span>{URDU_TTS_LABEL.en}.</span> <span className="ur" dir="rtl" lang="ur">{URDU_TTS_LABEL.ur}</span>{(tts === "speaking" || tts === "paused") && voice?.ok && !voice.canPause ? " Pause is not supported by this voice; use Stop and Replay." : ""}</p>}
          {recNote && <p className="text-xs text-muted" role="status">{recNote}</p>}
          {set === "tr-ur-maududi" && <PersonalSurahRecording surah={s} ayah={a} playerRef={personalPlayer}
            onPlay={() => { stopUrdu(); stopRecording(); if (audio.playing) audio.toggle(); }}/>}
          {tts === "unavailable" && voice && !voice.ok && <p className="text-sm text-muted" role="status">{voice.reason}</p>}
          {tts === "failed" && <p className="text-sm text-weak" role="alert">The Urdu voice could not play this translation. You can read it below.</p>}
          {showTr && (trErr ? <p className="text-sm text-weak">The Urdu translation could not be loaded.</p>
            : tr ? <div className="grid gap-1">
              <p className="ur ayah-quick-ur text-[18px]" dir="rtl" lang="ur">{tr}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>Translation: {urdu} (Tanzil.net)</span>
                <button className="underline" onClick={() => update((d) => { d.settings.tr = set === "tr-ur-maududi" ? "tr-ur-jalandhry" : "tr-ur-maududi"; })}>Use {set === "tr-ur-maududi" ? "Jalandhry" : "Maududi"}</button>
              </div>
            </div> : <p className="text-sm text-muted">Loading…</p>)}
        </section>
      </div>
    </Sheet>
  );
}
