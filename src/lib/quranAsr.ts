"use client";
// Speech engines for live recitation, behind one interface:
//  - "local":   microphone audio -> the Quran speech server (tarteel-ai/whisper-base-ar-quran) on this computer.
//  - "browser": the browser's / Android's generic Arabic speech recognition (fallback; not Quran-trained).
// Recognition output is only ever compared with the Quran text; it never modifies it.

export type EngineKind = "local" | "browser";
export type FinalSegment = { id: number; text: string; confidence?: number; ms?: number; seconds?: number };
export type AsrErrorCode = "not-allowed" | "audio-capture" | "network" | "unsupported" | "other";
export type AsrCallbacks = {
  onPartial: (text: string) => void;
  onFinal: (seg: FinalSegment) => void;
  onError: (code: AsrErrorCode, message: string) => void;
  onLevel?: (rms: number) => void;
  onQueue?: (pending: number, failed: number) => void;
};
export interface AsrSession {
  readonly kind: EngineKind;
  start(): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): Promise<void>;
  retryFailed(): void;
  audioFor(segmentId: number): Int16Array | undefined;
}
export type AsrHealth = { ok: boolean; model: string; license: string; engine: string; rss_mb: number };

const URL_KEY = "hifz-quran-asr-url";
export const DEFAULT_ASR_URL = process.env.NEXT_PUBLIC_QURAN_ASR_URL || "http://127.0.0.1:8765";
export function getAsrUrl(): string {
  try { return localStorage.getItem(URL_KEY) || DEFAULT_ASR_URL; } catch { return DEFAULT_ASR_URL; }
}
export function setAsrUrl(url: string) {
  try { if (url && url !== DEFAULT_ASR_URL) localStorage.setItem(URL_KEY, url); else localStorage.removeItem(URL_KEY); } catch { /* storage blocked */ }
}
function timeout(ms: number): AbortSignal | undefined {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}
export async function checkLocalAsr(url = getAsrUrl()): Promise<AsrHealth | null> {
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: timeout(2500), cache: "no-store" });
    if (!r.ok) return null;
    const h = await r.json() as AsrHealth;
    return h.ok ? h : null;
  } catch { return null; }
}
export function browserSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}
function micError(cause: unknown): [AsrErrorCode, string] {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return ["not-allowed", "Microphone permission was denied. Allow the microphone for this site (lock icon in the address bar), then try again."];
  if (name === "NotFoundError" || name === "OverconstrainedError") return ["audio-capture", "No microphone was found. Connect or enable a microphone, then try again."];
  if (name === "NotReadableError") return ["audio-capture", "The microphone is busy or blocked by another app. Close other apps using it, then try again."];
  return ["other", "The microphone could not be started. Check browser permission and your microphone."];
}

// ---------------------------------------------------------------- local Quran model
const RATE = 16000;
const FRAME = 320;              // 20 ms
const MIN_SEGMENT_S = 4;        // shorter pieces measurably hurt recognition (tested: 1.7 s avg -> many invented words)
const MAX_SEGMENT_S = 12;         // longer pieces measurably made the model loop or drop words (tested on user recordings)
const FORCED_SEARCH_FRAMES = 200; // look back 4 s for the quietest point when a cut must be forced
const CUT_SILENCE_MS = 450;
const INTERIM_EVERY_MS = 1800;

