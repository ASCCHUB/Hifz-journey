#!/usr/bin/env python3
"""Ayah Chain end-to-end test in Google Chrome, through the real UI (local only; needs Playwright + ffmpeg).

Settings → toggle on, repeat steppers, live preview → lesson shows the Ayah Chain button → session plays the plan
in order (checked against lib/ayahChain.ts) with Pause/Resume, Back one step and Skip → progress data untouched →
close the app and reopen OFFLINE → the session plays from the offline audio cache.

  --mode android : static export (out/) served like MainActivity (no service worker, window.AndroidApp, native
                   download path); "offline" = everyayah.com unreachable + navigator.onLine false.
  --mode web     : `next start` with the service worker and Chrome offline mode.
Usage: python3 scripts/audio-e2e/chain_e2e.py --mode android|web
"""
import argparse, json, os, re, shutil, signal, subprocess, sys, tempfile, time, traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import servers as S

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
AUDIO_PORT, SHELL_PORT, WEB_PORT = 8443, 8444, 3101
RECITER = "Alafasy_128kbps"
PASSAGE = "/chain?s=1&a=1&endS=1&endA=4"
results = []


def step(name, ok, detail=""):
    results.append({"step": name, "ok": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"\n      {detail}" if detail else ""))
    if not ok:
        raise AssertionError(f"{name}: {detail}")


