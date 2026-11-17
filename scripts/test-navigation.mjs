import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

// App modules use extensionless relative imports (resolved by the Next bundler); resolve them to .ts here,
// the same way scripts/test-hifz.mjs does. Static imports would be hoisted above the hook, so import dynamically.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch {}
    }
    return nextResolve(specifier, context);
  },
});
const { resolveLocation, pageFor, isValidAyah } = await import("../src/lib/quran.ts");
const { defaultState, hydrateState } = await import("../src/lib/store.ts");
const { readerBackAction } = await import("../src/lib/readerMode.ts");

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [quran, layout, juz, divisions, reference] = await Promise.all([
  readJson("../public/data/quran.json"),
  readJson("../public/data/layout.json"),
  readJson("../public/data/juz.json"),
  readJson("../public/data/divisions.json"),
  readJson("../scripts/reference/UthmanicHafs_v2-0 data/hafsData_v2-0.json"),
]);
const core = { n: quran.n, v: quran.v, lay: layout, juz, ...divisions };

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
test("all Quran division tables have complete, ordered counts", () => {
  assert.equal(core.n.length, 114);
  assert.equal(core.juz.length, 30);
  assert.equal(core.hizbs.length, 60);
  assert.equal(core.quarters.length, 240);
  assert.equal(core.lay.length, 604);
  for (const list of [core.juz.map((x) => x[0]), core.hizbs, core.quarters, core.lay.map((x) => x.slice(0, 2))]) {
    for (let i = 0; i < list.length; i++) {
      const [s, a] = list[i];
      assert.equal(isValidAyah(core, s, a), true, `invalid boundary ${i + 1}: ${s}:${a}`);
      if (i) assert.ok(list[i - 1][0] < s || (list[i - 1][0] === s && list[i - 1][1] < a), `non-increasing boundary ${i + 1}`);
    }
  }
});

test("Mushaf layout stays within 15 rows and preserves every Ayah word in order", () => {
  let expectedS = 1, expectedA = 1, wordIndex = 0, totalWords = 0, fullPages = 0;
  const renderedAyahs = new Map();
  for (const [pageIndex, page] of core.lay.entries()) {
    assert.ok(page.length >= 3 && page.length <= 17, `page ${pageIndex + 1} must have at most 15 layout rows`);
    const rows = page.slice(2);
    assert.deepEqual(page.slice(0, 2), [expectedS, expectedA], `page ${pageIndex + 1} start`);
    if (rows.length === 15) fullPages++;
    for (const [rowIndex, row] of rows.entries()) {
      assert.ok(Number.isInteger(row), `page ${pageIndex + 1} has a non-integer layout row`);
      if (row < 0) {
        const heading = -row;
        const isAdjacentSurahMarker = (heading === expectedS + 1 && expectedA === core.n[expectedS - 1][2] && wordIndex === 0)
          || (heading === expectedS - 1 && expectedA === 1 && wordIndex === 0);
        assert.ok(heading === expectedS || isAdjacentSurahMarker, `Surah heading on page ${pageIndex + 1}: heading=${heading}, current=${expectedS}:${expectedA}, word=${wordIndex}`);
        continue;
      }
      if (row === 0) continue; // standalone Bismillah line
      for (let i = 0; i < row; i++) {
        const ayahWords = core.v[expectedS - 1]?.[expectedA - 1]?.split(" ");
        assert.ok(ayahWords && wordIndex < ayahWords.length, `page ${pageIndex + 1} passes an Ayah word boundary`);
        const ayahKey = `${expectedS}:${expectedA}`;
        const position = renderedAyahs.get(ayahKey) || { page: pageIndex + 1, line_start: rowIndex + 1, line_end: rowIndex + 1 };
        position.line_end = rowIndex + 1; renderedAyahs.set(ayahKey, position);
        wordIndex++; totalWords++;
        if (wordIndex === ayahWords.length) {
          wordIndex = 0;
          if (expectedA < core.n[expectedS - 1][2]) expectedA++;
          else if (expectedS < 114) { expectedS++; expectedA = 1; }
          else expectedA++;
        }
      }
    }
    assert.equal(wordIndex, 0, `page ${pageIndex + 1} ends in the middle of an Ayah`);
  }
  assert.equal(fullPages > 500, true, "most pages should use the complete 15-row layout; front/back matter pages are shorter");
  assert.equal(totalWords, core.v.flat().reduce((n, ayah) => n + ayah.split(" ").length, 0));
  assert.deepEqual([expectedS, expectedA], [114, 7]);
  assert.equal(reference.length, 6236);
  let pageBoundaryDifferences = 0, lineCoordinateDifferences = 0; const pageExamples = [];
  for (const ayah of reference) {
    const actual = renderedAyahs.get(`${ayah.sura_no}:${ayah.aya_no}`);
    if (actual?.page !== ayah.page) { pageBoundaryDifferences++; if (pageExamples.length < 3) pageExamples.push(`${ayah.sura_no}:${ayah.aya_no} app=${actual?.page} ref=${ayah.page}`); }
    if (actual?.line_start !== ayah.line_start || actual?.line_end !== ayah.line_end) lineCoordinateDifferences++;
  }
  console.log(`  reference comparison: ${pageBoundaryDifferences} page and ${lineCoordinateDifferences} line-coordinate differences; samples ${pageExamples.join(", ")}; edition/layout provenance must be treated cautiously`);
});

