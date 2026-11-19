import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(path, "utf8");

test("Read, Learn and Recall command docks stay fixed while tapping Quran elsewhere only collapses extra panels", async () => {
 const css = await read("src/app/globals.css");
 assert.match(css, /\.mushaf-reading-dock\s*\{\s*position: fixed;/);
 assert.match(css, /\.mushaf-learning-columns > \.mushaf-lesson-panel \{\s*position: fixed;/);
 assert.match(css, /\.mushaf-root:not\(\.mushaf-root-focus\):not\(\.mushaf-root-reciting\) > \.mushaf-recall-dock \{[^}]*position: fixed;/s);
 assert.match(css, /data-moved="true"/);
 const learn = await read("src/components/MushafLesson.tsx");
 assert.match(learn, /document\.addEventListener\("pointerdown", collapseOnOutside\)/);
 assert.match(learn, /target\.closest\("\.mushaf-lesson-panel"\)/);
 assert.match(learn, /setCompactState\(true\)/);
 assert.doesNotMatch(learn, /floatingDock|Move<\/button>|Reset<\/button>/);
 assert.match(learn, /mushaf-lesson-compact/);
 const readUI = await read("src/components/MushafReader.tsx");
 assert.doesNotMatch(readUI, /readDock\.handle|recallDock\.handle/);
 assert.match(readUI, /mushaf-recall-dock/);
 assert.match(readUI, /setReadDockOpen\(false\)/);
 assert.match(readUI, /setRecallExtras\(false\)/);
 assert.match(readUI, /!t\.closest\("\.mushaf-tools-button, \.mushaf-tools-menu"\)/);
});
test("Quran sheets still close on backdrop tap while inside tap does not dismiss the window", async () => {
 const sheet = await read("src/components/Sheet.tsx");
 assert.match(sheet, /e\.target === e\.currentTarget\) onClose\(\)/);
 assert.match(sheet, /ControlIcon name="close"/);
});
test("Icon controls are inline SVG with readable labels and no external image assets", async () => {
 const component = await read("src/components/ControlIcon.tsx");
 for (const name of ['"eye"', '"eye-off"', '"mic"', '"pin"', '"settings"', '"chevron-down"', '"chevron-up"']) assert.ok(component.includes(name), name);
 assert.match(component, /<svg/);
 assert.match(component, /aria-hidden="true"/);
 const recite = await read("src/components/LiveRecitation.tsx");
 assert.match(recite, /ControlIcon name=\{hidden \? "eye" : "eye-off"\}/);
 assert.match(recite, /<ControlIcon name="mic" \/> Recite/);
 const mushaf = await read("src/components/MushafReader.tsx");
 assert.match(mushaf, /aria-label="Go to Ayah"/);
 assert.match(mushaf, /<ControlIcon name="location" \/>/);
 assert.doesNotMatch(mushaf, /<ControlIcon name="pin" \/> Move/);
});
