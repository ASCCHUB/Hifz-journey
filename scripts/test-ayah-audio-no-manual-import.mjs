import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Ayah audio sheet has no manual Surah recording import controls, but retains recorded Urdu and Arabic playback", async () => {
  const src = await readFile("src/components/AyahQuickSheet.tsx", "utf8");
  assert.doesNotMatch(src, /PersonalSurahRecording|personalPlayer|Import my Surah recording|My imported Urdu recording/);
  assert.match(src, /Play Arabic Recitation/);
  assert.match(src, /Play Urdu Translation/);
  assert.match(src, /shamshadTrack\(s, a\)/);
  assert.match(src, /showTr &&/);
  // Removing the UI must not delete a user's stored audio records.
  const stored = await readFile("src/lib/personalSurahAudio.ts", "utf8");
  assert.match(stored, /getPersonalSurahAudio/);
});
