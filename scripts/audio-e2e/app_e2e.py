#!/usr/bin/env python3
"""Real-app end-to-end test of automatic offline Ayah audio, in Google Chrome, through the actual UI.

Success criterion: the learner plays an Arabic Ayah online once, it is saved automatically, and the same Ayah
plays offline after closing and reopening Hifz Journey.

Mode "android" (default): the Android static export (out/, built with BUILD_ANDROID=1) is served at
  https://appassets.androidplatform.net exactly as MainActivity serves it, with /__hifz-audio/fetch answered
  like AudioDownloadProxy.java, no service worker (as in the WebView) and window.AndroidApp present. The fake
  everyayah.com sends NO CORS headers, so saving can only work through the native download path.
  "Offline" = everyayah.com unreachable and navigator.onLine false (app assets are inside the APK).
Mode "web": `next start` (production build in .next) with the service worker and full Chrome offline mode.

This is a desktop-Chrome simulation. It does not replace testing on a physical Android phone.
Usage: python3 scripts/audio-e2e/app_e2e.py --mode android|web [--chrome /usr/bin/google-chrome]
"""
import argparse, json, os, shutil, signal, subprocess, sys, tempfile, time, traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import servers as S

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
FIX = HERE / "fixtures"
AUDIO_PORT, SHELL_PORT, WEB_PORT = 8443, 8444, 3100
RECITER = "Alafasy_128kbps"
URL = lambda s, a: f"https://everyayah.com/data/{RECITER}/{s:03d}{a:03d}.mp3"
results = []


def step(name, ok, detail=""):
    results.append({"step": name, "ok": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"\n      {detail}" if detail else ""))
    if not ok:
        raise AssertionError(f"{name}: {detail}")


def everyayah_hits(since, proxy=False):
    with S.LOCK:
        return [l for l in S.LOG if l["at"] >= since and l["host"] == ("shell-proxy" if proxy else "everyayah")]


class App:
    def __init__(self, pw, chrome, mode, profile):
        self.pw, self.chrome, self.mode, self.profile = pw, chrome, mode, profile
        self.base = "https://appassets.androidplatform.net" if mode == "android" else f"http://localhost:{WEB_PORT}"

    def open(self, offline=False):
        rules = f"MAP everyayah.com 127.0.0.1:{AUDIO_PORT}, MAP appassets.androidplatform.net 127.0.0.1:{SHELL_PORT}"
        self.ctx = self.pw.chromium.launch_persistent_context(
            self.profile, executable_path=self.chrome, headless=True, ignore_https_errors=True,
            service_workers="block" if self.mode == "android" else "allow", viewport={"width": 1100, "height": 900},
            args=["--autoplay-policy=no-user-gesture-required", f"--host-resolver-rules={rules}", "--ignore-certificate-errors", "--no-proxy-server"])
        if self.mode == "android":
            self.ctx.add_init_script("window.AndroidApp = { audioProxyVersion: () => 1, versionName: () => 'e2e', versionCode: () => 1 };")
            if offline:
                self.ctx.add_init_script("Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });")
        elif offline:
            self.ctx.set_offline(True)
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self.page.on("dialog", lambda d: d.accept())
        return self

    def go(self, path):
        self.page.goto(self.base + path, wait_until="load")
        self.page.wait_for_timeout(1500)

    def play_ayah(self, s, a):
        """Mushaf → tap the Ayah → "Play this ayah" (the app's real controls)."""
        self.go(f"/mushaf?p=1")
        self.page.locator(f"#ayah-{s}-{a}").first.click()
        btn = self.page.get_by_role("button", name="Play this ayah")
        btn.wait_for(timeout=5000)
        tapped = time.time()
        btn.click()
        return tapped

    def bar(self):
        return self.page.locator(".audio-player-bar")

    def is_playing(self, timeout=6000):
        try:
            self.bar().get_by_role("button", name="Pause").wait_for(timeout=timeout)
            return True
        except Exception:
            return False

    def saved_badge(self, timeout=10000):
        try:
            self.page.get_by_test_id("audio-saved-offline").wait_for(timeout=timeout)
            return True
        except Exception:
            return False

    def storage(self):
        return self.page.evaluate("""async () => {
          const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
          const names = await caches.keys(); const caches_ = {};
          for (const n of names) caches_[n] = (await (await caches.open(n)).keys()).map((r) => r.url).sort();
          return { ls, caches: caches_ };
        }""")

    def close(self):
        self.ctx.close()


