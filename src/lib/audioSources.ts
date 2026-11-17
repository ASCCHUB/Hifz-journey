// Where Ayah audio comes from.
//
// Arabic recitation: everyayah.com, the app's existing source (URLs unchanged, so files saved earlier are reused).
// Urdu translation: ONLY a verified, licensed, accurately Ayah-mapped human recording may be configured below.
//                   None is configured. Until one is, the Ayah sheet keeps the device's Urdu text-to-speech,
//                   labelled as a device voice and not a human recording.
//
// Do NOT add an entry to URDU_RECORDINGS unless you hold written permission to stream AND store the files
// offline, and every file has been checked against its surah:ayah. The recorded voice is never assumed to be
// Maulana Maududi: Maududi wrote the translation (Tafheem-ul-Quran); the narrator must be named.

import { KIND_ARABIC, KIND_URDU, type AudioTrack } from "./audioCache";

const pad3 = (n: number) => String(n).padStart(3, "0");

/** everyayah.com URL for one Ayah: identical to what the player has always requested. */
export const everyAyahUrl = (reciter: string, s: number, a: number) => `https://everyayah.com/data/${reciter}/${pad3(s)}${pad3(a)}.mp3`;

/** Cache track for an everyayah.com recitation; the reciter folder becomes part of the identifier. */
export function arabicTrack(reciter: string, surah: number, ayah: number): AudioTrack {
  if (!/^[A-Za-z0-9_.-]+$/.test(reciter)) throw new Error(`Bad reciter folder: ${reciter}`);
  return { kind: KIND_ARABIC, voiceId: reciter, surah: Number(surah), ayah: Number(ayah), url: everyAyahUrl(reciter, surah, ayah) };
}

// ------------------------------------------------------------------ Urdu

export const URDU_TTS_LABEL = {
  en: "Urdu translation · device text-to-speech voice, not a human recording, not Quran recitation",
  ur: "اردو ترجمہ · فون کی مشینی آواز (ٹیکسٹ ٹو اسپیچ)، انسانی ریکارڈنگ نہیں",
} as const;

export type UrduRecordingDef = {
  id: string; // e.g. "maududi-<narrator-slug>"; part of the cache identifier
  narratorName: string; // whose voice is recorded
  translation: string; // must name Maududi / Tafheem-ul-Quran
  urlTemplate: string; // "/audio/urdu-maududi/<id>/{surah3}{ayah3}.mp3" (same origin) or an https URL with {surah3}{ayah3}
  licence: { holder: string; grantedTo: string; reference: string; allowsStreaming: true; allowsOfflineStorage: true };
  ayahMapping: { verified: true; verifiedBy: string; verifiedOn: string; method: string };
};

/**
 * Verified, licensed recorded Urdu translations. EMPTY ON PURPOSE.
 * If the files are on another https host, that host must also be added to:
 *   • URDU_AUDIO_HOSTS in android/app/src/main/java/com/hifzcompanion/AudioDownloadProxy.java, and
 *   • EXTRA_AUDIO_ORIGINS in public/sw.js.
 */
export const URDU_RECORDINGS: UrduRecordingDef[] = [];

const registry = new Map<string, UrduRecordingDef>();
let configLoaded = false;

/** Throws unless narrator, licence (streaming + offline storage) and a verified Ayah mapping are documented. */
export function validateUrduRecording(def: Partial<UrduRecordingDef> | null | undefined): asserts def is UrduRecordingDef {
  if (!def) throw new Error("Urdu recording rejected: missing definition");
  for (const k of ["id", "narratorName", "translation", "urlTemplate"] as const) if (!def[k]) throw new Error(`Urdu recording rejected: missing ${k}`);
  if (!/^[A-Za-z0-9_.-]+$/.test(def.id!)) throw new Error("Urdu recording rejected: id must use A-Z a-z 0-9 _ . -");
  if (!/maududi|tafheem|tafhim/i.test(def.translation!)) throw new Error("Urdu recording rejected: translation must be Maududi / Tafheem-ul-Quran");
  const l = (def.licence || {}) as Partial<UrduRecordingDef["licence"]>;
  if (!l.holder || !l.grantedTo || !l.reference || l.allowsStreaming !== true || l.allowsOfflineStorage !== true) {
    throw new Error("Urdu recording rejected: licence must name holder, grantee and reference, and allow streaming and offline storage");
  }
  const m = (def.ayahMapping || {}) as Partial<UrduRecordingDef["ayahMapping"]>;
  if (m.verified !== true || !m.verifiedBy || !/^\d{4}-\d{2}-\d{2}$/.test(m.verifiedOn || "") || !m.method) {
    throw new Error("Urdu recording rejected: Ayah mapping must be verified (verifiedBy, verifiedOn YYYY-MM-DD, method)");
  }
  const t = def.urlTemplate!;
  if (!t.includes("{surah3}") || !t.includes("{ayah3}")) throw new Error("Urdu recording rejected: urlTemplate needs {surah3} and {ayah3}");
  if (!/^(\/audio\/urdu-maududi\/|https:\/\/)/.test(t)) throw new Error("Urdu recording rejected: urlTemplate must be /audio/urdu-maududi/… or https://");
}

export function registerUrduRecording(def: UrduRecordingDef): string {
  validateUrduRecording(def);
  registry.set(def.id, Object.freeze({ ...def }));
  return def.id;
}

function loadConfig() {
  if (configLoaded) return;
  configLoaded = true;
  for (const def of URDU_RECORDINGS) {
    try { registerUrduRecording(def); } catch (e) { console.warn(String((e as Error).message)); } // an invalid entry is ignored, never played
  }
}

export function listUrduRecordings() {
  loadConfig();
  return [...registry.values()].map(({ id, narratorName, translation }) => ({ id, narratorName, translation }));
}

export type UrduAudioChoice =
  | { type: "recording"; track: AudioTrack; narratorName: string; label: { en: string; ur: string } }
  | { type: "tts"; label: typeof URDU_TTS_LABEL };

/** What to use for the Urdu translation audio of surah:ayah. */
export function resolveUrduAudio(surah: number, ayah: number, narratorId?: string): UrduAudioChoice {
  loadConfig();
  const def = narratorId ? registry.get(narratorId) : registry.values().next().value;
  if (!def) return { type: "tts", label: URDU_TTS_LABEL };
  const rel = def.urlTemplate.replace("{surah3}", pad3(surah)).replace("{ayah3}", pad3(ayah));
  const url = rel.startsWith("/") && typeof location !== "undefined" ? new URL(rel, location.origin).href : rel;
  return {
    type: "recording",
    track: { kind: KIND_URDU, voiceId: def.id, surah: Number(surah), ayah: Number(ayah), url },
    narratorName: def.narratorName,
    label: { en: `Recorded Urdu translation (Maududi) · voice: ${def.narratorName}`, ur: `ریکارڈ شدہ اردو ترجمہ (مودودی) · آواز: ${def.narratorName}` },
  };
}

/** Tests only. */
export function _resetUrduRecordingsForTests() { registry.clear(); configLoaded = true; }
