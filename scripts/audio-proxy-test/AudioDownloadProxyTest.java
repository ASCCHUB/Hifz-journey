package com.hifzcompanion;

import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Off-device tests for AudioDownloadProxy (the Android native download path for automatic offline audio).
 * Run by scripts/test-audio-proxy.mjs: compiles this file with the real AudioDownloadProxy.java and runs it.
 * A local HTTP server stands in for everyayah.com; the Opener maps the https URL onto it.
 */
public class AudioDownloadProxyTest {
    static int passed = 0, failed = 0;
    static void check(String name, boolean ok) { if (ok) { passed++; System.out.println("ok   " + name); } else { failed++; System.out.println("FAIL " + name); } }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int n;
        while ((n = in.read(b)) != -1) o.write(b, 0, n);
        in.close(); return o.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        // ---- allow-list
        check("allows everyayah ayah URL", AudioDownloadProxy.isAllowed("https://everyayah.com/data/Alafasy_128kbps/001001.mp3"));
        check("allows reciter with dash", AudioDownloadProxy.isAllowed("https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps/114006.mp3"));
        String[] bad = {
            "http://everyayah.com/data/Alafasy_128kbps/001001.mp3", // not https
            "https://evil.com/data/Alafasy_128kbps/001001.mp3",
            "https://everyayah.com.evil.com/data/A/001001.mp3",
            "https://everyayah.com/data/Alafasy_128kbps/../../etc/passwd",
            "https://everyayah.com/data/Alafasy_128kbps/001001.mp3?x=1",
            "https://everyayah.com/data/Alafasy_128kbps/001001.mp3#f",
            "https://user@everyayah.com/data/Alafasy_128kbps/001001.mp3",
            "https://everyayah.com:8443/data/Alafasy_128kbps/001001.mp3",
            "https://everyayah.com/data/Alafasy_128kbps/1001.mp3",
            "https://everyayah.com/data/Alafasy_128kbps/001001.mp3.exe",
            "https://everyayah.com/index.html",
            "https://everyayah.com/data/A%2F..%2F/001001.mp3",
            "file:///data/data/com.hifzcompanion/shared_prefs/x.xml",
            "javascript:alert(1)", "", null,
        };
        boolean allRejected = true;
        for (String u : bad) if (AudioDownloadProxy.isAllowed(u)) { allRejected = false; System.out.println("  wrongly allowed: " + u); }
        check("rejects non-https, other hosts, traversal, query, userinfo, ports, other paths, file:, javascript:, null", allRejected);
        check("fetch refuses a disallowed URL with 403 and no network", AudioDownloadProxy.fetch("https://evil.com/x.mp3", u -> { throw new IOException("must not connect"); }).status == 403);

        // ---- local stand-in for everyayah.com
        byte[] mp3 = new byte[64000]; mp3[0] = 0x49; mp3[1] = 0x44; mp3[2] = 0x33; for (int i = 3; i < mp3.length; i++) mp3[i] = (byte) (i * 7);
        AtomicReference<String> mode = new AtomicReference<>("ok");
        List<String> seenRange = new ArrayList<>();
        HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.createContext("/", ex -> {
            seenRange.add(String.valueOf(ex.getRequestHeaders().getFirst("Range")));
            String m = mode.get();
            if (m.equals("500")) { ex.sendResponseHeaders(500, -1); ex.close(); return; }
            if (m.equals("redirect-ok")) { mode.set("ok"); ex.getResponseHeaders().add("Location", "https://everyayah.com/data/Other_64kbps/001001.mp3"); ex.sendResponseHeaders(302, -1); ex.close(); return; }
            if (m.equals("redirect-evil")) { ex.getResponseHeaders().add("Location", "https://evil.com/steal.mp3"); ex.sendResponseHeaders(302, -1); ex.close(); return; }
            ex.getResponseHeaders().add("Content-Type", "audio/mpeg");
            if (m.equals("truncated")) {
                ex.sendResponseHeaders(200, mp3.length);
                OutputStream o = ex.getResponseBody(); o.write(mp3, 0, mp3.length / 2); o.flush();
                ex.getHttpContext().getServer(); // abrupt close below
                ex.close(); return;
            }
            ex.sendResponseHeaders(200, mp3.length);
            try (OutputStream o = ex.getResponseBody()) { o.write(mp3); }
        });
        srv.start();
        int port = srv.getAddress().getPort();
        AudioDownloadProxy.Opener local = u -> (HttpURLConnection) new URL("http://127.0.0.1:" + port + u.getPath()).openConnection();
        String good = "https://everyayah.com/data/Alafasy_128kbps/001001.mp3";

        AudioDownloadProxy.Result r = AudioDownloadProxy.fetch(good, local);
        byte[] got = readAll(r.body);
        check("200: complete bytes, audio/mpeg, Content-Length passed on", r.status == 200 && "audio/mpeg".equals(r.mimeType) && r.length == mp3.length && java.util.Arrays.equals(got, mp3));
        check("never sends a Range header", seenRange.stream().allMatch(h -> h.equals("null")));

        mode.set("500");
        r = AudioDownloadProxy.fetch(good, local);
        check("upstream 500 is reported as 500 with empty body", r.status == 500 && readAll(r.body).length == 0);

        mode.set("redirect-ok");
        r = AudioDownloadProxy.fetch(good, local);
        check("redirect to another allow-listed Ayah URL is followed", r.status == 200 && readAll(r.body).length == mp3.length);

        mode.set("redirect-evil");
        r = AudioDownloadProxy.fetch(good, local);
        check("redirect to a non-allow-listed host is refused (502)", r.status == 502);

        mode.set("truncated");
        r = AudioDownloadProxy.fetch(good, local);
        boolean threw = false;
        try { readAll(r.body); } catch (IOException e) { threw = true; }
        check("a short/interrupted body raises an error instead of looking complete", threw);

        AudioDownloadProxy.Result down = AudioDownloadProxy.fetch(good, u -> (HttpURLConnection) new URL("http://127.0.0.1:1/x").openConnection());
        check("network failure becomes 502, never an exception", down.status == 502);

        srv.stop(0);
        System.out.println(passed + " passed, " + failed + " failed");
        System.exit(failed == 0 ? 0 : 1);
    }
}