def run(pw, chrome, mode, tmp):
    profile = str(Path(tmp) / f"profile-{mode}")
    app = App(pw, chrome, mode, profile).open()
    if mode == "web":
        app.go("/")  # first visit installs the service worker
        app.page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
        for p in ["/mushaf?p=1", "/profile"]:
            app.go(p)  # visited while online, so the worker has them for offline use

    # Files saved by the previous app version's "Save … for offline listening" (opaque no-cors copies).
    app.go("/mushaf?p=1")
    app.page.evaluate("""async (u) => { const c = await caches.open('quran-audio-v1'); await c.put(u, await fetch(u, { mode: 'no-cors' })); }""", URL(1, 3))

    # 1. First play online: starts immediately, saves automatically.
    t0 = time.time()
    tapped = app.play_ayah(1, 2)
    started = app.is_playing()
    step(f"[{mode}] first play online starts immediately", started, f"playing {time.time() - tapped:.2f}s after tapping Play this ayah (save happens afterwards)")
    step(f"[{mode}] complete file saved automatically, 'Saved offline' shown", app.saved_badge(), "")
    st = app.storage()
    step(f"[{mode}] saved in app-private cache quran-audio-v1", URL(1, 2) in st["caches"].get("quran-audio-v1", []), str(st["caches"].get("quran-audio-v1")))
    step(f"[{mode}] older saved file from the previous version preserved", URL(1, 3) in st["caches"]["quran-audio-v1"], "")
    if mode == "android":
        px = [l for l in everyayah_hits(t0, proxy=True) if l["path"].endswith("001002.mp3")]
        step("[android] saved through the native download path (everyayah.com sends no CORS here)", len(px) == 1, f"{len(px)} native download(s)")
    full = [l for l in everyayah_hits(t0) if l["path"].endswith("001002.mp3") and l["range"] is None]
    step(f"[{mode}] downloaded once (no duplicate full download)", len(full) == 1, f"{len(full)} full GET(s); player stream requests use Range")

    # 2. Replay online: from the device, no network.
    t1 = time.time()
    app.play_ayah(1, 2)
    step(f"[{mode}] replay uses the saved file (no request to everyayah.com)", app.is_playing() and app.saved_badge(3000) and not everyayah_hits(t1), "")
    app.close()

    # 3. Close and reopen the app OFFLINE.
    S.CFG["down"] = True
    app = App(pw, chrome, mode, profile).open(offline=True)
    t2 = time.time()
    app.play_ayah(1, 2)
    playing = app.is_playing()
    pos = app.page.evaluate("() => new Promise((r) => setTimeout(() => r(document.querySelector('.audio-player-bar') ? 1 : 0), 1500))")
    step(f"[{mode}] SUCCESS CRITERION: after closing and reopening offline, the same Ayah plays", playing and pos == 1 and app.saved_badge(3000), "played from app-private storage")
    step(f"[{mode}] no network used offline", not everyayah_hits(t2), "")

    # 4. Offline, Ayah never played: clear message, no hang.
    app.play_ayah(1, 4)
    try: app.bar().get_by_text("isn't saved on this device yet").wait_for(timeout=6000)
    except Exception: pass
    msg = app.bar().inner_text(timeout=5000)
    step(f"[{mode}] unsaved Ayah offline shows a clear message", "isn't saved on this device yet" in msg, msg.replace("\n", " ")[:160])

    # 5. Urdu translation: existing TTS kept and labelled.
    app.go("/mushaf?p=1")
    app.page.locator('[data-qa="1:2"]').first.click(button="right")
    label = app.page.get_by_test_id("urdu-audio-label").inner_text(timeout=5000)
    step(f"[{mode}] Urdu audio is the device TTS, labelled 'not a human recording'", "not a human recording" in label and "text-to-speech" in label, label.replace("\n", " "))
    app.page.keyboard.press("Escape")

    # 6. Settings → Downloaded Audio, then Clear (only audio is removed).
    app.go("/profile#downloaded-audio")
    box = app.page.get_by_test_id("downloaded-audio-settings")
    box.wait_for(timeout=8000)
    app.page.wait_for_timeout(800)
    usage = app.page.get_by_test_id("audio-usage").inner_text()
    text = box.inner_text()
    step(f"[{mode}] Settings shows audio size, limit and counts", "0 MB of" not in usage and "of 500 MB" in usage and "Arabic recitation: 1 Ayah" in text, f"{usage}; {text.splitlines()[3] if len(text.splitlines()) > 3 else ''}")
    before = app.storage()
    app.page.get_by_test_id("clear-audio").click()
    app.page.wait_for_timeout(1500)
    after = app.storage()
    usage2 = app.page.get_by_test_id("audio-usage").inner_text()
    others_same = {k: v for k, v in before["caches"].items() if k != "quran-audio-v1"} == {k: v for k, v in after["caches"].items() if k != "quran-audio-v1"}
    step(f"[{mode}] Clear removes downloaded audio only", usage2.startswith("0 MB") and after["caches"].get("quran-audio-v1") == [] and before["ls"] == after["ls"] and others_same,
         f"usage now '{usage2}'; localStorage (progress, settings, backups) identical: {before['ls'] == after['ls']}; other caches identical: {others_same}")
    app.close()

    # 7. Online again: a failed save never blocks playback, and the next online play saves it.
    S.CFG.update(down=False, fail="500")
    app = App(pw, chrome, mode, profile).open()
    app.play_ayah(1, 2)
    step(f"[{mode}] download failure: playback still works, nothing claimed as saved", app.is_playing() and not app.saved_badge(4000), "")
    app.close()
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["android", "web"], default="android")
    ap.add_argument("--chrome", default=shutil.which("google-chrome") or shutil.which("chromium") or "")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="hifz-app-e2e-"))
    ctx = S.tls_context(tmp, ["everyayah.com", "appassets.androidplatform.net"])
    for a in range(1, 8):
        S.FILES[f"/data/{RECITER}/001{a:03d}.mp3"] = (FIX / ("ar_001001.mp3" if a % 2 else "ar_001002.mp3")).read_bytes()
    S.CFG["cors"] = args.mode != "android"  # Android: prove the native path works without CORS
    S.serve(S.EveryAyah, AUDIO_PORT, ctx)
    server = None
    if args.mode == "android":
        if not (ROOT / "out" / "mushaf.html").exists():
            sys.exit("Build the Android export first: BUILD_ANDROID=1 npm run build")
        S.serve(S.make_shell(ROOT / "out", AUDIO_PORT), SHELL_PORT, ctx)
    else:
        server = subprocess.Popen(["npx", "next", "start", "-p", str(WEB_PORT)], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        time.sleep(6)
    ok = True
    try:
        with sync_playwright() as pw:
            run(pw, args.chrome, args.mode, tmp)
    except Exception as e:
        ok = False
        if not isinstance(e, AssertionError): traceback.print_exc()
    finally:
        if server: os.killpg(server.pid, signal.SIGTERM)
        shutil.rmtree(tmp, ignore_errors=True)
    out = HERE / f"app-e2e-{args.mode}.json"
    out.write_text(json.dumps({"mode": args.mode, "passed": sum(r["ok"] for r in results), "failed": sum(not r["ok"] for r in results), "steps": results}, indent=2))
    print(f"\n{sum(r['ok'] for r in results)}/{len(results)} steps passed ({args.mode})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
