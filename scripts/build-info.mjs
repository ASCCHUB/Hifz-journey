// Frontend build identity (used by build-android.ps1, usable for any production export).
//   node scripts/build-info.mjs stamp  <exportDir> <buildId> <builtAtIso> <appVersion>
//       → fingerprints every exported file, writes <exportDir>/build-info.json, gives the service worker a
//         per-build cache name, and checks the JavaScript bundle embeds the same build ID.
//   node scripts/build-info.mjs verify <apkPath> <exportDir>
//       → opens the APK as a zip and checks build-info.json and the exact asset list match the export.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

const fail = (m) => { console.error(`BUILD-INFO FAILED: ${m}`); process.exit(1); };
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (root, p) => relative(root, p).split(sep).join("/");
const sha = (b) => createHash("sha256").update(b).digest("hex");
/** Fingerprint = SHA-256 over "path\0sha256(file)\n" for every exported file (sorted), excluding build-info.json itself. */
function fingerprint(files) { const h = createHash("sha256"); for (const [p, d] of files.sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(`${p}\0${d}\n`); return h.digest("hex"); }

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "stamp") {
  const [dir, buildId, builtAt, appVersion] = args;
  if (!dir || !buildId || !builtAt) fail("usage: stamp <exportDir> <buildId> <builtAt> <appVersion>");
  // 1. Service worker: per-build static cache, so an update never keeps serving older cached files.
  const swPath = join(dir, "sw.js"); const sw = readFileSync(swPath, "utf8");
  const sw2 = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${buildId}";`);
  if (sw2 === sw) fail("sw.js has no VERSION line to stamp");
  writeFileSync(swPath, sw2);
  // 2. The JS bundle must embed this build ID (NEXT_PUBLIC_BUILD_ID), proving the bundle is from this build.
  const all = walk(dir).filter((p) => !p.endsWith("build-info.json"));
  const embedded = all.filter((p) => p.endsWith(".js") && readFileSync(p, "utf8").includes(buildId)).length;
  if (!embedded) fail(`no JavaScript chunk embeds build ID ${buildId}; the export is not from this build`);
  const files = all.map((p) => [rel(dir, p), sha(readFileSync(p))]);
  const info = { appVersion, buildId, builtAt, gitCommit: null, gitNote: "project is not a git repository", frontendFingerprint: fingerprint(files), fileCount: files.length };
  writeFileSync(join(dir, "build-info.json"), JSON.stringify(info, null, 2));
  console.log(`BUILD-INFO ${buildId} fingerprint ${info.frontendFingerprint.slice(0, 16)} files ${files.length} (ID embedded in ${embedded} JS files)`);
} else if (cmd === "verify") {
  const [apk, dir] = args;
  // Minimal zip reader: central directory → entries; stored (0) or deflated (8).
  const z = readFileSync(apk); let eocd = z.length - 22; while (eocd >= 0 && z.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) fail("APK is not a valid zip");
  const n = z.readUInt16LE(eocd + 10); let off = z.readUInt32LE(eocd + 16); const entries = new Map();
  for (let i = 0; i < n; i++) {
    const method = z.readUInt16LE(off + 10), csize = z.readUInt32LE(off + 20), nlen = z.readUInt16LE(off + 28), xlen = z.readUInt16LE(off + 30), clen = z.readUInt16LE(off + 32), lho = z.readUInt32LE(off + 42);
    entries.set(z.toString("utf8", off + 46, off + 46 + nlen), { method, csize, lho }); off += 46 + nlen + xlen + clen;
  }
  const read = (name) => { const e = entries.get(name); if (!e) return null; const s = e.lho + 30 + z.readUInt16LE(e.lho + 26) + z.readUInt16LE(e.lho + 28); const raw = z.subarray(s, s + e.csize); return e.method === 0 ? raw : inflateRawSync(raw); };
  const infoBuf = read("assets/public/build-info.json"); if (!infoBuf) fail("APK has no assets/public/build-info.json");
  const apkInfo = JSON.parse(infoBuf.toString("utf8")); const localInfo = JSON.parse(readFileSync(join(dir, "build-info.json"), "utf8"));
  if (apkInfo.buildId !== localInfo.buildId || apkInfo.frontendFingerprint !== localInfo.frontendFingerprint) fail(`APK frontend ${apkInfo.buildId} ≠ export ${localInfo.buildId}`);
  // Exact asset list: every exported file present with identical bytes; no extra (stale) frontend files.
  const exported = walk(dir).map((p) => rel(dir, p)).map((p) => (p.startsWith("_next/") ? `next/${p.slice(6)}` : p));
  const inApk = [...entries.keys()].filter((e) => e.startsWith("assets/public/") && !e.endsWith("/")).map((e) => e.slice(14));
  const missing = exported.filter((p) => !entries.has(`assets/public/${p}`)); const extra = inApk.filter((p) => !exported.includes(p));
  if (missing.length) fail(`APK is missing ${missing.length} exported files, e.g. ${missing.slice(0, 3).join(", ")}`);
  if (extra.length) fail(`APK contains ${extra.length} files not in this export (stale assets), e.g. ${extra.slice(0, 3).join(", ")}`);
  const files = inApk.filter((p) => p !== "build-info.json").map((p) => [p.startsWith("next/") ? `_next/${p.slice(5)}` : p, sha(read(`assets/public/${p}`))]);
  if (fingerprint(files) !== apkInfo.frontendFingerprint) fail("APK asset bytes do not match the recorded frontend fingerprint");
  const required = ["index.html", "mushaf.html", "memorize.html", "learn.html", "recall.html", "recite.html", "mind-maps.html", "profile.html", "assess.html", "sw.js", "maps/manifest.json", "data/quran.json", "pdfjs/pdf.min.mjs", "pdfjs/pdf.worker.min.mjs"];
  const absent = required.filter((p) => !entries.has(`assets/public/${p}`)); if (absent.length) fail(`APK missing required routes/assets: ${absent.join(", ")}`);
  const pdfs = [...entries.keys()].filter((e) => /\.pdf$/i.test(e)); if (pdfs.length) fail(`APK unexpectedly contains PDF files: ${pdfs.join(", ")}`);
  console.log(`APK-VERIFIED ${apkInfo.buildId} fingerprint ${apkInfo.frontendFingerprint.slice(0, 16)} · ${inApk.length} frontend files, 0 missing, 0 stale, bytes match`);
} else fail("unknown command");
