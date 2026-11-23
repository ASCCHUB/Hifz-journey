// Ayah Chain integration: stored preferences are backward compatible, sync keeps them, progress is never
// touched, and the mode reuses the existing audio/cache, display, routes and settings code.
import { registerHooks } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch {}
    }
    return nextResolve(specifier, context);
  },
});
const mem = new Map();
globalThis.window = {};
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = process.cwd();
const src = (p) => readFile(resolve(root, p), "utf8");
const strip = (t) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const chain = await import("../src/lib/ayahChain.ts");
const store = await import("../src/lib/store.ts");
const sync = await import("../src/lib/sync.ts");

const legacy = () => ({ ...store.defaultState(), t: 100, mem: { "1:1": { iv: 3, due: 10, last: 5, reps: 2 } }, readPages: { 1: 3 }, tutor: { mode: "guided", level: "standard", portion: "page", repeat: 5, visibility: "full", updatedAt: 50 } });

test("Older saves (no tutor.chain) load unchanged and read as 'off' with defaults", () => {
  const s = store.hydrateState(JSON.parse(JSON.stringify(legacy())));
  assert.equal("chain" in s.tutor, false, "nothing is added to an older save");
  assert.deepEqual(s.tutor, legacy().tutor);
  assert.deepEqual(chain.readChainPrefs(s.tutor.chain), { on: false, newReps: 3, setReps: 2 });
  assert.equal("chain" in store.defaultTutor(), false, "new installs store nothing until the learner changes it");
});

test("Saved preferences round-trip; damaged values fall back per field and never throw", () => {
  const saved = { ...legacy(), tutor: { ...legacy().tutor, chain: { on: true, newReps: 5, setReps: 1, linkSingle: true } } };
  const s = store.hydrateState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(chain.readChainPrefs(s.tutor.chain), { on: true, newReps: 5, setReps: 1, linkSingle: true });
  for (const bad of [null, "on", 7, [], { on: "yes", newReps: 0, setReps: 11 }, { on: true, newReps: 2.5, setReps: "3" }]) {
    const r = chain.readChainPrefs(bad);
    assert.ok(r.newReps >= 1 && r.newReps <= 10 && r.setReps >= 1 && r.setReps <= 10, JSON.stringify(bad));
    assert.doesNotThrow(() => chain.buildChainPlan([[1, 1], [1, 2]], r));
  }
  assert.deepEqual(chain.readChainPrefs({ on: true, newReps: 2.5, setReps: "3" }), { on: true, newReps: 3, setReps: 2 });
});

