// Automatic offline audio: one shared cache for Arabic recitation and recorded Urdu translation.
//
//   • Play starts at once from the network (or from the saved copy, if there is one).
//   • Shortly after playback starts, the COMPLETE file is fetched once in the background (no Range
//     header), checked (HTTP 200, not partial/opaque, byte count = Content-Length, real audio signature),
//     written to app-private CacheStorage "quran-audio-v1" (the name the app has always used) and read
//     back. Only then is it reported as "Saved offline".
//   • Later plays use the saved copy first, as a blob: URL: seeking works offline and the Android WebView
//     never has to send Range requests to everyayah.com or to a service worker.
//   • Failures never interrupt playback; they are retried later with back-off.
//   • Size limit and "clear downloaded audio" for Settings.
//
// Android app: the WebView page cannot read everyayah.com responses unless the server sends CORS headers,
// so MainActivity offers a narrow same-origin download path (/__hifz-audio/fetch?u=…) for allow-listed
// audio URLs only (see AudioDownloadProxy.java). Browsers use an ordinary CORS request.
//
// This module stores ONLY audio. It never reads or writes Quran text, translations, Hifz progress,
// assessments or backups (those live in localStorage / the app store, which this file does not import).

export const AUDIO_CACHE_NAME = "quran-audio-v1"; // preserved: files saved by earlier versions stay usable
export const AUDIO_DB_NAME = "hifz-audio-cache";
const DB_VERSION = 1;

export const KIND_ARABIC = "ar-recitation";
export const KIND_URDU = "ur-translation";
export type AudioKind = typeof KIND_ARABIC | typeof KIND_URDU;
const KINDS: readonly string[] = [KIND_ARABIC, KIND_URDU];

export const STATE = {
  NONE: "none",
  SAVING: "saving",
  SAVED: "saved", // complete file stored and read back
  UNVERIFIED: "unverified", // older opaque copy: kept and still used offline, never shown as "Saved"
  FAILED: "failed", // retried later
  QUOTA: "quota", // not saved: size limit or device storage
} as const;
export type AudioState = (typeof STATE)[keyof typeof STATE];

export type AudioTrack = { kind: AudioKind; voiceId: string; surah: number; ayah: number; url: string };
export type AudioSettings = { autoSave: boolean; maxBytes: number; whenFull: "stop" | "evict-lru" };
export const DEFAULT_SETTINGS: AudioSettings = { autoSave: true, maxBytes: 500 * 1024 * 1024, whenFull: "stop" };

export type AudioStatus = {
  id: string; kind?: string; voiceId?: string; state: AudioState; bytes: number; savedAt: number | null;
  lastError: string | null; nextRetryAt: number | null; savedOffline: boolean;
};
export type AudioUsage = {
  bytes: number; count: number; unverified: number;
  byKind: Record<AudioKind, { bytes: number; count: number }>;
  settings: AudioSettings; device: { usage?: number; quota?: number } | null;
};
export type AudioEvent =
  | { type: "status"; id: string; status: Partial<AudioStatus> & { id: string; state: AudioState } }
  | { type: "settings"; settings: AudioSettings }
  | { type: "cleared"; kind: string | null; freed: number };

type Entry = {
  id: string; kind: string; voiceId: string; surah: number; ayah: number; url: string; state: AudioState;
  bytes?: number; contentType?: string; opaque?: boolean; legacy?: boolean; savedAt?: number; lastPlayedAt?: number;
  attempts?: number; lastError?: string | null; nextRetryAt?: number | null; retryPending?: boolean;
};
export type FetchResult = { status: number; contentType: string | null; contentLength: string | null; contentRange: string | null; bytes: Uint8Array };
export type FetchBytes = (url: string, opts: { signal?: AbortSignal; onProgress?: (n: number) => void }) => Promise<FetchResult>;

const RETRY_DELAYS_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 12 * 3600e3, 24 * 3600e3];
const MIN_AUDIO_BYTES = 512;
const STALL_TIMEOUT_MS = 30e3;
const STORAGE_HEADROOM_BYTES = 20 * 1024 * 1024; // leave room for the rest of the app
export const NATIVE_PROXY_PATH = "/__hifz-audio/fetch";

const pad3 = (n: number) => String(n).padStart(3, "0");