class App:
    def __init__(self, pw, chrome, mode, profile):
        self.pw, self.chrome, self.mode, self.profile = pw, chrome, mode, profile
        self.base = "https://appassets.androidplatform.net" if mode == "android" else f"http://localhost:{WEB_PORT}"

    def open(self, offline=False):
        rules = f"MAP everyayah.com 127.0.0.1:{AUDIO_PORT}, MAP appassets.androidplatform.net 127.0.0.1:{SHELL_PORT}"
        self.ctx = self.pw.chromium.launch_persistent_context(
            self.profile, executable_path=self.chrome, headless=True, ignore_https_errors=True,
            service_workers="block" if self.mode == "android" else "allow", viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
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

    def go(self, path, wait=1500):
        self.page.goto(self.base + path, wait_until="load")
        self.page.wait_for_timeout(wait)

    def text(self, testid):
        return self.page.get_by_test_id(testid).inner_text().replace("\n", " ")

    def progress(self):
        """Saved progress data (mirror of the app state): must never change because of Ayah Chain."""
        return self.page.evaluate("""() => { const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
            if (!k.startsWith('hifz-companion-state-v1')) continue; try { const s = JSON.parse(localStorage.getItem(k));
            if (s && s.v === 1) out[k] = { mem: s.mem, readPages: s.readPages, lessons: s.lessons, log: s.log, hist: s.hist, studentJourney: s.studentJourney, assessments: s.assessments, dailyPlan: s.dailyPlan, chain: s.tutor && s.tutor.chain }; } catch {} } return out; }""")

    def close(self):
        self.ctx.close()


def plays_left(app):
    m = re.search(r"(\d+) plays? left", app.text("chain-plays-left"))
    return int(m.group(1)) if m else -1


def wait_for(fn, timeout=15, every=0.1):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(every)
    return fn()


def run(pw, chrome, mode, tmp):
    profile = str(Path(tmp) / f"profile-{mode}")
    app = App(pw, chrome, mode, profile).open()
    if mode == "web":
        app.go("/")
        app.page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)

    # ---- Settings: off by default, toggle on, steppers, live preview
    app.go("/journey-settings#teaching")
    app.page.locator("#teaching-prefs > summary").click()
    box = app.page.get_by_test_id("ayah-chain-settings")
    box.wait_for(timeout=8000)
    toggle = app.page.get_by_test_id("ayah-chain-toggle")
    step(f"[{mode}] mode is off by default", not toggle.is_checked())
    prev = app.text("chain-preview-plays"), app.text("chain-preview-math")
    step(f"[{mode}] preview (defaults, Add Ayah 4): 11 plays this step; 30 through Ayah 4; 75 for 7 Ayahs",
         prev[0].startswith("11 plays") and "Ayahs 1–4 so far: 30 plays" in prev[1] and "75 plays" in prev[1], " | ".join(prev))
    rows = box.get_by_test_id("ayah-chain-preview").inner_text()
    step(f"[{mode}] preview rows: Learn Ayah 4 ×3 and Join Ayahs 1–4 ×2", "Learn Ayah 4 ×3" in rows and "Join Ayahs 1–4 ×2" in rows, rows.replace("\n", " | ")[:200])
    app.page.get_by_role("button", name="New Ayah: more").click()
    app.page.wait_for_timeout(300)
    up = app.text("chain-preview-plays"), app.text("chain-preview-math")
    step(f"[{mode}] New Ayah ×4 updates the preview: 12 this step; 34 through Ayah 4", up[0].startswith("12 plays") and "34 plays" in up[1], " | ".join(up))
    app.page.get_by_role("button", name="New Ayah: fewer").click()
    toggle.check()
    app.page.wait_for_timeout(500)
    st = app.progress()
    chain_saved = [v["chain"] for v in st.values()]
    step(f"[{mode}] settings saved in tutor.chain", {"on": True, "newReps": 3, "setReps": 2} in chain_saved, json.dumps(chain_saved))

    # ---- Lesson shows the entry button (only when on)
    app.go("/learn?s=1&a=1&endS=1&endA=4")
    app.page.get_by_role("button", name="Start lesson").click()
    btn = app.page.get_by_test_id("open-ayah-chain")
    btn.wait_for(timeout=8000)
    href = btn.get_attribute("href")
    step(f"[{mode}] guided lesson shows the Ayah Chain button for its passage", href.startswith(PASSAGE), href)
    before = app.progress()
    btn.click()
    app.page.get_by_test_id("ayah-chain-session").wait_for(timeout=8000)
    app.page.wait_for_timeout(800)
    step(f"[{mode}] session opens: Step 1 of 7, 30 plays left", "Step 1 of 7" in app.text("chain-now") and plays_left(app) == 30, f"{app.text('chain-now')} · {app.text('chain-plays-left')}")

    # ---- Playback order follows the plan (sampled 'Now:' Ayah while playing)
    app.page.get_by_test_id("chain-play").click()
    seen = []
    end = time.time() + 14
    while time.time() < end and plays_left(app) > 19:
        m = re.search(r"Now: Al-Fatihah (\d+)", app.text("chain-now"))
        if m and (not seen or seen[-1] != int(m.group(1))): seen.append(int(m.group(1)))
        time.sleep(0.1)
    step(f"[{mode}] plays in plan order: Ayah 1 (×3), Ayah 2 (×3), then Ayahs 1, 2 (×2)", seen[:4] == [1, 2, 1, 2], f"Ayah changes seen: {seen}; {app.text('chain-now')}")

    # ---- Pause / Resume
    app.page.get_by_test_id("chain-play").click()  # pause
    paused_at = plays_left(app)
    app.page.wait_for_timeout(2500)
    label = app.page.get_by_test_id("chain-play").inner_text()
    step(f"[{mode}] Pause holds the place", plays_left(app) == paused_at and "Resume" in label, f"{paused_at} plays left; button '{label.strip()}'")
    app.page.get_by_test_id("chain-play").click()  # resume
    resumed = wait_for(lambda: plays_left(app) < paused_at, timeout=6)
    step(f"[{mode}] Resume continues from the same place", resumed, f"now {plays_left(app)} plays left")

    # ---- Skip step / Back one step
    s0 = re.search(r"Step (\d+)", app.text("chain-now")).group(1)
    app.page.get_by_role("button", name="Skip step").click()
    app.page.wait_for_timeout(400)
    s1 = re.search(r"Step (\d+)", app.text("chain-now")).group(1)
    step(f"[{mode}] Skip step moves to the next step", int(s1) == int(s0) + 1, f"step {s0} → {s1}; {plays_left(app)} plays left")
    app.page.get_by_test_id("chain-play").click()  # pause before testing Back precisely
    s1 = re.search(r"Step (\d+)", app.text("chain-now")).group(1)  # may have moved on before the pause landed
    app.page.get_by_role("button", name="Back one step").click()
    app.page.wait_for_timeout(300)
    s2 = re.search(r"Step (\d+)", app.text("chain-now")).group(1)
    step(f"[{mode}] Back one step goes to the previous step", int(s2) == int(s1) - 1, f"step {s1} → {s2}")

    # ---- Let it finish (all four Ayahs get played and saved automatically)
    app.page.get_by_test_id("chain-play").click()
    finished = wait_for(lambda: "Passage complete" in app.text("chain-now"), timeout=60, every=0.3)
    step(f"[{mode}] whole passage plays to the end", finished and plays_left(app) == 0, app.text("chain-now"))
    saved = wait_for(lambda: "4 of 4" in app.text("chain-offline"), timeout=15)
    step(f"[{mode}] all 4 Ayahs saved for offline through the existing cache", saved, app.text("chain-offline"))
    after = app.progress()
    step(f"[{mode}] progress, lessons and page-tracker data unchanged by the session", before == after, "mem, readPages, lessons, log, hist, journey, assessments, dailyPlan identical")
    if mode == "web":
        # The existing service worker stores a page only when it is loaded in full (in-app links are client-side);
        # load the session page once while online, as a returning learner would have. (Android serves all routes
        # from the APK, so it needs nothing like this.)
        app.go(PASSAGE, wait=2500)
    app.close()

    # ---- Close and reopen OFFLINE: the chain plays from the device
    S.CFG["down"] = True
    t0 = time.time()
    app = App(pw, chrome, mode, profile).open(offline=True)
    app.go(PASSAGE, wait=2000)
    app.page.get_by_test_id("ayah-chain-session").wait_for(timeout=8000)
    step(f"[{mode}] offline after restart: 'Saved for offline: 4 of 4'", "4 of 4" in app.text("chain-offline"), app.text("chain-offline"))
    app.page.get_by_test_id("chain-play").click()
    moved = wait_for(lambda: plays_left(app) <= 26, timeout=10)
    with S.LOCK:
        net = [l for l in S.LOG if l["at"] >= t0 and l["host"] in ("everyayah", "shell-proxy")]
    step(f"[{mode}] offline after restart: the chain plays, with no network", moved and not net and "Audio" not in app.text("chain-step").split("Saved")[0], f"{app.text('chain-plays-left')}; network requests: {len(net)}")
    app.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["android", "web"], default="android")
    ap.add_argument("--chrome", default=shutil.which("google-chrome") or shutil.which("chromium") or "")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="hifz-chain-e2e-"))
    clip = tmp / "clip.mp3"  # 1-second tone: a 30-play passage runs in about half a minute
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ac", "1", "-b:a", "64k", str(clip)], check=True)
    for a in range(1, 8):
        S.FILES[f"/data/{RECITER}/001{a:03d}.mp3"] = clip.read_bytes()
    ctx = S.tls_context(tmp, ["everyayah.com", "appassets.androidplatform.net"])
    S.CFG["cors"] = args.mode != "android"
    S.serve(S.EveryAyah, AUDIO_PORT, ctx)
    server = None
    if args.mode == "android":
        if not (ROOT / "out" / "chain.html").exists():
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
        if not (isinstance(e, AssertionError) and results and not results[-1]["ok"]): traceback.print_exc()
    finally:
        if server: os.killpg(server.pid, signal.SIGTERM)
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{sum(r['ok'] for r in results)}/{len(results)} steps passed ({args.mode})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
