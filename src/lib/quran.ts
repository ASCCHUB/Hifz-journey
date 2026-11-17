// Quran data access. The Arabic text is loaded from /public/data and is never edited or generated in code.
import { headerTime } from "./localTime";
// Source: QuranEnc quran-json snapshot. See README and scripts/reference for its pinned KFGQPC v2.0 comparison.

export type SurahMeta = [ar: string, en: string, count: number, type: string];
export type Core = {
  n: SurahMeta[];
  v: string[][];
  lay: number[][]; // per page: [surah, ayah, ...lines]; line > 0 = word count, 0 = basmala, < 0 = surah header
  juz: [[number, number], [number, number]][];
  hizbs: [number, number][];
  quarters: [number, number][];
};

let core: Core | null = null;
let pending: Promise<Core> | null = null;

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(`/data/${name}.json`);
  if (!r.ok) throw new Error(`Could not load ${name}`);
  return r.json() as Promise<T>;
}

export function loadCore(): Promise<Core> {
  if (core) return Promise.resolve(core);
  if (!pending) {
    pending = Promise.all([
      getJson<{ n: SurahMeta[]; v: string[][] }>("quran"),
      getJson<number[][]>("layout"),
      getJson<Core["juz"]>("juz"),
      getJson<{ hizbs: Core["hizbs"]; quarters: Core["quarters"] }>("divisions"),
    ]).then(([q, lay, juz, divisions]) => {
      core = { n: q.n, v: q.v, lay, juz, ...divisions };
      return core;
    });
    pending.catch(() => { pending = null; });
  }
  return pending;
}

export const Q = (): Core => {
  if (!core) throw new Error("Quran data not loaded");
  return core;
};

export const text = (s: number, a: number) => Q().v[s - 1][a - 1];
// Words are the source text split on plain spaces only.
export const words = (s: number, a: number) => text(s, a).split(" ");
export const sname = (s: number) => Q().n[s - 1][1];
export const sarabic = (s: number) => Q().n[s - 1][0];
export const count = (s: number) => Q().n[s - 1][2];
export const ref = (s: number, a: number) => `${sname(s)} ${a}`;
export const key = (s: number, a: number) => `${s}:${a}`;
export const parseKey = (k: string): [number, number] => k.split(":").map(Number) as [number, number];
export const arNum = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
export const TOTAL_AYAT = 6236;

export function pageOf(s: number, a: number): number {
  return pageFor(Q(), s, a) || 1;
}

export type LocationKind = "surah" | "ayah" | "juz" | "hizb" | "quarter" | "page";
export type LocationRequest = { kind: LocationKind; id?: number; surah?: number; ayah?: number };
export type QuranLocation = { s: number; a: number; page: number };

export function isValidAyah(core: Core, s: number, a: number): boolean {
  return Number.isInteger(s) && Number.isInteger(a) && s >= 1 && s <= core.n.length && a >= 1 && a <= core.n[s - 1][2];
}

export function pageFor(core: Core, s: number, a: number): number | null {
  if (!isValidAyah(core, s, a) || core.lay.length !== 604) return null;
  const L = core.lay;
  let lo = 0, hi = L.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1, x = L[m];
    if (x[0] < s || (x[0] === s && x[1] <= a)) lo = m; else hi = m - 1;
  }
  return lo + 1;
}

/** Resolve a Surah, Ayah, Juz, Hizb, quarter, or page to its first Ayah and page. */
export function resolveLocation(core: Core, request: LocationRequest): QuranLocation | null {
  let s: number, a: number;
  if (request.kind === "ayah") {
    s = request.surah ?? NaN;
    a = request.ayah ?? NaN;
  } else {
    const id = request.id ?? NaN;
    if (!Number.isInteger(id)) return null;
    if (request.kind === "surah") {
      if (id < 1 || id > core.n.length) return null;
      s = id; a = 1;
    } else if (request.kind === "juz") {
      const start = core.juz[id - 1]?.[0]; if (!start) return null;
      [s, a] = start;
    } else if (request.kind === "hizb") {
      const start = core.hizbs[id - 1]; if (!start) return null;
      [s, a] = start;
    } else if (request.kind === "quarter") {
      const start = core.quarters[id - 1]; if (!start) return null;
      [s, a] = start;
    } else if (request.kind === "page") {
      const start = core.lay[id - 1];
      if (!start || id > 604) return null;
      [s, a] = start;
    } else return null;
  }
  const page = pageFor(core, s, a);
  return page ? { s, a, page } : null;
}

