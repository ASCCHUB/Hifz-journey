import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
registerHooks({ resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch {}
  }
  return nextResolve(specifier, context);
} });
const { reviewMushafRecitation, feedbackIsVisible } = await import("../src/lib/mushafRecitation.ts");
const quran = await import("../src/lib/quran.ts");
const ts = await import("typescript");
const asrSource = await readFile(resolve(process.cwd(), "src/lib/quranAsr.ts"), "utf8");
const asrJs = ts.transpileModule(asrSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { createSession, checkLocalAsr } = await import(`data:text/javascript;base64,${Buffer.from(asrJs).toString("base64")}`);
globalThis.fetch = async (url) => {
  const name = String(url).split("/").at(-1).replace(/\.json(?:\?.*)?$/, "");
  const data = JSON.parse(await readFile(resolve(process.cwd(), `public/data/${name}.json`), "utf8"));
  return { ok: true, json: async () => data };
};
await quran.loadCore();
const { words } = quran;

test("completed speech segments align to the selected Mushaf Ayah without changing its text", () => {
  const expected = words(1, 1);
  const result = reviewMushafRecitation([[1, 1]], [
    { id: 1, text: expected.slice(2).join(" ") },
    { id: 0, text: expected.slice(0, 2).join(" ") },
  ]);
  assert.equal(result.heardCount, expected.length);
  assert.equal(result.summary.correct, expected.length);
  assert.equal(result.summary.missing + result.summary.incorrect, 0);
  assert.equal(result.expected.map((w) => w.txt).join(" "), expected.join(" "));
});

test("unrecited tail remains pending and is not counted as a skipped mistake", () => {
  const result = reviewMushafRecitation([[1, 1], [1, 2]], [{ id: 0, text: words(1, 1).join(" ") }]);
  assert.ok(result.alignment.exp.some((x) => x === "pending"));
  assert.equal(result.summary.missing, 0);
});

test("Recall and Revise never expose transcript word feedback", () => {
  assert.equal(feedbackIsVisible("recall"), false);
  assert.equal(feedbackIsVisible("revise"), false);
  assert.equal(feedbackIsVisible("read"), true);
  assert.equal(feedbackIsVisible("learn"), true);
});

test("recognition findings remain advisory and incomplete recordings produce no false clean result", () => {
  const result = reviewMushafRecitation([[1, 1]], [{ id: 0, text: "غير موجود" }]);
  assert.equal(result.expected.length, words(1, 1).length);
  assert.ok(result.summary.incorrect + result.summary.missing + result.summary.uncertain + result.summary.extra > 0);
  assert.equal(result.summary.confirmed, 0);
});

test("browser/Android speech session requests mic on start and flushes final words on stop", async () => {
  let stoppedTracks = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stoppedTracks++ }] }) } } });
  class FakeSpeechRecognition {
    start() { this.started = true; }
    stop() {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "الحمد لله" } }] });
      this.onend?.();
    }
  }
  globalThis.window = { SpeechRecognition: FakeSpeechRecognition };
  const finals = []; const errors = [];
  const session = createSession("browser", { onPartial() {}, onFinal: (x) => finals.push(x), onError: (c) => errors.push(c) }, { keepAudio: false });
  await session.start();
  await session.stop();
  assert.deepEqual(errors, []);
  assert.equal(finals[0]?.text, "الحمد لله");
  assert.equal(stoppedTracks, 1);
});

test("microphone denial is surfaced and an unavailable local server is not treated as ready", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); } } } });
  globalThis.window = { SpeechRecognition: class { start() {} stop() {} } };
  const errors = [];
  const session = createSession("browser", { onPartial() {}, onFinal() {}, onError: (c, m) => errors.push([c, m]) }, { keepAudio: false });
  await assert.rejects(() => session.start());
  assert.equal(errors[0]?.[0], "not-allowed");
  globalThis.fetch = async () => { throw new Error("server unavailable"); };
  assert.equal(await checkLocalAsr("http://127.0.0.1:8765"), null);
});
