// AlQuran Cloud's verse-by-verse Urdu audio edition, read by Shamshad Ali Khan.
// Provider terms: https://alquran.cloud/terms-and-conditions (personal/educational streaming,
// downloading and caching); attribution: https://alquran.cloud/credits
// Audio narration is NOT labelled as Maududi; displayed Urdu text is independently attributed.
// The API supplies the canonical global ayah index and actual audio URL, avoiding guessed bitrates.
// Store only the resulting URL for offline lookups; audio bytes stay in the existing private audio cache.
import { KIND_URDU, type AudioTrack } from "./audioCache";

export const SHAMSHAD_NARRATOR = "Shamshad Ali Khan";
export const SHAMSHAD_SOURCE = "AlQuran Cloud / Islamic Network";
const EDITION = "ur.khan";
const STORE_PREFIX = "hifz:urdu:shamshad:ayah-url:v1:";
const CDN_HOST = "cdn.islamic.network";

export function validateShamshadAudioUrl(value: unknown, globalNumber: number): string {
  if (typeof value !== "string") throw new Error("Audio provider did not return a URL.");
  const u = new URL(value);
  if (u.protocol !== "https:" || u.hostname !== CDN_HOST || u.port ||
      u.username || u.password || u.search || u.hash ||
      !/^\/quran\/audio\/(?:32|40|48|64|128|192)\/ur\.khan\/[1-9][0-9]*\.mp3$/.test(u.pathname) ||
      !u.pathname.endsWith(`/${globalNumber}.mp3`)) {
    throw new Error("Urdu audio provider returned a URL outside the approved edition.");
  }
  return u.href;
}

export function parseShamshadAyah(data: unknown, surah: number, ayah: number): string {
  const d = data as {
    code?: number; data?: { number?: number; numberInSurah?: number;
      surah?: { number?: number }; edition?: { identifier?: string }; audio?: unknown };
  };
  const a = d?.data;
  if (d?.code !== 200 || !a || a.edition?.identifier !== EDITION ||
      a.surah?.number !== surah || a.numberInSurah !== ayah ||
      !Number.isInteger(a.number) || a.number! < 1 || a.number! > 6236) {
    throw new Error("Urdu audio edition/ayah mapping did not match the selected verse.");
  }
  return validateShamshadAudioUrl(a.audio, a.number!);
}

/** Returns the verified track from saved URL metadata or the provider API.
 * The saved audio will play without internet once this URL was resolved on an earlier play.
 */
export async function shamshadTrack(surah: number, ayah: number): Promise<AudioTrack> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114 ||
      !Number.isInteger(ayah) || ayah < 1 || ayah > 286) throw new Error("Invalid Ayah.");
  const key = `${STORE_PREFIX}${surah}:${ayah}`;
  let url = "";
  try {
    const saved = localStorage.getItem(key);
    // Offline lookups must not ask the API for the metadata again.
    if (saved) {
      const parsed = new URL(saved);
      if (parsed.protocol === "https:" && parsed.hostname === CDN_HOST &&
          /^\/quran\/audio\/(?:32|40|48|64|128|192)\/ur\.khan\/[1-9][0-9]*\.mp3$/.test(parsed.pathname) &&
          !parsed.search && !parsed.hash && !parsed.port) url = parsed.href;
    }
  } catch { /* storage disabled: online lookup still works */ }
  if (!url) {
    const api = `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/${EDITION}`;
    const response = await fetch(api, { credentials: "omit" });
    if (!response.ok) throw new Error("Urdu recording information is unavailable online.");
    url = parseShamshadAyah(await response.json(), surah, ayah);
    try { localStorage.setItem(key, url); } catch { /* audio playback can proceed */ }
  }
  return { kind: KIND_URDU, voiceId: "shamshad-ali-khan-alquran-cloud", surah, ayah, url };
}
