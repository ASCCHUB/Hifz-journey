// Durable persistence for the app state (B1).
//
// The store stays synchronous in memory; every change is queued here and written to durable storage.
//   • Primary: IndexedDB (much larger quota than localStorage, offline, available in Android WebView).
//   • Mirror:  localStorage, best effort — it lets the app show the last state instantly on start and keeps
//              older builds working. The mirror is NEVER deleted on quota errors (that would hide old data).
// Guarantees
//   • A failed write is never reported as saved: status becomes "unsaved" with the error, and stays so until a
//     later write succeeds (retry is automatic on the next change, or manual via retry()).
//   • Writes for a profile are serialized and coalesced: only the newest state is written, and a durable record
//     is never replaced by an older one (compare by state.t inside the same IndexedDB transaction).
//   • Nothing is written for a profile until its durable copy has been read and merged (hydration), so an early
//     write from a not-yet-loaded state can never overwrite real progress.
//   • Local save status is separate from cloud sync status.
import type { AppState } from "./store";

export type DurableRecord = { t: number; savedAt: number; state: AppState };
/** Minimal storage contract (IndexedDB in the app; fakes in tests). Methods may throw/reject. */
export type DurableBackend = {
  name: string;
  get(key: string): Promise<DurableRecord | null>;
  /** Write unless an existing record is newer (by t). Resolves the record actually kept. */
  putIfNewer(key: string, rec: DurableRecord): Promise<DurableRecord>;
  getAux<T>(key: string): Promise<T | null>;
  putAux<T>(key: string, value: T): Promise<void>;
};
export type MirrorBackend = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export type SaveStatus = {
  state: "idle" | "saving" | "saved" | "unsaved";
  lastSavedAt: number | null;      // last durable success
  lastSavedT: number | null;       // state.t of the last durable success
  pendingT: number | null;         // newest state.t not yet durably saved
  error: string | null;            // last failure, while unsaved
  where: "indexeddb" | "localstorage" | null;
  acknowledged: boolean;           // user acknowledged the unsaved warning (does NOT mean saved)
};

