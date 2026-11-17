// Regressions: Dashboard name, manual page/Ayah/Juz/Surah revision,
// direct Mushaf top navigation and Quran-wide automatic recitation UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (file) => readFile(file, "utf8");
test("Journey is named Dashboard but existing route/progress remains unchanged", async () => {
  const c = await read("src/components/Shell.tsx");
  assert.match(c, /href: "\/journey", label: "Dashboard"/);
  assert.match(c, /path === "\/journey" \? "Dashboard"/);
  assert.match(c, /setShowTopMore\(false\)/);
  assert.match(c, /pointerdown/);
});
test("Manual revision supports page, ayah, Juz and Surah even with empty scheduled queue", async () => {
  const p = await read("src/components/ManualRevisionPicker.tsx");
  for (const x of ['"page"', '"ayah"', '"juz"', '"surah"', "collectRevisionRange", "Start manual revision", "Manual revision does not remove"]) assert.ok(p.includes(x), x);
  const r = await read("src/app/revision/page.tsx");
  assert.match(r, /<ManualRevisionPicker onStart=/);
  assert.match(r, /if \(manual\) return <Practice/);
  assert.doesNotMatch(r, /if \(!practised && claimedKeys\.length === 0\) return <EmptyState/);
});
test("Top Mushaf bar navigates Surah, Juz, Page and Ayah, and overlays collapse on outside taps", async () => {
  const r = await read("src/components/MushafReader.tsx");
  assert.match(r, /mushaf-location-topbar/);
  for (const label of ["Jump to Surah", "Jump to Juz", "Jump to Mushaf page", "Go to Ayah"]) assert.ok(r.includes(label), label);
  assert.match(r, /<LocationNavigator initial=/);
  assert.match(r, /document\.addEventListener\("pointerdown", dismiss\)/);
  const css = await read("src/app/globals.css");
  assert.match(css, /guided-mushaf-lesson \.mushaf-location-topbar/);
});
test("Recite defaults to Quran-wide detection, hidden text, an eye toggle, detected 15-line page and advisory red feedback", async () => {
  const route = await read("src/app/recite/page.tsx");
  assert.match(route, /<LiveRecitation auto items=\{allAyahs\}/);
  assert.match(route, /passagePicker \? <RecitePassage/);
  const c = await read("src/components/LiveRecitation.tsx");
  assert.match(c, /installAndroidSpeech\(\)/, "Android WebView microphone adapter must load on the direct Recite route");
  for (const x of ["useState(auto)", "locate(exp, window)", "MiniMushafPage page={pg}", "data-testid=\"detected-mushaf-page\"", "text-weak !text-weak", "ControlIcon name={hidden ? \"eye\" : \"eye-off\"}", "<ControlIcon name=\"mic\" /> Recite", "not a confirmed mistake"]) assert.ok(c.includes(x), x);
  const mini = await read("src/components/MiniMushafPage.tsx");
  assert.match(mini, /wordClass\?: \(w: PageWord\) => string/);
  assert.match(mini, /className=\{wordClass\?\.\(f\) \?\? ""\}/);
});
