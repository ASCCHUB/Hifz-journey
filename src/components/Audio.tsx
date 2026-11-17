"use client";
// Quran audio: ayah-by-ayah recitation from everyayah.com.
// Each Ayah plays at once; after playback starts, the complete file is saved automatically in app-private
// storage (lib/audioCache.ts) and later plays use the saved copy first, also offline.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getAudioCache, type AudioState } from "@/lib/audioCache";
import { OFFLINE_NOT_SAVED_MESSAGE, playTrack } from "@/lib/audioPlayback";
import { arabicTrack, everyAyahUrl } from "@/lib/audioSources";
import { count, nextAyah, prevAyah, Q, ref } from "@/lib/quran";
import { update, useStore } from "@/lib/store";

export const RECITERS: Record<string, string> = {
  Alafasy_128kbps: "Mishary Alafasy",
  Abdul_Basit_Murattal_192kbps: "Abdul Basit (Murattal)",
  Husary_128kbps: "Mahmoud Khalil Al-Husary",
  Minshawy_Murattal_128kbps: "Al-Minshawi (Murattal)",
  "Abdurrahmaan_As-Sudais_192kbps": "Abdur-Rahman As-Sudais",
  "Saood_ash-Shuraym_128kbps": "Saud Ash-Shuraym",
  MaherAlMuaiqly128kbps: "Maher Al-Muaiqly",
};
export const audioUrl = (reciter: string, s: number, a: number) => everyAyahUrl(reciter, s, a);

export type Repeat = "off" | "ayah" | "range" | "surah";
type Range = { s: number; a: number; b: number };
/** Offline state of the current Ayah: "saved" only after the complete file was stored and read back. */
export type OfflineState = AudioState | "unsupported";
type Ctx = {
  cur: [number, number] | null; playing: boolean; repeat: Repeat; range: Range | null; error: string; offline: OfflineState;
  play: (s: number, a: number, range?: Range | null) => void;
  toggle: () => void; stop: () => void; next: () => void; prev: () => void;
  setRepeat: (r: Repeat) => void;
  saveOffline: (s: number, onProgress: (done: number, total: number) => void) => Promise<number>;
};
const AudioCtx = createContext<Ctx | null>(null);
export const useAudio = () => { const c = useContext(AudioCtx); if (!c) throw new Error("AudioProvider missing"); return c; };

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const st = useStore();
  const el = useRef<HTMLAudioElement | null>(null);
  const [cur, setCur] = useState<[number, number] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const [range, setRange] = useState<Range | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState<OfflineState>("none");
  const req = useRef(0); // increases on every start; an older, slower start never overrides a newer one
  const live = useRef({ cur, repeat, range, reciter: st.settings.reciter, speed: st.settings.speed });
  live.current = { cur, repeat, range, reciter: st.settings.reciter, speed: st.settings.speed };

  const start = useCallback((s: number, a: number) => {
    const audio = el.current; if (!audio) return;
    const my = ++req.current; const isCurrent = () => req.current === my;
    setError(""); setCur([s, a]); setOffline("none");
    const track = arabicTrack(live.current.reciter, s, a);
    playTrack(audio, track, { rate: live.current.speed, isCurrent })
      .then((r) => {
        if (!isCurrent()) return;
        setPlaying(true);
        setOffline(r.source === "stream" ? "unsupported" : r.source === "offline-cache" ? "saved" : (r.status?.state as AudioState) || "none");
        void r.saved.then((st) => { if (isCurrent() && st?.state) setOffline(st.state as AudioState); });
      })
      .catch((e: Error) => {
        if (e?.name === "StaleAudioRequest" || !isCurrent()) return;
        setPlaying(false);
        if (e?.name === "OfflineUnavailableError") setError(OFFLINE_NOT_SAVED_MESSAGE);
      });
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: ref(s, a), artist: RECITERS[live.current.reciter] || "Quran", album: "Hifz Journey" }); } catch { /* optional */ }
    }
  }, []);

  const advance = useCallback((dir: 1 | -1, fromEnd: boolean) => {
    const { cur: c, repeat: rp, range: rg } = live.current; if (!c) return;
    const [s, a] = c;
    if (fromEnd && rp === "ayah") return start(s, a);
    if (rg) {
      const n = a + dir;
      if (n >= rg.a && n <= rg.b) return start(rg.s, n);
      if (fromEnd && rp === "range") return start(rg.s, rg.a);
      if (fromEnd) { setPlaying(false); return; }
    }
    if (fromEnd && rp === "surah" && a >= count(s)) return start(s, 1);
    const nx = dir === 1 ? nextAyah(s, a) : prevAyah(s, a);
    if (!nx || (fromEnd && nx[0] !== s && rp !== "off")) { setPlaying(false); return; }
    if (fromEnd && nx[0] !== s) { setPlaying(false); return; } // stop at the end of a surah
    start(nx[0], nx[1]);
  }, [start]);

  useEffect(() => {
    const audio = new Audio(); audio.preload = "auto"; el.current = audio;
    const onEnd = () => advance(1, true);
    const onErr = () => { setPlaying(false); setError("This ayah's audio could not be played. Check your connection or try another reciter."); };
    const onPause = () => setPlaying(false), onPlay = () => setPlaying(true);
    audio.addEventListener("ended", onEnd); audio.addEventListener("error", onErr);
    audio.addEventListener("pause", onPause); audio.addEventListener("play", onPlay);
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("nexttrack", () => advance(1, false));
        navigator.mediaSession.setActionHandler("previoustrack", () => advance(-1, false));
      } catch { /* optional */ }
    }
    return () => { audio.pause(); audio.removeEventListener("ended", onEnd); audio.removeEventListener("error", onErr); audio.removeEventListener("pause", onPause); audio.removeEventListener("play", onPlay); };
  }, [advance]);

  useEffect(() => { if (el.current) el.current.playbackRate = st.settings.speed; }, [st.settings.speed]);

  // Live "Saved offline" state for the current Ayah (saving finishes after playback has started).
  useEffect(() => {
    let off: (() => void) | undefined; let mounted = true;
    void getAudioCache().then((c) => {
      if (!c || !mounted) return;
      off = c.subscribe((e) => {
        if (e.type === "cleared") { setOffline((o) => (o === "unsupported" ? o : "none")); return; }
        const now = live.current.cur;
        if (e.type !== "status" || !now) return;
        if (e.id === c.audioId(arabicTrack(live.current.reciter, now[0], now[1]))) setOffline(e.status.state);
      });
    });
    return () => { mounted = false; off?.(); };
  }, []);

  const api = useMemo<Ctx>(() => ({
    cur, playing, repeat, range, error, offline,
    play: (s, a, rg = null) => { setRange(rg); live.current.range = rg; start(s, a); },
    toggle: () => { const a = el.current; if (!a || !cur) return; if (a.paused) a.play().catch(() => {}); else a.pause(); },
    stop: () => { req.current++; el.current?.pause(); setCur(null); setRange(null); setError(""); },
    next: () => advance(1, false), prev: () => advance(-1, false),
    setRepeat,
    // Saves a whole surah on request, through the same verified cache as automatic saving
    // (complete files only; already-saved Ayahs are not downloaded again).
    saveOffline: async (s, onProgress) => {
      const cache = await getAudioCache();
      if (!cache) throw new Error("Offline storage is not supported in this browser.");
      if (!navigator.onLine) throw new Error("You are offline. Connect to the internet and try again.");
      const total = count(s); let ok = 0;
      for (let a = 1; a <= total; a++) {
        const r = await cache.ensureSaved(arabicTrack(live.current.reciter, s, a), { force: true });
        if (r.state === "saved") ok++;
        onProgress(a, total);
        if (r.state === "quota") break; // limit reached: stop instead of failing every remaining Ayah
      }
      return ok;
    },
  }), [cur, playing, repeat, range, error, offline, start, advance]);

  return <AudioCtx.Provider value={api}>{children}</AudioCtx.Provider>;
}

