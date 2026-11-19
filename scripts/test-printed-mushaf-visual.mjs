// Browser regression for the printed Mushaf. Runs against the built Next.js app on
// Ubuntu GitHub Actions with the hosted runner's Chrome. Saves screenshots for review.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const base = "http://127.0.0.1:3113";
const out = join(process.cwd(), "artifacts", "printed-mushaf");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "hifz-printed-mushaf-"));
const socketPort = createServer();
await new Promise((resolve) => socketPort.listen(0, "127.0.0.1", resolve));
const port = socketPort.address().port;
await new Promise((resolve) => socketPort.close(resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3113", "-H", "127.0.0.1"], { stdio: "ignore" });
let browser, ws;
try {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(base + "/mushaf?p=26"); if (r.ok) break; } catch {}
    if (i === 149) throw new Error("Next production server not ready");
    await sleep(200);
  }
  browser = spawn(process.env.CHROME_PATH || "google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--disable-background-networking", "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base+"/mushaf?p=26")}`, { method: "PUT" });
      if (r.ok) { target = await r.json(); break; }
    } catch {}
    if (i === 99) throw new Error("Chrome DevTools not reachable");
    await sleep(250);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { ws.addEventListener("open",resolve,{once:true}); ws.addEventListener("error",reject,{once:true}); });
  let seq=0;
  const pending=new Map();
  ws.addEventListener("message", ({data}) => {
    const reply=JSON.parse(data), p=pending.get(reply.id);
    if(!p) return;
    pending.delete(reply.id);
    if(reply.error) p.reject(new Error(reply.error.message));
    else p.resolve(reply.result);
  });
  const cdp=(method,params={}) => new Promise((resolve,reject) => {
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  const evalJS=async expression => {
    const x=await cdp("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    if(x.exceptionDetails)throw new Error(x.exceptionDetails.text);
    return x.result?.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  const dimensions=[[360,800],[393,852],[768,1024],[1024,768]];
  const results=[];
  for(const [width,height] of dimensions){
    await cdp("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<900});
    await cdp("Page.navigate",{url:base+"/mushaf?p=26&mode=read"});
    let ready=false;
    for(let i=0;i<120;i++){
      ready=await evalJS('(() => { const p=document.querySelector(".mpage.mushaf-printed-page"); return !!p && getComputedStyle(p).visibility==="visible" && document.fonts.status==="loaded" && p.querySelectorAll(".mline").length===15; })()');
      if(ready)break;
      await sleep(250);
    }
    assert.ok(ready,`page 26 not visible at ${width}x${height}`);
    const info=await evalJS(`(() => {
      const p=document.querySelector(".mpage.mushaf-printed-page");
      const page=p.getBoundingClientRect();
      const rows=[...p.querySelectorAll(".mline")];
      const words=[...p.querySelectorAll(".w:not(.ph)")];
      const word=words.find(w=>w.textContent.trim());
      const header=p.querySelector(".mushaf-print-header");
      const footer=p.querySelector(".mushaf-print-footer");
      const font=getComputedStyle(p).fontFamily;
      const sample=getComputedStyle(word);
      const shell=document.querySelector(".mushaf-page-shell");
      const outRows=rows.filter(r=>{const b=r.getBoundingClientRect();return b.left<page.left-3||b.right>page.right+3;}).length;
      return {width:innerWidth,height:innerHeight,lines:rows.length,
        page:document.querySelector(".mushaf-print-footer")?.textContent?.trim(),
        header:header?.textContent?.trim(),footer:footer?.textContent?.trim(),
        font,normalWordBackground:sample.backgroundColor,
        outRows,screenOverflow:document.documentElement.scrollWidth>innerWidth+2,
        shellOverflow:shell.scrollWidth>shell.clientWidth+2,
        wordCount:words.length,
        pageHeight:page.height,
        pageWidth:page.width
      };
    })()`);
    assert.equal(info.lines,15,`source line count ${width}x${height}`);
    assert.ok(info.header.includes("Al-Baqarah") && info.header.includes("Juz 2"),"printed header");
    assert.equal(info.footer,"26","printed page number");
    assert.ok(info.font.includes("KFGQPC Hafs"),"bundled Uthmani Quran font");
    assert.equal(info.normalWordBackground,"rgba(0, 0, 0, 0)","no colored word tiles");
    assert.equal(info.outRows,0,`printed rows clipped at ${width}x${height}`);
    assert.equal(info.screenOverflow,false,`document horizontal overflow at ${width}x${height}`);
    assert.equal(info.shellOverflow,false,`page horizontal overflow at ${width}x${height}`);
    const shot=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,fromSurface:true});
    await writeFile(join(out,`page26-${width}x${height}.png`),Buffer.from(shot.data,"base64"));
    results.push(info);
  }
  await writeFile(join(out,"measurements.json"),JSON.stringify(results,null,2));
  console.log("Printed page 26 verified at 4 viewports:\n"+JSON.stringify(results,null,2));
} finally {
  try {ws?.close();}catch{}
  browser?.kill("SIGKILL");
  next.kill("SIGKILL");
  await rm(profile,{recursive:true,force:true});
}
