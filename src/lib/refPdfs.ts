// Reference PDF maps imported by the learner from their own device.
// Stored ONLY in this browser's IndexedDB, in a database separate from Hifz progress ("hifz-companion"),
// so PDFs never enter progress records, backups, snapshots or cloud sync, and are never uploaded.
// These are reference material: never teacher-reviewed, never Hifz evidence, never used as hints.

export type RefJuz = { juz: number; ar: string; en: string };
export const ACTIVE_RECALL_PDF_KEY = "hifz-active-recall-pdf-context";
export const PENDING_RECALL_PDF_KEY = "hifz-pending-recall-pdf-assistance";
export const REFERENCE_JUZ: RefJuz[] = [
  { juz: 1, ar: "الجزء الأول · الم", en: "Juz 1 · Alif Lam Mim" },
  { juz: 2, ar: "الجزء الثاني · سيقول", en: "Juz 2 · Sayaqul" },
  { juz: 3, ar: "الجزء الثالث · تلك الرسل", en: "Juz 3 · Tilka ar-Rusul" },
  { juz: 4, ar: "الجزء الرابع · لن تنالوا", en: "Juz 4 · Lan Tanalu" },
  { juz: 5, ar: "الجزء الخامس · والمحصنات", en: "Juz 5 · Wal-Muhsanat" },
  { juz: 26, ar: "الجزء السادس والعشرون · حم", en: "Juz 26 · Ha Mim" },
  { juz: 28, ar: "الجزء الثامن والعشرون · قد سمع", en: "Juz 28 · Qad Sami‘a" },
  { juz: 29, ar: "الجزء التاسع والعشرون · تبارك", en: "Juz 29 · Tabarak" },
  { juz: 30, ar: "الجزء الثلاثون · عم", en: "Juz 30 · ‘Amma" },
];
export type RefPdfMeta = { juz: number; name: string; size: number; addedAt: number };
type RefPdfRow = RefPdfMeta & { blob: Blob };

export const MAX_PDF_BYTES = 200 * 1024 * 1024;
const DB = "hifz-reference-pdfs", STORE = "pdfs";

export type RefPdfErrorCode = "not_pdf" | "too_large" | "no_space" | "storage_unavailable" | "write_failed" | "not_found";
export class RefPdfError extends Error {
  code: RefPdfErrorCode;
  constructor(code: RefPdfErrorCode, message: string) { super(message); this.code = code; }
}

type IDBFactoryLike = Pick<IDBFactory, "open">;
let factory: () => IDBFactoryLike | undefined = () => (typeof indexedDB === "undefined" ? undefined : indexedDB);
/** Test hook: swap the IndexedDB implementation. */
export function useRefPdfFactory(f: () => IDBFactoryLike | undefined) { factory = f; }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const f = factory(); if (!f) { reject(new RefPdfError("storage_unavailable", "This browser has no local database (IndexedDB), so PDFs cannot be kept offline here.")); return; }
    let req: IDBOpenDBRequest;
    try { req = f.open(DB, 1); } catch { reject(new RefPdfError("storage_unavailable", "Local storage is blocked (for example in a private window).")); return; }
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "juz" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new RefPdfError("storage_unavailable", "Local storage could not be opened."));
    req.onblocked = () => reject(new RefPdfError("storage_unavailable", "Local storage is busy in another tab. Close other tabs of the app and try again."));
  });
}
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    let out: T | undefined; let tx: IDBTransaction;
    try { tx = db.transaction(STORE, mode); const r = fn(tx.objectStore(STORE)); if (r) r.onsuccess = () => { out = r.result; }; }
    catch (e) { db.close(); reject(e); return; }
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => { db.close(); const name = tx.error?.name; reject(name === "QuotaExceededError" ? new RefPdfError("no_space", "Not enough storage space on this device for this PDF.") : new RefPdfError("write_failed", "The PDF could not be saved on this device.")); };
    tx.onabort = tx.onerror as never;
  }));
}

/** Check a picked file is a real PDF of a manageable size (reads only the first bytes). */
export async function validatePdf(file: Blob): Promise<void> {
  if (file.size > MAX_PDF_BYTES) throw new RefPdfError("too_large", `This file is ${Math.round(file.size / 1048576)} MB; the limit is ${MAX_PDF_BYTES / 1048576} MB.`);
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const s = String.fromCharCode(...head);
  if (!s.includes("%PDF-")) throw new RefPdfError("not_pdf", "This file is not a PDF. Choose the original PDF map file.");
}

/** Space check using the browser's storage estimate (where available). */
export async function checkSpace(bytes: number, est: () => Promise<{ usage?: number; quota?: number }> | undefined = () => (typeof navigator !== "undefined" ? navigator.storage?.estimate?.() : undefined)): Promise<void> {
  const e = await est()?.catch?.(() => undefined);
  if (e && e.quota !== undefined && e.usage !== undefined && e.quota - e.usage < bytes * 1.1) throw new RefPdfError("no_space", `Not enough storage space: this PDF needs about ${Math.round(bytes / 1048576)} MB, about ${Math.max(0, Math.round((e.quota - e.usage) / 1048576))} MB is free for the app.`);
}

export async function importRefPdf(juz: number, file: File | Blob, name = (file as File).name || `Juz ${juz}.pdf`, now = Date.now()): Promise<RefPdfMeta> {
  if (!REFERENCE_JUZ.some((j) => j.juz === juz)) throw new RefPdfError("not_found", "Unknown Juz.");
  await validatePdf(file);
  await checkSpace(file.size);
  try { await (typeof navigator !== "undefined" ? navigator.storage?.persist?.() : undefined); } catch { /* best effort */ }
  const row: RefPdfRow = { juz, name, size: file.size, addedAt: now, blob: file };
  await run("readwrite", (s) => { s.put(row); });
  return { juz, name, size: file.size, addedAt: now };
}
export async function listRefPdfs(): Promise<RefPdfMeta[]> {
  const rows = (await run<RefPdfRow[]>("readonly", (s) => s.getAll() as IDBRequest<RefPdfRow[]>)) || [];
  return rows.map(({ juz, name, size, addedAt }) => ({ juz, name, size, addedAt })).sort((a, b) => a.juz - b.juz);
}
export async function getRefPdf(juz: number): Promise<Blob> {
  const row = await run<RefPdfRow>("readonly", (s) => s.get(juz) as IDBRequest<RefPdfRow>);
  if (!row) throw new RefPdfError("not_found", "This PDF is no longer on this device. Import it again.");
  return row.blob;
}
export async function removeRefPdf(juz: number): Promise<void> { await run("readwrite", (s) => { s.delete(juz); }); }

// ---- reading position (per-device convenience; localStorage, never part of progress)
export type ReadPos = { page: number; zoom: number };
export function loadPos(juz: number): ReadPos {
  try { const v = JSON.parse(localStorage.getItem(`hifz-refpdf-pos:${juz}`) || "null"); if (v && v.page >= 1 && v.zoom > 0) return v; } catch { /* unavailable */ }
  return { page: 1, zoom: 1 };
}
export function savePos(juz: number, pos: ReadPos) { try { localStorage.setItem(`hifz-refpdf-pos:${juz}`, JSON.stringify(pos)); } catch { /* unavailable */ } }
export function clearPos(juz: number) { try { localStorage.removeItem(`hifz-refpdf-pos:${juz}`); } catch { /* unavailable */ } }
