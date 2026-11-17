// Reference PDF maps: local-only storage (separate IndexedDB database), validation, quota errors, removal,
// reading position, and isolation from Hifz progress. Uses a minimal in-memory IndexedDB.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

registerHooks({ resolve(s, c, n) { if ((s.startsWith("./") || s.startsWith("../")) && !/\.[a-z]+$/i.test(s)) { try { return n(`${s}.ts`, c); } catch {} } return n(s, c); } });
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let fetched = [];
globalThis.fetch = async (u) => { fetched.push(String(u)); return { ok: false, status: 404 }; };

// ---- minimal IndexedDB
function fakeIdb(opts = {}) {
  const dbs = new Map();
  const later = (f) => setTimeout(f, 0);
  return {
    dbs,
    open(name) {
      const req = {}; later(() => {
        let db = dbs.get(name); const fresh = !db;
        if (!db) { db = { stores: new Map(), objectStoreNames: { contains: (n) => db.stores.has(n) } }; dbs.set(name, db); }
        const handle = {
          objectStoreNames: db.objectStoreNames, close() {},
          createObjectStore(n, o) { db.stores.set(n, { keyPath: o.keyPath, rows: new Map() }); },
          transaction(n, mode) {
            const st = db.stores.get(n); const tx = { error: null }; const reqs = [];
            const mk = (fn) => { const r = {}; reqs.push(() => { r.result = fn(); r.onsuccess?.(); }); return r; };
            tx.objectStore = () => ({
              put(v) { return mk(() => { if (opts.quota && v.size > opts.quota) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } st.rows.set(v[st.keyPath], structuredClone(v)); }); },
              get(k) { return mk(() => st.rows.get(k)); }, getAll() { return mk(() => [...st.rows.values()]); }, delete(k) { return mk(() => st.rows.delete(k)); },
            });
            later(() => { try { reqs.forEach((f) => f()); tx.oncomplete?.(); } catch (e) { tx.error = e; tx.onerror?.(); } });
            return tx;
          },
        };
        req.result = handle; if (fresh) req.onupgradeneeded?.(); req.onsuccess?.();
      });
      return req;
    },
  };
}
const R = await import("../src/lib/refPdfs.ts");
const pdfBlob = (size = 2048) => { const b = new Uint8Array(size); b.set(new TextEncoder().encode("%PDF-1.7\n")); return new Blob([b], { type: "application/pdf" }); };

test("nine reference Juz in order with Arabic labels", () => {
  assert.deepEqual(R.REFERENCE_JUZ.map((j) => j.juz), [1, 2, 3, 4, 5, 26, 28, 29, 30]);
  R.REFERENCE_JUZ.forEach((j) => { assert.match(j.ar, /[؀-ۿ]/); assert.match(j.en, new RegExp(`^Juz ${j.juz} `)); });
});

test("import, list, reopen and remove for every Juz; stored in its own database, not Hifz progress", async () => {
  const idb = fakeIdb(); R.useRefPdfFactory(() => idb);
  for (const j of R.REFERENCE_JUZ) await R.importRefPdf(j.juz, pdfBlob(3000 + j.juz), `map-${j.juz}.pdf`, 5);
  const list = await R.listRefPdfs();
  assert.deepEqual(list.map((x) => x.juz), [1, 2, 3, 4, 5, 26, 28, 29, 30]);
  assert.equal(list[8].name, "map-30.pdf"); assert.ok(!("blob" in list[0]), "listing never returns the binary");
  const b = await R.getRefPdf(30); assert.equal(b.size, 3030);
  assert.equal(new TextDecoder().decode(new Uint8Array(await b.slice(0, 5).arrayBuffer())), "%PDF-");
  assert.deepEqual([...idb.dbs.keys()], ["hifz-reference-pdfs"], "only the separate PDF database is used");
  assert.ok(![...mem.keys()].some((k) => k.startsWith("hifz-companion-state")), "no Hifz progress key touched");
  await R.removeRefPdf(30);
  assert.deepEqual((await R.listRefPdfs()).map((x) => x.juz), [1, 2, 3, 4, 5, 26, 28, 29]);
  await assert.rejects(R.getRefPdf(30), /no longer on this device/);
  // replacing keeps one entry per Juz
  await R.importRefPdf(1, pdfBlob(999), "new.pdf"); const l2 = await R.listRefPdfs();
  assert.equal(l2.filter((x) => x.juz === 1).length, 1); assert.equal(l2[0].name, "new.pdf");
});

test("rejects non-PDF files and files over the limit; unknown Juz rejected", async () => {
  R.useRefPdfFactory(() => fakeIdb());
  await assert.rejects(R.importRefPdf(30, new Blob(["hello, not a pdf"]), "x.txt"), (e) => e.code === "not_pdf");
  const huge = { size: R.MAX_PDF_BYTES + 1, slice: () => pdfBlob(10) };
  await assert.rejects(R.validatePdf(huge), (e) => e.code === "too_large");
  await assert.rejects(R.importRefPdf(7, pdfBlob()), (e) => e.code === "not_found");
});

test("storage errors are reported honestly: quota exceeded, no space estimate, IndexedDB unavailable", async () => {
  { const q = fakeIdb({ quota: 1000 }); R.useRefPdfFactory(() => q); }
  await assert.rejects(R.importRefPdf(30, pdfBlob(5000)), (e) => e.code === "no_space" && /Not enough storage/.test(e.message));
  assert.deepEqual(await R.listRefPdfs(), [], "a failed save leaves nothing behind");
  await assert.rejects(R.checkSpace(80 * 1048576, async () => ({ usage: 950e6, quota: 1000e6 })), (e) => e.code === "no_space" && /80 MB/.test(e.message));
  await R.checkSpace(80 * 1048576, async () => ({ usage: 0, quota: 10e9 }));
  R.useRefPdfFactory(() => undefined);
  await assert.rejects(R.importRefPdf(30, pdfBlob()), (e) => e.code === "storage_unavailable");
  await assert.rejects(R.listRefPdfs(), (e) => e.code === "storage_unavailable");
});

test("large file (~80 MB, like the Juz 4 map) imports when space allows", async () => {
  { const one = fakeIdb(); R.useRefPdfFactory(() => one); }
  const big = pdfBlob(84 * 1048576);
  const m = await R.importRefPdf(4, big, "juz4.pdf"); assert.equal(m.size, big.size);
  assert.equal((await R.getRefPdf(4)).size, big.size);
});

test("reading position is per Juz, survives reopening, and is cleared on removal", () => {
  assert.deepEqual(R.loadPos(30), { page: 1, zoom: 1 });
  R.savePos(30, { page: 7, zoom: 1.5 }); R.savePos(1, { page: 2, zoom: 1 });
  assert.deepEqual(R.loadPos(30), { page: 7, zoom: 1.5 }); assert.deepEqual(R.loadPos(1), { page: 2, zoom: 1 });
  R.clearPos(30); assert.deepEqual(R.loadPos(30), { page: 1, zoom: 1 });
});

test("no network: nothing is uploaded; source has no Supabase or fetch usage", async () => {
  assert.deepEqual(fetched, []);
  const src = await readFile(new URL("../src/lib/refPdfs.ts", import.meta.url), "utf8") + await readFile(new URL("../src/components/ReferencePdfMaps.tsx", import.meta.url), "utf8");
  assert.ok(!/supabase|fetch\(|XMLHttpRequest|sendBeacon/i.test(src), "no upload paths");
  assert.ok(!/teacher_reviewed|applyResults|update\(\(d\)/.test(src), "never marks reviewed or writes Hifz progress");
});
