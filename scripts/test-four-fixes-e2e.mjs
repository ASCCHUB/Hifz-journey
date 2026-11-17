// Browser checks + screenshots for the four Android fixes (headless Edge, Android-sized viewports).
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/test-four-fixes-e2e.mjs
// Seeds a guest profile in a throwaway browser profile (never touches a real device's data).
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "four-android-fixes");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [[320, 700], [360, 800], [393, 852], [430, 932], [768, 1024], [1280, 860]];

// ---- seed: 5 due revision pages (2–5 and 50) and the five unfinished lessons from the screenshot
const DAY = 86400000, now = Date.now();
const day = Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / DAY);
const memRec = () => ({ iv: 1, due: day - 1, dueAt: now - DAY, last: day - 3, reps: 1, successes: 1, successDays: [day - 3], history: [{ at: now - 3 * DAY, result: "ok", interval: 1 }] });
const mem = {};
for (let a = 1; a <= 29; a++) mem[`2:${a}`] = memRec();
for (let a = 1; a <= 9; a++) mem[`3:${a}`] = memRec(); // page 50
const L = (page, s, a, ea, ago, step) => ({ id: `learn:page:${page}`, title: `Learn page ${page}`, unit: { kind: "page", page, start: { s, a }, end: { s, a: ea } }, template: "learn", mode: "guided", level: "guided", step, results: {}, hinted: {}, startedAt: now - ago - 1000, updatedAt: now - ago });
const lessons = Object.fromEntries([L(542, 58, 1, 6, 1000, 4), L(84, 4, 12, 14, 2 * DAY, 2), L(46, 3, 1, 9, 3 * DAY, 1), L(427, 33, 31, 35, 4 * DAY, 3), L(66, 3, 92, 100, 5 * DAY, 2)].map((l) => [l.id, l]));
const seed = { v: 1, t: now, mem, lessons, settings: { theme: "light", tr: "tr-ur-maududi", reciter: "Alafasy_128kbps", speed: 1, newTarget: 5, revTarget: 60, pagesTarget: 2, zoom: 1, readerAyahHighlight: true, quizLength: 10, quizDifficulty: "guided" }, lastPage: 2, readPages: {}, log: {}, bookmarks: {}, weak: {}, mw: {}, goals: [], hist: [], mapProgress: {}, best: 0, recSessions: [], rsus: {} };

