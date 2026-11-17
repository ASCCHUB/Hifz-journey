import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

registerHooks({ resolve(s, c, n) { if ((s.startsWith("./") || s.startsWith("../")) && !/\.[a-z]+$/i.test(s)) { try { return n(`${s}.ts`, c); } catch {} } return n(s, c); } });
const { referenceJuzForAyah, referenceMapHref } = await import("../src/lib/refPdfLearn.ts");
const { loadCore, pageOf } = await import("../src/lib/quran.ts");
globalThis.fetch = async (url) => {
  const name = String(url).split("/").at(-1);
  return { ok: true, json: async () => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8")) };
};
await loadCore();

test("Juz 30 active Ayah selects only an imported Juz 30 PDF", () => {
  assert.equal(referenceJuzForAyah(78, 1, [30]), 30);
  assert.equal(referenceJuzForAyah(78, 1, [1]), null);
});

test("Juz 1 active Ayah selects the locally imported Juz 1 PDF", () => {
  assert.equal(referenceJuzForAyah(1, 1, [1]), 1);
});

test("matching is based on the active Ayah when one page crosses a Juz boundary", () => {
  assert.equal(pageOf(3, 92), pageOf(3, 93)); // Both sides of the Juz 4 boundary share Mushaf page 62.
  assert.equal(referenceJuzForAyah(3, 92, [3, 4]), 3);
  assert.equal(referenceJuzForAyah(3, 93, [3, 4]), 4);
});

test("unsupported or not imported Juz has no shortcut and return context is preserved", () => {
  assert.equal(referenceJuzForAyah(2, 1, []), null);
  assert.equal(referenceJuzForAyah(6, 1, [6]), null);
  assert.equal(referenceMapHref(30, "/mushaf?p=582&mode=learn&from=78:1&to=78:4"), "/reference-map?juz=30&returnTo=%2Fmushaf%3Fp%3D582%26mode%3Dlearn%26from%3D78%3A1%26to%3D78%3A4");
});
