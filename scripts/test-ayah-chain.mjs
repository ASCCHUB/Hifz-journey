// Ayah Chain plan engine (src/lib/ayahChain.ts): sequence rules, play counts, edge cases and invalid input.
// Pure module: no Quran data, store or audio is loaded.
import test from "node:test";
import assert from "node:assert/strict";

const c = await import("../src/lib/ayahChain.ts");

const rows = (plan) => plan.steps.map((s) => `${s.type} ${s.from.join(":")}${s.ayahs.length > 1 ? `-${s.to.join(":")}` : ""} x${s.repeats} =${s.plays}`);

test("Defaults are 3 plays of the new Ayah and 2 plays of the growing set; first-Ayah link is off", () => {
  assert.deepEqual(c.CHAIN_DEFAULTS, { newReps: 3, setReps: 2, linkSingle: false });
  assert.deepEqual(c.chainRules(), { newReps: 3, setReps: 2, linkSingle: false });
});

test("Sequence for Ayahs 1-4 with defaults: learn k x3, then link 1..k x2 (no link for the first Ayah) = 30 plays", () => {
  const p = c.chainPlanForRange(1, 1, 4);
  assert.deepEqual(rows(p), [
    "learn 1:1 x3 =3",
    "learn 1:2 x3 =3", "link 1:1-1:2 x2 =4",
    "learn 1:3 x3 =3", "link 1:1-1:3 x2 =6",
    "learn 1:4 x3 =3", "link 1:1-1:4 x2 =8",
  ]);
  assert.equal(p.totalPlays, 30);
  assert.equal(p.cycles, 4);
  const v = c.previewCycle(p, 4);
  assert.equal(v.cyclePlays, 11); // learn 4 x3 (3) + link 1-4 x2 (8)
  assert.equal(v.playsThrough, 30);
  assert.deepEqual(v.steps.map((s) => s.type), ["learn", "link"]);
  assert.deepEqual(v.steps[1].ayahs, [[1, 1], [1, 2], [1, 3], [1, 4]]);
});

test("playsBefore is the running sum and every step has plays = Ayahs x repeats", () => {
  const p = c.chainPlanForRange(2, 1, 9, { newReps: 4, setReps: 3 });
  let run = 0;
  for (const s of p.steps) {
    assert.equal(s.playsBefore, run);
    assert.equal(s.plays, s.ayahs.length * s.repeats);
    assert.equal(s.repeats, s.type === "learn" ? 4 : 3);
    if (s.type === "link") assert.deepEqual(s.ayahs, p.ayahs.slice(0, s.cycle));
    else assert.deepEqual(s.ayahs, [p.ayahs[s.cycle - 1]]);
    run += s.plays;
  }
  assert.equal(run, p.totalPlays);
});

test("Closed-form total matches the built plan for every size 1-60 and several repeat counts", () => {
  for (const [r, g] of [[1, 1], [3, 2], [10, 10], [2, 7]]) {
    for (const linkSingle of [false, true]) {
      for (let n = 1; n <= 60; n++) {
        const p = c.chainPlanForRange(2, 1, n, { newReps: r, setReps: g, linkSingle });
        assert.equal(p.totalPlays, c.chainTotalPlays(n, r, g, linkSingle), `n=${n} r=${r} g=${g} linkSingle=${linkSingle}`);
        const sum = Array.from({ length: n }, (_, i) => c.cyclePlays(i + 1, r, g, linkSingle)).reduce((a, b) => a + b, 0);
        assert.equal(sum, p.totalPlays);
      }
    }
  }
});

test("Edge: a single Ayah (start = end) is one learn step; with linkSingle it also links", () => {
  const p = c.chainPlanForRange(112, 3, 3);
  assert.deepEqual(rows(p), ["learn 112:3 x3 =3"]);
  assert.equal(p.totalPlays, 3);
  assert.deepEqual(c.previewCycle(p, 1), { cycle: 1, ayah: [112, 3], cyclePlays: 3, playsThrough: 3, totalPlays: 3, steps: p.steps });
  const q = c.chainPlanForRange(112, 3, 3, { linkSingle: true });
  assert.deepEqual(rows(q), ["learn 112:3 x3 =3", "link 112:3 x2 =2"]);
  assert.equal(q.totalPlays, 5);
});

