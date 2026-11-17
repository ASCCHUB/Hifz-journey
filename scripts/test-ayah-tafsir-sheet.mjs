// Regression tests for Ayah-sheet Tafsir readability and non-obstructing actions.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sheet = await readFile("src/components/AyahSheet.tsx", "utf8");
const frame = await readFile("src/components/Sheet.tsx", "utf8");

test("Selected Tafsir renders in full RTL flowing text, not a small scroll-clipped box", () => {
  assert.match(sheet, /aria-label="Full tafsir text"/);
  assert.match(sheet, /whitespace-pre-wrap/);
  assert.match(sheet, /break-words/);
  assert.match(sheet, /lang=\{taf === "tafsir-ar-muyassar" \? "ar" : "ur"\}/);
  assert.doesNotMatch(sheet, /card max-h-72 overflow-auto/);
});
test("Extra buttons are hidden initially and collapse again whenever a Tafsir is chosen", () => {
  assert.match(sheet, /useState\(false\).*showActions|\[showActions, setShowActions\] = useState\(false\)/);
  assert.match(sheet, /setTaf\(e\.target\.value as TafsirChoice\); setShowActions\(false\)/);
  assert.match(sheet, /aria-expanded=\{showActions\}/);
  assert.match(sheet, /\{showActions && <div id="ayah-sheet-actions"/);
});
test("Tapping outside the sheet or pressing Escape dismisses it", () => {
  assert.match(frame, /e\.target === e\.currentTarget\) onClose\(\)/);
  assert.match(frame, /e\.key === "Escape"\) onClose\(\)/);
});