const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port; await new Promise((r) => reserve.close(r));
const profile = await mkdtemp(join(tmpdir(), "hifz-four-fixes-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const results = []; let failed = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
let ws;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { } await sleep(200); }
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => Promise.race([new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }), sleep(45000).then(() => ({ timeout: true }))]);
  const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const until = async (expr, ms = 30000) => { for (let t = 0; t < ms; t += 250) { if (await js(expr)) return true; await sleep(250); } return false; };
  const go = async (path) => { await send("Page.navigate", { url: base + path }); await until(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`); await sleep(1200); };
  const shot = async (name, full = false) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full }); if (r.result?.data) await writeFile(join(out, `${name}.png`), Buffer.from(r.result.data, "base64")); };
  const size = (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: w < 1000 });
  const state = () => js(`JSON.parse(localStorage.getItem("hifz-companion-state-v1:guest") || "{}")`);
  // long-press with synthetic pointer events on a word of Ayah s:a (dx/dy = finger movement during the press)
  const press = (sel, ms = 700, dy = 0) => js(`(async () => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return "missing"; const r = el.getBoundingClientRect(); const o = { bubbles: true, isPrimary: true, pointerType: "touch", clientX: r.x + 4, clientY: r.y + 4 };
    el.dispatchEvent(new PointerEvent("pointerdown", o)); if (${dy}) el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientY: o.clientY + ${dy} }));
    await new Promise((x) => setTimeout(x, ${ms})); el.dispatchEvent(new PointerEvent("pointerup", o)); if (!${dy}) el.click(); return "ok"; })()`); // a real scroll emits no click

  await send("Page.enable"); await send("Runtime.enable");
  await size(393, 852);
  await go("/");
  await js(`localStorage.setItem("hifz-companion-state-v1:guest", ${JSON.stringify(JSON.stringify(seed))}); true`);

  // ---------------- 1. Hijri date on the dashboard
  for (const [w, h] of WIDTHS) {
    await size(w, h); await go("/");
    const meta = await js(`document.querySelector(".dashboard-meta")?.innerText || ""`);
    check(`Hijri @${w}px: Islamic month + AH, no BC/AD`, /\d{1,2} (Muharram|Safar|Rabi al-Awwal|Rabi al-Thani|Jumada al-Ula|Jumada al-Akhirah|Rajab|Sha'ban|Ramadan|Shawwal|Dhu al-Qa'dah|Dhu al-Hijjah) 14\d\d AH/.test(meta) && !/\b(BC|AD)\b/.test(meta), meta.replace(/\n/g, " | "));
    check(`Dashboard @${w}px: no horizontal scroll`, await js(`document.documentElement.scrollWidth <= innerWidth + 1`));
    await shot(`dashboard-${w}`);
  }

  // ---------------- 3. Revision: two tasks, Done
  for (const [w, h] of WIDTHS) {
    await size(w, h); await go("/revision");
    await until(`document.querySelectorAll("[data-testid=revision-task]").length > 0`, 15000);
    const n = await js(`document.querySelectorAll("[data-testid=revision-task]").length`);
    check(`Revision @${w}px: two pending tasks (5 due)`, n === 2, `${n} cards`);
    check(`Revision @${w}px: no horizontal scroll`, await js(`document.documentElement.scrollWidth <= innerWidth + 1`));
    check(`Revision @${w}px: Start Revision and Done visible without scrolling`, await js(`[...document.querySelectorAll("[data-testid=revision-task] button")].every((b) => b.getBoundingClientRect().bottom <= innerHeight)`));
    await shot(`revision-${w}`);
  }
  await size(393, 852); await go("/revision");
  const beforeMem = JSON.stringify((await state()).mem);
  const firstPage = await js(`document.querySelector("[data-testid=revision-task] .text-lg")?.innerText`);
  const secondPage = await js(`document.querySelectorAll("[data-testid=revision-task] .text-lg")[1]?.innerText`);
  await js(`[...document.querySelector("[data-testid=revision-task]").querySelectorAll("button")].find((b) => b.textContent.trim() === "Done").click(); true`); await sleep(500);
  const after = await js(`[...document.querySelectorAll("[data-testid=revision-task] .text-lg")].map((x) => x.innerText)`);
  check("Revision: Done removes the task immediately, the other stays, nothing swapped in", after.length === 1 && after[0] === secondPage, JSON.stringify(after));
  await shot("revision-after-done-393");
  const s1 = await state();
  check("Revision: Done recorded as self-reported; Hifz records untouched", JSON.stringify(s1.mem) === beforeMem && Object.values(s1.revisionSession?.done || {}).some((d) => d.how === "self") && s1.hist?.[0]?.k === "Revision · self-reported", `done=${JSON.stringify(s1.revisionSession?.done)}`);
  await go("/revision");
  const reopened = await js(`[...document.querySelectorAll("[data-testid=revision-task] .text-lg")].map((x) => x.innerText)`);
  check("Revision: after restart the done task stays gone; the unfinished one is carried first", reopened[0] === secondPage && !reopened.includes(firstPage) && reopened.length === 2, JSON.stringify(reopened));
  check("Revision: Done never touched SRS after restart", JSON.stringify((await state()).mem) === beforeMem);

  // ---------------- 4. New Learning
  for (const [w, h] of WIDTHS) {
    await size(w, h); await go("/learn");
    await until(`!!document.querySelector("[data-testid=passage-select]")`, 15000);
    const v = await js(`(() => { const c = document.querySelector("[data-testid=continue-learning]"); const s = document.querySelector("[data-testid=start-learning]"); return { cont: c?.innerText || "", buttons: c ? c.querySelectorAll("a.btn-primary").length : 0, others: c?.querySelector("summary")?.innerText || "", startDisabled: s?.tagName === "BUTTON" && s.disabled, startBottom: s?.getBoundingClientRect().bottom, h: innerHeight, scroll: document.documentElement.scrollWidth <= innerWidth + 1 }; })()`);
    check(`New Learning @${w}px: one Continue lesson (page 542) + recoverable others`, /Page 542 · Al-Mujadil/.test(v.cont) && v.buttons === 1 && /Other unfinished lessons \(4\)/.test(v.others), v.others);
    check(`New Learning @${w}px: Start Learning on the first screen, disabled until a passage is chosen`, v.startDisabled && v.startBottom <= v.h, `bottom ${Math.round(v.startBottom)} / ${v.h}`);
    check(`New Learning @${w}px: no horizontal scroll`, v.scroll);
    await shot(`learn-${w}`);
    await js(`document.querySelector("[data-testid=passage-select]").click(); true`); await sleep(500);
    check(`Passage sheet @${w}px: four choices`, (await js(`[...document.querySelectorAll('[role=dialog] [role=tab]')].map((t) => t.textContent.trim()).join(",")`)) === "Juz,Surah,Page,Ayah");
    await shot(`learn-sheet-${w}`);
    await js(`document.querySelector('[role=dialog] button.btn-sm')?.click?.(); [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === "Close")?.click(); true`); await sleep(300);
  }
  await size(393, 852); await go("/learn");
  await js(`document.querySelector("[data-testid=passage-select]").click(); true`); await sleep(400);
  const setVal = (sel, v) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; })()`);
  const tab = (t) => js(`[...document.querySelectorAll('[role=dialog] [role=tab]')].find((x) => x.textContent.trim() === ${JSON.stringify(t)}).click(); true`);
  const summary = () => js(`document.querySelector("[data-testid=passage-summary]")?.innerText || ""`);
  const useBtn = () => js(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === "Use this passage"); return b ? !b.disabled : null; })()`);
  await tab("Page"); await sleep(200); await setVal('[role=dialog] input[type=number]', 605); await sleep(200);
  check("Selector: invalid page 605 is rejected and Use is disabled", /1 to 604/.test(await summary()) && (await useBtn()) === false, await summary());
  await setVal('[role=dialog] input[type=number]', 542); await sleep(200);
  check("Selector: page 542 summary", /Mushaf page 542/.test(await summary()) && (await useBtn()) === true, (await summary()).replace(/\n/g, " | "));
  await tab("Ayah"); await sleep(200); await setVal('[role=dialog] select', 2); await sleep(150);
  const nums = `[role=dialog] input[type=number]`;
  await js(`(() => { const [a, b] = document.querySelectorAll(${JSON.stringify(nums)}); const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set(a, "255"); set(b, "257"); return true; })()`); await sleep(250);
  check("Selector: Ayah range 2:255–257", /Al-Baqarah · Ayahs 255–257/.test(await summary()), (await summary()).replace(/\n/g, " | "));
  await shot("learn-sheet-ayah-range-393");
  await js(`[...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === "Use this passage").click(); true`); await sleep(400);
  const href = await js(`document.querySelector("a[data-testid=start-learning]")?.getAttribute("href")`);
  check("Start Learning enabled; a range across pages 42–43 opens the tutor and says so", href === "/learn?s=2&a=255&endS=2&endA=257" && await js(`/opens in the Ayah-by-Ayah tutor/.test(document.body.innerText)`), href);
  await shot("learn-selected-393");
  await js(`document.querySelector("[data-testid=passage-select]").click(); true`); await sleep(400); await tab("Page"); await sleep(200);
  await setVal('[role=dialog] input[type=number]', 542); await sleep(200);
  await js(`[...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === "Use this passage").click(); true`); await sleep(400);
  const href2 = await js(`document.querySelector("a[data-testid=start-learning]")?.getAttribute("href")`);
  check("Start Learning: page 542 with the default (Mushaf) method → whole-page Mushaf lesson", href2 === "/mushaf?p=542&mode=learn&portion=page", href2);
  const lessonCount = Object.keys((await state()).lessons || {}).length;
  check("New Learning: choosing a passage creates no lesson record and deletes none", lessonCount === 5, `${lessonCount} lessons`);

  // ---------------- 2. Long-press in the Mushaf
  for (const [w, h] of WIDTHS) {
    await size(w, h); await go("/mushaf?p=2");
    await until(`!!document.querySelector('[data-qa="2:2"]')`, 20000); await sleep(800);
    await js(`scrollTo(0, 120); true`); await sleep(200);
    const y0 = await js(`scrollY`);
    await press('[data-qa="2:2"] .w');
    await until(`!!document.querySelector("[data-testid=ayah-quick]")`, 4000);
    const lines0 = await js(`document.querySelectorAll(".mpage .mline").length`);
    const q = await js(`(() => { const d = document.querySelector("[data-testid=ayah-quick]")?.closest("[role=dialog]"); return { open: !!d, title: d?.getAttribute("aria-label"), detailsSheet: !!document.querySelector("#trsel"), selected: document.querySelectorAll(".w.quick-sel").length, lines: document.querySelectorAll(".mpage .mline").length }; })()`);
    check(`Long-press @${w}px: quick sheet for Al-Baqarah 2, tap sheet not opened, Ayah highlighted, page lines unchanged`, q.open && q.title === "Al-Baqarah 2" && !q.detailsSheet && q.selected > 0 && q.lines === lines0 && lines0 > 0, JSON.stringify({ ...q, lines0 }));
    await js(`[...document.querySelectorAll("[data-testid=ayah-quick] button")].find((b) => b.textContent.trim() === "Read Urdu Translation").click(); true`);
    await until(`!!document.querySelector(".ayah-quick-ur")?.innerText.trim()`, 8000);
    const ur = await js(`(() => { const e = document.querySelector(".ayah-quick-ur"); return { dir: e?.getAttribute("dir"), lang: e?.getAttribute("lang"), len: e?.innerText.length || 0, src: document.querySelector("[data-testid=ayah-quick]").innerText.includes("Tanzil") }; })()`);
    check(`Long-press @${w}px: Urdu translation RTL with source`, ur.dir === "rtl" && ur.lang === "ur" && ur.len > 10 && ur.src, JSON.stringify(ur));
    await shot(`mushaf-longpress-${w}`);
    await js(`history.back(); true`); await sleep(500);
    const closed = await js(`({ open: !!document.querySelector("[data-testid=ayah-quick]"), y: scrollY, path: location.pathname + location.search })`);
    check(`Long-press @${w}px: Android Back closes the sheet at the same page and scroll position`, !closed.open && closed.path === "/mushaf?p=2" && Math.abs(closed.y - y0) < 2, JSON.stringify({ ...closed, y0 }));
  }
  await size(393, 852); await go("/mushaf?p=2"); await until(`!!document.querySelector('[data-qa="2:3"]')`, 20000); await sleep(600);
  await press('[data-qa="2:3"] .w', 700, 40);
  check("Long-press: moving the finger (scrolling) never opens the sheet", !(await js(`!!document.querySelector("[data-testid=ayah-quick]")`)));
    await js(`document.querySelector('[data-qa="2:4"]').click(); true`); await sleep(500);
  check("Normal tap still opens the full Ayah sheet", await js(`!!document.querySelector("#trsel") && !document.querySelector("[data-testid=ayah-quick]")`));
  await js(`[...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Close")?.click(); true`); await sleep(400);
  // Play Arabic: uses the shared player (AudioBar), single Ayah
  await press('[data-qa="2:5"] .w'); await until(`!!document.querySelector("[data-testid=ayah-quick]")`, 4000);
  await js(`[...document.querySelectorAll("[data-testid=ayah-quick] button")].find((b) => b.textContent.trim() === "Play Arabic Recitation").click(); true`); await sleep(1500);
  const ar = await js(`({ bar: document.querySelector(".audio-player-bar")?.innerText || "", btns: [...document.querySelectorAll("[data-testid=ayah-quick] button")].map((b) => b.textContent.trim()) })`);
  check("Arabic recitation: the shared player loads exactly the held Ayah (2:5)", /Al-Baqarah 5|2:5/.test(ar.bar) && ar.btns.some((b) => /Pause recitation|Resume recitation/.test(b)) && ar.btns.includes("Replay"), JSON.stringify(ar));
  await js(`[...document.querySelectorAll("[data-testid=ayah-quick] button")].find((b) => /Play Urdu Translation/.test(b.textContent)).click(); true`);
  await until(`/Checking/.test(document.querySelector("[data-testid=ayah-quick]")?.innerText || "") === false`, 6000); await sleep(800);
  const tts = await js(`document.querySelector("[data-testid=ayah-quick]")?.innerText || ""`);
  const ttsState = /No Urdu voice is installed/.test(tts) ? "unavailable (no Urdu voice in this browser) — message shown" : /not Quran recitation/.test(tts) ? "speaking with an Urdu voice" : /could not play/.test(tts) ? "failed (message shown)" : "unknown";
  check("Urdu audio: either an Urdu voice speaks (labelled translation) or a clear unavailable message — never silence/other language", ttsState !== "unknown", ttsState);
  check("Urdu audio started → recitation paused (one stream at a time)", await js(`![...document.querySelectorAll(".audio-player-bar button")].some((b) => b.textContent.trim() === "Pause")`));
  await shot("mushaf-longpress-audio-393");
  await js(`history.back(); true`); await sleep(400);
  await go("/mushaf?p=50"); await until(`!!document.querySelector('[data-qa="3:1"]')`, 20000); await sleep(600);
  await press('[data-qa="3:2"] .w'); await until(`!!document.querySelector("[data-testid=ayah-quick]")`, 4000);
  check("Long-press on a full page (50): 15-line layout kept while the sheet is open", await js(`!!document.querySelector("[data-testid=ayah-quick]") && document.querySelectorAll(".mpage > .mline, .mpage > .mhead").length === 15`));
  await js(`history.back(); true`); await sleep(400);
  // Recall: hidden Ayahs must not open the sheet
  await go("/mushaf?p=2&mode=recall"); await until(`!!document.querySelector('[data-qa="2:1"]')`, 20000); await sleep(800);
  await press('[data-qa="2:1"]');
  const rc = await js(`({ open: !!document.querySelector("[data-testid=ayah-quick]"), note: document.querySelector(".ayah-quick-note")?.innerText || "", leak: [...document.querySelectorAll('.mpage [aria-hidden="true"] .w.ph')].some((x) => x.textContent.trim().length > 0) })`);
  check("Recall: long-press on a hidden, unrated Ayah is blocked with an explanation; no hidden text in the DOM", !rc.open && /Rate this Ayah first/.test(rc.note) && !rc.leak, JSON.stringify(rc));
  await shot("mushaf-recall-blocked-393");
} catch (e) { failed++; console.error(e); }
finally { try { ws?.close(); } catch { } browser.kill(); }
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed + (failed && results.every((r) => r.ok) ? 0 : 0)} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