/** Stable identifier: kind + reciter/narrator + surah + ayah, e.g. "ar-recitation:Alafasy_128kbps:001001". */
export function audioId(t: { kind: string; voiceId: string; surah: number; ayah: number }): string {
  if (!KINDS.includes(t.kind)) throw new Error(`Unknown audio kind: ${t.kind}`);
  if (!t.voiceId || !/^[A-Za-z0-9_.-]+$/.test(t.voiceId)) throw new Error(`Invalid voiceId: ${t.voiceId}`);
  const s = Number(t.surah), a = Number(t.ayah);
  if (!Number.isInteger(s) || s < 1 || s > 114 || !Number.isInteger(a) || a < 0 || a > 286) throw new Error(`Invalid surah/ayah: ${t.surah}:${t.ayah}`);
  return `${t.kind}:${t.voiceId}:${pad3(s)}${pad3(a)}`;
}

/** Recognises an everyayah.com ayah URL (used to adopt files saved by earlier versions). */
export function parseEveryAyahUrl(url: string): { kind: AudioKind; voiceId: string; surah: number; ayah: number } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "everyayah.com") return null;
    const m = u.pathname.match(/^\/data\/(.+)\/(\d{3})(\d{3})\.mp3$/i);
    if (!m) return null;
    return { kind: KIND_ARABIC, voiceId: decodeURIComponent(m[1]).replace(/[^A-Za-z0-9_.-]/g, "_"), surah: Number(m[2]), ayah: Number(m[3]) };
  } catch { return null; }
}

// ---------------------------------------------------------------- validation

export function sniffAudio(b: Uint8Array): string | null {
  if (b.length < 4) return null;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "audio/mpeg"; // "ID3"
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "audio/mpeg"; // MPEG frame sync
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg"; // "OggS"
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "audio/mp4"; // "ftyp"
  return null;
}

export class DownloadError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

/** Throws DownloadError unless the bytes are one complete, playable audio file. Returns the sniffed type. */
export function validateCompleteAudio(r: { status: number; contentType?: string | null; contentLength?: string | null; contentRange?: string | null; bytes: Uint8Array }): string {
  if (r.status === 206 || r.contentRange) throw new DownloadError("partial", "Partial (206) response cannot be saved");
  if (r.status !== 200) throw new DownloadError("http", `HTTP ${r.status}`, r.status >= 500 || r.status === 429 || r.status === 408 || r.status === 404);
  if (r.contentType && /^(text\/|application\/(json|xml|xhtml))/i.test(r.contentType)) throw new DownloadError("not-audio", `Unexpected content-type ${r.contentType}`);
  if (r.bytes.length < MIN_AUDIO_BYTES) throw new DownloadError("too-small", `Only ${r.bytes.length} bytes`);
  if (r.contentLength != null && r.contentLength !== "" && Number(r.contentLength) !== r.bytes.length) {
    throw new DownloadError("truncated", `Expected ${r.contentLength} bytes, got ${r.bytes.length}`);
  }
  const sniffed = sniffAudio(r.bytes);
  if (!sniffed) throw new DownloadError("not-audio", "Body is not a recognised audio file");
  return sniffed;
}

// ---------------------------------------------------------------- fetchers

async function readAll(res: Response, onProgress?: (n: number) => void): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length; onProgress?.(received);
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new DownloadError("aborted", "Download stalled or was cancelled");
    throw new DownloadError("interrupted", `Download interrupted after ${received} bytes`);
  }
  const out = new Uint8Array(received); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function fetchToResult(input: string, init: RequestInit, onProgress?: (n: number) => void): Promise<FetchResult> {
  let res: Response;
  try { res = await fetch(input, init); } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new DownloadError("aborted", "Download stalled or was cancelled");
    throw new DownloadError("network", `Network/CORS error: ${(e as Error)?.message}`);
  }
  if (res.type === "opaque") throw new DownloadError("opaque", "Opaque response cannot be verified");
  const encoded = /gzip|br|deflate/i.test(res.headers.get("content-encoding") || "");
  const meta = { status: res.status, contentType: res.headers.get("content-type"), contentLength: encoded ? null : res.headers.get("content-length"), contentRange: res.headers.get("content-range") };
  if (!res.ok) return { ...meta, bytes: new Uint8Array(0) };
  return { ...meta, bytes: await readAll(res, onProgress) };
}

/** Browser: one CORS request for the whole file. */
export const corsFetchBytes: FetchBytes = (url, { signal, onProgress }) =>
  fetchToResult(url, { mode: "cors", credentials: "omit", cache: "default", redirect: "follow", signal }, onProgress);

