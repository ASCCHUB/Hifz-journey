#!/usr/bin/env python3
"""Engine-level browser tests for src/lib/audioCache.ts + public/sw.js, in real Google Chrome.

  * A local app server serves public/sw.js, src/ and this harness on http://localhost:8080.
  * A fake "everyayah.com" runs over HTTPS on 127.0.0.1:8443; Chrome maps the hostname to it,
    so the real URL patterns, CORS, Range and service-worker paths are exercised.
  * Failure modes (HTTP 500/404, dropped connection, HTML error page, missing CORS, slow
    downloads, server down/offline) are injected per test.

Usage:  python3 tests/audio-cache/run_tests.py [--chrome /path/to/chrome]
Requires: pip install playwright ; a Chrome/Chromium with MP3 support.
This does NOT replace testing on a physical Android phone (see ANDROID_TEST_PLAN.md).
"""
import argparse, json, os, shutil, ssl, subprocess, sys, tempfile, threading, time, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # project root
ENGINE = None  # set in main(): directory with the type-stripped modules
FIX = HERE / "fixtures"
APP_PORT, AUDIO_PORT = 8080, 8443
APP = f"http://localhost:{APP_PORT}"
HARNESS = f"{APP}/__harness.html"
R = "TestReciter_64kbps"
EA = "https://everyayah.com/data"

AUDIO_FILES = {
    f"/data/{R}/001001.mp3": FIX / "ar_001001.mp3",
    f"/data/{R}/001002.mp3": FIX / "ar_001002.mp3",
    f"/data/{R}/002255.mp3": FIX / "ar_002255.mp3",
    "/data/OtherReciter_64kbps/001001.mp3": FIX / "ar_001002.mp3",
}
CFG = {}
LOG = []
LOCK = threading.Lock()


def reset_cfg():
    CFG.clear()
    CFG.update(cors=True, down=False, fail=None, slow_download=0.0, urdu_down=False)


class AudioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        dest = self.headers.get("Sec-Fetch-Dest", "")
        rng = self.headers.get("Range")
        with LOCK:
            LOG.append({"path": self.path, "range": rng, "dest": dest, "at": time.time()})
        if CFG["down"]:
            self.close_connection = True
            self.connection.shutdown(2)
            return
        f = AUDIO_FILES.get(self.path)
        # The background saver sends one full GET with no Range header; <audio> always sends Range
        # (and a SW-forwarded media request arrives with Sec-Fetch-Dest: empty, so dest can't be used).
        downloader = rng is None
        fail = CFG["fail"] if downloader else None
        cors = {"Access-Control-Allow-Origin": "*"} if CFG["cors"] else {}
        if f is None or fail == "404":
            return self._send(404, b"not found", "text/plain", cors)
        if fail == "500":
            return self._send(500, b"server error", "text/plain", cors)
        if fail == "html200":
            return self._send(200, b"<html><body>" + b"x" * 2000 + b"</body></html>", "text/html", cors)
        if fail == "not_audio":
            return self._send(200, os.urandom(4000), "application/octet-stream", cors)
        data = f.read_bytes()
        if downloader and CFG["slow_download"]:
            time.sleep(CFG["slow_download"])
        if fail == "drop_mid":
            self.send_response(200)
            for k, v in {**cors, "Content-Type": "audio/mpeg", "Content-Length": str(len(data))}.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data[: len(data) // 2])
            self.wfile.flush()
            self.close_connection = True
            self.connection.shutdown(2)
            return
        if rng and rng.startswith("bytes="):
            a, b = rng[6:].split("-")
            start = int(a) if a else 0
            end = int(b) if b else len(data) - 1
            part = data[start : end + 1]
            return self._send(206, part, "audio/mpeg", {**cors, "Content-Range": f"bytes {start}-{end}/{len(data)}", "Accept-Ranges": "bytes"})
        return self._send(200, data, "audio/mpeg", {**cors, "Accept-Ranges": "bytes"})

    def _send(self, code, body, ctype, extra):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


class AppHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        p = self.path.split("?")[0]
        with LOCK:
            LOG.append({"path": "APP" + p, "range": self.headers.get("Range"), "dest": self.headers.get("Sec-Fetch-Dest", ""), "at": time.time()})
        if p == "/audio/urdu-maududi/test-narrator/001001.mp3":
            if CFG["urdu_down"]:
                self.close_connection = True
                self.connection.shutdown(2)
                return
            return self._file(FIX / "ur_001001.mp3", "audio/mpeg")
        if p == "/sw.js":
            return self._file(ROOT / "public" / "sw.js", "text/javascript", {"Service-Worker-Allowed": "/"})
        if p == "/__harness.html":
            return self._file(HERE / "engine_harness.html", "text/html")
        if p in ("/__engine/audioCache.js", "/__engine/audioSources.js"):
            return self._file(Path(ENGINE) / p.split("/")[-1], "text/javascript")
        body = b"not found"
        self.send_response(404)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, f, ct, extra=None):
        data = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)


