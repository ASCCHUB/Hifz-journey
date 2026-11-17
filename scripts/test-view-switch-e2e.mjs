// End-to-end Ayah View / Mushaf View switching on: Mushaf Recall, the guided Mushaf lesson (/mushaf?mode=learn)
// and LessonPlayer (/learn). Per width: fresh Edge profile, switch both ways, check state is preserved, geometry is
// identical, nothing is written to Hifz evidence, exit + resume works, and the global default persists.
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/test-view-switch-e2e.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "view-switch");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failures = 0;
const check = (width, name, ok, detail = "") => { results.push({ width, name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} [${width}] ${name}${detail ? ` — ${detail}` : ""}`); };

async function session(width) {
  const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port; await new Promise((r) => reserve.close(r));
  const profile = await mkdtemp(join(tmpdir(), "hifz-view-"));
  const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let ws;
  try {
    for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { } await sleep(200); }
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
    let id = 0; const pending = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
    const until = async (expr, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(expr)) return true; await sleep(200); } throw new Error(`timeout: ${expr}`); };
    const click = async (text) => { const ok = await js(`(() => { const b = [...document.querySelectorAll("button,a")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)}) && x.offsetParent && !x.disabled); if (b) b.click(); return !!b; })()`); await sleep(350); return ok; };
    const shot = async (name) => { await sleep(500); const r = await send("Page.captureScreenshot", { format: "png" }); await writeFile(join(out, `${width}-${name}.png`), Buffer.from(r.result.data, "base64")); };
    const go = async (path) => { await send("Page.navigate", { url: base + path }); await sleep(900); await until(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`); await sleep(500); };
    // Evidence snapshot from the local mirror: per-Ayah records, weak list, and completed lessons / saved flags.
    const evidence = () => js(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("hifz-companion-state-v1")); const s = k ? JSON.parse(localStorage.getItem(k)) : {}; return JSON.stringify({ mem: s.mem || {}, weak: s.weak || {}, done: Object.values(s.lessons || {}).map((l) => [l.id, !!l.completedAt, l.savedToHifz || 0, Object.keys(l.results || {}).filter((r) => r.startsWith("final")).length]) }); })()`);
    const view = () => js(`(() => { const r = document.querySelector('[aria-label="View"] [aria-checked="true"]'); return r ? r.textContent : null; })()`);
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height: 860, deviceScaleFactor: 2, mobile: true });

    // ---------------- 1. Mushaf Recall ----------------
    await go("/mushaf?p=2&mode=recall");
    const ev0 = await evidence();
    check(width, "recall: switch shown, starts in this screen's usual view (Mushaf)", (await view()) === "Mushaf view");
    await click("Ayah view");
    await click("Hint (next word)"); await click("Recited correctly");
    const rated = await js(`(document.body.innerText.match(/(\\d+) of 5 rated/) || [])[1]`);
    check(width, "recall: one Ayah rated before switching", rated === "1");
    const listHidden = await js(`document.querySelectorAll(".mushaf-ayah-list .w.ph").length`);
    check(width, "recall: concealed words carry no Quran text in the page", await js(`[...document.querySelectorAll(".w.ph:not(.head)")].every((x) => x.textContent === "")`));
    await shot("recall-ayah-view");
    await click("Mushaf view");
    const ph1 = await js(`JSON.stringify([...document.querySelectorAll(".mushaf-page-shell .w.ph")].map((x) => x.style.width))`);
    check(width, "recall: Ayah→Mushaf keeps rating and hidden words", (await js(`(document.body.innerText.match(/(\\d+) of 5 rated/) || [])[1]`)) === "1" && JSON.parse(ph1).length === listHidden, `list hidden ${listHidden}, page placeholders ${JSON.parse(ph1).length}`);
    await shot("recall-mushaf-view");
    await click("Ayah view"); await click("Mushaf view");
    const ph2 = await js(`JSON.stringify([...document.querySelectorAll(".mushaf-page-shell .w.ph")].map((x) => x.style.width))`);
    check(width, "recall: Mushaf→Ayah→Mushaf keeps identical hidden-word geometry", ph1 === ph2);
    check(width, "recall: switching wrote no evidence", (await evidence()) === ev0);
    await go("/journey"); await go("/mushaf?p=2&mode=recall");
    check(width, "recall: exit and resume keeps the unsaved progress", (await js(`(document.body.innerText.match(/(\\d+) of 5 rated/) || [])[1]`)) === "1");

    // ---------------- 2. Guided Mushaf lesson ----------------
    await go("/mushaf?p=3&mode=learn&portion=page");
    await click("Start guided lesson"); await until(`!!document.querySelector(".mushaf-lesson-panel")`);
    // advance to a step that conceals words (hide / recall), so both views must show the same hidden words
    for (let i = 0; i < 12 && !(await js(`/HIDE|RECALL/.test(document.querySelector(".mushaf-lesson-panel")?.innerText || "")`)); i++) { if (!(await click("Next"))) await click("Skip preparation"); }
    const panel =() => js(`(document.querySelector(".mushaf-lesson-panel")?.innerText || "").split("\\n").slice(0, 3).join(" | ")`);
    const p1 = await panel(); const evL = await evidence();
    check(width, "lesson: switch shown during the running lesson", (await view()) !== null, p1);
    await click(await view() === "Ayah view" ? "Mushaf view" : "Ayah view");
    await click("Ayah view");
    const lh = await js(`document.querySelectorAll(".mushaf-ayah-list .w.ph").length`);
    check(width, "lesson: Ayah view lists the page with the lesson's word states", (await js(`document.querySelectorAll(".mushaf-ayah-list [id^=list-ayah-]").length`)) > 0 && lh > 0, `${lh} concealed words in Ayah view`);
    check(width, "lesson: step unchanged after Mushaf→Ayah", (await panel()) === p1);
    await shot("lesson-ayah-view");
    await click("Mushaf view");
    check(width, "lesson: step unchanged after Ayah→Mushaf", (await panel()) === p1);
    const pc = await js(`document.querySelectorAll(".mushaf-page-shell .w.ph").length`);
    check(width, "lesson: same number of concealed words in both views", pc === lh, `page ${pc}, list ${lh}`);
    await shot("lesson-mushaf-view");
    check(width, "lesson: switching neither completes the lesson nor writes evidence", (await evidence()) === evL);
    await go("/journey"); await go("/mushaf?p=3&mode=learn&portion=page");
    await until(`!!document.querySelector(".mushaf-lesson-panel")`);
    check(width, "lesson: exit and resume returns to the same step", (await panel()) === p1, await panel());

    // ---------------- 3. LessonPlayer (/learn) ----------------
    await go("/learn?page=4&template=recover");
    await click("Start recovery");
    await until(`document.body.innerText.includes("step 1 of")`);
    await click("Continue"); await sleep(300);
    const stepText = () => js(`(document.body.innerText.match(/step \\d+ of \\d+/) || [""])[0]`);
    const s1 = await stepText(); const evP = await evidence();
    await click("Mushaf view");
    check(width, "learn: Ayah→Mushaf shows the 15-line page, same step", (await js(`!!document.querySelector(".mpage")`)) && (await stepText()) === s1, s1);
    await shot("learn-mushaf-view");
    await click("Ayah view");
    check(width, "learn: Mushaf→Ayah, same step", (await js(`!document.querySelector(".mpage")`)) && (await stepText()) === s1);
    await shot("learn-ayah-view");
    check(width, "learn: switching wrote no evidence", (await evidence()) === evP);
    await click("Save & exit"); await go("/learn?page=4&template=recover");
    check(width, "learn: Save & exit then resume keeps the step", (await stepText()) === s1, await stepText());

    // ---------------- 4. Global default ----------------
    await click("Mushaf view"); await click("Use this view for all sessions");
    await go("/learn?page=4&template=recover");
    check(width, "default: saved default applies after leaving /learn", (await view()) === "Mushaf view" && (await js(`!!document.querySelector(".mpage")`)));
    await go("/recall?page=2"); await click("Start recalling");
    check(width, "default: also applies to Recall a Page (normally Ayah view)", (await view()) === "Mushaf view");
    await click("Ayah view"); await click("Use this view for all sessions");
    await go("/mushaf?p=2&mode=recall");
    check(width, "default: Ayah default applies to Mushaf Recall too", (await view()) === "Ayah view" && (await js(`!!document.querySelector(".mushaf-ayah-list")`)));
    const overflow = await js(`document.documentElement.scrollWidth > window.innerWidth + 1`);
    check(width, "layout: no horizontal page scroll", !overflow);
  } catch (e) { check(width, "run completed", false, String(e.message || e)); }
  finally { try { ws?.close(); } catch { } browser.kill(); }
}

for (const w of [320, 360, 393, 430]) await session(w);
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