const REPEAT_LABEL: Record<Repeat, string> = { off: "No repeat", ayah: "Repeat ayah", range: "Repeat range", surah: "Repeat surah" };

/** Player bar shown above the navigation while something is loaded. */
export function AudioBar() {
  const a = useAudio(); const st = useStore();
  const [open, setOpen] = useState(false);
  const [dl, setDl] = useState("");
  if (!a.cur) return null;
  const [s, ay] = a.cur;
  const cycle = () => { const order: Repeat[] = a.range ? ["off", "ayah", "range"] : ["off", "ayah", "surah"]; a.setRepeat(order[(order.indexOf(a.repeat) + 1) % order.length]); };
  return (
    <div className="audio-player-bar fixed left-0 right-0 bottom-[64px] lg:bottom-0 lg:left-[220px] z-30 px-3 pb-2">
      <div className="mx-auto max-w-3xl card !p-3 shadow-lg">
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" onClick={a.prev} aria-label="Previous ayah">‹</button>
          <button className="btn-primary btn-sm min-w-[72px]" onClick={a.toggle}>{a.playing ? "Pause" : "Play"}</button>
          <button className="btn btn-sm" onClick={a.next} aria-label="Next ayah">›</button>
          <button className="flex-1 min-w-0 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
            <div className="font-semibold truncate">{ref(s, ay)}</div>
            <div className="text-xs text-muted truncate">{RECITERS[st.settings.reciter] || st.settings.reciter} · {REPEAT_LABEL[a.repeat]}{a.offline === "saved" ? <span className="audio-saved-offline" data-testid="audio-saved-offline"> · ✓ Saved offline</span> : null}</div>
          </button>
          <button className="btn btn-sm" onClick={a.stop} aria-label="Close player">✕</button>
        </div>
        {a.error && <p className="text-sm text-weak mt-2">{a.error}</p>}
        {open && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-sm text-muted">Reciter
              <select className="field mt-1" value={st.settings.reciter} onChange={(e) => update((d) => { d.settings.reciter = e.target.value; })}>
                {Object.entries(RECITERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm text-muted">Speed
              <select className="field mt-1" value={st.settings.speed} onChange={(e) => update((d) => { d.settings.speed = Number(e.target.value); })}>
                {[0.75, 1, 1.25, 1.5].map((v) => <option key={v} value={v}>{v}×</option>)}
              </select>
            </label>
            <button className={`btn btn-sm ${a.repeat !== "off" ? "btn-on" : ""}`} onClick={cycle}>{REPEAT_LABEL[a.repeat]}</button>
            <button className="btn btn-sm" onClick={() => a.play(s, 1, null)}>Play {Q().n[s - 1][1]} from the start</button>
            <button className="btn btn-sm sm:col-span-2" disabled={!!dl && !dl.startsWith("Saved") && !dl.startsWith("Could")} onClick={async () => {
              try { setDl("Saving 0%"); const ok = await a.saveOffline(s, (d, t) => setDl(`Saving ${Math.round((d / t) * 100)}%`)); setDl(`Saved ${ok} of ${count(s)} ayat for offline listening`); }
              catch (e) { setDl(`Could not save: ${(e as Error).message}`); }
            }}>{dl || `Save ${Q().n[s - 1][1]} for offline listening`}</button>
          </div>
        )}
      </div>
    </div>
  );
}
