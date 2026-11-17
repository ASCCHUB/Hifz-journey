// Full-page screenshots of every app screen at a phone width, plus a local gallery page.
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/shots-all-screens.mjs [width]
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const width = Number(process.argv[2]) || 393;
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "all-screens");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCREENS = [
  ["01-home", "/", "Home dashboard"],
  ["02-journey", "/journey", "My Journey"],
  ["03-learn", "/learn", "New Learning"],
  ["04-revision", "/revision", "Revision"],
  ["05-my-quran", "/quran", "My Quran"],
  ["06-mushaf-read", "/mushaf?p=2", "Read Mushaf"],
  ["07-mushaf-learn", "/mushaf?p=3&mode=learn&portion=page", "Mushaf Learn (lesson chooser)"],
  ["08-mushaf-recall", "/mushaf?p=2&mode=recall", "Mushaf Recall"],
  ["09-recall-chooser", "/recall", "Recall a page"],
  ["10-recall-page", "/recall?page=2", "Recall page 2"],
  ["11-recite", "/recite", "Recite"],
  ["12-memorize", "/memorize", "Memorize"],
  ["13-assess", "/assess", "Assess"],
  ["14-visual-maps", "/mind-maps", "Visual Maps"],
  ["15-reference-map", "/reference-map", "Reference map"],
  ["16-progress", "/progress", "Progress"],
  ["17-journey-settings", "/journey-settings", "Journey Settings"],
  ["18-settings", "/profile", "Settings"],
  ["19-prayer-calendar", "/prayer-settings", "Prayer Times & Calendar"],
  ["20-checkin", "/checkin?kind=hifz", "Reminder check-in"],
  ["21-login", "/login", "Sign in"],
];

const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port; await new Promise((r) => reserve.close(r));
const profile = await mkdtemp(join(tmpdir(), "hifz-shots-all-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const done = [];
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
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 2, mobile: true });
  for (const [file, path, title] of SCREENS) {
    await send("Page.navigate", { url: base + path });
    for (let i = 0; i < 60; i++) { if (await js(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`)) break; await sleep(250); }
    await sleep(1800);
    // full page: grow the viewport to the content height (capped), so fixed bars stay at the bottom of the image
    const h = Math.min(6000, Math.max(850, await js(`Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))`) || 850));
    await send("Emulation.setDeviceMetricsOverride", { width, height: h, deviceScaleFactor: 2, mobile: true });
    await sleep(600);
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data) { await writeFile(join(out, `${file}.png`), Buffer.from(r.result.data, "base64")); done.push([file, path, title]); console.log(`saved ${file} (${h}px)`); }
    else console.log(`FAILED ${file}`);
    await send("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 2, mobile: true });
  }
} finally { try { ws?.close(); } catch { } browser.kill(); }

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hifz Journey screens</title>
<style>body{margin:0;padding:16px;font:15px system-ui,sans-serif;background:#0d1714;color:#e7efe9}h1{font-size:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}figure{margin:0;background:#16231f;border-radius:12px;padding:8px}
img{width:100%;border-radius:8px;display:block}figcaption{padding:6px 2px;font-weight:600}small{display:block;color:#9fb3aa;font-weight:400}</style></head>
<body><h1>Hifz Journey: all screens (${width}px wide)</h1><div class="grid">${done.map(([f, p, t]) => `<figure><a href="${f}.png" target="_blank"><img src="${f}.png" alt="${t}" loading="lazy"></a><figcaption>${t}<small>${p.replace(/&/g, "&amp;")}</small></figcaption></figure>`).join("")}</div></body></html>`;
await writeFile(join(out, "index.html"), html);
console.log(`\n${done.length} of ${SCREENS.length} screens saved to ${out}`);
