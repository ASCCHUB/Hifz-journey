import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HIFZ_DASHBOARD_TEST_URL || "http://127.0.0.1:3100";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const outDir = join(process.cwd(), "artifacts", "hifz-journey-dashboard");
await mkdir(outDir, { recursive: true });
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
const profile = await mkdtemp(join(tmpdir(), "hifz-dashboard-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function pollJson(url, timeout = 30000) { const end = Date.now() + timeout; while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch {} await sleep(200); } throw new Error(`Timed out waiting for ${url}`); }
let socket;
try {
  const browserInfo = await pollJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}/journey`)}`, { method: "PUT" }).then((r) => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let seq = 0; const pending = new Map();
  socket.addEventListener("message", ({ data }) => { const m = JSON.parse(data); const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result?.value; };
  const waitFor = async (expression, label, timeout = 25000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await sleep(200); } throw new Error(`Timed out waiting for ${label}`); };
  const screenshot = async (name) => { const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); await writeFile(join(outDir, name), Buffer.from(data, "base64")); };
  const checks = [];
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: `${baseUrl}/journey` });
  await waitFor("!!document.querySelector('.dashboard-hero') && !!document.querySelector('.hifz-main-card')", "dashboard render");
  await waitFor("document.querySelector('.hifz-main-card a.btn-primary')?.textContent.includes('Start Your Hifz Journey')", "new learner action");
  for (const width of [320, 360, 393, 430, 768, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: width >= 768 ? 960 : 800, deviceScaleFactor: 1, mobile: width < 768 });
    await sleep(250);
    const metrics = await evaluate(`(() => {const hero=document.querySelector('.dashboard-hero').getBoundingClientRect(), main=document.querySelector('.hifz-main-card').getBoundingClientRect(); const small=[...document.querySelectorAll('.dashboard-screen a,.dashboard-screen button,.dashboard-screen select')].filter(x=>{const r=x.getBoundingClientRect();return r.width&&r.height&&(r.width<44||r.height<44)}).map(x=>({text:x.textContent.trim(),w:Math.round(x.getBoundingClientRect().width),h:Math.round(x.getBoundingClientRect().height)})); return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,hero:{top:Math.round(hero.top),bottom:Math.round(hero.bottom)},hifz:{top:Math.round(main.top),bottom:Math.round(main.bottom)},action:document.querySelector('.hifz-main-card a.btn-primary')?.textContent.trim(),prayerSetup:!!document.querySelector('.prayer-card a[href="/prayer-settings"]'),smallTargets:small};})()`);
    if (metrics.scrollWidth > width + 1) throw new Error(`Horizontal overflow at ${width}: ${metrics.scrollWidth}`);
    if (metrics.smallTargets.length) throw new Error(`Tap target under 44px at ${width}: ${JSON.stringify(metrics.smallTargets)}`);
    checks.push(metrics);
    await screenshot(`dashboard-new-light-${width}px.png`);
  }
  await cdp("Page.navigate", { url: `${baseUrl}/prayer-settings` });
  await waitFor("!!document.querySelector('select.field') && document.body.innerText.includes('Prayer times')", "prayer settings");
  const setup = await evaluate(`(() => { const label=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith('City')); const s=label?.querySelector('select'); if(!s)return false; s.value='riyadh'; s.dispatchEvent(new Event('change',{bubbles:true})); const save=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save prayer settings'); save?.click(); return true; })()`);
  if (!setup) throw new Error("Could not select a manual city in Prayer Settings");
  await waitFor("localStorage.getItem('hifz-journey-prayer-preferences-v1')?.includes('riyadh')", "manual city saved");
  await cdp("Page.navigate", { url: `${baseUrl}/journey` }); await waitFor("!!document.querySelector('.prayer-card')", "calculated prayer card"); await sleep(400);
  const prayerMetrics = await evaluate(`(() => ({city:document.querySelector('.prayer-card')?.innerText.includes('Riyadh'),names:['Fajr','Dhuhr','Asr','Maghrib','Isha'].filter(n=>document.querySelector('.prayer-card')?.innerText.includes(n)),method:document.querySelector('.prayer-card')?.innerText.match(/Riyadh · ([^\n]+)/)?.[1],next:document.querySelector('.prayer-card strong.text-accent')?.textContent,clock:document.querySelector('.dashboard-hero')?.innerText.match(/\d{1,2}:\d{2}/)?.[0]}))()`);
  if (!prayerMetrics.city || prayerMetrics.names.length !== 5 || !prayerMetrics.next) throw new Error(`Prayer calculation/UI incomplete: ${JSON.stringify(prayerMetrics)}`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true }); await sleep(200); await screenshot("dashboard-riyadh-light-393px.png");
  await evaluate(`(() => { const b=document.querySelector('button[aria-label="Switch to dark mode"]'); b?.click(); return !!b; })()`);
  await waitFor("document.documentElement.classList.contains('dark')", "dark mode applied");
  for (const width of [393, 1280]) { await cdp("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 852 : 960, deviceScaleFactor: 1, mobile: width < 768 }); await sleep(250); const m = await evaluate("({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,dark:document.documentElement.classList.contains('dark')})"); if (m.scrollWidth > width + 1 || !m.dark) throw new Error(`Dark theme viewport check failed: ${JSON.stringify(m)}`); await screenshot(`dashboard-riyadh-dark-${width}px.png`); }
  await cdp("Page.navigate", { url: `${baseUrl}/prayer-settings` }); await waitFor("!!document.querySelector('h2')", "settings screenshot"); await cdp("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true }); await screenshot("prayer-settings-393px-dark.png");
  console.log(JSON.stringify({ edge: browserInfo.Browser, screenshots: outDir, viewportChecks: checks, prayer: prayerMetrics, darkMode: true }, null, 2));
} finally { try { if (socket?.readyState === WebSocket.OPEN) socket.close(); } catch {} try { browser.kill(); } catch {} }
