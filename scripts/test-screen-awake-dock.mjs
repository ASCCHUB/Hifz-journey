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
test("Movable instructions support touch, keyboard, reset and viewport clamping", async () => {
  const hook = await read("src/lib/useMovableDock.ts");
  for (const s of ["onPointerDown", "onPointerMove", "onPointerUp", "setPointerCapture", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "ResizeObserver", "window.innerHeight"]) assert.ok(hook.includes(s), s);
  const l = await read("src/components/MushafLesson.tsx");
  assert.match(l, /useMovableDock\(\)/);
  assert.match(l, /style=\{floatingDock\.style\}/);
  assert.match(l, /\{\.\.\.floatingDock\.handle\}/);
  const r = await read("src/components/MushafReader.tsx");
  assert.match(r, /useMovableDock\(\)/);
  assert.match(r, /mushaf-reading-dock/);
  assert.match(r, /\{\.\.\.recallDock\.handle\}/);
  assert.match(r, /\{recallExtras && <SimilarButton/);
  assert.match(r, /\{readDockOpen && <div/);
  const css = await read("src/app/globals.css");
  assert.match(css, /mushaf-reading-dock/);
  assert.match(css, /touch-action: none/);
});
