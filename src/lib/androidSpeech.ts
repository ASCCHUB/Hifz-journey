// In the Android app the page runs in a WebView, which has no working Web Speech API.
// MainActivity exposes Android's native SpeechRecognizer as `window.AndroidSpeech`;
// this adapter presents it as a standard `SpeechRecognition` so the Recite page works unchanged.
type Bridge = { available(): boolean; start(lang: string): void; stop(): void };
type Alt = { transcript: string; confidence?: number };
type Result = { isFinal: boolean; length: number; 0: Alt };

export function installAndroidSpeech() {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  const bridge = w.AndroidSpeech as Bridge | undefined;
  if (!bridge || w.__androidSpeechInstalled) return;
  try { if (!bridge.available()) return; } catch { return; }

  let active: NativeRecognition | null = null;

  class NativeRecognition {
    lang = "ar-SA";
    continuous = false;
    interimResults = false;
    onresult: ((e: { resultIndex: number; results: Result[] }) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    finals: Alt[] = [];
    ended = false;

    start() {
      if (active && active !== this) active.finish();
      active = this;
      this.ended = false;
      bridge!.start(this.lang);
    }
    stop() {
      bridge!.stop();
      window.setTimeout(() => this.finish(), 2500); // safety net if the native side never reports "end"
    }
    abort() { this.stop(); }
    emit(resultIndex: number, partial?: string) {
      const results: Result[] = this.finals.map((alt) => ({ isFinal: true, length: 1, 0: alt }));
      if (partial) results.push({ isFinal: false, length: 1, 0: { transcript: partial } });
      this.onresult?.({ resultIndex, results });
    }
    finish() {
      if (this.ended) return;
      this.ended = true;
      if (active === this) active = null;
      this.onend?.();
    }
  }

  w.__androidSpeech = (type: string, text: string, confidence: number) => {
    const r = active;
    if (!r) return;
    if (type === "partial") { if (r.interimResults) r.emit(r.finals.length, text); }
    else if (type === "final") {
      r.finals.push({ transcript: text, confidence: confidence >= 0 ? confidence : undefined });
      r.emit(r.finals.length - 1);
      if (!r.continuous) bridge.stop();
    } else if (type === "error") r.onerror?.({ error: text });
    else if (type === "end") r.finish();
  };
  w.SpeechRecognition = NativeRecognition;
  w.__androidSpeechInstalled = true;
}