test("Edge: repeat counts of 1 and of the maximum (10)", () => {
  const one = c.chainPlanForRange(1, 1, 7, { newReps: 1, setReps: 1 });
  assert.equal(one.totalPlays, 7 + (28 - 1)); // 34
  assert.equal(one.totalPlays, 34);
  const max = c.chainPlanForRange(1, 1, 7, { newReps: 10, setReps: 10 });
  assert.equal(max.totalPlays, 70 + 10 * 27); // 340
  assert.equal(c.CHAIN_LIMITS.maxReps, 10);
});

test("Passages may cross a Surah boundary (e.g. a Mushaf page), keeping Mushaf order", () => {
  const p = c.buildChainPlan([[1, 7], [2, 1], [2, 2]]);
  assert.deepEqual(rows(p), ["learn 1:7 x3 =3", "learn 2:1 x3 =3", "link 1:7-2:1 x2 =4", "learn 2:2 x3 =3", "link 1:7-2:2 x2 =6"]);
  assert.equal(p.totalPlays, 19);
});

test("Invalid input is rejected with a clear error code", () => {
  const code = (fn) => { try { fn(); return "accepted"; } catch (e) { assert.ok(e instanceof c.ChainPlanError, String(e)); return e.code; } };
  assert.equal(code(() => c.buildChainPlan([])), "empty");
  assert.equal(code(() => c.buildChainPlan(null)), "empty");
  assert.equal(code(() => c.chainPlanForRange(2, 1, 61)), "too-long");
  assert.equal(code(() => c.buildChainPlan(Array.from({ length: 61 }, (_, i) => [2, i + 1]))), "too-long");
  assert.equal(code(() => c.chainPlanForRange(1, 5, 4)), "order");
  assert.equal(code(() => c.chainPlanForRange(1, 0, 4)), "order");
  assert.equal(code(() => c.chainPlanForRange(1, 1.5, 4)), "order");
  assert.equal(code(() => c.buildChainPlan([[1, 2], [1, 2]])), "order");
  assert.equal(code(() => c.buildChainPlan([[2, 3], [1, 7]])), "order");
  assert.equal(code(() => c.buildChainPlan([[115, 1]])), "bad-ayah");
  assert.equal(code(() => c.buildChainPlan([[1, 0]])), "bad-ayah");
  assert.equal(code(() => c.buildChainPlan([["1", 1]])), "bad-ayah");
  for (const bad of [0, 11, -1, 2.5, NaN, "3", null]) {
    assert.equal(code(() => c.chainPlanForRange(1, 1, 3, { newReps: bad })), "bad-reps", `newReps ${bad}`);
    assert.equal(code(() => c.chainPlanForRange(1, 1, 3, { setReps: bad })), "bad-reps", `setReps ${bad}`);
  }
  assert.equal(code(() => c.chainPlanForRange(1, 1, 60, { newReps: 10, setReps: 10 })), "accepted");
});

test("Deterministic and does not mutate its input", () => {
  const input = [[1, 1], [1, 2], [1, 3]];
  const copy = JSON.stringify(input);
  const a = c.buildChainPlan(input, { newReps: 2, setReps: 3 }), b = c.buildChainPlan(input, { newReps: 2, setReps: 3 });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), copy);
  a.steps[0].ayahs[0][1] = 99; // plan owns its own arrays
  assert.equal(JSON.stringify(input), copy);
});

test("Player positions: every play maps to its step, repeat and Ayah; remaining counts down to 1", () => {
  const p = c.chainPlanForRange(1, 1, 3); // learn1 x3, learn2 x3, link1-2 x2, learn3 x3, link1-3 x2 = 3+3+4+3+6 = 19
  assert.equal(p.totalPlays, 19);
  const seq = Array.from({ length: p.totalPlays }, (_, i) => c.positionAt(p, i));
  assert.deepEqual(seq.map((x) => x.ayah[1]), [1, 1, 1, 2, 2, 2, 1, 2, 1, 2, 3, 3, 3, 1, 2, 3, 1, 2, 3]);
  assert.deepEqual(seq.map((x) => x.step), [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4]);
  assert.deepEqual(seq.slice(13).map((x) => x.repeat), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual([seq[0].remaining, seq[18].remaining], [19, 1]);
  assert.equal(c.positionAt(p, 19), null);
  assert.equal(c.positionAt(p, -1), null);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => c.stepStart(p, i)), [0, 3, 6, 10, 13]);
  assert.equal(c.stepStart(p, 99), 13); // clamped: "skip" past the end stays on the last step
  assert.equal(c.stepStart(p, -5), 0);  // clamped: "back" before the start stays on the first step
});