def start_servers(tmp):
    cert, key = Path(tmp) / "cert.pem", Path(tmp) / "key.pem"
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(cert), "-days", "2",
                    "-subj", "/CN=everyayah.com", "-addext", "subjectAltName=DNS:everyayah.com"], check=True, capture_output=True)
    app = ThreadingHTTPServer(("127.0.0.1", APP_PORT), AppHandler)
    aud = ThreadingHTTPServer(("127.0.0.1", AUDIO_PORT), AudioHandler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    aud.socket = ctx.wrap_socket(aud.socket, server_side=True)
    for s in (app, aud):
        s.handle_error = lambda *a: None  # broken pipes from aborted media requests are expected
        threading.Thread(target=s.serve_forever, daemon=True).start()
    return app, aud


# ------------------------------------------------------------------ browser helpers

class Env:
    def __init__(self, pw, chrome, profile):
        self.pw, self.chrome, self.profile = pw, chrome, profile
        self.ctx = self.page = None
        self.console = []

    def launch(self, offline=False):
        self.ctx = self.pw.chromium.launch_persistent_context(
            self.profile, executable_path=self.chrome, headless=True, ignore_https_errors=True,
            args=["--autoplay-policy=no-user-gesture-required", f"--host-resolver-rules=MAP everyayah.com 127.0.0.1:{AUDIO_PORT}",
                  "--ignore-certificate-errors", "--no-sandbox", "--no-proxy-server"])
        if offline:
            self.ctx.set_offline(True)
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self.page.on("console", lambda m: self.console.append(m.text))
        self.page.goto(HARNESS)
        self.page.wait_for_function("window.HARNESS_READY === true", timeout=10000)
        return self

    def js(self, expr, arg=None):
        return self.page.evaluate(expr, arg) if arg is not None else self.page.evaluate(expr)

    def close(self):
        if self.ctx:
            self.ctx.close()
        self.ctx = None


def downloads(path_suffix, since=0):
    with LOCK:
        return [l for l in LOG if l["path"].endswith(path_suffix) and l["range"] is None and l["at"] >= since]


def all_requests(path_suffix, since=0):
    with LOCK:
        return [l for l in LOG if l["path"].endswith(path_suffix) and l["at"] >= since]


def go_offline(env):
    env.ctx.set_offline(True)
    CFG["down"] = True
    CFG["urdu_down"] = True


def go_online(env):
    CFG["down"] = False
    CFG["urdu_down"] = False
    env.ctx.set_offline(False)


def fresh(pw, chrome, tmp, name, sw=True):
    env = Env(pw, chrome, str(Path(tmp) / f"profile-{name}")).launch()
    if sw:
        assert env.js("H.registerSW()") is True, "service worker did not take control"
        # Reload under the active worker, as the real app's pages are, so the shell is cached for offline restart.
        env.page.reload()
        env.page.wait_for_function("window.HARNESS_READY === true && !!navigator.serviceWorker.controller", timeout=10000)
    return env


def track(env, f, s, a):
    return env.js(f"H.ar({json.dumps(f)}, {s}, {a})")


# ------------------------------------------------------------------ tests

RESULTS = []


def test(fn):
    RESULTS.append(fn)
    return fn


@test
def first_play_starts_immediately_and_saves_in_background(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "first")
    try:
        env.js("H.init()")
        t = track(env, R, 1, 1)
        CFG["slow_download"] = 2.5  # background download is slow; playback must not wait for it
        t0 = time.time()
        r = env.js("t => H.play(t)", t)
        assert r["source"] == "network", r
        cur = env.js("H.waitPlaying(3000)")
        started = time.time() - t0
        assert cur > 0, "playback did not start"
        assert started < 2.4, f"playback waited for download ({started:.2f}s)"
        saved = env.js("H.awaitSaved()")
        assert saved["s"]["state"] == "saved" and saved["s"]["savedOffline"], saved
        assert saved["at"] >= 2400, f"save finished before slow download could ({saved['at']}ms)"
        st = env.js("H.playerState()")
        bad = [e["t"] for e in st["events"] if e["t"] in ("pause", "emptied", "abort", "error")]
        assert not bad and not st["paused"] and st["src"].startswith("https://everyayah.com"), st
        d = downloads(f"{R}/001001.mp3", t0)
        assert len(d) == 1, d
        assert any(e.get("status", {}).get("state") == "saved" for e in env.js("H.statusLog()")), "no Saved-offline event"
        keys = env.js("H.cacheKeys()")
        assert f"{EA}/{R}/001001.mp3" in keys, keys
        return f"started in {started:.2f}s; saved after {saved['at']/1000:.2f}s; 1 full GET, no Range; no pause/emptied events"
    finally:
        CFG["slow_download"] = 0
        env.close()


@test
def offline_replay_and_no_duplicate_download_and_restart(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "offline")
    try:
        env.js("H.init()")
        t = track(env, R, 1, 1)
        env.js("t => H.play(t)", t)
        assert env.js("H.awaitSaved()")["s"]["state"] == "saved"
        env.js("H.stop()")
        # online replay: must come from the saved file, with no network at all
        t1 = time.time()
        r = env.js("t => H.play(t)", t)
        assert r["source"] == "offline-cache" and r["src"].startswith("blob:"), r
        assert env.js("H.waitPlaying()") > 0
        assert not all_requests(f"{R}/001001.mp3", t1), "re-downloaded a saved file"
        env.js("H.stop()")
        # concurrent saves of the same ayah are deduplicated
        t2 = time.time()
        t2a = track(env, R, 1, 2)
        env.js("t => Promise.all([H.ensureSaved(t), H.ensureSaved(t), H.ensureSaved(t)])", t2a)
        assert len(downloads(f"{R}/001002.mp3", t2)) == 1, downloads(f"{R}/001002.mp3", t2)
        # offline
        go_offline(env)
        assert env.js("H.online()") is False
        t3 = time.time()
        r = env.js("t => H.play(t)", t)
        assert r["source"] == "offline-cache", r
        assert env.js("H.waitPlaying()") > 0, "offline playback failed"
        sk = env.js("H.seek(6)")
        assert sk["error"] is None and sk["t"] >= 5.9, sk
        env.js("H.stop()")
        # offline + not saved -> clear error, not a silent hang
        nr = env.js("t => H.playAndTryCatch(t)", track(env, R, 2, 255))
        assert nr["ok"] is False and nr["name"] == "OfflineUnavailableError", nr
        assert not all_requests(f"{R}/001001.mp3", t3)
        env.close()
        # app restart while offline: page, module and audio all come from app-private storage
        env.launch(offline=True)
        env.js("H.init()")
        r = env.js("t => H.play(t)", t)
        assert r["source"] == "offline-cache", r
        assert env.js("H.waitPlaying()") > 0, "playback after restart failed"
        u = env.js("H.usage()")
        assert u["count"] == 2 and u["byKind"]["ar-recitation"]["count"] == 2, u
        return "offline-cache blob playback; seek offline OK; 3 concurrent saves -> 1 GET; restart offline OK"
    finally:
        go_online(env) if env.ctx else None
        CFG.update(down=False, urdu_down=False)
        env.close()


@test
def failed_download_keeps_playback_and_retries_later(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "fail")
    try:
        env.js("H.init()")
        t = track(env, R, 1, 2)
        CFG["fail"] = "500"
        r = env.js("t => H.play(t)", t)
        assert r["source"] == "network"
        assert env.js("H.waitPlaying()") > 0, "online playback must work even if saving fails"
        s = env.js("H.awaitSaved()")["s"]
        assert s["state"] == "failed" and s["nextRetryAt"], s
        assert f"{EA}/{R}/001002.mp3" not in env.js("H.cacheKeys()")
        env.js("H.stop()")
        # replay within back-off: plays, but doesn't hammer the server
        t1 = time.time()
        env.js("t => H.play(t)", t)
        env.js("H.awaitSaved()")
        assert not downloads(f"{R}/001002.mp3", t1), "retried inside back-off window"
        env.js("H.stop()")
        CFG["fail"] = None
        res = env.js("H.retry({force: true})")
        assert any(x["state"] == "saved" for x in res), res
        return "HTTP 500 -> playback continues, state=failed with back-off; later retry saves it"
    finally:
        CFG["fail"] = None
        env.close()


@test
def interrupted_and_invalid_downloads_are_never_saved(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "interrupt")
    out = []
    try:
        env.js("H.init()")
        for mode, ayah, code in (("drop_mid", 1, "interrupted"), ("html200", 2, "not-audio"), ("not_audio", 255, "not-audio"), ("404", 2, "http")):
            CFG["fail"] = mode
            sur = 2 if ayah == 255 else 1
            t = track(env, R, sur, ayah)
            s = env.js("t => H.ensureSaved(t, {force: true})", t)
            assert s["state"] == "failed" and s["lastError"].startswith(code), (mode, s)
            keys = env.js("H.cacheKeys()")
            assert t["url"] not in keys, (mode, keys)
            out.append(f"{mode}->{code}")
        CFG["fail"] = None
        t = track(env, R, 1, 1)
        s = env.js("t => H.ensureSaved(t, {force: true})", t)
        assert s["state"] == "saved" and s["bytes"] == (FIX / "ar_001001.mp3").stat().st_size, s
        return "rejected: " + ", ".join(out) + "; then full file saved with exact byte size"
    finally:
        CFG["fail"] = None
        env.close()


@test
def missing_cors_falls_back_to_streaming_without_storing_opaque(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "cors")
    try:
        env.js("H.init()")
        CFG["cors"] = False
        t = track(env, R, 1, 1)
        env.js("t => H.play(t)", t)
        assert env.js("H.waitPlaying()") > 0
        s = env.js("H.awaitSaved()")["s"]
        assert s["state"] == "failed" and "network" in s["lastError"], s
        time.sleep(0.5)
        assert t["url"] not in env.js("H.cacheKeys()"), "opaque/partial response was stored"
        return "no CORS -> plays online, nothing unverifiable stored, marked for retry (native fetcher needed on Android if host lacks CORS)"
    finally:
        CFG["cors"] = True
        env.close()


@test
def storage_limit_stop_and_lru(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "quota")
    try:
        env.js("H.init()")
        env.js("H.setSettings({maxBytes: 100 * 1024, whenFull: 'stop'})")
        a, b, big = track(env, R, 1, 1), track(env, R, 1, 2), track(env, R, 2, 255)
        assert env.js("t => H.ensureSaved(t)", a)["state"] == "saved"
        env.js("t => H.play(t)", big)
        assert env.js("H.waitPlaying()") > 0, "playback must continue when the cache is full"
        s = env.js("H.awaitSaved()")["s"]
        assert s["state"] == "quota", s
        env.js("H.stop()")
        assert env.js("t => H.status(t)", a)["state"] == "saved", "'stop' mode must keep existing files"
        # switch to LRU with 300 KB: saving the big file evicts the least recently played
        env.js("H.setSettings({maxBytes: 300 * 1024, whenFull: 'evict-lru'})")
        assert env.js("t => H.ensureSaved(t)", b)["state"] == "saved"
        time.sleep(0.05)
        env.js("t => H.play(t)", b)  # b is now most recently played
        env.js("H.stop()")
        res = env.js("H.retry({force: true})")
        assert any(x["id"].endswith("002255") and x["state"] == "saved" for x in res), res
        u = env.js("H.usage()")
        assert u["bytes"] <= 300 * 1024, u
        sa = env.js("t => H.status(t)", a)["state"]
        assert sa == "none", f"LRU should have evicted oldest (a): {sa}"
        return f"stop mode: kept old, refused new (state=quota); LRU: evicted least-recent, usage {u['bytes']//1024} KB <= 300 KB"
    finally:
        env.close()


@test
def urdu_tts_fallback_label_and_recorded_urdu_shares_cache(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "urdu")
    try:
        env.js("H.init()")
        r = env.js("H.urdu.resolveUrduAudio(1, 1)")
        assert r["type"] == "tts" and "not a human recording" in r["label"]["en"], r
        err = env.js("() => { try { H.urdu.registerUrduRecording({id:'x', narratorName:'n', translation:'Tafheem-ul-Quran (Maududi)', urlTemplate:'/audio/urdu-maududi/x/{surah3}{ayah3}.mp3'}); return null } catch (e) { return e.message } }")
        assert err and "licence" in err, err
        # TEST FIXTURE ONLY: a fake licence record so the code path can be exercised. Not a real source.
        env.js("""H.urdu.registerUrduRecording({id:'test-narrator', narratorName:'TEST FIXTURE (sine tone)', translation:'Tafheem-ul-Quran (Maududi)',
            urlTemplate:'/audio/urdu-maududi/test-narrator/{surah3}{ayah3}.mp3',
            licence:{holder:'TEST', grantedTo:'TEST', reference:'automated-test-fixture', allowsStreaming:true, allowsOfflineStorage:true},
            ayahMapping:{verified:true, verifiedBy:'automated test', verifiedOn:'2026-11-17', method:'fixture'}})""")
        u = env.js("H.urdu.resolveUrduAudio(1, 1, 'test-narrator')")
        assert u["type"] == "recording" and u["track"]["kind"] == "ur-translation", u
        ar = track(env, R, 1, 1)
        env.js("t => H.play(t)", u["track"])
        assert env.js("H.waitPlaying()") > 0
        assert env.js("H.awaitSaved()")["s"]["state"] == "saved"
        env.js("H.stop()")
        env.js("t => H.ensureSaved(t)", ar)
        su, sa = env.js("t => H.status(t)", u["track"]), env.js("t => H.status(t)", ar)
        assert su["id"] == "ur-translation:test-narrator:001001" and sa["id"] == f"ar-recitation:{R}:001001", (su, sa)
        assert su["state"] == sa["state"] == "saved"
        other = env.js("t => H.status(t)", track(env, "OtherReciter_64kbps", 1, 1))
        assert other["state"] == "none", "a different reciter must have its own identifier"
        go_offline(env)
        r = env.js("t => H.play(t)", u["track"])
        assert r["source"] == "offline-cache" and env.js("H.waitPlaying()") > 0
        env.js("H.stop()")
        go_online(env)
        env.js("H.clear({kind: 'ur-translation'})")
        assert env.js("t => H.status(t)", u["track"])["state"] == "none"
        assert env.js("t => H.status(t)", ar)["state"] == "saved", "clearing Urdu must not remove Arabic"
        env.js("H.urdu.reset()")
        return "TTS labelled 'not a human recording'; unlicensed source rejected; Urdu+Arabic separate ids in one cache; offline Urdu OK; per-kind clear"
    finally:
        CFG.update(down=False, urdu_down=False)
        env.close()


@test
def legacy_cache_is_preserved_and_adopted(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "legacy", sw=False)  # old app state: entries from previous SW
    try:
        a, b = track(env, R, 1, 1), track(env, R, 1, 2)
        env.js("u => H.seedLegacy(u)", a["url"])
        env.js("u => H.seedLegacy(u, {opaque: true})", b["url"])
        before = sorted(env.js("H.cacheKeys()"))
        assert env.js("H.registerSW()") is True
        env.js("H.init()")
        assert sorted(env.js("H.cacheKeys()")) == before, "upgrade removed previously saved audio"
        t0 = time.time()
        sa, sb = env.js("t => H.status(t)", a), env.js("t => H.status(t)", b)
        assert sa["state"] == "saved", sa  # verifiable legacy file adopted without re-download
        assert sb["state"] == "unverified", sb  # opaque legacy file kept, not claimed as saved
        assert not downloads("001001.mp3", t0)
        go_offline(env)
        r = env.js("t => H.play(t)", a)
        assert r["source"] == "offline-cache" and env.js("H.waitPlaying()") > 0
        env.js("H.stop()")
        lr = env.js("t => H.playAndTryCatch(t)", b)
        lp = env.js("H.waitPlaying(2500)") if lr.get("ok") else -1
        env.js("H.stop()")
        go_online(env)
        t1 = time.time()
        env.js("t => H.play(t)", b)
        s = env.js("H.awaitSaved()")["s"]
        assert s["state"] == "saved", s
        assert len(downloads(f"{R}/001002.mp3", t1)) == 1
        return f"legacy keys preserved; verifiable entry adopted with 0 downloads; opaque entry kept as 'unverified' (offline play via SW: {'worked' if lp > 0 else 'did not play'}), upgraded with 1 download when played online"
    finally:
        CFG.update(down=False, urdu_down=False)
        env.close()


@test
def clear_removes_only_audio(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "clear")
    try:
        env.js("H.init()")
        env.js("H.seedAppData()")
        before = env.js("H.readAppData()")
        env.js("t => H.ensureSaved(t)", track(env, R, 1, 1))
        assert env.js("H.usage()")["count"] == 1
        r = env.js("H.clear()")
        assert r["removed"] == 1 and r["freedBytes"] > 0, r
        assert env.js("H.cacheKeys()") == [] and env.js("H.usage()")["bytes"] == 0
        assert env.js("H.readAppData()") == before, "clear touched non-audio data"
        names = env.js("H.cacheNames()")
        assert "quran-audio-v1" in names and "static-v4" in names, names
        return "audio cache emptied; progress (localStorage), assessment evidence (IndexedDB), Quran data cache untouched"
    finally:
        env.close()


@test
def service_worker_serves_range_requests_from_saved_file(pw, chrome, tmp):
    env = fresh(pw, chrome, tmp, "range")
    try:
        env.js("H.init()")
        big = track(env, R, 2, 255)
        assert env.js("t => H.ensureSaved(t)", big)["state"] == "saved"
        go_offline(env)
        t0 = time.time()
        env.js("u => H.directSrcPlay(u)", big["url"])  # a player NOT using the module: remote URL, SW must answer Range
        assert env.js("H.waitPlaying()") > 0, "SW could not serve saved file offline"
        sk = env.js("H.seek(25)")
        assert sk["error"] is None and sk["t"] >= 24.9, sk
        assert not all_requests("002255.mp3", t0)
        return "offline, remote URL in <audio>: SW answered Range with 206 slices; seek to 25 s OK"
    finally:
        CFG.update(down=False, urdu_down=False)
        env.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", default=shutil.which("google-chrome") or shutil.which("chromium") or "")
    ap.add_argument("--json", default=str(HERE / "engine-results.json"))
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright
    global ENGINE
    tmp = tempfile.mkdtemp(prefix="hifz-audio-test-")
    ENGINE = str(Path(tmp) / "engine")
    subprocess.run(["node", str(HERE / "strip_ts.mjs"), ENGINE], check=True, cwd=str(ROOT))
    start_servers(tmp)
    results, failed = [], 0
    with sync_playwright() as pw:
        ver = pw.chromium.launch(executable_path=args.chrome, headless=True)
        browser_version = ver.version
        ver.close()
        for fn in RESULTS:
            reset_cfg()
            t = time.time()
            try:
                note = fn(pw, args.chrome, tmp)
                results.append({"test": fn.__name__, "ok": True, "note": note, "secs": round(time.time() - t, 1)})
                print(f"PASS  {fn.__name__}  ({time.time()-t:.1f}s)\n      {note}")
            except Exception as e:
                failed += 1
                results.append({"test": fn.__name__, "ok": False, "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()})
                print(f"FAIL  {fn.__name__}: {type(e).__name__}: {e}")
                traceback.print_exc()
    Path(args.json).write_text(json.dumps({"browser": browser_version, "passed": len(results) - failed, "failed": failed, "results": results}, indent=2))
    print(f"\n{len(results)-failed}/{len(results)} passed  (browser {browser_version})")
    shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