test("every Juz start resolves to its stored start Ayah", () => {
  core.juz.forEach((entry, i) => {
    const resolved = resolveLocation(core, { kind: "juz", id: i + 1 });
    assert.deepEqual(resolved && [resolved.s, resolved.a], entry[0]);
  });
});

test("all 60 Hizb starts align to the first quarter in each group of four", () => {
  core.hizbs.forEach((start, i) => {
    assert.deepEqual(start, core.quarters[i * 4]);
    assert.deepEqual(resolveLocation(core, { kind: "hizb", id: i + 1 }) && [resolveLocation(core, { kind: "hizb", id: i + 1 }).s, resolveLocation(core, { kind: "hizb", id: i + 1 }).a], start);
  });
});

test("all 240 Rubʿ al-Hizb quarters resolve to their source starts", () => {
  core.quarters.forEach(([s, a], i) => {
    const resolved = resolveLocation(core, { kind: "quarter", id: i + 1 });
    assert.deepEqual(resolved && [resolved.s, resolved.a], [s, a]);
  });
});

test("all 604 pages resolve to the existing Madani layout start", () => {
  core.lay.forEach(([s, a], i) => {
    const resolved = resolveLocation(core, { kind: "page", id: i + 1 });
    assert.deepEqual(resolved && [resolved.s, resolved.a, resolved.page], [s, a, i + 1]);
    assert.equal(pageFor(core, s, a), i + 1);
  });
});

test("Surah and exact Ayah deep links resolve, including first and final Ayah", () => {
  assert.deepEqual(resolveLocation(core, { kind: "surah", id: 114 }), { s: 114, a: 1, page: pageFor(core, 114, 1) });
  const target = resolveLocation(core, { kind: "ayah", surah: 2, ayah: 255 });
  assert.deepEqual(target && [target.s, target.a], [2, 255]);
  assert.deepEqual(resolveLocation(core, { kind: "ayah", surah: 1, ayah: 1 }) && [resolveLocation(core, { kind: "ayah", surah: 1, ayah: 1 }).s, resolveLocation(core, { kind: "ayah", surah: 1, ayah: 1 }).a], [1, 1]);
  assert.deepEqual(resolveLocation(core, { kind: "ayah", surah: 114, ayah: 6 }) && [resolveLocation(core, { kind: "ayah", surah: 114, ayah: 6 }).s, resolveLocation(core, { kind: "ayah", surah: 114, ayah: 6 }).a], [114, 6]);
});

test("invalid IDs, Ayahs and malformed page boundaries are rejected", () => {
  for (const request of [
    { kind: "surah", id: 0 }, { kind: "surah", id: 115 },
    { kind: "juz", id: 31 }, { kind: "hizb", id: 0 }, { kind: "hizb", id: 61 },
    { kind: "quarter", id: 0 }, { kind: "quarter", id: 241 },
    { kind: "page", id: 0 }, { kind: "page", id: 605 },
    { kind: "ayah", surah: 2, ayah: 287 }, { kind: "ayah", surah: 0, ayah: 1 },
    { kind: "ayah", surah: 2, ayah: 1.5 }, { kind: "unknown", id: 1 },
  ]) assert.equal(resolveLocation(core, request), null, JSON.stringify(request));
  assert.equal(pageFor(core, 114, 7), null);
});

test("older v1 saved progress hydrates new reader preferences without data loss", () => {
  const old = defaultState();
  old.lastPage = 428;
  old.bookmarks["2:255"] = { t: 1234, f: 1 };
  old.mem["2:255"] = { iv: 4, due: 20, last: 10, reps: 3 };
  old.settings.zoom = 2;
  delete old.settings.readerAyahHighlight;
  const restored = hydrateState(old);
  assert.equal(restored.v, 1);
  assert.equal(restored.lastPage, 428);
  assert.deepEqual(restored.bookmarks["2:255"], { t: 1234, f: 1 });
  assert.deepEqual(restored.mem["2:255"], { iv: 4, due: 20, last: 10, reps: 3 });
  assert.equal(restored.settings.zoom, 2);
  assert.equal(restored.settings.readerAyahHighlight, true);
});

test("reader focus and Ayah sheet history handle Back in the right order", () => {
  assert.equal(readerBackAction({ hifzAyahSheet: true, hifzReaderFocus: true }, true, true), "none");
  assert.equal(readerBackAction({ hifzReaderFocus: true }, true, true), "close-sheet");
  assert.equal(readerBackAction({}, false, true), "exit-reader-focus");
  assert.equal(readerBackAction({}, false, false), "none");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack || error}`); }
}
console.log(`${tests.length - failed}/${tests.length} navigation test groups passed`);
if (failed) process.exitCode = 1;
