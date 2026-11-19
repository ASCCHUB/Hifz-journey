// Printed Mushaf regression checks, grounded in the committed Quran layout.
// This test never edits or regenerates Quran text or Quran layout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const layout = JSON.parse(await read("public/data/layout.json"));
const reader = await read("src/components/MushafReader.tsx");
const mini = await read("src/components/MiniMushafPage.tsx");
const css = await read("src/app/globals.css");
const learning = await read("src/components/LearnView.tsx");

test("Canonical Mushaf page 26 is Al-Baqarah 170 and has the original exact 15 line lengths", () => {
  assert.equal(layout.length, 604);
  assert.deepEqual(layout[25], [2,170,13,8,7,12,8,8,8,13,9,8,9,7,6,8,9]);
  const standard = layout.filter((row) => row.slice(2).length === 15);
  assert.equal(standard.length, 600);
  for (const [index, row] of layout.entries()) {
    assert.ok([8,12,15].includes(row.slice(2).length), `unexpected layout row count at page ${index+1}`);
    assert.ok(row.slice(2).every(Number.isInteger), `non-integer layout record at page ${index+1}`);
  }
});
test("Read, Learn and Recall draw the pinned page/line/word order without paragraph wrapping", () => {
  assert.match(reader, /c\.lines\.map\(\(l, n\) =>/);
  assert.match(reader, /l\.idx\.map\(\(i\) =>/);
  assert.match(reader, /c\.flat\[i\]/);
  assert.match(mini, /c\.lines\.map\(\(l, n\) =>/);
  assert.match(mini, /l\.idx\.map\(\(i\) =>/);
  assert.match(css, /\.mpage\.mushaf-printed-page \.mline[\s\S]*?white-space: nowrap;/);
  assert.match(reader, /measure\.className = "mpage mushaf-printed-page"/);
});
test("Printed Uthmani page uses existing bundled font with header/footer, no word tiles", () => {
  assert.match(css, /UthmanicHafs1Ver18\.woff2/);
  for (const src of [reader,mini]) {
    assert.match(src, /className="mpage mushaf-printed-page/);
    assert.match(src, /className="mushaf-print-header"/);
    assert.match(src, /className="mushaf-print-footer"/);
  }
  assert.match(css, /\.mpage\.mushaf-printed-page \.w:not\(\.ph\)[\s\S]*?background: transparent;/);
  assert.match(css, /\.mpage\.mushaf-printed-page \.mnum/);
  assert.match(css, /\.mpage\.mushaf-printed-page \.w\.r-bad/);
  assert.match(css, /\.mpage\.mushaf-printed-page \.w\.ph/);
  assert.match(css, /\.mpage\.mushaf-printed-page \.w\.recite-possible-error/);
  assert.match(learning, /if \(state === "hide"\) return <span className=\{\`w ph/);
});
test("Print appearance never invents Tajweed rules or mutates canonical Arabic text", () => {
  assert.doesNotMatch(reader + mini + css.slice(css.lastIndexOf("PRINTED MUSHAF")), /tajweedMap|autoTajweed|replaceAyahText/);
  assert.match(reader, /\{f\.txt\}/);
  assert.match(mini, /txt=\{f\.txt\}/);
});