const listeners = new Set<(s: SaveStatus) => void>();
let status: SaveStatus = { state: "idle", lastSavedAt: null, lastSavedT: null, pendingT: null, error: null, where: null, acknowledged: false };
const setStatus = (patch: Partial<SaveStatus>) => { status = { ...status, ...patch }; listeners.forEach((l) => l(status)); };
export const getSaveStatus = () => status;
export const onSaveStatus = (fn: (s: SaveStatus) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const acknowledgeUnsaved = () => setStatus({ acknowledged: true });

let durable: DurableBackend | null = null;
let mirror: MirrorBackend | null = null;
export function configurePersistence(d: DurableBackend | null, m: MirrorBackend | null) { durable = d; mirror = m; resetQueues(); }

type Q = { pending: AppState | null; running: Promise<void> | null; hydrated: boolean };
const queues = new Map<string, Q>();
const q = (key: string) => { let x = queues.get(key); if (!x) { x = { pending: null, running: null, hydrated: false }; queues.set(key, x); } return x; };
function resetQueues() { queues.clear(); mirrorT.clear(); }
export const hasDurable = () => !!durable;

const describe = (e: unknown) => {
  const name = (e as { name?: string })?.name || "";
  if (/Quota/i.test(name) || /quota/i.test(String((e as Error)?.message || ""))) return "Device storage is full.";
  if (/Security|InvalidState|NotAllowed/i.test(name)) return "Storage is blocked (private browsing or browser settings).";
  return "The device refused to save (" + (name || String(e)).slice(0, 80) + ").";
};

/** Newest state.t successfully written to the localStorage mirror, per profile key. */
const mirrorT = new Map<string, number>();
/** Best-effort mirror write. Returns true on success. Never deletes an existing mirror. */
let lastMirrorError: unknown = null;
export function writeMirror(key: string, s: AppState): boolean {
  if (!mirror) return false;
  try { mirror.setItem(key, JSON.stringify(s)); mirrorT.set(key, Math.max(mirrorT.get(key) || 0, s.t || 0)); lastMirrorError = null; return true; } catch (e) { lastMirrorError = e; return false; }
}
/** The configured mirror (localStorage in the app), so every reader and writer uses the same storage. */
export const getMirror = () => mirror;

/**
 * Queue the newest state of a profile for durable saving. Coalesces: if a write is in flight, the newest
 * pending state is written next; older pending states are dropped (never written after a newer one).
 */
export function enqueueSave(key: string, s: AppState): Promise<void> {
  const x = q(key);
  if (!x.pending || (s.t || 0) >= (x.pending.t || 0)) x.pending = s;
  setStatus({ state: status.state === "unsaved" ? "unsaved" : "saving", pendingT: Math.max(status.pendingT || 0, s.t || 0) });
  if (!x.hydrated) return Promise.resolve(); // flushed by markHydrated()
  return pump(key);
}

function pump(key: string): Promise<void> {
  const x = q(key);
  if (x.running) return x.running;
  x.running = (async () => {
    while (x.pending) {
      const s = x.pending; x.pending = null;
      const rec: DurableRecord = { t: s.t || 0, savedAt: Date.now(), state: s };
      let ok = false, where: SaveStatus["where"] = null, err: unknown = null;
      if (durable) {
        try { await durable.putIfNewer(key, rec); ok = true; where = "indexeddb"; } catch (e) { err = e; }
      }
      // Durable store failed or is unavailable: the state still counts as saved if the mirror holds this
      // version (written synchronously by the store, or retried here).
      if (!ok && ((mirrorT.get(key) || 0) >= rec.t || writeMirror(key, s))) { ok = true; where = "localstorage"; }
      if (ok) {
        const newer = x.pending as AppState | null;
        setStatus({ state: newer ? "saving" : "saved", lastSavedAt: Date.now(), lastSavedT: rec.t, pendingT: newer ? newer.t : null, error: null, where, acknowledged: false });
      } else {
        // Keep the unsaved state queued so a retry writes it; never report success.
        if (!x.pending) x.pending = s;
        setStatus({ state: "unsaved", error: describe(err ?? lastMirrorError ?? new Error("no storage available")), pendingT: Math.max(status.pendingT || 0, rec.t) });
        break;
      }
    }
  })().finally(() => { x.running = null; });
  return x.running;
}

/** Retry all unsaved profiles now (the "Retry save" button). */
export async function retrySaves(): Promise<boolean> {
  await Promise.all([...queues.entries()].filter(([, x]) => x.pending && x.hydrated).map(([k]) => pump(k)));
  return status.state !== "unsaved";
}

/** Read the durable record for a profile (null if none or unavailable). An empty result is NOT proof of no progress. */
export async function readDurable(key: string): Promise<DurableRecord | null> {
  if (!durable) return null;
  try { return await durable.get(key); } catch { return null; }
}

/**
 * One-time, non-destructive copy of an existing localStorage state into the durable store. The mirror is kept.
 * Verified by reading back; if anything fails the migration is simply retried on the next start.
 */
export async function migrateMirror(key: string, mirrorState: AppState | null): Promise<"done" | "nothing" | "failed"> {
  if (!durable || !mirrorState) return "nothing";
  try {
    const existing = await durable.get(key);
    if (existing && existing.t >= (mirrorState.t || 0)) return "done";
    await durable.putIfNewer(key, { t: mirrorState.t || 0, savedAt: Date.now(), state: mirrorState });
    const back = await durable.get(key);
    return back && back.t >= (mirrorState.t || 0) ? "done" : "failed";
  } catch { return "failed"; }
}

/** Allow writes for a profile (after its durable copy has been merged in) and flush anything queued. */
export function markHydrated(key: string): Promise<void> {
  const x = q(key); x.hydrated = true;
  return x.pending ? pump(key) : Promise.resolve();
}
export const isHydrated = (key: string) => q(key).hydrated;

/** Wait until queued writes for a profile have finished (tests, sign-out, before unload). */
export async function flush(key: string) { const x = q(key); while (x.running) await x.running; }

// ---------------------------------------------------------------- snapshots (kept in the durable store)
export type Snapshot = { at: number; reason: string; state: AppState };
export async function readSnapshots(key: string): Promise<Snapshot[]> {
  if (!durable) return [];
  try { return (await durable.getAux<Snapshot[]>(`${key}:snapshots`)) || []; } catch { return []; }
}
/** Add a snapshot (max `limit`). Returns false if it could not be stored — never throws, never blocks saving. */
export async function writeSnapshot(key: string, snap: Snapshot, limit = 3): Promise<boolean> {
  if (!durable) return false;
  try { const cur = await readSnapshots(key); await durable.putAux(`${key}:snapshots`, [snap, ...cur].slice(0, limit)); return true; }
  catch { try { await durable.putAux(`${key}:snapshots`, [snap]); return true; } catch { return false; } }
}

// ---------------------------------------------------------------- IndexedDB backend
const DB = "hifz-companion", STATES = "states", AUX = "aux";
export function indexedDbBackend(idb: IDBFactory): DurableBackend {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => dbp ||= new Promise<IDBDatabase>((resolve, reject) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STATES)) d.createObjectStore(STATES); if (!d.objectStoreNames.contains(AUX)) d.createObjectStore(AUX); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => { dbp = null; reject(r.error); }; r.onblocked = () => { dbp = null; reject(new DOMException("IndexedDB blocked", "InvalidStateError")); };
  });
  // A synchronous throw from put() (e.g. QuotaExceededError) must reject the save, not escape as an uncaught error.
  const failed = new WeakMap<IDBTransaction, unknown>();
  const failTx = (s: IDBObjectStore, e: unknown) => { failed.set(s.transaction, e); try { s.transaction.abort(); } catch { /* already finished */ } };
  const tx = <T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore, done: (v: T) => void) => void) => open().then((d) => new Promise<T>((resolve, reject) => {
    let result: T; const t = d.transaction(store, mode); const s = t.objectStore(store);
    t.oncomplete = () => resolve(result); t.onerror = () => reject(failed.get(t) || t.error); t.onabort = () => reject(failed.get(t) || t.error || new DOMException("aborted", "AbortError"));
    try { fn(s, (v) => { result = v; }); } catch (e) { failTx(s, e); }
  }));
  return {
    name: "indexeddb",
    get: (key) => tx<DurableRecord | null>(STATES, "readonly", (s, done) => { const r = s.get(key); r.onsuccess = () => done((r.result as DurableRecord) ?? null); }),
    putIfNewer: (key, rec) => tx<DurableRecord>(STATES, "readwrite", (s, done) => {
      const r = s.get(key);
      r.onsuccess = () => { const cur = r.result as DurableRecord | undefined; if (cur && cur.t > rec.t) { done(cur); return; } try { s.put(rec, key); done(rec); } catch (e) { failTx(s, e); } };
    }),
    getAux: <T,>(key: string) => tx<T | null>(AUX, "readonly", (s, done) => { const r = s.get(key); r.onsuccess = () => done((r.result as T) ?? null); }),
    putAux: <T,>(key: string, value: T) => tx<void>(AUX, "readwrite", (s, done) => { try { s.put(value, key); done(undefined); } catch (e) { failTx(s, e); } }),
  };
}
