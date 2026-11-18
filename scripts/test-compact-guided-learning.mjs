import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (p) => readFile(p, "utf8");

test("Page learning begins by tapping an Ayah and keeps canonical phrase steps", async () => {
  const lesson = await read("src/components/MushafLesson.tsx");
  const engine = await read("src/lib/lesson.ts");
  const chunk = await read("src/lib/chunking.ts");
  assert.match(lesson, /return pageAyahs; \/\/ A chosen page is ready immediately/);
  assert.match(lesson, /if \(!running\) \{ if \(!lesson\?\.completedAt\) start\(false, \[s,a\]\)/);
  assert.match(lesson, /steps\.findIndex\(\(st\) => st\.kind === "listen"/);
  assert.match(lesson, /onExit: \(\) => void/);
  assert.match(engine, /unitsForAyah\(x\[0\], x\[1\]\)/);
  assert.match(engine, /units\.slice\(0, ui \+ 1\)/);
  assert.match(chunk, /const WAQF =/);
  assert.match(chunk, /export function splitAyah/);
  assert.doesNotMatch(lesson, /floatingDock|useMovableDock/);
});
test("Primary Learn controls are fixed and compact and More closes on outside taps", async () => {
  const c = await read("src/components/MushafLesson.tsx");
  const css = await read("src/app/globals.css");
  assert.match(c, /className="mushaf-lesson-panel mushaf-lesson-compact card"/);
  assert.match(c, /aria-expanded=\{!compact\}/);
  assert.match(c, /setCompactState\(true\)/);
  assert.match(c, /lesson-dock-more/);
  assert.match(c, /player\.play\(stepAyahs, repeat\)/);
  assert.match(c, /onClick=\{\(\) => setShown\(true\)\}/);
  assert.match(css, /position: fixed !important/);
  assert.match(css, /data-compact="true"/);
  assert.doesNotMatch(c, /Move<\/button>|Reset<\/button>/);
});
test("Repeat is selectable, actual audio plays N times, and page number is erasable", async () => {
  const c = await read("src/components/MushafLesson.tsx");
  const player = await read("src/components/LessonPlayer.tsx");
  const manual = await read("src/components/ManualRevisionPicker.tsx");
  assert.match(c, /\[1,3,5,7,10\]\.map/);
  assert.match(c, /player\.stop\(\); setRepeatState\(n\)/);
  assert.match(player, /for \(let t = 0; t < times; t\+\+\) queue\.push\(\.\.\.ayahs\)/);
  assert.match(manual, /setPageInput\(e\.target\.value\)/);
  assert.match(manual, /disabled=\{!valid\}/);
  assert.doesNotMatch(manual, /Math\.max\(1, \+e\.target\.value \|\| 1\)/);
});
test("Recite uses one Quran-wide microphone flow and word feedback on Mushaf, not duplicate yellow transcription", async () => {
  const recite = await read("src/components/LiveRecitation.tsx");
  const route = await read("src/app/recite/page.tsx");
  const page = await read("src/components/MiniMushafPage.tsx");
  assert.match(route, /<LiveRecitation auto items=\{allAyahs\}/);
  assert.match(recite, /setHidden\(true\)/);
  assert.match(recite, /data-testid="detected-mushaf-page"/);
  assert.match(recite, /wordClass=\{\(f\) =>/);
  assert.match(recite, /possible mismatch/);
  assert.match(page, /wordClass\?\.\(f\)/);
  assert.doesNotMatch(recite, /bg-gold\/10 px-3 py-1 text-xl text-gold/);
  assert.match(recite, /aria-label=\{hidden \? "Show Quran text" : "Hide Quran text"\}/);
});


test("Learning dock renders evaluated JSX labels with no literal dollar prefixes", async () => {
  const src = await read("src/components/MushafLesson.tsx");
  const start = src.indexOf('panel = <section');
  assert.ok(start > 0, "learning control JSX exists");
  const jsx = src.slice(start);
  for (const bad of [">$", " ${exit}", " ${player.err", " ${prep", " ${showMeaning", " ${hintsAllowed", " ${step.instruction", "(${rated})"]) {
    assert.ok(!jsx.includes(bad), `Unexpected literal dollar prefix: ${bad}`);
  }
  assert.match(jsx, />\{MARK_LABEL\[m\]\}<\/button>/);
  assert.match(jsx, />\{activeAyah \?/);
  assert.match(jsx, /\{stepIdx \+ 1\}\/\{steps.length\}/);
  assert.match(jsx, /\{player.err && <p/);
});
