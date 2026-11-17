import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const appPath = resolve(root, "public/data/quran.json");
const referencePath = resolve(root, "scripts/reference/UthmanicHafs_v2-0 data/hafsData_v2-0.json");
const reportPath = resolve(root, process.argv.find((arg) => arg.startsWith("--report="))?.slice(9) || "scripts/quran-reference-differences.csv");
const expected = {
  appSha256: "fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680",
  referenceSha256: "d2960b3217962e7e4252abdcece67bea3d6b48271e4cd3af45bbbb2dd5c872ca",
};
const hash = (data) => createHash("sha256").update(data).digest("hex");
const appBytes = readFileSync(appPath), refBytes = readFileSync(referencePath);
if (hash(appBytes) !== expected.appSha256) throw new Error("App Quran dataset changed since this validation baseline. Review and update the pinned hash deliberately.");
if (hash(refBytes) !== expected.referenceSha256) throw new Error("Reference Quran file hash mismatch. Do not validate against a changed reference.");
const app = JSON.parse(appBytes), reference = JSON.parse(refBytes);
if (app.n?.length !== 114 || app.v?.length !== 114 || reference.length !== 6236) throw new Error("Unexpected Surah or Ayah counts in one of the Quran datasets.");

// Ignore only whitespace, tatweel, and the reference export's trailing font ayah marker.
// Preserve Arabic letters, harakat, Quranic signs, and word order for comparison.
function comparisonForm(text) {
  const chars = Array.from(text);
  if (chars.length && chars.at(-1).codePointAt(0) >= 0xfc00 && chars.at(-1).codePointAt(0) <= 0xfdff) chars.pop();
  return chars.join("").replace(/[\s\u0640]/gu, "");
}
function csv(value) { return `"${String(value).replaceAll('"', '""')}"`; }

const rows = [["surah", "ayah", "app_text", "kfgqpc_hafs_v2_text"]];
let index = 0;
for (let s = 1; s <= 114; s++) {
  if (app.v[s - 1]?.length !== app.n[s - 1]?.[2]) throw new Error(`App ayah count mismatch in Surah ${s}.`);
  for (let a = 1; a <= app.n[s - 1][2]; a++) {
    const ref = reference[index++];
    if (!ref || ref.sura_no !== s || ref.aya_no !== a) throw new Error(`Reference numbering/order mismatch at ${s}:${a}.`);
    const localText = app.v[s - 1][a - 1], referenceText = ref.aya_text;
    if (typeof localText !== "string" || typeof referenceText !== "string") throw new Error(`Missing Arabic text at ${s}:${a}.`);
    if (comparisonForm(localText) !== comparisonForm(referenceText)) rows.push([s, a, localText, referenceText]);
  }
}
if (index !== 6236) throw new Error(`Compared ${index} ayahs, expected 6,236.`);
writeFileSync(reportPath, rows.map((row) => row.map(csv).join(",")).join("\n") + "\n", "utf8");
console.log(`App dataset SHA-256: ${expected.appSha256}`);
console.log("App source: Noble Quran Encyclopedia (QuranEnc) quran-json snapshot; upstream package version was not preserved in the project.");
console.log("Reference: King Fahd Complex, Uthmanic Hafs v2.0 official developer package; mirror bytes checked against SHA-256 a7b0e5591945712ec5e4d6142938ae4d1e9b49bdc89dff06222789bfebdfd72c.");
console.log(`Compared all 114 Surahs and 6,236 numbered ayahs. Differences requiring review: ${rows.length - 1}.`);
console.log(`CSV report: ${reportPath}`);
if (rows.length > 1) process.exitCode = 2;
