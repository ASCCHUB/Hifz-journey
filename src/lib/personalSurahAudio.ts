// User-provided, private whole-Surah audio. No third-party recordings are bundled or downloaded.
// Storage is origin-private IndexedDB: survives offline/restart, but uninstall/clear-data removes it.
// This is NOT Ayah-aligned, and must never be presented as a single Ayah translation.
const DATABASE = "hifz-personal-urdu-surah-audio";
const STORE = "surahs";
const LIMIT_BYTES = 200 * 1024 * 1024; // per recording; quota may be lower
export type PersonalSurahAudio = {
  surah: number;
  name: string;
  blob: Blob;
  bytes: number;
  savedAt: number;
};

function checkSurah(surah: number) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error("Invalid Surah");
}
function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Private audio storage is unavailable on this device."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "surah" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open private audio storage."));
    request.onblocked = () => reject(new Error("Audio storage is blocked by another app window."));
  });
}
async function transact<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let settled = false;
    const tx = db.transaction(STORE, mode);
    const req = act(tx.objectStore(STORE));
    let result: T;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => { /* transaction onerror below */ };
    tx.oncomplete = () => { settled = true; db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => {
      if (!settled) { settled = true; db.close(); reject(new Error("Could not save audio. Check available phone storage.")); }
    };
  });
}
function allowedExtension(name: string): boolean { return /\.(mp3|m4a|ogg)$/i.test(name); }
async function validAudioSignature(file: File): Promise<boolean> {
  const a = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (a.length < 8) return false;
  const id3 = a[0] === 0x49 && a[1] === 0x44 && a[2] === 0x33;
  const mp3 = a[0] === 0xff && (a[1] & 0xe0) === 0xe0;
  const ogg = a[0] === 0x4f && a[1] === 0x67 && a[2] === 0x67 && a[3] === 0x53;
  const m4a = a[4] === 0x66 && a[5] === 0x74 && a[6] === 0x79 && a[7] === 0x70;
  return id3 || mp3 || ogg || m4a;
}
export async function savePersonalSurahAudio(surah: number, file: File): Promise<PersonalSurahAudio> {
  checkSurah(surah);
  if (!allowedExtension(file.name) || !(await validAudioSignature(file)))
    throw new Error("Select a valid MP3, M4A or OGG recording.");
  if (file.size > LIMIT_BYTES) throw new Error("This recording is over the 200 MB per-file limit.");
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    if (typeof est.quota === "number" && typeof est.usage === "number" &&
        est.quota - est.usage < file.size + 8 * 1024 * 1024)
      throw new Error("Not enough private storage to save this recording.");
  }
  const record: PersonalSurahAudio = { surah, name: file.name, blob: file, bytes: file.size, savedAt: Date.now() };
  await transact("readwrite", (store) => store.put(record));
  return record;
}
export async function getPersonalSurahAudio(surah: number): Promise<PersonalSurahAudio | null> {
  checkSurah(surah);
  return (await transact<PersonalSurahAudio | undefined>("readonly", (store) => store.get(surah))) ?? null;
}
export async function deletePersonalSurahAudio(surah: number): Promise<void> {
  checkSurah(surah);
  await transact("readwrite", (store) => store.delete(surah));
}
