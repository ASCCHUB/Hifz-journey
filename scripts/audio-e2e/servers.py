"""Test servers for the automatic offline audio end-to-end tests.

* FakeEveryAyah: HTTPS stand-in for everyayah.com (Chrome maps the hostname to it), with switchable CORS,
  failures (500, dropped connection, HTML error page) and an on/off switch to simulate no internet.
* AndroidShell: serves the static export (out/) at https://appassets.androidplatform.net exactly as
  MainActivity.serveAsset does, plus /__hifz-audio/fetch with the same allow-list as AudioDownloadProxy.java.
"""
import re, ssl, subprocess, threading, time, urllib.parse, http.client
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

CFG = {"cors": True, "down": False, "fail": None}
LOG = []
LOCK = threading.Lock()
FILES = {}  # path -> bytes


def log(entry):
    with LOCK:
        LOG.append({**entry, "at": time.time()})


class EveryAyah(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def do_GET(self):
        rng = self.headers.get("Range")
        log({"host": "everyayah", "path": self.path, "range": rng, "origin": self.headers.get("Origin"), "ua": self.headers.get("User-Agent", "")})
        if CFG["down"]:
            self.close_connection = True; self.connection.shutdown(2); return
        data = FILES.get(self.path)
        cors = {"Access-Control-Allow-Origin": "*"} if CFG["cors"] else {}
        fail = CFG["fail"] if rng is None else None  # failures hit the background saver (no Range), not the player
        if data is None: return self._send(404, b"not found", "text/plain", cors)
        if fail == "500": return self._send(500, b"error", "text/plain", cors)
        if fail == "html200": return self._send(200, b"<html>" + b"x" * 3000 + b"</html>", "text/html", cors)
        if fail == "drop_mid":
            self.send_response(200)
            for k, v in {**cors, "Content-Type": "audio/mpeg", "Content-Length": str(len(data))}.items(): self.send_header(k, v)
            self.end_headers(); self.wfile.write(data[: len(data) // 2]); self.wfile.flush()
            self.close_connection = True; self.connection.shutdown(2); return
        if rng and rng.startswith("bytes="):
            a, b = rng[6:].split("-"); s = int(a or 0); e = int(b) if b else len(data) - 1
            return self._send(206, data[s:e + 1], "audio/mpeg", {**cors, "Content-Range": f"bytes {s}-{e}/{len(data)}", "Accept-Ranges": "bytes"})
        return self._send(200, data, "audio/mpeg", {**cors, "Accept-Ranges": "bytes"})
    def _send(self, code, body, ct, extra):
        self.send_response(code); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body)))
        for k, v in extra.items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)


# Same rules as AudioDownloadProxy.isAllowed (Java).
EVERYAYAH_PATH = re.compile(r"^/data/[A-Za-z0-9_.-]+/\d{6}\.mp3$")
def proxy_allowed(url):
    if not url or len(url) > 300 or ".." in url or "\\" in url or "%" in url: return False
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or u.username or u.query or u.fragment or (u.port not in (None, 443)): return False
    return (u.hostname or "") == "everyayah.com" and bool(EVERYAYAH_PATH.match(u.path))


MIME = {".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".txt": "text/plain", ".css": "text/css",
        ".json": "application/json", ".webmanifest": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
        ".woff": "font/woff", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".ico": "image/x-icon"}


def make_shell(out_dir: Path, audio_port: int):
    class Shell(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *a): pass
        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path == "/__hifz-audio/fetch":
                return self.proxy(urllib.parse.parse_qs(parsed.query).get("u", [None])[0])
            path = parsed.path.lstrip("/")
            if path == "": path = "index.html"
            if path.endswith("/"): path += "index.html"
            elif "." not in path.rsplit("/", 1)[-1]: path += ".html"
            if ".." in path or "\\" in path: return self.send(404, b"Not Found", "text/plain")
            f = out_dir / path
            if not f.is_file(): return self.send(404, b"Not Found", "text/plain")
            self.send(200, f.read_bytes(), MIME.get(f.suffix, "application/octet-stream"), {"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"})
        def proxy(self, target):
            log({"host": "shell-proxy", "path": target or "", "range": None})
            if not proxy_allowed(target): return self.send(403, b"", "text/plain")
            # Native download (no CORS involved), like HttpURLConnection in AudioDownloadProxy.fetch.
            ctx = ssl._create_unverified_context()
            try:
                c = http.client.HTTPSConnection("127.0.0.1", audio_port, context=ctx, timeout=30)
                c.request("GET", urllib.parse.urlsplit(target).path, headers={"Host": "everyayah.com", "Accept-Encoding": "identity", "User-Agent": "HifzJourney-Android"})
                r = c.getresponse()
                if r.status != 200: r.read(); return self.send(r.status if 400 <= r.status <= 599 else 502, b"", "text/plain")
                length = r.getheader("Content-Length")
                body = r.read()  # raises IncompleteRead on a dropped connection, like CheckedStream
            except Exception:
                return self.send(502, b"", "text/plain")
            self.send(200, body, (r.getheader("Content-Type") or "application/octet-stream").split(";")[0], {"Cache-Control": "no-store"})
        def send(self, code, body, ct, extra=None):
            self.send_response(code); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body)))
            for k, v in (extra or {}).items(): self.send_header(k, v)
            self.end_headers(); self.wfile.write(body)
    return Shell


def tls_context(tmp: Path, hosts):
    cert, key = tmp / "cert.pem", tmp / "key.pem"
    san = ",".join(f"DNS:{h}" for h in hosts)
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key), "-out", str(cert), "-days", "2",
                    "-subj", f"/CN={hosts[0]}", "-addext", f"subjectAltName={san}"], check=True, capture_output=True)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(cert, key); return ctx


def serve(handler, port, ctx=None):
    s = ThreadingHTTPServer(("127.0.0.1", port), handler)
    s.handle_error = lambda *a: None
    if ctx: s.socket = ctx.wrap_socket(s.socket, server_side=True)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s
