/**
 * Optional, rights-cleared, AYAH-ALIGNED recordings of Maududi's Urdu translation.
 * Never assumes that recordings written by Maududi are spoken by Maududi himself.
 * Only URLs explicitly listed in /public/urdu-recordings/manifest.json may play.
 * Missing recordings are not an error: the existing device Urdu TTS remains available.
 */

export type RecordingManifest = {
  version: 1;
  translation: "tr-ur-maududi";
  narrator: string;
  source: string;
  permission: string;
  tracks: Record<string, string>;
};

type AudioEvent = "start" | "end" | "error" | "stop";
type Listener = (event: AudioEvent) => void;
let manifestPromise: Promise<RecordingManifest | null> | null = null;
let player: HTMLAudioElement | null = null;
let activeListener: Listener | null = null;

/** A local URL is required: do not let manifest input point to an unrelated site. */
export function isSafeRecordingPath(path: string): boolean {
  return /^\/urdu-recordings\/[a-zA-Z0-9_./-]+\.(mp3|m4a|ogg)$/i.test(path)
    && !path.split("/").includes("..") && !path.includes("//");
}

async function readManifest(): Promise<RecordingManifest | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/urdu-recordings/manifest.json");
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return null;
    const m = data as Partial<RecordingManifest>;
    if (m.version !== 1 || m.translation !== "tr-ur-maududi" || typeof m.narrator !== "string"
      || typeof m.source !== "string" || typeof m.permission !== "string"
      || !m.tracks || typeof m.tracks !== "object") return null;
    // A manifest must state that redistribution/public playback is authorized.
    if (m.permission !== "cleared") return null;
    return m as RecordingManifest;
  } catch { return null; }
}

export async function getRecordedUrduTrack(surah: number, ayah: number): Promise<string | null> {
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || surah < 1 || surah > 114 || ayah < 1) return null;
  manifestPromise ??= readManifest();
  const manifest = await manifestPromise;
  const path = manifest?.tracks[`${surah}:${ayah}`];
  return typeof path === "string" && isSafeRecordingPath(path) ? path : null;
}

export function stopRecordedUrdu(): void {
  const a = player; const cb = activeListener;
  player = null; activeListener = null;
  if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
  cb?.("stop");
}

export async function playRecordedUrdu(path: string, on: Listener): Promise<boolean> {
  if (!isSafeRecordingPath(path) || typeof Audio === "undefined") return false;
  stopRecordedUrdu();
  const a = new Audio(path);
  player = a; activeListener = on;
  a.preload = "auto";
  a.onplay = () => { if (player === a) activeListener?.("start"); };
  a.onended = () => { if (player === a) { player = null; activeListener = null; on("end"); } };
  a.onerror = () => { if (player === a) { player = null; activeListener = null; on("error"); } };
  try { await a.play(); return true; }
  catch { if (player === a) { player = null; activeListener = null; } a.pause(); return false; }
}

export function pauseRecordedUrdu(): void { player?.pause(); }
export async function resumeRecordedUrdu(): Promise<boolean> {
  if (!player) return false;
  try { await player.play(); return true; } catch { return false; }
}
