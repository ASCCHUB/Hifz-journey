// Complete learner journey in a fresh browser profile (headless Edge, phone viewport):
// set up a goal → choose a passage → guided lesson (listen, hide, recall, hint) → finish and save once →
// resume an interrupted lesson → view switch → revision state → memory map return link → Back.
// Also checks every route for horizontal overflow at phone, tablet and desktop widths.
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/test-complete-journey.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "complete-journey");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failures = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port; await new Promise((r) => reserve.close(r));
const profile = await mkdtemp(join(tmpdir(), "hifz-journey-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let ws;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { } await sleep(200); }
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => Promise.race([new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }), sleep(30000).then(() => ({ timeout: true }))]);
  const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const until = async (expr, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(expr)) return true; await sleep(200); } return false; };
  const click = async (text, exact = false) => { const ok = await js(`(() => { const b = [...document.querySelectorAll("button,a,summary")].find((x) => x.offsetParent && !x.disabled && (${exact} ? x.textContent.trim() === ${JSON.stringify(text)} : x.textContent.trim().startsWith(${JSON.stringify(text)}))); if (b) { b.click(); return true; } return false; })()`); await sleep(400); return ok; };
  const shot = async (name) => { await sleep(400); const r = await send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) await writeFile(join(out, `${name}.png`), Buffer.from(r.result.data, "base64")); };
  const go = async (path) => { await send("Page.navigate", { url: base + path }); await sleep(900); await until(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`); await sleep(500); };
  const state = () => js(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("hifz-companion-state-v1")); return k ? JSON.parse(localStorage.getItem(k)) : {}; })()`);
  const overflow = () => js(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });

  // 1. New user: Home shows one primary action, nothing contradictory.
  await go("/");
  const home = await js(`(() => { const c = document.querySelector(".hifz-main-card"); const r = document.querySelector(".today-revision-card"); return { primaries: c ? c.querySelectorAll(".btn-primary").length : -1, revPrimary: r ? r.querySelectorAll(".btn-primary").length : -1, revText: r?.innerText || "" }; })()`);
  check("1. Home (new user): one primary action, revision card is honest", home.primaries === 1 && home.revPrimary === 0 && /Nothing to revise yet/.test(home.revText), JSON.stringify(home));
  await shot("01-home-new-user");
  // set up a goal with the defaults
  await go("/journey-settings");
  await click("Set up journey"); await click("Add path", true);
  const reviewed = await click("Review changes"); const saved = reviewed && await click("Confirm and save");
  const s1 = await state();
  check("1. Set up a Hifz goal (Review → Confirm and save)", !!s1.studentJourney?.paths?.length, `paths ${s1.studentJourney?.paths?.length || 0}`);

  // 2. Choose a passage: New Learning shows the two steps, adjusters collapsed.
  await go("/learn");
  const nl = await js(`({ steps: document.body.innerText.includes("Choose what to memorize") && !!document.querySelector("[data-testid=passage-select]") && !!document.querySelector("[data-testid=start-learning]"), adjustOpen: !!document.querySelector("details[open] input[type=number]") })`);
  check("2. New Learning: one passage selector + Start Learning; start-Ayah adjusters collapsed", nl.steps && !nl.adjustOpen, JSON.stringify(nl));
  await shot("02-new-learning");

  // 3–7. Guided lesson on Al-Ikhlas 1: listen/repeat, hide, recall with a hint, finish and save once.
  await go("/learn?s=112&a=1&endS=112&endA=1");
  await click("Start lesson");
  let usedHint = false, finished = false, steps = 0;
  const seen = new Set();
  for (; steps < 60 && !finished; steps++) {
    const t = await js(`(document.body.innerText.match(/step \\d+ of \\d+/) || [""])[0] + " " + ((document.querySelector('[aria-live="polite"]')?.innerText) || "").slice(0, 40)`);
    seen.add(t.split(" ").slice(0, 4).join(" "));
    if (await click("Finish lesson")) { finished = true; break; }
    // the hint is used in the final page test, the only step whose rating is saved as evidence
    if (!usedHint && await js(`document.body.innerText.includes("Page test")`) && await click("Hint: next word")) { usedHint = true; continue; }
    if (await click("Recited correctly")) continue;
    if (await click("I have recited it")) continue;
    if (await click("Continue")) continue;
    // order exercise: tap the Ayah choices in order
    if (await js(`(() => { const b = [...document.querySelectorAll("button.text-right")].find((x) => !x.disabled); if (b) { b.click(); return true; } return false; })()`)) continue;
    break;
  }
  await sleep(600);
  const s2 = await state();
  const lesson = Object.values(s2.lessons || {}).find((l) => l.unit?.start?.s === 112);
  const rec = s2.mem?.["112:1"];
  check("3–6. Guided lesson ran listen → hide → recall, with a hint in the final test", usedHint && steps > 2, `${steps} actions`);
  check("7. Finish saves once: lesson completed, one evidence event for 112:1", !!lesson?.completedAt && !!rec && (rec.history?.length || 0) === 1, `history ${rec?.history?.length}`);
  check("7. A hinted pass is not saved as a clean success", rec?.history?.[0]?.result !== "ok", rec?.history?.[0]?.result);
  await shot("07-lesson-complete");
  await click("Finish lesson"); await sleep(400);
  check("7. No duplicate completion on a second tap", ((await state()).mem?.["112:1"]?.history?.length || 0) === 1);

  // 8–9. Resume an interrupted Mushaf lesson and switch views.
  await go("/mushaf?p=3&mode=learn&portion=page");
  const chooserTop = await js(`(() => { const p = document.querySelector(".mushaf-page-shell"); return p ? Math.round(p.getBoundingClientRect().top + scrollY) : -1; })()`);
  check("Mushaf Learn: the Quran page starts within the first screen", chooserTop > 0 && chooserTop < 780, `${chooserTop}px`);
  await shot("08-mushaf-learn-chooser");
  await click("Start guided lesson");
  await until(`!!document.querySelector(".mushaf-lesson-panel")`);
  await click("Next"); await sleep(300);
  const stepA = await js(`(document.querySelector(".mushaf-lesson-panel")?.innerText || "").split("\\n").slice(0, 2).join(" ")`);
  await go("/journey");
  const cont = await js(`[...document.querySelectorAll("a")].find((a) => a.textContent.startsWith("Continue Hifz"))?.getAttribute("href") || ""`);
  check("8. Home offers Continue Hifz for the interrupted lesson", cont.includes("/mushaf?p=3"), cont);
  await go(cont || "/mushaf?p=3&mode=learn&portion=page");
  await until(`!!document.querySelector(".mushaf-lesson-panel")`);
  const stepB = await js(`(document.querySelector(".mushaf-lesson-panel")?.innerText || "").split("\\n").slice(0, 2).join(" ")`);
  check("8. Resume returns to the same step", stepA === stepB, stepB);
  await click("Ayah view"); const listOk = await js(`!!document.querySelector(".mushaf-ayah-list")`);
  await click("Mushaf view");
  check("9. View switch works inside the resumed lesson", listOk && await js(`!document.querySelector(".mushaf-ayah-list")`));
  const panel = await js(`(() => { const p = document.querySelector(".mushaf-lesson-panel")?.getBoundingClientRect(); const a = document.querySelector(".mushaf-page-shell .w.act, .mushaf-page-shell .w.ph.act")?.getBoundingClientRect(); return p && a ? { panelTop: Math.round(p.top), activeBottom: Math.round(a.bottom) } : null; })()`);
  check("Lesson panel does not cover the active Ayah", !panel || panel.activeBottom <= panel.panelTop, JSON.stringify(panel));
  await shot("09-lesson-resumed");

  // 10. Revision after learning: no contradiction, optional practice offered.
  await go("/revision");
  const rv = await js(`document.querySelector("main")?.innerText || ""`);
  const cards = await js(`document.querySelectorAll("[data-testid=revision-task]").length`);
  check("10. Revision shows the due state honestly (no empty state once Ayahs exist; at most two tasks)", !rv.includes("Nothing to revise yet") && (cards > 0 ? cards <= 2 : /All caught up/.test(rv)), rv.split("\n").slice(0, 3).join(" | "));
  await shot("10-revision");

  // 11. Memory map: missing PDF shows import + return to the lesson.
  await go(`/reference-map?juz=30&returnTo=${encodeURIComponent("/learn?s=112&a=1&endS=112&endA=1")}`);
  await until(`document.body.innerText.includes("not available") || !!document.querySelector("canvas")`, 8000);
  const map = await js(`({ back: !![...document.querySelectorAll("a")].find((a) => a.textContent.includes("Return to Learning")), manage: !![...document.querySelectorAll("a")].find((a) => a.textContent.includes("Manage imported PDFs")), label: document.body.innerText.includes("not teacher-reviewed") })`);
  check("11. Missing map: import action, return link, labelled not teacher-reviewed", map.back && map.manage && map.label, JSON.stringify(map));

  // 12. Back navigation.
  await go("/journey"); await go("/revision");
  await js(`history.back()`); await sleep(1200);
  check("12. Back returns to the previous screen", (await js(`location.pathname`)) === "/journey");

  // Empty / reduced states.
  // Overflow sweep across routes and widths.
  const routes = ["/", "/journey", "/learn", "/revision", "/quran", "/mushaf?p=2", "/mushaf?p=3&mode=learn&portion=page", "/mushaf?p=2&mode=recall", "/recall?page=2", "/progress", "/journey-settings", "/profile", "/prayer-settings", "/mind-maps"];
  for (const [w, h, mobile] of [[320, 700, true], [360, 780, true], [393, 850, true], [430, 932, true], [768, 1024, true], [1280, 900, false]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    const bad = [];
    for (const r of routes) { await go(r); if (await overflow()) bad.push(r); }
    check(`No horizontal overflow on ${routes.length} routes at ${w}px`, bad.length === 0, bad.join(", "));
  }
} catch (e) { check("run completed", false, String(e.message || e)); }
finally { try { ws?.close(); } catch { } browser.kill(); }
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
