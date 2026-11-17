// Dashboard header worldwide: device time zones (Saudi Arabia, India, UK, USA, Japan, Australia), Android widths and
// desktop, no settings button, no mojibake, Continue card position, location permission denied / granted, offline.
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/test-dashboard-time-e2e.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "dashboard-time");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failures = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port; await new Promise((r) => reserve.close(r));
const profile = await mkdtemp(join(tmpdir(), "hifz-time-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let ws;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { } await sleep(200); }
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => Promise.race([new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }), sleep(30000).then(() => ({ timeout: true }))]);
  // browser-level commands (permissions) go through the browser endpoint
  const bws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res) => bws.addEventListener("open", res, { once: true }));
  let bid = 0; const bpending = new Map();
  bws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && bpending.has(m.id)) { bpending.get(m.id)(m); bpending.delete(m.id); } });
  const bsend = (method, params = {}) => Promise.race([new Promise((res) => { const i = ++bid; bpending.set(i, res); bws.send(JSON.stringify({ id: i, method, params })); }), sleep(10000).then(() => ({ timeout: true }))]);

  const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const until = async (expr, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(expr)) return true; await sleep(200); } throw new Error(`timeout: ${expr}`); };
  const shot = async (name) => { await sleep(400); const r = await send("Page.captureScreenshot", { format: "png" }); await writeFile(join(out, `${name}.png`), Buffer.from(r.result.data, "base64")); };
  const go = async (path) => { await send("Page.navigate", { url: base + path }); await sleep(900); await until(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`); await sleep(600); };
  const header = () => js(`(() => { const h = document.querySelector(".dashboard-hero"); return h ? { text: h.innerText, height: Math.round(h.getBoundingClientRect().height), buttons: h.querySelectorAll("a,button").length } : null; })()`);
  await send("Page.enable"); await send("Runtime.enable");

  // 1. Time zones — the page reads the device zone; Emulation.setTimezoneOverride changes it like the OS would.
  const zones = [["saudi-arabia", "Asia/Riyadh", "ar-SA"], ["india", "Asia/Kolkata", "en-IN"], ["uk", "Europe/London", "en-GB"], ["usa", "America/New_York", "en-US"], ["japan", "Asia/Tokyo", "ja-JP"], ["australia", "Australia/Sydney", "en-AU"]];
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  for (const [name, zone, locale] of zones) {
    await send("Emulation.setTimezoneOverride", { timezoneId: zone });
    await send("Emulation.setLocaleOverride", { locale });
    await go("/");
    const h = await header();
    const expected = await js(`new Intl.DateTimeFormat(undefined, { timeZone: ${JSON.stringify(zone)}, hour: "numeric", minute: "2-digit" }).format(new Date())`);
    const deviceZone = await js(`Intl.DateTimeFormat().resolvedOptions().timeZone`);
    const same = await js(`new Intl.DateTimeFormat("en", { timeZone: ${JSON.stringify(zone)}, timeZoneName: "longOffset" }).format(0) === new Intl.DateTimeFormat("en", { timeZoneName: "longOffset" }).format(0)`);
    check(`${name}: page uses the device zone ${zone}`, deviceZone === zone || (zone === "Asia/Kolkata" && deviceZone === "Asia/Calcutta" && same), deviceZone);
    check(`${name}: header shows local time ${expected}`, !!h && h.text.includes(expected), h?.text.replace(/\n/g, " | "));
    check(`${name}: no settings button in header, no mojibake`, h && h.buttons === 0 && !/â€|Â|Ã/.test(h.text));
    await shot(`zone-${name}-360`);
  }
  await send("Emulation.setLocaleOverride", {});

  // 2. Widths: compact header, Continue card position.
  await send("Emulation.setTimezoneOverride", { timezoneId: "Europe/London" });
  for (const [w, hgt, mobile] of [[320, 760, true], [360, 800, true], [393, 852, true], [430, 932, true], [1280, 900, false]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await go("/");
    const h = await header();
    const cont = await js(`(() => { const c = document.querySelector(".dashboard-continue"); return c ? Math.round(c.getBoundingClientRect().top) : null; })()`);
    const overflow = await js(`document.documentElement.scrollWidth > window.innerWidth + 1`);
    check(`width ${w}: header ${h?.height}px, Continue Hifz button at ${cont}px, no horizontal scroll`, h && cont !== null && cont < hgt && !overflow);
    await shot(`dashboard-${w}`);
  }

  // 3. Settings path: More → Settings → Prayer Times & Calendar.
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await go("/");
  await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("More") && b.offsetParent)?.click()`); await sleep(400);
  const settingsLink = await js(`(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/profile"); return a ? a.textContent.trim() : null; })()`);
  check("More menu lists Settings", settingsLink === "Settings", settingsLink);
  await go("/profile");
  check("Settings has Prayer Times & Calendar", await js(`!![...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/prayer-settings" && a.innerText.includes("Prayer Times & Calendar"))`));
  await shot("settings-360");

  // 4. Prayer not configured: discreet message, no invented times.
  await go("/");
  const unset = await js(`document.querySelector(".prayer-card")?.innerText || ""`);
  check("Prayer card without a location: discreet setup message, no times", unset.includes("Prayer location not set") && !/Fajr|Dhuhr/.test(unset));

  // 5. Location permission denied → message, manual selection stays.
  const origin = new URL(base).origin;
  await bsend("Browser.setPermission", { origin, permission: { name: "geolocation" }, setting: "denied" });
  await go("/prayer-settings");
  await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Use my current location")).click()`);
  await until(`document.body.innerText.includes("Location permission was not granted")`, 15000);
  check("Location denied: clear message; city selection still available", await js(`!!document.querySelector("select")`));
  await shot("prayer-location-denied-360");

  // 6. Location granted → coordinates filled, device zone used; save → prayer times computed locally.
  await bsend("Browser.setPermission", { origin, permission: { name: "geolocation" }, setting: "granted" });
  await send("Emulation.setGeolocationOverride", { latitude: 35.6762, longitude: 139.6503, accuracy: 50 });
  await send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Tokyo" });
  await go("/prayer-settings");
  await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Use my current location")).click()`);
  await sleep(1500);
  const filled = await js(`[...document.querySelectorAll("input")].map((i) => i.value).join("|")`);
  check("Location granted: current location and device zone filled in", filled.includes("Current location") && filled.includes("Asia/Tokyo") && filled.includes("35.6762"), filled);
  await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Save prayer settings")).click()`);
  await go("/");
  const card = await js(`document.querySelector(".prayer-card")?.innerText || ""`);
  check("Prayer times calculated for the saved location in its zone", /Fajr/.test(card) && card.includes("Asia/Tokyo"), card.replace(/\n/g, " | ").slice(0, 120));
  await shot("prayer-times-tokyo-360");

  // 7. Offline: everything is computed on the device; the clock keeps ticking.
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const t0 = await js(`document.querySelector(".dashboard-hero time")?.textContent`);
  const wait = 60_000 - (Date.now() % 60_000) + 1500; await sleep(wait);
  const t1 = await js(`document.querySelector(".dashboard-hero time")?.textContent`);
  const prayersOffline = await js(`/Fajr/.test(document.querySelector(".prayer-card")?.innerText || "")`);
  check("Offline: clock advanced on the minute without a reload; prayer times still shown", t0 !== t1 && prayersOffline, `${t0} → ${t1}`);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  try { bws.close(); } catch { }
} catch (e) { check("run completed", false, String(e.message || e)); }
finally { try { ws?.close(); } catch { } browser.kill(); }
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