export function juzOf(s: number, a: number): number {
  const J = Q().juz;
  for (let j = 29; j >= 0; j--) {
    const f = J[j][0];
    if (f[0] < s || (f[0] === s && f[1] <= a)) return j + 1;
  }
  return 1;
}

export function nextAyah(s: number, a: number): [number, number] | null {
  if (a < count(s)) return [s, a + 1];
  return s < 114 ? [s + 1, 1] : null;
}
export function prevAyah(s: number, a: number): [number, number] | null {
  if (a > 1) return [s, a - 1];
  return s > 1 ? [s - 1, count(s - 1)] : null;
}

export type PageWord = { s: number; a: number; w: number; last: boolean; txt: string };
export type PageLine = { t: "h"; s: number } | { t: "b" } | { t: "t"; idx: number[] };
export type PageContent = { lines: PageLine[]; flat: PageWord[]; ayat: [number, number][]; first: [number, number]; surahs: number[] };

// Rebuild one Madinah mushaf page (15 lines) from the line-length table.
export function pageContent(pg: number): PageContent {
  const arr = Q().lay[pg - 1];
  let s = arr[0], a = arr[1], w = 0, ws = words(s, a);
  const lines: PageLine[] = [], flat: PageWord[] = [], ayat: [number, number][] = [];
  const surahs = new Set<number>();
  for (let i = 2; i < arr.length; i++) {
    const n = arr[i];
    if (n < 0) { lines.push({ t: "h", s: -n }); continue; }
    if (n === 0) { lines.push({ t: "b" }); continue; }
    const idx: number[] = [];
    for (let k = 0; k < n; k++) {
      if (w === 0) ayat.push([s, a]);
      surahs.add(s);
      const last = w === ws.length - 1;
      idx.push(flat.length);
      flat.push({ s, a, w, last, txt: ws[w] });
      w++;
      if (last) {
        w = 0; a++;
        if (a > count(s)) { a = 1; s++; }
        if (s <= 114) ws = words(s, a);
      }
    }
    lines.push({ t: "t", idx });
  }
  return { lines, flat, ayat, first: [arr[0], arr[1]], surahs: [...surahs] };
}

// Matching form used only for search and speech comparison. Never displayed.
export const normA = (w: string) =>
  w.replace(/ٰ/g, "ا").replace(/[^ء-غف-يٱ]/g, "")
    .replace(/[ٱأإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "");
const normB = (w: string) => normA(w.replace(/ٰ/g, ""));

// Optional data sets, loaded on demand and kept in memory.
export const SETS = {
  "tr-ur-maududi": { label: "Urdu: Abul A'la Maududi", lang: "ur", kind: "Translation" },
  "tr-ur-jalandhry": { label: "Urdu: Fateh Muhammad Jalandhry", lang: "ur", kind: "Translation" },
  "tr-en-sahih": { label: "English: Saheeh International", lang: "en", kind: "Translation" },
  "tafsir-ar-muyassar": { label: "Arabic: Al-Tafsir Al-Muyassar (King Fahd Complex)", lang: "ar", kind: "Tafsir" },
} as const;
export type SetName = keyof typeof SETS;
const sets: Partial<Record<SetName, Promise<string[][]>>> = {};
export function loadSet(name: SetName): Promise<string[][]> {
  if (!sets[name]) {
    sets[name] = getJson<string[][]>(name);
    sets[name]!.catch(() => { delete sets[name]; });
  }
  return sets[name]!;
}

// Tafsir fetched per ayah from the open tafsir_api project (github.com/spa5k/tafsir_api).
export const REMOTE_TAFSIR = {
  "ur-tafseer-ibn-e-kaseer": "Urdu: Tafsir Ibn Kathir",
  "ur-tafsir-bayan-ul-quran": "Urdu: Bayan ul Quran (Dr. Israr Ahmad)",
  "ur-tazkirul-quran": "Urdu: Tazkirul Quran (Wahiduddin Khan)",
} as const;
export type RemoteTafsir = keyof typeof REMOTE_TAFSIR;
export async function fetchTafsir(slug: RemoteTafsir, s: number, a: number): Promise<string> {
  const urls = [
    `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${slug}/${s}/${a}.json`,
    `https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/${slug}/${s}/${a}.json`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) { const j = (await r.json()) as { text?: string }; return j.text || ""; }
    } catch { /* try the next source */ }
  }
  throw new Error("Tafsir could not be loaded");
}