test("Older app versions keep tutor.chain when they edit teaching preferences (they spread the object)", async () => {
  const s = store.hydrateState({ ...legacy(), tutor: { ...legacy().tutor, chain: { on: true, newReps: 4, setReps: 3 } } });
  // The exact update patterns used by TeachingPrefs.tsx, MushafLesson.tsx and LessonPlayer.tsx on main:
  const teaching = { ...s.tutor, level: "challenge", updatedAt: 60 };
  const mushafRepeat = { ...(s.tutor || { mode: "guided", level: "guided", portion: "page", repeat: 3, updatedAt: 0 }), repeat: 7, updatedAt: 61 };
  for (const t of [teaching, mushafRepeat]) assert.deepEqual(t.chain, { on: true, newReps: 4, setReps: 3 });
  for (const f of ["src/components/TeachingPrefs.tsx", "src/components/MushafLesson.tsx", "src/components/LessonPlayer.tsx"]) {
    const t = await src(f);
    for (const m of t.matchAll(/d\.tutor = \{([^}]*)/g)) assert.match(m[1], /^\s*\.\.\.\(?d\.tutor/, `${f}: tutor updates must spread the existing object`);
  }
});

test("Sync: the newer tutor copy wins as a whole (as before); chain travels with it; progress merges unchanged", () => {
  const a = store.hydrateState({ ...legacy(), t: 200, tutor: { ...legacy().tutor, chain: { on: true, newReps: 4, setReps: 3 }, updatedAt: 300 } });
  const b = store.hydrateState({ ...legacy(), t: 150, mem: { "1:2": { iv: 1, due: 2, last: 1, reps: 1 } }, tutor: { ...legacy().tutor, updatedAt: 100 } });
  const m = sync.mergeStates(a, b);
  assert.deepEqual(m.tutor.chain, { on: true, newReps: 4, setReps: 3 });
  assert.deepEqual(Object.keys(m.mem).sort(), ["1:1", "1:2"], "memorisation records from both copies are kept");
  assert.deepEqual(sync.mergeStates(b, a).tutor.chain, { on: true, newReps: 4, setReps: 3 }, "order does not matter");
  // A copy from a version that predates Ayah Chain and was edited later wins as a whole: the mode reads as off.
  const old = store.hydrateState({ ...legacy(), t: 400, tutor: { ...legacy().tutor, updatedAt: 500 } });
  assert.equal(chain.readChainPrefs(sync.mergeStates(a, old).tutor.chain).on, false);
});

test("Ayah Chain never writes progress: no store writes in the session; settings write only tutor.chain", async () => {
  const session = strip(await src("src/components/AyahChain.tsx"));
  assert.doesNotMatch(session, /\bupdate\(|applyResults|saveLessonEvidence|finishLesson|readPages|\.mem\b|lessons|pageTracker|markRead/);
  const settings = strip(await src("src/components/AyahChainSettings.tsx"));
  const writes = [...settings.matchAll(/update\(\(d\) => \{([\s\S]*?)\}\);/g)].map((m) => m[1]);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /d\.tutor = \{ \.\.\.t, chain: \{ \.\.\.readChainPrefs\(t\.chain\), \.\.\.patch \}, updatedAt: Date\.now\(\) \}/);
  for (const f of ["src/lib/ayahChain.ts", "src/lib/ayahChainText.ts"]) {
    assert.doesNotMatch(strip(await src(f)), /^import (?!type)/m, `${f} must stay pure (type-only imports)`);
  }
});

test("Reuses the existing audio path (offline cache), display components and passage parser; no new network code", async () => {
  const session = strip(await src("src/components/AyahChain.tsx"));
  assert.match(session, /playTrack\(a, arabicTrack\(live\.current\.reciter, p\.ayah\[0\], p\.ayah\[1\]\)/);
  assert.match(session, /getAudioCache\(\)/);
  assert.match(session, /ensureSaved\(arabicTrack/);
  assert.match(session, /global\.stop\(\)/, "the shared player stops so only one recitation plays");
  assert.match(session, /<AyahList /); assert.match(session, /<MiniMushafPage /); assert.match(session, /<ViewSwitch /);
  assert.doesNotMatch(session, /fetch\(|https?:\/\/|everyayah|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(strip(await src("src/components/AyahChainSettings.tsx")), /fetch\(|https?:\/\//);
  const learn = await src("src/app/learn/page.tsx"), route = await src("src/app/chain/page.tsx");
  assert.match(learn, /parseLearnTarget\(/); assert.match(route, /parseLearnTarget\(/);
  assert.doesNotMatch(learn, /function parse\(/, "the parser exists once, in lib/learnTarget.ts");
});

test("Entry points appear only when the mode is on, and keep the compact lesson dock unchanged", async () => {
  const lp = await src("src/components/LessonPlayer.tsx"), ml = await src("src/components/MushafLesson.tsx");
  assert.equal((lp.match(/data-testid="open-ayah-chain"/g) || []).length, 2);
  assert.match(lp, /readChainPrefs\(st\.tutor\?\.chain\)\.on && <Link/);
  assert.match(lp, /chainOn && <Link/);
  const at = ml.lastIndexOf('lesson-dock-more'); // the guided lesson's expanded "More" area
  const more = ml.slice(at, ml.indexOf('{exit}', at));
  assert.match(more, /readChainPrefs\(st\.tutor\?\.chain\)\.on && <Link[^>]*data-testid="open-ayah-chain"/, "Mushaf lesson: inside the expanded More area only");
  const compact = ml.slice(ml.lastIndexOf('lesson-compact-actions'), ml.lastIndexOf('lesson-dock-ratings'));
  assert.doesNotMatch(compact, /ayah-chain|chainHref/, "compact action row untouched");
  const prefs = await src("src/components/TeachingPrefs.tsx");
  assert.match(prefs, /<AyahChainSettings \/>/);
});

test("Session controls: one-handed bar with Back, Play/Pause/Resume and Skip; current step and plays left shown", async () => {
  const s = await src("src/components/AyahChain.tsx");
  for (const id of ["chain-controls", "chain-play", "chain-plays-left", "chain-step", "chain-now"]) assert.match(s, new RegExp(`data-testid="${id}"`));
  for (const k of ["T.back", "T.skip", "T.pause", "T.resume", "T.start", "T.restart"]) assert.ok(s.includes(k), k);
  assert.match(s, /fixed left-0 right-0 bottom-\[64px\]/, "same placement as the existing audio bar");
  const t = await import("../src/lib/ayahChainText.ts");
  assert.equal(t.CHAIN_TEXT.name, "Ayah Chain");
  assert.equal(t.stepRow({ type: "learn", cycle: 4, repeats: 3 }), "Learn Ayah 4 ×3");
  assert.equal(t.stepRow({ type: "link", cycle: 4, repeats: 2 }), "Join Ayahs 1–4 ×2");
});

test("Quran data and audio data are not modified by this feature", async () => {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(await readFile(resolve(root, "public/data/quran.json"))).digest("hex");
  assert.equal(hash, "fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680");
  for (const f of ["src/lib/ayahChain.ts", "src/lib/ayahChainText.ts", "src/components/AyahChain.tsx", "src/components/AyahChainSettings.tsx"]) {
    assert.doesNotMatch(strip(await src(f)), /[؀-ۿ]/, `${f}: no Arabic text typed into the code; Quran text comes from the app data`);
  }
});
