// Recall layout: Mushaf Recall and Practice (Recall a page) with the bottom teaching dock.
// Per width (fresh profile): hint, rate every Ayah, view switch mid-recall, exit + resume, save; at each step the
// dock must not cover the current Ayah, concealed words carry no text, and a hinted Ayah is saved as "needed help".
// Usage: HIFZ_UX_TEST_URL=http://127.0.0.1:3000 node scripts/test-recall-dock-e2e.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.HIFZ_UX_TEST_URL || "http://127.0.0.1:3000";
const edge = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const out = join(process.cwd(), "artifacts", "recall-dock");
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failures = 0;
const check = (w, name, ok, detail = "") => { results.push({ width: w, name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} [${w}] ${name}${detail ? ` — ${detail}` : ""}`); };

async function run(width) {
  const reserve = createServer(); await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port; await new Promise((r) => reserve.close(r));
  const profile = await mkdtemp(join(tmpdir(), "hifz-recall-"));
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
    const click = async (text) => { const ok = await js(`(() => { const b = [...document.querySelectorAll("button,a")].find((x) => x.offsetParent && !x.disabled && x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) { b.click(); return true; } return false; })()`); await sleep(450); return ok; };
    const shot = async (name) => { await sleep(300); const r = await send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) await writeFile(join(out, `${width}-${name}.png`), Buffer.from(r.result.data, "base64")); };
    const go = async (path) => { await send("Page.navigate", { url: base + path }); await sleep(900); await until(`!!document.querySelector("main") && !document.body.innerText.includes("Loading the Quran")`); await sleep(600); };
    const state = () => js(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("hifz-companion-state-v1")); return k ? JSON.parse(localStorage.getItem(k)) : {}; })()`);
    const noLeak = () => js(`[...document.querySelectorAll(".w.ph:not(.head)")].every((x) => x.textContent === "")`);
    // Overlap: the current Ayah's visible words/boxes must end above the dock's top edge.
    const overlap = (curSel, dockSel) => js(`(() => { const d = document.querySelector(${JSON.stringify(dockSel)}); const els = [...document.querySelectorAll(${JSON.stringify(curSel)})].filter((e) => e.offsetParent); if (!d || !els.length) return { ok: false, why: "missing" }; const top = d.getBoundingClientRect().top; const bottom = Math.max(...els.map((e) => e.getBoundingClientRect().bottom)); return { ok: bottom <= top + 1, bottom: Math.round(bottom), dockTop: Math.round(top) }; })()`);
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height: Math.round(width * 2.1), deviceScaleFactor: 2, mobile: true });

    // ---------- Mushaf Recall, page 2 (5 Ayahs) ----------
    await go("/mushaf?p=2&mode=recall");
    check(width, "Mushaf Recall: microphone is a compact optional button", await js(`!!document.querySelector(".recite-toggle") && !document.querySelector(".mushaf-recitation")`));
    const docked = await js(`(() => { const d = document.querySelector(".mushaf-recall-dock"); if (!d) return null; const r = d.getBoundingClientRect(); return { pos: getComputedStyle(d).position, nearBottom: r.bottom >= innerHeight - 2 }; })()`);
    check(width, "Mushaf Recall: instruction, Hint, Reveal and ratings in a bottom dock", docked?.pos === "sticky" && docked.nearBottom, JSON.stringify(docked));
    await shot("mushaf-recall-start");
    const curSel = () => js(`(() => { const m = document.body.innerText.match(/Now: ([^\\n.]+?) (\\d+)\\./); return m ? m[2] : null; })()`);
    let worst = { ok: true };
    for (let i = 0; i < 5; i++) {
      const a = await curSel();
      const o = await overlap(`#ayah-2-${a} .w, #ayah-2-${a}, [id="ayah-2-${a}"] ~ span .w`, ".mushaf-recall-dock");
      if (!o.ok) worst = { ...o, ayah: a };
      if (i === 1) { await click("Hint (next word)"); }
      if (i === 2) { await click("Ayah view"); const lo = await overlap(`#list-ayah-2-${a}`, ".mushaf-recall-dock"); if (!lo.ok) worst = { ...lo, ayah: a, view: "ayah" }; check(width, "Mushaf Recall: Ayah view mid-recall keeps the count", (await js(`(document.body.innerText.match(/(\\d+) of 5 rated/) || [])[1]`)) === "2"); await shot("mushaf-recall-ayah-view"); await click("Mushaf view"); }
      if (i === 3) { check(width, "Mushaf Recall: no concealed Quran text in the page", await noLeak()); await go("/journey"); await go("/mushaf?p=2&mode=recall"); check(width, "Mushaf Recall: exit and resume keeps 3 of 5 rated", (await js(`(document.body.innerText.match(/(\\d+) of 5 rated/) || [])[1]`)) === "3"); }
      await click("Recited correctly");
    }
    check(width, "Mushaf Recall: the dock never covered the current Ayah", worst.ok, JSON.stringify(worst));
    const s1 = await state();
    const recs = ["2:1", "2:2", "2:3", "2:4", "2:5"].map((k) => s1.mem?.[k]?.history?.at(-1)?.result);
    check(width, "Mushaf Recall: page saved once; the hinted Ayah is “needed help”, others clean", recs.filter(Boolean).length === 5 && recs[1] === "hes" && recs.filter((r) => r === "ok").length === 4, recs.join(","));
    await shot("mushaf-recall-saved");

    // ---------- Practice (Recall a page), page 3 ----------
    await go("/recall?page=3"); await click("Start recalling");
    await until(`document.body.innerText.includes("Ayah 1 of")`);
    check(width, "Practice: microphone is a compact optional button", await js(`!!document.querySelector(".recite-toggle")`));
    check(width, "Practice: instruction sits in the action dock", await js(`/Recite .+ from memory/.test(document.querySelector(".practice-actions")?.innerText || "")`));
    let pworst = { ok: true };
    for (let i = 0; i < 3; i++) {
      const o = await overlap("#practice-current", ".practice-actions"); if (!o.ok) pworst = { ...o, i };
      if (i === 0) await click("Hint: next word");
      if (i === 1) { await click("Mushaf view"); const mo = await overlap(".mpage .act", ".practice-actions"); if (!mo.ok) pworst = { ...mo, i, view: "mushaf" }; await shot("practice-mushaf-view"); await click("Ayah view"); }
      await click("Check ayah"); await click("Correct");
    }
    check(width, "Practice: the dock never covered the current Ayah", pworst.ok, JSON.stringify(pworst));
    await shot("practice-ayah-view");
    check(width, "Layout: no horizontal scroll", !(await js(`document.documentElement.scrollWidth > innerWidth + 1`)));
  } catch (e) { check(width, "run completed", false, String(e.message || e)); }
  finally { try { ws?.close(); } catch { } browser.kill(); }
}

for (const w of [320, 360, 393, 430]) await run(w);
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
