package com.hifzcompanion;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Native download path for Ayah audio, used by the web app's automatic offline saving (src/lib/audioCache.ts).
 *
 * Why: the WebView page (https://appassets.androidplatform.net) can play everyayah.com audio, but it can only
 * READ the bytes (to verify and save a complete file) if everyayah.com sends CORS headers. MainActivity answers
 * the same-origin request GET /__hifz-audio/fetch?u=<audio URL> with this class instead.
 *
 * Deliberately narrow:
 *  - only https URLs on an allow-listed host with an Ayah-shaped path (everyayah.com/data/<reciter>/SSSAAA.mp3,
 *    plus licensed Urdu recording hosts once configured); redirects are followed only to allow-listed URLs;
 *  - GET only, no cookies or credentials, no Range header, identity encoding;
 *  - size-capped, time-limited, and never written to disk here: the page validates the bytes and stores them in
 *    its own app-private CacheStorage;
 *  - reachable only from pages loaded in this app's WebView (shouldInterceptRequest), not by other apps.
 * Pure Java (no android.* imports) so it can be unit-tested off-device.
 */
final class AudioDownloadProxy {
    static final String PATH = "/__hifz-audio/fetch";
    static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;

    /** Hosts of licensed, Ayah-verified Urdu translation recordings (see src/lib/audioSources.ts). Empty on purpose. */
    private static final String[] URDU_AUDIO_HOSTS = {"cdn.islamic.network"};

    private static final Pattern EVERYAYAH_PATH = Pattern.compile("^/data/[A-Za-z0-9_.-]+/\\d{6}\\.mp3$");
    private static final Pattern URDU_PATH = Pattern.compile("^/quran/audio/(32|40|48|64|128|192)/ur\\.khan/[1-9][0-9]{0,3}\\.mp3$");

    interface Opener { HttpURLConnection open(URL url) throws IOException; }

    static final class Result {
        final int status; final String reason; final String mimeType; final long length; final InputStream body;
        Result(int status, String reason, String mimeType, long length, InputStream body) {
            this.status = status; this.reason = reason; this.mimeType = mimeType; this.length = length; this.body = body;
        }
    }

    private AudioDownloadProxy() { }

    /** True only for an https Ayah audio URL on an allow-listed host. */
    static boolean isAllowed(String url) {
        if (url == null || url.length() > 300 || url.contains("..") || url.contains("\\") || url.contains("%")) return false;
        URI u;
        try { u = new URI(url); } catch (Exception e) { return false; }
        if (!"https".equals(u.getScheme()) || u.getRawUserInfo() != null || u.getRawQuery() != null || u.getRawFragment() != null) return false;
        if (u.getPort() != -1 && u.getPort() != 443) return false;
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        String path = u.getRawPath() == null ? "" : u.getRawPath();
        if ("everyayah.com".equals(host)) return EVERYAYAH_PATH.matcher(path).matches();
        for (String h : URDU_AUDIO_HOSTS) if (h.equals(host)) return URDU_PATH.matcher(path).matches();
        return false;
    }

    private static Result error(int status, String reason) {
        return new Result(status, reason, "text/plain", 0, new ByteArrayInputStream(new byte[0]));
    }

    /** Download `url` (must pass isAllowed). Never throws; failures become an HTTP-style status for the page. */
    static Result fetch(String url, Opener opener) {
        if (!isAllowed(url)) return error(403, "Forbidden");
        String current = url;
        try {
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                HttpURLConnection c = opener.open(new URL(current));
                c.setInstanceFollowRedirects(false);
                c.setUseCaches(false);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestMethod("GET");
                c.setRequestProperty("Accept-Encoding", "identity");
                c.setRequestProperty("User-Agent", "HifzJourney-Android");
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) return error(502, "Bad Gateway");
                    String next = new URL(new URL(current), loc).toString();
                    if (!isAllowed(next)) return error(502, "Bad Gateway");
                    current = next;
                    continue;
                }
                if (code != 200) {
                    c.disconnect();
                    // WebResourceResponse accepts 100-599 except 3xx.
                    return code >= 400 && code <= 599 ? error(code, "Upstream " + code) : error(502, "Bad Gateway");
                }
                long length = c.getContentLengthLong();
                if (length > MAX_BYTES) { c.disconnect(); return error(413, "Too Large"); }
                String type = c.getContentType();
                String mime = type == null ? "application/octet-stream" : type.split(";")[0].trim().toLowerCase(Locale.ROOT);
                if (mime.isEmpty()) mime = "application/octet-stream";
                return new Result(200, "OK", mime, length, new CheckedStream(c.getInputStream(), length, c));
            }
            return error(502, "Bad Gateway");
        } catch (Exception e) {
            return error(502, "Bad Gateway");
        }
    }

    /** Caps the size and turns a short body into an error, so a truncated file can never look complete. */
    static final class CheckedStream extends FilterInputStream {
        private final long expected; private final HttpURLConnection conn; private long count;
        CheckedStream(InputStream in, long expected, HttpURLConnection conn) { super(in); this.expected = expected; this.conn = conn; }
        private int check(int n) throws IOException {
            if (n > 0) { count += n; if (count > MAX_BYTES) throw new IOException("audio too large"); }
            else if (n < 0 && expected >= 0 && count != expected) throw new IOException("audio truncated: " + count + " of " + expected);
            return n;
        }
        @Override public int read() throws IOException { int b = super.read(); if (b >= 0) check(1); else check(-1); return b; }
        @Override public int read(byte[] buf, int off, int len) throws IOException { return check(super.read(buf, off, len)); }
        @Override public void close() throws IOException { try { super.close(); } finally { if (conn != null) conn.disconnect(); } }
    }
}
