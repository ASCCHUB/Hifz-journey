// Compiles and runs the off-device tests for android/.../AudioDownloadProxy.java (needs a JDK: javac + java).
// Also parses MainActivity.java with javac's parser (syntax only; the full Android compile happens in the
// android-debug workflow / Gradle). Usage: npm run test:audio-proxy
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const javaDir = resolve(root, "android/app/src/main/java/com/hifzcompanion");
const out = mkdtempSync(join(tmpdir(), "hifz-audio-proxy-"));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
try {
  run("javac", ["-d", out, join(javaDir, "AudioDownloadProxy.java"), resolve(root, "scripts/audio-proxy-test/AudioDownloadProxyTest.java")]);
  run("java", ["-cp", out, "com.hifzcompanion.AudioDownloadProxyTest"]);

  // Syntax check of MainActivity.java without the Android SDK.
  const parser = join(out, "ParseOnly.java");
  writeFileSync(parser, `import javax.tools.*; import com.sun.source.util.JavacTask; import java.util.*;
public class ParseOnly { public static void main(String[] a) throws Exception {
  JavaCompiler c = ToolProvider.getSystemJavaCompiler(); DiagnosticCollector<JavaFileObject> d = new DiagnosticCollector<>();
  StandardJavaFileManager fm = c.getStandardFileManager(d, null, null);
  JavacTask t = (JavacTask) c.getTask(null, fm, d, List.of("-proc:none"), null, fm.getJavaFileObjects(a));
  t.parse(); boolean bad = false;
  for (Diagnostic<?> x : d.getDiagnostics()) if (x.getKind() == Diagnostic.Kind.ERROR) { bad = true; System.out.println(x); }
  System.out.println(bad ? "MainActivity.java: syntax errors" : "MainActivity.java: parses (syntax OK)"); System.exit(bad ? 1 : 0);
} }`);
  run("javac", ["-d", out, parser]);
  run("java", ["-cp", out, "ParseOnly", join(javaDir, "MainActivity.java")]);
} finally {
  rmSync(out, { recursive: true, force: true });
}
