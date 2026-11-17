// Urdu translation audio via the device's text-to-speech. This is *translation* audio, never Quran recitation.
//
// • Android app: the WebView has no usable speechSynthesis, so MainActivity exposes Android TextToSpeech as
//   `window.AndroidTTS` (status / speak / stop) and reports progress through `window.__androidTts(type)`.
// • Browsers: speechSynthesis, using only a voice whose language is Urdu ("ur", "ur-PK", "ur-IN", …).
// • No Urdu voice → unavailable. We never fall back to an English or other-language voice.

export type UrduVoice = { ok: true; engine: "android" | "web"; voice: string; canPause: boolean } | { ok: false; reason: string };
type Bridge = { status(): string; speak(text: string): boolean; stop(): void };
type Listener = (e: "start" | "end" | "error" | "stop") => void;

const w = () => (typeof window === "undefined" ? undefined : (window as unknown as Record<string, unknown>));
const bridge = () => w()?.AndroidTTS as Bridge | undefined;
let listener: Listener | null = null;
let utter: SpeechSynthesisUtterance | null = null;

/** True when a voice's language tag is Urdu. Exported for tests. */
export const isUrduLang = (lang?: string | null) => !!lang && /^ur(?:[-_]|$)/i.test(lang.trim());

/** Picks an installed Urdu voice; prefers a local (offline) one. Exported for tests. */
export function pickUrduVoice<V extends { lang: string; localService?: boolean; name?: string }>(voices: readonly V[]): V | null {
  const ur = voices.filter((v) => isUrduLang(v.lang));
  return ur.find((v) => v.localService) || ur[0] || null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function webVoices(): Promise<SpeechSynthesisVoice[]> {
  const ss = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
  if (!ss) return [];
  let v = ss.getVoices();
  for (let i = 0; i < 8 && !v.length; i++) { await sleep(200); v = ss.getVoices(); } // voices load asynchronously
  return v;
}

export async function detectUrduVoice(): Promise<UrduVoice> {
  const b = bridge();
  if (b) {
    // The native engine initialises asynchronously: "pending" for a moment after the app opens.
    for (let i = 0; i < 15; i++) {
      let st: { state: string; voice?: string } = { state: "error" };
      try { st = JSON.parse(b.status()); } catch { /* treat as error */ }
      if (st.state === "ok") return { ok: true, engine: "android", voice: st.voice || "Urdu", canPause: false };
      if (st.state === "no-urdu") return { ok: false, reason: "No Urdu text-to-speech voice is installed on this phone. You can add one in Android Settings → Text-to-speech, or read the translation below." };
      if (st.state === "no-engine" || st.state === "error") return { ok: false, reason: "This phone has no text-to-speech engine available. The Urdu translation can still be read below." };
      await sleep(200);
    }
    return { ok: false, reason: "The phone's text-to-speech engine did not respond. Try again in a moment." };
  }
  const v = pickUrduVoice(await webVoices());
  if (!v) return { ok: false, reason: "No Urdu voice is installed for this browser or device. The Urdu translation can still be read below." };
  return { ok: true, engine: "web", voice: v.name, canPause: true };
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__androidTts = (type: string) => {
    if (type === "start" || type === "end" || type === "error" || type === "stop") listener?.(type);
  };
}

/** Speaks the translation verbatim with an Urdu voice. Stops any earlier Urdu speech first. */
export async function speakUrdu(text: string, on: Listener): Promise<boolean> {
  stopUrdu();
  listener = on;
  const b = bridge();
  if (b) { try { return b.speak(text); } catch { return false; } }
  const v = pickUrduVoice(await webVoices());
  if (!v || typeof speechSynthesis === "undefined") return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v; u.lang = v.lang; u.rate = 0.95;
  u.onstart = () => { if (utter === u) listener?.("start"); };
  u.onend = () => { if (utter === u) { utter = null; listener?.("end"); } };
  u.onerror = () => { if (utter === u) { utter = null; listener?.("error"); } };
  utter = u; speechSynthesis.speak(u);
  return true;
}

export function pauseUrdu() { try { if (!bridge() && typeof speechSynthesis !== "undefined") speechSynthesis.pause(); } catch { /* optional */ } }
export function resumeUrdu() { try { if (!bridge() && typeof speechSynthesis !== "undefined") speechSynthesis.resume(); } catch { /* optional */ } }

export function stopUrdu() {
  const l = listener; listener = null;
  try { bridge()?.stop(); } catch { /* ignore */ }
  try { if (!bridge() && typeof speechSynthesis !== "undefined") { utter = null; speechSynthesis.cancel(); } } catch { /* ignore */ }
  l?.("stop");
}