export type SearchHit = { s?: number; a?: number; pg?: number; label: string; ayah?: boolean };
let NORM: [string[], string[]][][] | null = null;
export function search(input: string): { hits: SearchHit[]; total: number } {
  const q = input.trim(); const hits: SearchHit[] = []; let total = 0;
  if (!q) return { hits, total };
  const C = Q();
  const m = q.match(/^(\d{1,3})\s*[:\s]\s*(\d{1,3})$/);
  if (m) {
    const s = +m[1], a = +m[2];
    if (s >= 1 && s <= 114 && a >= 1 && a <= count(s)) hits.push({ s, a, label: ref(s, a) });
    return { hits, total: hits.length };
  }
  if (/^\d{1,3}$/.test(q)) {
    const n = +q;
    if (n >= 1 && n <= 114) hits.push({ s: n, a: 1, label: `Surah ${n} · ${sname(n)}` });
    if (n >= 1 && n <= 30) hits.push({ s: C.juz[n - 1][0][0], a: C.juz[n - 1][0][1], label: `Juz ${n}` });
    if (n >= 1 && n <= 604) hits.push({ pg: n, label: `Page ${n}` });
    return { hits, total: hits.length };
  }
  const ql = q.toLowerCase().replace(/[^a-z]/g, "");
  if (ql.length >= 2) C.n.forEach((n, i) => { if (n[1].toLowerCase().replace(/[^a-z]/g, "").includes(ql)) hits.push({ s: i + 1, a: 1, label: `Surah ${i + 1} · ${n[1]}` }); });
  const qw = q.split(/\s+/).map(normA).filter(Boolean);
  if (qw.join("").length >= 2) {
    C.n.forEach((n, i) => { if (normA(n[0]).includes(qw.join(""))) hits.push({ s: i + 1, a: 1, label: `Surah ${i + 1} · ${n[1]}` }); });
    if (!NORM) NORM = C.v.map((v) => v.map((x) => { const w = x.split(" "); return [w.map(normA), w.map(normB)] as [string[], string[]]; }));
    const hit = (A: string[], B: string[], i: number) => {
      for (let k = 0; k < qw.length; k++) {
        const a = A[i + k], b = B[i + k], t = qw[k];
        if (a === undefined) return false;
        const ok = qw.length === 1 ? a.includes(t) || b.includes(t)
          : k === 0 ? a.endsWith(t) || b.endsWith(t)
          : k === qw.length - 1 ? a.startsWith(t) || b.startsWith(t)
          : a === t || b === t;
        if (!ok) return false;
      }
      return true;
    };
    for (let s = 0; s < 114; s++) for (let a = 0; a < NORM[s].length; a++) {
      const [A, B] = NORM[s][a]; let f = false;
      for (let i = 0; i + qw.length <= A.length && !f; i++) f = hit(A, B, i);
      if (f) { total++; if (hits.length < 60) hits.push({ s: s + 1, a: a + 1, label: ref(s + 1, a + 1), ayah: true }); }
    }
  }
  return { hits, total: Math.max(total, hits.length) };
}

/** Umm al-Qura Hijri date in English ("7 Jumada al-Akhirah 1448 AH"); deterministic, see lib/localTime. */
export function hijriDate(d = new Date()): string { return headerTime(d, { locale: "en" }).hijri; }
