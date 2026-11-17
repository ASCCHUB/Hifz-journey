// One way to start Ayah audio on an <audio> element, shared by the main player, the lesson repeat player and
// recorded Urdu translation: saved copy first, otherwise stream at once and save in the background.
// If the cache itself is unavailable or fails, it falls back to plain streaming exactly as before.
import { getAudioCache, type AudioStatus, type AudioTrack, type PlayResult } from "./audioCache";

export type PlayOutcome = { source: PlayResult["source"] | "stream"; status: Partial<AudioStatus> | null; saved: Promise<Partial<AudioStatus> | null> };

/** Errors the caller should handle itself (not cache failures). */
const PASS_THROUGH = new Set(["OfflineUnavailableError", "StaleAudioRequest", "NotAllowedError", "AbortError", "NotSupportedError"]);

export async function playTrack(el: HTMLMediaElement, track: AudioTrack, opts: { rate?: number; isCurrent?: () => boolean } = {}): Promise<PlayOutcome> {
  const beforePlay = (m: HTMLMediaElement) => { if (opts.rate) m.playbackRate = opts.rate; };
  const cache = await getAudioCache().catch(() => null);
  if (cache) {
    try {
      const r = await cache.play(el, track, { beforePlay, isCurrent: opts.isCurrent });
      return { source: r.source, status: r.status, saved: r.saved };
    } catch (e) {
      if (PASS_THROUGH.has((e as Error)?.name)) throw e;
      // Cache problem (storage unavailable, IndexedDB blocked…): stream as before.
    }
  }
  if (opts.isCurrent && !opts.isCurrent()) { const stale = new Error("A newer Ayah was requested"); stale.name = "StaleAudioRequest"; throw stale; }
  el.src = track.url;
  beforePlay(el);
  await el.play();
  return { source: "stream", status: null, saved: Promise.resolve(null) };
}

export const OFFLINE_NOT_SAVED_MESSAGE = "This Ayah's audio isn't saved on this device yet. Play it once while online and it will be saved automatically for offline listening.";
