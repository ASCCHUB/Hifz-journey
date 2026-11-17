import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3100";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const outDir = join(process.cwd(), "artifacts", "android-mushaf-learning-ux");
await mkdir(outDir, { recursive: true });

const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const profile = await mkdtemp(join(tmpdir(), "hifz-android-ux-"));
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--remote-allow-origins=*", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function pollJson(url, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch { /* wait for Edge */ }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for Edge DevTools at ${url}`);
}

let socket;
try {
  const version = await pollJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}/mushaf?p=55&mode=learn&portion=page`)}`, { method: "PUT" }).then((r) => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(`${callback.method}: ${message.error.message}`)); else callback.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    return result.result?.value;
  };
  const waitFor = async (expression, label, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const clickButton = async (label) => {
    const clicked = await evaluate(`(() => { const root=${label === "Next" ? "document.querySelector('.mushaf-lesson-panel')" : "document"}; const b=[...(root||document).querySelectorAll('button,summary')].find(x=>x.textContent.trim()===${JSON.stringify(label)}||(${JSON.stringify(label)}.startsWith("Start ")&&x.textContent.trim().startsWith(${JSON.stringify(label)}))); if(!b) return false; b.click(); return true; })()`);
    if (!clicked) throw new Error(`Button not found: ${label}`);
    await sleep(400);
  };
  const screenshot = async (name) => {
    await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }).then(({ data }) => writeFile(join(outDir, name), Buffer.from(data, "base64")));
  };
  const inspect = async () => evaluate(`(() => {
    const shell=document.querySelector('.mushaf-page-shell'), dock=document.querySelector('.mushaf-lesson-panel');
    const active=[...document.querySelectorAll('.mpage .act')];
    const activeBottom=active.length ? Math.max(...active.map(x=>x.getBoundingClientRect().bottom)) : null;
    const bounds=shell?.getBoundingClientRect(), db=dock?.getBoundingClientRect();
    const visibleButton=(label)=>{const root=document.querySelector('.mushaf-lesson-panel')||document;const b=[...root.querySelectorAll('button')].find(x=>x.textContent.trim()===label);if(!b)return null;const r=b.getBoundingClientRect();return {visible:getComputedStyle(b).display!=='none'&&r.width>0&&r.height>0,top:r.top,bottom:r.bottom,height:r.height};};
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,lineCount:document.querySelectorAll('.mpage .mline').length,
      dock:!!dock,dockTop:db?.top,dockBottom:db?.bottom,dockMode:dock?.dataset.compact,
      pageBottom:bounds?.bottom,pageTop:bounds?.top,pageScrollTop:shell?.scrollTop,pageScrollHeight:shell?.scrollHeight,activeTop:active.length?Math.min(...active.map(x=>x.getBoundingClientRect().top)):null,activeBottom,activeCount:active.length,
      activeBeforeDock:activeBottom==null||!db||activeBottom<=db.top+2,
      next:visibleButton('Next'),listen:visibleButton('▶ Listen ×3'),expand:visibleButton('Expand'),saveExit:visibleButton('Save & exit'),
      noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth+1,
      hiddenTextLeaks:[...document.querySelectorAll('.mpage [aria-hidden="true"] .w.ph')].some(x=>x.textContent.trim().length>0),
      bottomNav:getComputedStyle(document.querySelector('nav[aria-label="Main"]')).display,
      title:document.title
    };
  })()`);
  const requireCheck = (condition, message) => { if (!condition) throw new Error(message); };

  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: `${baseUrl}/learn` });
  await waitFor("!!document.querySelector('[data-testid=passage-select]')", "New Learning route content");
  await screenshot("learn-route-recovery-360x800.png");
  await cdp("Page.navigate", { url: `${baseUrl}/mushaf?p=55&mode=learn&portion=page` });
  await waitFor("document.querySelector('button') && document.readyState==='complete'", "Mushaf page load");
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('Start guided lesson'))", "lesson start control");
  await clickButton("Start guided lesson");
  await waitFor("!!document.querySelector('.mushaf-lesson-panel')", "active lesson dock");
  await sleep(600);

  // Recreate the former stacked mobile layout by disabling only the new focused-mode class.
  await evaluate("document.documentElement.classList.remove('guided-mushaf-lesson')");
  await screenshot("before-stacked-layout-360x800.png");
  await evaluate("document.documentElement.classList.add('guided-mushaf-lesson')");

  const cases = [
    [320, 740, "phone-320x740"], [360, 800, "phone-360x800"], [393, 852, "phone-393x852"], [430, 932, "phone-430x932"],
    [768, 1024, "tablet-768x1024"], [844, 390, "phone-landscape-844x390"], [1024, 768, "tablet-landscape-1024x768"],
  ];
  const results = [];
  for (const [width, height, name] of cases) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 844 });
    await sleep(500);
    const state = await inspect();
    console.log(`VIEWPORT ${width}x${height} ${JSON.stringify(state)}`);
    if (width===844 && height===390) await screenshot("phone-landscape-diagnostic.png");
    requireCheck(state.dock, `${width}x${height}: lesson panel missing`);
    requireCheck(state.lineCount === 15, `${width}x${height}: expected 15 Mushaf lines, found ${state.lineCount}`);
    requireCheck(state.noHorizontalOverflow, `${width}x${height}: horizontal overflow (${state.scrollWidth}px)`);
    if (width <= 820 || height <= 480 && width <= 1000) {
      requireCheck(state.dockMode === "true", `${width}x${height}: compact mobile dock is not active`);
      requireCheck(state.activeCount > 0 && state.activeBeforeDock, `${width}x${height}: active Ayah is obscured by dock`);
      requireCheck(state.bottomNav === "none", `${width}x${height}: main nav was not minimized`);
      requireCheck(state.next?.visible && state.next.height >= 44, `${width}x${height}: primary Next action is not visibly reachable`);
      requireCheck(state.expand?.visible && state.saveExit?.visible, `${width}x${height}: dock expand or Save & Exit is missing`);
    }
    await screenshot(`${name}-collapsed.png`);
    results.push(state);
  }

  await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await clickButton("Expand");
  await waitFor("document.querySelector('.mushaf-lesson-panel')?.dataset.compact==='false'", "expanded lesson dock");
  await screenshot("phone-360x800-expanded.png");
  const expanded = await inspect();
  requireCheck(expanded.dockBottom <= expanded.height + 1, "Expanded dock extends below viewport");
  await clickButton("Display options");
  const optionValues = await evaluate(`(() => [...document.querySelectorAll('select[aria-label="Text visibility"] option')].map(x=>x.value))()`);
  requireCheck(["full", "unlearned", "current"].every((v) => optionValues.includes(v)), "A requested page visibility option is missing");
  const setVisibility = async (value) => {
    const selected = await evaluate(`(() => { const s=document.querySelector('select[aria-label="Text visibility"]'); if(!s)return false; const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
    requireCheck(selected, "Text visibility selector unavailable in expanded dock");
    await waitFor(`document.querySelector('select[aria-label="Text visibility"]')?.value===${JSON.stringify(value)}`, `${value} visibility`);
    await sleep(250);
  };
  await setVisibility("unlearned");
  const unlearnedCheck = await evaluate(`(() => ({hidden:[...document.querySelectorAll('.mpage [aria-hidden="true"] .w.ph')].length, leaked:[...document.querySelectorAll('.mpage [aria-hidden="true"] .w.ph')].some(x=>x.textContent.trim())}))()`);
  requireCheck(unlearnedCheck.hidden > 0 && !unlearnedCheck.leaked, "Hide unlearned Ayahs exposed concealed Quran text");
  await setVisibility("current");
  await sleep(300);
  const hiddenCheck = await evaluate(`(() => ({hidden:[...document.querySelectorAll('.mpage [aria-hidden="true"] .w.ph')].length, leaked:[...document.querySelectorAll('.mpage [aria-hidden="true"] .w.ph')].some(x=>x.textContent.trim())}))()`);
  requireCheck(hiddenCheck.hidden > 0 && !hiddenCheck.leaked, "Current-Ayah visibility exposed concealed Quran text");
  await setVisibility("full");

  const beforeStep = await evaluate("document.querySelector('.lesson-dock-header')?.textContent.trim() || ''");
  await clickButton("Next");
  await sleep(500);
  const afterStep = await evaluate("document.querySelector('.lesson-dock-header')?.textContent.trim() || ''");
  requireCheck(beforeStep !== afterStep, "Next did not advance the lesson step");
  await screenshot("phone-360x800-after-next.png");
  const nav = await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Save & exit'); if(!b)return false; b.click(); return true; })()`);
  requireCheck(nav, "Save & Exit is unavailable");
  await waitFor("!document.querySelector('.mushaf-lesson-panel')", "Save & Exit");
  await cdp("Page.navigate", { url: `${baseUrl}/mushaf?p=55&mode=learn&portion=page` });
  await waitFor("!!document.querySelector('.mushaf-lesson-panel')", "lesson resume");
  const resumedStep = await evaluate("document.querySelector('.lesson-dock-header')?.textContent.trim() || ''");
  requireCheck(resumedStep === afterStep, "Resumed lesson did not return to the saved step");
  await screenshot("phone-360x800-resumed.png");
  console.log(JSON.stringify({ edge: version.Browser, screenshots: outDir, viewports: results, expanded, optionValues, unlearnedCheck, hiddenCheck, beforeStep, afterStep, resumedStep }, null, 2));
} finally {
  try { if (socket?.readyState === WebSocket.OPEN) socket.close(); } catch { /* ignore during cleanup */ }
  try { browser.kill(); } catch { /* ignore during cleanup */ }
}
