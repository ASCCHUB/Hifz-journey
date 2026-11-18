// Regression checks for optional wake lock and movable, non-obstructing study controls.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = (name) => readFile(name, "utf8");

test("Keep-awake defaults on, is opt-out, and never modifies user progress", async () => {
  const src = await read("src/lib/screenAwake.ts");
  assert.match(src, /localStorage\.getItem\(KEY\) !== "off"/);
  assert.match(src, /hifz-screen-awake-change/);
  assert.doesNotMatch(src, /@\/lib\/store|resetProgress|deleteDatabase/);
  const ui = await read("src/components/ScreenAwake.tsx");
  assert.match(ui, /visibilitychange/);
  assert.match(ui, /wakeLock/);
  assert.match(ui, /releaseLock\(\)/);
  assert.match(ui, /ScreenAwakeSetting/);
  assert.match(await read("src/components/Shell.tsx"), /<ScreenAwakeController \/>/);
  assert.match(await read("src/app/profile/page.tsx"), /<ScreenAwakeSetting \/>/);
});
test("Native Android keeps the display awake in foreground and supports disabling", async () => {
  const src = await read("android/app/src/main/java/com/hifzcompanion/MainActivity.java");
  assert.match(src, /setKeepScreenOn\(boolean enabled\)/);
  assert.match(src, /FLAG_KEEP_SCREEN_ON/);
  assert.match(src, /clearFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/);
  assert.match(src, /runOnUiThread/);
});
test("Study controls are fixed and compact; legacy drag helper is no longer used", async () => {
  const learn = await read("src/components/MushafLesson.tsx");
  const reader = await read("src/components/MushafReader.tsx");
  const css = await read("src/app/globals.css");
  assert.match(learn, /mushaf-lesson-compact/);
  assert.match(css, /\.mushaf-lesson-panel\.mushaf-lesson-compact/);
  assert.doesNotMatch(learn, /useMovableDock|floatingDock/);
  assert.doesNotMatch(reader, /useMovableDock|recallDock\.handle|readDock\.handle/);
  assert.match(reader, /\{readDockOpen && <div/);
});
