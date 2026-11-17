// Screenshots for HIFZ_JOURNEY_LEARNING_FEATURES_REPORT.md: Recall in Ayah / Mushaf view, Similar Ayahs sheet,
// reminder settings, check-in — at Android widths 320/360/393/430. Headless Edge via DevTools protocol.
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/shots-learning-features.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "learning-features");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port; await new Promise((r) => reserve.close(r));
const profile = await mkdtemp(join(tmpdir(), "hifz-shots-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
async function poll(url) { for (let i = 0; i < 150; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch { } await sleep(200); } throw new Error("Edge did not start"); }

const report = [];
let ws;
try {
  await poll(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evalJs(expr)) return true; await sleep(200); } throw new Error(`timeout: ${expr}`); };
  const click = (text) => evalJs(`(() => { const b = [...document.querySelectorAll("button,a")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)}) && x.offsetParent); if (b) b.click(); return !!b; })()`);
  const shot = async (name) => { await sleep(600); const r = await send("Page.captureScreenshot", { format: "png" }); await writeFile(join(out, `${name}.png`), Buffer.from(r.result.data, "base64")); };
  const go = async (path) => { await send("Page.navigate", { url: base + path }); await sleep(800); await until(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`); };
  await send("Page.enable"); await send("Runtime.enable");

  for (const w of [320, 360, 393, 430]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 860, deviceScaleFactor: 2, mobile: true });
    // Opt in to examples awaiting review (otherwise the button is correctly hidden).
    await go("/journey-settings");
    await until(`!!document.getElementById("learn-view-title")`);
    await evalJs(`(() => { const c = document.querySelector('#learn-view-title').closest('section').querySelector('input[type=checkbox]'); if (!c.checked) c.click(); return c.checked; })()`);
    await evalJs(`document.getElementById("reminders-title").scrollIntoView()`); await shot(`${w}-reminder-settings`);

    await go("/recall?page=2");
    await click("Start recalling");
    await until(`document.body.innerText.includes("Ayah 1 of")`);
    for (let i = 0; i < 4; i++) { await click("Check ayah"); await sleep(150); await click("Correct"); await sleep(250); }
    await until(`document.body.innerText.includes("Ayah 5 of")`);
    const nav = await evalJs(`(() => { const n = document.querySelector(".main-bottom-nav"); return n ? getComputedStyle(n).display : "absent"; })()`);
    const hasSimilar = await evalJs(`[...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("Similar Ayahs"))`);
    const overflow = await evalJs(`document.documentElement.scrollWidth > window.innerWidth + 1`);
    await shot(`${w}-recall-ayah-view`);
    await click("Mushaf view");
    await until(`!!document.querySelector(".mpage")`);
    const hidden = await evalJs(`document.querySelectorAll(".mpage .w.ph").length`);
    const actionsVisible = await evalJs(`(() => { const a = document.querySelector(".practice-actions").getBoundingClientRect(); return a.bottom <= window.innerHeight + 1; })()`);
    await shot(`${w}-recall-mushaf-view`);
    await click("Similar Ayahs");
    await until(`!!document.querySelector('[aria-label="Similar Ayahs"]')`);
    await shot(`${w}-similar-sheet`);
    await click("Open in Mushaf"); await shot(`${w}-similar-mushaf-context`);
    await click("Close");
    // after looking at the comparison, a correct answer must count as "hesitated" (assistance)
    await click("Check ayah"); await sleep(200);
    const ayahStill = await evalJs(`document.body.innerText.includes("Ayah 5 of")`);
    await click("Ayah view"); await sleep(200);
    const kept = await evalJs(`document.body.innerText.includes("Ayah 5 of")`);
    await go("/checkin?kind=hifz"); await shot(`${w}-checkin`);
    report.push({ width: w, bottomNavDuringLesson: nav, similarButton: hasSimilar, horizontalOverflow: overflow, hiddenWordsInMushafView: hidden, actionBarOnScreen: actionsVisible, progressKeptAfterSheet: ayahStill, progressKeptAfterViewSwitch: kept });
  }
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { try { ws?.close(); } catch { } browser.kill(); }