/** Android app: same-origin request that MainActivity answers natively, for allow-listed audio URLs only. */
export const nativeProxyFetchBytes: FetchBytes = (url, { signal, onProgress }) =>
  fetchToResult(`${NATIVE_PROXY_PATH}?u=${encodeURIComponent(url)}`, { method: "GET", credentials: "omit", cache: "no-store", signal }, onProgress);

/** True inside the Hifz Journey Android app version that provides the native audio download path. */
export function hasNativeAudioProxy(): boolean {
  try {
    const app = (globalThis as unknown as { AndroidApp?: { audioProxyVersion?: () => number } }).AndroidApp;
    return !!app && typeof app.audioProxyVersion === "function" && Number(app.audioProxyVersion()) >= 1;
  } catch { return false; }
}

export const defaultFetchBytes: FetchBytes = (url, opts) => (hasNativeAudioProxy() ? nativeProxyFetchBytes(url, opts) : corsFetchBytes(url, opts));

// ---------------------------------------------------------------- IndexedDB

function reqP<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        const s = db.createObjectStore("entries", { keyPath: "id" });
        s.createIndex("byUrl", "url", { unique: false });
        s.createIndex("byKind", "kind", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

export class OfflineUnavailableError extends Error {
  constructor() { super("This Ayah's audio has not been saved for offline listening yet."); this.name = "OfflineUnavailableError"; }
}

export type AudioCacheOptions = {
  cacheName?: string; dbName?: string; fetchBytes?: FetchBytes; now?: () => number; isOnline?: () => boolean;
  maxConcurrent?: number; startDelayMs?: number; stallTimeoutMs?: number; log?: (...a: unknown[]) => void;
};

export type PlayResult = { source: "offline-cache" | "network" | "legacy-cache"; status: Partial<AudioStatus>; saved: Promise<Partial<AudioStatus>> };

// ---------------------------------------------------------------- the cache

export function createAudioCache(options: AudioCacheOptions = {}) {
  const cacheName = options.cacheName || AUDIO_CACHE_NAME;
  const dbName = options.dbName || AUDIO_DB_NAME;
  const fetchBytes = options.fetchBytes || defaultFetchBytes;
  const now = options.now || (() => Date.now());
  const isOnline = options.isOnline || (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const maxConcurrent = options.maxConcurrent || 2;
  const startDelayMs = options.startDelayMs ?? 1200; // let playback buffer first
  const log = options.log || (() => {});

  const listeners = new Set<(e: AudioEvent) => void>();
  const inflight = new Map<string, Promise<Partial<AudioStatus>>>(); // url -> pending save
  const queue: (() => Promise<void>)[] = [];
  let active = 0;
  let dbP: Promise<IDBDatabase> | null = null;
  let persistRequested = false;
  const release = new WeakMap<HTMLMediaElement, () => void>(); // element -> revoke its blob: URL

  const emit = (e: AudioEvent) => { for (const l of listeners) { try { l(e); } catch { /* listener error */ } } };
  const db = () => (dbP ||= openDb(dbName));
  const cache = () => caches.open(cacheName);

  async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
    const d = await db();
    return new Promise<T>((resolve, reject) => {
      const t = d.transaction(store, mode);
      let result: T;
      fn(t.objectStore(store)).then((r) => { result = r; }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("transaction aborted"));
    });
  }
  const getEntryRaw = (id: string) => tx("entries", "readonly", (s) => reqP(s.get(id) as IDBRequest<Entry | undefined>));
  const putEntry = (e: Entry) => tx("entries", "readwrite", (s) => reqP(s.put(e)));
  const allEntries = () => tx("entries", "readonly", (s) => reqP(s.getAll() as IDBRequest<Entry[]>));
  const entriesByUrl = (url: string) => tx("entries", "readonly", (s) => reqP(s.index("byUrl").getAll(url) as IDBRequest<Entry[]>));
  const deleteEntry = (id: string) => tx("entries", "readwrite", (s) => reqP(s.delete(id)));
  const getMeta = <T>(k: string) => tx("meta", "readonly", (s) => reqP(s.get(k) as IDBRequest<T | undefined>));
  const setMeta = (k: string, v: unknown) => tx("meta", "readwrite", (s) => reqP(s.put(v, k)));

  async function getSettings(): Promise<AudioSettings> {
    return { ...DEFAULT_SETTINGS, ...((await getMeta<Partial<AudioSettings>>("settings")) || {}) };
  }
  async function setSettings(patch: Partial<AudioSettings>): Promise<AudioSettings> {
    const next = { ...(await getSettings()), ...patch };
    if (next.whenFull !== "stop" && next.whenFull !== "evict-lru") throw new Error("whenFull must be 'stop' or 'evict-lru'");
    if (!(next.maxBytes > 0)) throw new Error("maxBytes must be positive");
    await setMeta("settings", next);
    await releaseQuotaBlocked();
    emit({ type: "settings", settings: next });
    return next;
  }

  function base(track: AudioTrack): Entry {
    const id = audioId(track);
    if (!track.url) throw new Error("track.url is required");
    return { id, kind: track.kind, voiceId: track.voiceId, surah: Number(track.surah), ayah: Number(track.ayah), url: String(track.url), state: STATE.NONE };
  }

  function publicStatus(e: Entry): AudioStatus {
    return { id: e.id, kind: e.kind, voiceId: e.voiceId, state: e.state, bytes: e.bytes || 0, savedAt: e.savedAt || null, lastError: e.lastError || null, nextRetryAt: e.nextRetryAt || null, savedOffline: e.state === STATE.SAVED };
  }

  /** Adopt a file already in the cache (e.g. "Save … for offline listening" in earlier versions). Never deletes. */
  async function adoptFromCache(b: Entry): Promise<Entry | null> {
    const res = await (await cache()).match(b.url);
    if (!res) return null;
    const entry: Entry = { ...b, attempts: 0, legacy: true, savedAt: now(), lastPlayedAt: 0 };
    if (res.type === "opaque" || res.status === 0) {
      Object.assign(entry, { state: STATE.UNVERIFIED, opaque: true, bytes: 0 });
    } else {
      try {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const ct = validateCompleteAudio({ status: res.status, contentType: res.headers.get("content-type"), contentLength: res.headers.get("content-length"), contentRange: res.headers.get("content-range"), bytes });
        Object.assign(entry, { state: STATE.SAVED, bytes: bytes.length, contentType: res.headers.get("content-type") || ct, opaque: false });
      } catch (e) {
        Object.assign(entry, { state: STATE.UNVERIFIED, bytes: 0, lastError: `older copy not verifiable: ${(e as Error).message}` });
      }
    }
    await putEntry(entry);
    return entry;
  }

  async function getEntry(track: AudioTrack): Promise<Entry | null> {
    const b = base(track);
    return (await getEntryRaw(b.id)) || adoptFromCache(b);
  }

  async function getStatus(track: AudioTrack): Promise<AudioStatus> {
    const e = await getEntry(track);
    if (e) return publicStatus(e);
    return { id: audioId(track), state: inflight.has(track.url) ? STATE.SAVING : STATE.NONE, bytes: 0, savedAt: null, lastError: null, nextRetryAt: null, savedOffline: false };
  }

  async function usage(): Promise<AudioUsage> {
    const all = await allEntries();
    const byKind = { [KIND_ARABIC]: { bytes: 0, count: 0 }, [KIND_URDU]: { bytes: 0, count: 0 } } as AudioUsage["byKind"];
    let bytes = 0, count = 0, unverified = 0;
    const seen = new Set<string>();
    for (const e of all) {
      if (e.state === STATE.UNVERIFIED) unverified++;
      if (e.state !== STATE.SAVED) continue;
      count++;
      const k = byKind[e.kind as AudioKind];
      if (k) k.count++;
      if (seen.has(e.url)) continue; // one file shared by two ids counts once
      seen.add(e.url); bytes += e.bytes || 0; if (k) k.bytes += e.bytes || 0;
    }
    let device: AudioUsage["device"] = null;
    try { if (navigator.storage?.estimate) { const d = await navigator.storage.estimate(); device = { usage: d.usage, quota: d.quota }; } } catch { /* unsupported */ }
    return { bytes, count, unverified, byKind, settings: await getSettings(), device };
  }

  async function removeFile(url: string) {
    await (await cache()).delete(url);
    for (const e of await entriesByUrl(url)) {
      await deleteEntry(e.id);
      emit({ type: "status", id: e.id, status: { id: e.id, state: STATE.NONE, savedOffline: false } });
    }
  }

  async function ensureRoom(size: number, excludeUrl: string) {
    const settings = await getSettings();
    const u = await usage();
    if (u.device?.quota && u.device.usage != null && u.device.quota - u.device.usage < size + STORAGE_HEADROOM_BYTES) {
      throw new DownloadError("quota", "Device storage is nearly full", false);
    }
    if (u.bytes + size <= settings.maxBytes) return;
    if (settings.whenFull !== "evict-lru") throw new DownloadError("quota", "Downloaded-audio limit reached", false);
    const victims = (await allEntries())
      .filter((e) => e.state === STATE.SAVED && e.url !== excludeUrl)
      .sort((a, b) => (a.lastPlayedAt || a.savedAt || 0) - (b.lastPlayedAt || b.savedAt || 0));
    let total = u.bytes;
    for (const v of victims) {
      if (total + size <= settings.maxBytes) break;
      await removeFile(v.url); total -= v.bytes || 0; log("evicted", v.id);
    }
    if (total + size > settings.maxBytes) throw new DownloadError("quota", "File is larger than the downloaded-audio limit", false);
  }

  async function markFailure(b: Entry, err: DownloadError): Promise<Entry> {
    const prev = (await getEntryRaw(b.id)) || b;
    const quota = err.code === "quota", offline = err.code === "offline";
    const attempts = offline ? prev.attempts || 0 : (prev.attempts || 0) + 1; // being offline is nobody's fault
    const delay = err.retryable === false ? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] : RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1) - 1, RETRY_DELAYS_MS.length - 1)];
    const next: Entry = {
      ...prev, ...b,
      // Never downgrade an older copy we are keeping; just record the error.
      state: prev.state === STATE.UNVERIFIED ? STATE.UNVERIFIED : quota ? STATE.QUOTA : STATE.FAILED,
      bytes: prev.bytes || 0, attempts,
      lastError: `${err.code || "error"}: ${err.message}`,
      nextRetryAt: quota || offline ? null : now() + delay,
      retryPending: !quota,
    };
    await putEntry(next);
    emit({ type: "status", id: next.id, status: publicStatus(next) });
    return next;
  }

  async function downloadAndStore(b: Entry): Promise<Entry> {
    if (!isOnline()) throw new DownloadError("offline", "Device is offline");
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let stall: ReturnType<typeof setTimeout> | undefined;
    const kick = () => { if (!controller) return; clearTimeout(stall); stall = setTimeout(() => controller.abort(), options.stallTimeoutMs || STALL_TIMEOUT_MS); };
    kick();
    let r: FetchResult;
    try { r = await fetchBytes(b.url, { signal: controller?.signal, onProgress: kick }); } finally { clearTimeout(stall); }
    const bytes = r.bytes instanceof Uint8Array ? r.bytes : new Uint8Array(r.bytes);
    const sniffed = validateCompleteAudio({ ...r, bytes });
    await ensureRoom(bytes.length, b.url);
    const type = r.contentType && /^audio\//i.test(r.contentType) ? r.contentType.split(";")[0] : sniffed;
    const stored = new Response(new Blob([bytes as BlobPart], { type }), {
      status: 200,
      headers: { "Content-Type": type, "Content-Length": String(bytes.length), "Accept-Ranges": "bytes", "X-Hifz-Audio-Id": b.id, "X-Hifz-Saved-At": new Date(now()).toISOString() },
    });
    const c = await cache();
    try { await c.put(b.url, stored); } catch (e) {
      const err = e as Error;
      if (err?.name === "QuotaExceededError" || /quota/i.test(err?.message || "")) throw new DownloadError("quota", "Device storage quota exceeded", false);
      throw new DownloadError("storage", `Could not write audio cache: ${err?.message}`);
    }
    // Confirm by reading back. Only now is it "Saved offline".
    const check = await c.match(b.url);
    const blob = check && (await check.blob());
    if (!blob || blob.size !== bytes.length) {
      await c.delete(b.url).catch(() => false);
      throw new DownloadError("storage", "Stored file could not be read back");
    }
    if (!persistRequested && navigator.storage?.persist) { persistRequested = true; navigator.storage.persist().catch(() => false); }
    const prev = (await getEntryRaw(b.id)) || b;
    const entry: Entry = { ...prev, ...b, state: STATE.SAVED, bytes: bytes.length, contentType: type, opaque: false, legacy: false, savedAt: now(), lastPlayedAt: prev.lastPlayedAt || now(), attempts: 0, lastError: null, nextRetryAt: null, retryPending: false };
    await putEntry(entry);
    for (const other of await entriesByUrl(b.url)) {
      if (other.id !== b.id && other.state !== STATE.SAVED) await putEntry({ ...other, state: STATE.SAVED, bytes: bytes.length, contentType: type, opaque: false, lastError: null, retryPending: false });
    }
    emit({ type: "status", id: entry.id, status: publicStatus(entry) });
    return entry;
  }

  function pump() {
    while (active < maxConcurrent && queue.length) {
      const job = queue.shift()!;
      active++;
      job().finally(() => { active--; pump(); });
    }
  }

  async function withLock<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    return locks?.request ? (locks.request(`hifz-audio:${url}`, fn) as Promise<T>) : fn();
  }

  /** Save the complete file for `track` (deduplicated per URL, also across tabs). Never throws. */
  function ensureSaved(track: AudioTrack, { force = false }: { force?: boolean } = {}): Promise<Partial<AudioStatus>> {
    let b: Entry;
    try { b = base(track); } catch (e) { return Promise.resolve({ state: STATE.FAILED, lastError: (e as Error).message }); }
    const pending = inflight.get(b.url);
    if (pending) return pending;
    const p = new Promise<Partial<AudioStatus>>((resolve) => {
      queue.push(async () => {
        try {
          const settings = await getSettings();
          const existing = await getEntry(track);
          if (existing?.state === STATE.SAVED) {
            const hit = await (await cache()).match(b.url);
            if (hit && hit.type !== "opaque") return resolve(publicStatus(existing));
          }
          if (!settings.autoSave && !force) return resolve(existing ? publicStatus(existing) : { id: b.id, state: STATE.NONE });
          if (existing?.state === STATE.QUOTA && !force) return resolve(publicStatus(existing));
          if (existing?.nextRetryAt && existing.nextRetryAt > now() && !force) return resolve(publicStatus(existing));
          const result = await withLock(b.url, async () => {
            // Another tab may have finished while we waited for the lock.
            const again = await getEntryRaw(b.id);
            const hit = await (await cache()).match(b.url);
            if (hit && hit.type !== "opaque" && again?.state === STATE.SAVED) return again;
            emit({ type: "status", id: b.id, status: { id: b.id, state: STATE.SAVING, savedOffline: false } });
            return downloadAndStore(b);
          });
          resolve(publicStatus(result));
        } catch (err) {
          const e = err instanceof DownloadError ? err : new DownloadError((err as { code?: string })?.code || "error", String((err as Error)?.message));
          log("save failed", b.url, e.message);
          resolve(publicStatus(await markFailure(b, e).catch(() => ({ ...b, state: STATE.FAILED, lastError: e.message }) as Entry)));
        } finally {
          inflight.delete(b.url);
        }
      });
      pump();
    });
    inflight.set(b.url, p);
    return p;
  }

  async function touch(id: string) {
    const e = await getEntryRaw(id);
    if (e) await putEntry({ ...e, lastPlayedAt: now() });
  }

  /** Saved copy first (blob: URL), otherwise the network URL. Throws OfflineUnavailableError offline with nothing saved. */
  async function resolveSource(track: AudioTrack): Promise<{ src: string; source: PlayResult["source"]; status: Partial<AudioStatus>; release: () => void }> {
    const b = base(track);
    let e: Entry | null = null;
    try { e = await getEntry(track); } catch (err) { log("index read failed", err); }
    if (e?.state === STATE.SAVED) {
      const hit = await (await cache()).match(b.url);
      if (hit && hit.type !== "opaque") {
        const blob = await hit.blob();
        if (!e.bytes || blob.size === e.bytes) {
          touch(e.id).catch(() => {});
          const src = URL.createObjectURL(blob);
          return { src, source: "offline-cache", status: publicStatus(e), release: () => URL.revokeObjectURL(src) };
        }
      }
      // The file vanished (browser eviction / site data cleared): forget the stale index entry.
      await deleteEntry(e.id).catch(() => undefined);
      e = null;
    }
    if (!isOnline()) {
      if (e?.state === STATE.UNVERIFIED) return { src: b.url, source: "legacy-cache", status: publicStatus(e), release: () => {} };
      throw new OfflineUnavailableError();
    }
    return { src: b.url, source: "network", status: e ? publicStatus(e) : { id: b.id, state: STATE.NONE }, release: () => {} };
  }

  /**
   * Point `el` at the best source for `track` and start playback immediately. When it came from the
   * network, the complete file is saved in the background once playback is under way.
   * `beforePlay` runs after src is set (e.g. to apply playbackRate). `isCurrent` lets a player that has moved
   * on (Next tapped again) cancel a stale start: it then throws a StaleAudioRequest error and changes nothing.
   * Otherwise throws what audio.play() throws.
   */
  async function play(el: HTMLMediaElement, track: AudioTrack, opts: { beforePlay?: (el: HTMLMediaElement) => void; isCurrent?: () => boolean } = {}): Promise<PlayResult> {
    const { beforePlay, isCurrent } = opts;
    const r = await resolveSource(track);
    if (isCurrent && !isCurrent()) {
      r.release();
      const stale = new Error("A newer Ayah was requested"); stale.name = "StaleAudioRequest";
      throw stale;
    }
    const prev = release.get(el);
    el.src = r.src;
    prev?.();
    release.set(el, r.release);
    beforePlay?.(el);
    let saved: Promise<Partial<AudioStatus>> = Promise.resolve(r.status);
    if (r.source !== "offline-cache") {
      saved = new Promise((resolve) => {
        let started = false;
        const start = () => {
          if (started) return;
          started = true;
          el.removeEventListener("playing", onPlaying);
          ensureSaved(track).then(resolve);
        };
        const onPlaying = () => setTimeout(start, Math.min(startDelayMs, 300));
        el.addEventListener("playing", onPlaying);
        setTimeout(start, startDelayMs); // also save if "playing" is never seen (paused at once, slow start)
      });
    }
    await el.play();
    return { source: r.source, status: r.status, saved };
  }

  /** Retry failed saves whose back-off has passed (or all, with force). Only Ayahs the learner has played. */
  async function retryPending({ force = false }: { force?: boolean } = {}) {
    if (!isOnline()) return [];
    const due = (await allEntries()).filter((e) => e.retryPending && e.state !== STATE.SAVED && e.state !== STATE.QUOTA && (force || !e.nextRetryAt || e.nextRetryAt <= now()));
    return Promise.all(due.map((e) => ensureSaved(e as unknown as AudioTrack, { force: true })));
  }

  async function releaseQuotaBlocked() {
    for (const e of await allEntries()) if (e.state === STATE.QUOTA) await putEntry({ ...e, state: STATE.FAILED, retryPending: true, nextRetryAt: now() });
  }

  /** Clear downloaded audio (all, or one kind). Touches nothing but the audio cache and its index. */
  async function clear({ kind }: { kind?: AudioKind } = {}) {
    const c = await cache();
    const all = await allEntries();
    const targets = kind ? all.filter((e) => e.kind === kind) : all;
    const keep = new Set(all.filter((e) => !targets.includes(e)).map((e) => e.url));
    let freed = 0;
    for (const e of targets) {
      if (!keep.has(e.url) && (await c.delete(e.url))) freed += e.bytes || 0;
      await deleteEntry(e.id);
    }
    if (!kind) for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req); // un-indexed older copies
    emit({ type: "cleared", kind: kind || null, freed });
    return { removed: targets.length, freedBytes: freed };
  }

  function subscribe(fn: (e: AudioEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

  let onOnline: (() => void) | null = null;
  async function init() {
    await db();
    if (typeof window !== "undefined" && !onOnline) {
      onOnline = () => { retryPending().catch(() => {}); };
      window.addEventListener("online", onOnline);
    }
    retryPending().catch(() => {});
    return api;
  }

  const api = { init, play, resolveSource, ensureSaved, getStatus, retryPending, usage, getSettings, setSettings, clear, subscribe, audioId };
  return api;
}
export type AudioCache = ReturnType<typeof createAudioCache>;

// ---------------------------------------------------------------- shared instance

let shared: AudioCache | null = null;
let sharedReady: Promise<AudioCache> | null = null;

/** True where automatic saving can work (secure context with CacheStorage and IndexedDB). */
export const audioCacheSupported = () => typeof window !== "undefined" && "caches" in window && "indexedDB" in window;

/** The one shared cache for the whole app. Resolves to null where unsupported (plain streaming then). */
export function getAudioCache(): Promise<AudioCache | null> {
  if (!audioCacheSupported()) return Promise.resolve(null);
  if (!sharedReady) {
    shared = createAudioCache();
    sharedReady = shared.init().catch(() => shared!);
  }
  return sharedReady;
}

export function formatBytes(n: number | undefined | null): string {
  if (!n) return "0 MB";
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