function toInt16(chunks: Float32Array[], length: number): Int16Array {
  const out = new Int16Array(length); let o = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) { const v = Math.max(-1, Math.min(1, c[i])); out[o++] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return out;
}
function downsample(x: Float32Array, from: number): Float32Array {
  if (from === RATE) return new Float32Array(x);
  const ratio = from / RATE, n = Math.floor(x.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio), end = Math.min(x.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = start; j < end; j++) sum += x[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

class LocalModelSession implements AsrSession {
  readonly kind = "local" as const;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private active = false;
  private buf = new Float32Array(RATE * 24);
  private length = 0;
  private frames: number[] = [];   // per-20 ms energy of the current piece
  private loud: boolean[] = [];    // whether each frame was above the silence threshold
  private voicedMs = 0;
  private silentMs = 0;
  private floor = 0.004;
  private recent: number[] = [];
  private nextId = 0;
  private queue: { id: number; pcm: Int16Array }[] = [];
  private failed: { id: number; pcm: Int16Array }[] = [];
  private inflight = false;
  private interimGen = 0;
  private lastInterim = 0;
  private lastLevel = 0;
  private audio = new Map<number, Int16Array>();

  constructor(private url: string, private cb: AsrCallbacks, private keepAudio: boolean) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } }); // auto-gain lifts pauses, hiding them from the cutter
    } catch (cause) { const [c, m] = micError(cause); this.cb.onError(c, m); throw cause; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try { this.ctx = new AC({ sampleRate: RATE }); } catch { this.ctx = new AC(); }
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
    src.connect(this.node); this.node.connect(this.ctx.destination); // output is silent; needed for processing to run
    this.active = true;
  }

  private onAudio(input: Float32Array) {
    if (!this.active || !this.ctx) return;
    const x = downsample(input, this.ctx.sampleRate);
    // Append to the current piece.
    if (this.length + x.length > this.buf.length) { const b = new Float32Array(Math.max(this.buf.length * 2, this.length + x.length)); b.set(this.buf.subarray(0, this.length)); this.buf = b; }
    this.buf.set(x, this.length); this.length += x.length;
    // Silence threshold: 2.5 x the quiet level (10th percentile) of the last ~8 s, never below 0.01.
    if (this.recent.length >= 50) { const sorted = [...this.recent].sort((a, b) => a - b); this.floor = sorted[Math.floor(sorted.length * 0.1)]; }
    const threshold = Math.max(0.01, this.floor * 2.5);
    let peak = 0;
    for (let f = this.frames.length; (f + 1) * FRAME <= this.length; f++) {
      let sum = 0; for (let j = f * FRAME; j < (f + 1) * FRAME; j++) sum += this.buf[j] * this.buf[j];
      const rms = Math.sqrt(sum / FRAME); peak = Math.max(peak, rms);
      this.frames.push(rms); this.loud.push(rms >= threshold);
      this.recent.push(rms); if (this.recent.length > 400) this.recent.shift();
      if (rms < threshold) this.silentMs += 20; else { this.silentMs = 0; this.voicedMs += 20; }
    }
    const now = performance.now();
    if (this.cb.onLevel && now - this.lastLevel > 100) { this.lastLevel = now; this.cb.onLevel(peak); }
    const seconds = this.length / RATE, nf = this.frames.length;
    if (this.silentMs >= CUT_SILENCE_MS && seconds >= MIN_SEGMENT_S) {
      // Cut in the middle of the pause: the quiet tail goes to the next piece, so a soft word onset is never clipped.
      this.cut(nf - Math.floor(this.silentMs / 40));
    } else if (seconds >= MAX_SEGMENT_S) {
      // No pause long enough: cut at the quietest moment of the last few seconds (usually a breath between words).
      let best = nf - 15, min = Infinity;
      for (let f = Math.max(1, nf - FORCED_SEARCH_FRAMES); f < nf - 15; f++) { const v = (this.frames[f - 1] + this.frames[f] + (this.frames[f + 1] | 0)) / 3; if (v < min) { min = v; best = f; } }
      this.cut(best);
    } else if (seconds >= MIN_SEGMENT_S && this.voicedMs < 200) this.dropAll(); // only silence so far
    else if (!this.inflight && !this.queue.length && this.voicedMs >= 800 && seconds >= 1.5 && now - this.lastInterim > INTERIM_EVERY_MS) this.interim();
  }

  private dropAll() { this.length = 0; this.frames = []; this.loud = []; this.voicedMs = 0; this.silentMs = 0; }

  /** Send frames [0, atFrame) as a finished piece; keep the rest as the start of the next piece. */
  private cut(atFrame = this.frames.length) {
    const at = Math.min(this.length, Math.max(0, atFrame) * FRAME);
    const voiced = this.loud.slice(0, atFrame).filter(Boolean).length * 20;
    if (voiced >= 250 && at > 0) {
      const pcm = toInt16([this.buf.subarray(0, at)], at), id = this.nextId++;
      if (this.keepAudio) this.audio.set(id, pcm);
      this.queue.push({ id, pcm });
      this.interimGen++; // any provisional result for this audio is now stale
      this.cb.onPartial("");
    }
    // Carry the remainder over.
    this.buf.copyWithin(0, at, this.length); this.length -= at;
    this.frames = this.frames.slice(atFrame); this.loud = this.loud.slice(atFrame);
    this.voicedMs = this.loud.filter(Boolean).length * 20;
    let s = 0; for (let f = this.loud.length - 1; f >= 0 && !this.loud[f]; f--) s += 20; this.silentMs = s;
    void this.pump();
  }

  private async post(pcm: Int16Array): Promise<{ text: string; confidence?: number; ms?: number; seconds?: number }> {
    const r = await fetch(`${this.url.replace(/\/$/, "")}/transcribe`, { method: "POST", body: pcm.buffer as ArrayBuffer, headers: { "Content-Type": "application/octet-stream" }, signal: timeout(45000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  private report() { this.cb.onQueue?.(this.queue.length + (this.inflight ? 1 : 0), this.failed.length); }

  private async pump() {
    this.report();
    if (this.inflight) return;
    const next = this.queue.shift();
    if (!next) return;
    this.inflight = true; this.report();
    try {
      const r = await this.post(next.pcm);
      this.cb.onFinal({ id: next.id, text: (r.text || "").trim(), confidence: r.confidence ?? undefined, ms: r.ms, seconds: r.seconds });
    } catch {
      // Keep the audio so nothing is lost; stop listening until the server is back.
      this.failed.push(next, ...this.queue); this.queue = [];
      this.active = false;
      this.cb.onError("network", "The Quran speech server did not respond. Your recitation audio is kept in memory — start the server, then press Retry recognition.");
    } finally {
      this.inflight = false; this.report();
      if (this.queue.length) void this.pump();
    }
  }

  private async interim() {
    this.inflight = true; this.lastInterim = performance.now();
    const gen = ++this.interimGen, pcm = toInt16([this.buf.subarray(0, this.length)], this.length);
    try {
      const r = await this.post(pcm);
      if (gen === this.interimGen && r.text) this.cb.onPartial(r.text.trim());
    } catch { /* provisional only; the final request reports failures */ }
    finally { this.inflight = false; if (this.queue.length) void this.pump(); }
  }

  pause() { if (this.active) { this.cut(); this.active = false; } }
  async resume() { await this.ctx?.resume(); this.active = true; }
  retryFailed() { if (!this.failed.length) return; this.queue = [...this.failed, ...this.queue]; this.failed = []; void this.pump(); }
  async stop() {
    this.pause();
    // Stop the microphone immediately when the user leaves/stops. Inference can finish from the
    // already-captured PCM buffers after the live audio tracks have been closed.
    this.stream?.getTracks().forEach((t) => t.stop());
    for (let waited = 0; (this.inflight || this.queue.length) && waited < 60000; waited += 100) await new Promise((r) => setTimeout(r, 100));
    try { this.node?.disconnect(); await this.ctx?.close(); } catch { /* already closed */ }
    this.stream = null; this.ctx = null; this.node = null;
  }
  audioFor(id: number) { return this.audio.get(id); }
}

// ---------------------------------------------------------------- browser / Android speech recognition
type Alt = { transcript: string; confidence?: number };
type Res = { isFinal: boolean; 0: Alt };
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Res> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};

class BrowserSpeechSession implements AsrSession {
  readonly kind = "browser" as const;
  private want = false;
  private rec: Rec | null = null;
  private stopDone: (() => void) | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 0;
  constructor(private cb: AsrCallbacks) {}

  async start() {
    try {
      if (navigator.mediaDevices?.getUserMedia) (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    } catch (cause) { const [c, m] = micError(cause); this.cb.onError(c, m); throw cause; }
    this.want = true; this.launch();
  }
  private launch() {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Engine = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Engine) { this.cb.onError("unsupported", "This browser has no speech recognition. Use Chrome or Edge, or start the local Quran speech server."); return; }
    const r = new Engine(); const ids = new Map<number, number>();
    r.lang = "ar-SA"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let draft = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], text = res[0]?.transcript?.trim() || "";
        if (!text) continue;
        if (res.isFinal) {
          if (!ids.has(i)) ids.set(i, this.nextId++);
          const c = res[0].confidence;
          this.cb.onFinal({ id: ids.get(i)!, text, confidence: c && c > 0 ? c : undefined });
        } else draft += (draft ? " " : "") + text;
      }
      this.cb.onPartial(draft);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { this.want = false; this.cb.onError("not-allowed", "Microphone or speech permission was denied. Allow it for this site, then resume."); }
      else if (e.error === "audio-capture") { this.want = false; this.cb.onError("audio-capture", "No microphone was found."); }
      else if (e.error === "network") { this.want = false; this.cb.onError("network", "The browser's speech service is unreachable (in the VS Code preview it always is). Use Chrome/Edge, or the local Quran model."); }
      else if (e.error === "language-not-supported") { this.want = false; this.cb.onError("unsupported", "Arabic speech recognition is not available on this device."); }
    };
    r.onend = () => {
      if (this.want) setTimeout(() => this.want && this.launch(), 150);
      else if (this.stopDone) { if (this.stopTimer) clearTimeout(this.stopTimer); this.stopTimer = null; const done = this.stopDone; this.stopDone = null; done(); }
    };
    this.rec = r;
    try { r.start(); } catch { /* already started */ }
  }
  pause() { this.want = false; try { this.rec?.stop(); } catch { /* stopped */ } this.cb.onPartial(""); }
  async resume() { this.want = true; this.launch(); }
  async stop() {
    this.want = false;
    const r = this.rec;
    if (!r) { this.cb.onPartial(""); return; }
    this.cb.onPartial("");
    await new Promise<void>((resolve) => {
      this.stopDone = resolve;
      this.stopTimer = setTimeout(() => { this.stopTimer = null; const done = this.stopDone; this.stopDone = null; done?.(); }, 2500);
      try { r.stop(); } catch { if (this.stopTimer) clearTimeout(this.stopTimer); this.stopTimer = null; this.stopDone = null; resolve(); }
    });
  }
  retryFailed() { /* nothing is buffered by the browser engine */ }
  audioFor() { return undefined; }
}

export function createSession(kind: EngineKind, cb: AsrCallbacks, opts: { keepAudio: boolean; url?: string }): AsrSession {
  return kind === "local" ? new LocalModelSession(opts.url || getAsrUrl(), cb, opts.keepAudio) : new BrowserSpeechSession(cb);
}

/** Play back a kept PCM16 segment (memory only). */
export function playPcm(pcm: Int16Array) {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const buf = ctx.createBuffer(1, pcm.length, RATE);
  const ch = buf.getChannelData(0); for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  src.onended = () => void ctx.close(); src.start();
}
