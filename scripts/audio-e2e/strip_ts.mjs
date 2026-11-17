// Turns src/lib/audioCache.ts and audioSources.ts into browser ES modules for the engine tests (Node 24+ built-in type stripping).
import { stripTypeScriptTypes } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const [outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
for (const name of ["audioCache", "audioSources"]) {
  const code = stripTypeScriptTypes(readFileSync(resolve("src/lib", `${name}.ts`), "utf8"), { mode: "strip" });
  writeFileSync(join(outDir, `${name}.js`), code.replace(/from "\.\/(audioCache|audioSources)"/g, 'from "./$1.js"'));
}
console.log("stripped to", outDir);
