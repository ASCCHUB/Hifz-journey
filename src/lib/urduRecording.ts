// Recorded Urdu translation audio (a verified, licensed recording configured in lib/audioSources.ts).
// Mirrors lib/urduSpeech.ts: one Urdu translation stream at a time, managed here so that screens never create
// their own players. Playback goes through the shared cache (lib/audioPlayback.ts): saved copy first, otherwise
// streamed at once and saved automatically for offline listening. This is translation audio, never recitation.
import type { AudioTrack } from "./audioCache";
import { playTrack } from "./audioPlayback";

type Listener = (e: "start" | "end" | "error" | "stop") => void;
let el: HTMLAudioElement | null = null;
let run = 0;
let listener: Listener | null = null;

/** Plays the recording for one Ayah. Throws OfflineUnavailableError when offline and not yet saved. */
export async function playUrduRecording(track: AudioTrack, on: Listener): Promise<void> {
  stopUrduRecording();
  listener = on;
  if (!el) el = new Audio();
  const my = ++run; const isCurrent = () => run === my;
  el.onended = () => { if (isCurrent()) listener?.("end"); };
  el.onerror = () => { if (isCurrent()) listener?.("error"); };
  await playTrack(el, track, { isCurrent });
  if (isCurrent()) listener?.("start");
}

export function pauseUrduRecording() { el?.pause(); }
export function resumeUrduRecording() { void el?.play().catch(() => {}); }

export function stopUrduRecording() {
  run++;
  const l = listener; listener = null;
  el?.pause();
  l?.("stop");
}
