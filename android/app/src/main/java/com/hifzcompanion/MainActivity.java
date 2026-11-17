package com.hifzcompanion;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Arrays;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String APP_HOST = "appassets.androidplatform.net";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 93, 75));
        getWindow().setNavigationBarColor(Color.rgb(11, 21, 19));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(246, 240, 227));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true); // only used when the learner taps "Use my current location"
        webView.addJavascriptInterface(new SpeechBridge(), "AndroidSpeech");
        webView.addJavascriptInterface(new AppInfoBridge(), "AndroidApp");
        webView.addJavascriptInterface(new ReminderBridge(), "AndroidReminder");
        webView.addJavascriptInterface(new TtsBridge(), "AndroidTTS");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { request.deny(); return; }
                    if (hasMic()) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    else { pendingWebPermission = request; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST); }
                });
            }

            // Prayer location (Settings → Use my current location): coarse location, asked only when the page requests
            // it after a tap. Denial is reported to the page, which then keeps manual city selection.
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
                if (!("https://" + APP_HOST).equals(origin) && !(("https://" + APP_HOST + "/").equals(origin))) { callback.invoke(origin, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) { callback.invoke(origin, true, false); return; }
                pendingGeoOrigin = origin; pendingGeoCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, GEO_REQUEST);
            }

            // <input type="file"> (Reference PDF maps import): open the system picker. The chosen file is read by the
            // WebView only; nothing is uploaded. Without this, file inputs do nothing inside a WebView.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!APP_HOST.equals(request.getUrl().getHost())) return super.shouldInterceptRequest(view, request);
                if (AudioDownloadProxy.PATH.equals(request.getUrl().getPath())) return audioDownload(request);
                return serveAsset(request.getUrl().getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.setVisibility(View.VISIBLE);
            }
        });
        // targetSdk 35: Android 15 draws apps edge-to-edge, so the page went under the status and gesture bars.
        // Pad a container by the system-bar, cutout and keyboard insets; its background colours the bars.
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 93, 75));
        root.addView(webView, new android.widget.FrameLayout.LayoutParams(-1, -1));
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout() | android.view.WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return android.view.WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        webView.loadUrl("https://" + APP_HOST + startPath(getIntent()));
        ReminderReceiver.schedule(this); // keep the daily alarm armed whenever the app opens
    }

    /** A notification tap carries the page to open; only simple in-app paths are accepted. */
    private static String startPath(Intent intent) {
        String p = intent == null ? null : intent.getStringExtra("path");
        // Only simple in-app paths, optionally with one lowercase query parameter (e.g. /checkin?kind=rev).
        return p != null && p.matches("/[a-z-]*(\\?[a-z]+=[a-z0-9-]+)?") ? p : "/";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String p = startPath(intent);
        if (webView != null && !"/".equals(p)) webView.loadUrl("https://" + APP_HOST + p);
    }

    // ---- Hifz & revision reminder bridge (see ReminderReceiver) ----
    private static final int NOTIFY_REQUEST = 43;

    private class ReminderBridge {
        /** Legacy single reminder (older web bundles): maps onto the Hifz reminder. */
        @JavascriptInterface
        public void configure(boolean enabled, int hour, int minute) {
            ReminderReceiver.prefs(MainActivity.this).edit().putBoolean("enabled", enabled)
                .putInt("hifzMin", Math.max(0, Math.min(23, hour)) * 60 + Math.max(0, Math.min(59, minute))).apply();
            ReminderReceiver.schedule(MainActivity.this);
            if (enabled) askPermission();
        }

        /** Full preferences as JSON: {on,hifzOn,hifzMin,revOn,revMin,days(bitmask),followUp,maxFollow,quietStart,quietEnd,sound}. */
        @JavascriptInterface
        public void setup(String json) {
            try {
                JSONObject o = new JSONObject(json);
                boolean on = o.optBoolean("on", false);
                ReminderReceiver.prefs(MainActivity.this).edit()
                    .putBoolean("enabled", on)
                    .putBoolean("hifzOn", o.optBoolean("hifzOn", true))
                    .putInt("hifzMin", clamp(o.optInt("hifzMin", 1200), 0, 1439))
                    .putBoolean("revOn", o.optBoolean("revOn", true))
                    .putInt("revMin", clamp(o.optInt("revMin", 360), 0, 1439))
                    .putInt("days", clamp(o.optInt("days", 0x7F), 0, 0x7F))
                    .putInt("followUp", clamp(o.optInt("followUp", 60), 15, 480))
                    .putInt("maxFollow", clamp(o.optInt("maxFollow", 2), 0, 5))
                    .putInt("quietStart", clamp(o.optInt("quietStart", -1), -1, 1439))
                    .putInt("quietEnd", clamp(o.optInt("quietEnd", -1), -1, 1439))
                    .putString("sound", "silent".equals(o.optString("sound")) ? "silent" : "default")
                    .apply();
                ReminderReceiver.schedule(MainActivity.this);
                if (on) askPermission();
            } catch (Exception ignored) { }
        }

        /** Older bundles: window end and repeat interval are no longer used (replaced by follow-ups). */
        @JavascriptInterface
        public void window(int endHour, int endMinute, int everyMinutes) { }

        /** Legacy combined status: applied to both activities. */
        @JavascriptInterface
        public void report(long day, boolean done, String summary) {
            status(day, "hifz", done ? "done" : "todo", summary);
            status(day, "rev", done ? "done" : "todo", summary);
        }

        /** Today's state of one activity from the planner: "none" | "todo" | "done", and a summary of real tasks. */
        @JavascriptInterface
        public void status(long day, String kind, String state, String summary) {
            if (!"hifz".equals(kind) && !"rev".equals(kind)) return;
            if (!"none".equals(state) && !"todo".equals(state) && !"done".equals(state)) return;
            ReminderReceiver.prefs(MainActivity.this).edit()
                .putLong(kind + "StateDay", day).putString(kind + "State", state)
                .putString(kind + "Summary", summary == null ? "" : summary.length() > 200 ? summary.substring(0, 200) : summary)
                .apply();
            if ("done".equals(state)) {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(ReminderReceiver.notifId(kind)); // completed in the app: withdraw the reminder
            }
        }

        /** A check-in answered inside the app (same rules as the notification buttons). */
        @JavascriptInterface
        public void answer(String kind, String answer) {
            if (("hifz".equals(kind) || "rev".equals(kind)) && answer != null) {
                ReminderReceiver.respond(MainActivity.this, kind, answer);
                ReminderReceiver.schedule(MainActivity.this);
            }
        }

        /** Notification-button answers not yet read by the web app (JSON array); clears the queue. */
        @JavascriptInterface
        public String responses() {
            SharedPreferences p = ReminderReceiver.prefs(MainActivity.this);
            String r = p.getString("responses", "[]");
            p.edit().putString("responses", "[]").apply();
            return r;
        }

        @JavascriptInterface
        public boolean permitted() {
            return android.os.Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        /** Show a sample right now so the user can check it works. */
        @JavascriptInterface
        public void test() { ReminderReceiver.test(MainActivity.this, "hifz", false); }

        @JavascriptInterface
        public void testKind(String kind, boolean followUp) { ReminderReceiver.test(MainActivity.this, "rev".equals(kind) ? "rev" : "hifz", followUp); }
    }

    private static int clamp(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }

    private void askPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFY_REQUEST));
        }
    }

    private WebResourceResponse serveAsset(String requestPath) {
        String path = requestPath == null ? "/" : requestPath;
        while (path.startsWith("/")) path = path.substring(1);
        // Android's asset merger filters underscore-prefixed directories, so the build script
        // stores Next's static bundle under "next" and we translate its public URL here.
        if (path.startsWith("_next/")) path = "next/" + path.substring(6);
        if (path.isEmpty()) path = "index.html";
        if (path.endsWith("/")) path += "index.html";
        else if (!path.substring(path.lastIndexOf('/') + 1).contains(".")) path += ".html";
        if (path.contains("..") || path.contains("\\")) return notFound();
        try {
            String mime = mimeType(path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("public/" + path));
        } catch (IOException ignored) {
            return notFound();
        }
    }

    /**
     * Same-origin download of one allow-listed Ayah audio file for automatic offline saving (see
     * AudioDownloadProxy). Runs on the WebView's background thread. The page verifies and stores the bytes in its
     * own app-private cache; nothing is written to device storage here.
     */
    private WebResourceResponse audioDownload(WebResourceRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return new WebResourceResponse("text/plain", null, 405, "Method Not Allowed", new HashMap<>(), new java.io.ByteArrayInputStream(new byte[0]));
        }
        AudioDownloadProxy.Result r = AudioDownloadProxy.fetch(request.getUrl().getQueryParameter("u"), u -> (java.net.HttpURLConnection) u.openConnection());
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        if (r.length >= 0) headers.put("Content-Length", String.valueOf(r.length));
        return new WebResourceResponse(r.mimeType, null, r.status, r.reason, headers, r.body);
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), null);
    }

    private String mimeType(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".txt")) return "text/plain";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    // ---- Native speech recognition bridge (WebView has no working Web Speech API) ----
    private static final int MIC_REQUEST = 41;
    private static final int GEO_REQUEST = 44;
    private String pendingGeoOrigin;
    private android.webkit.GeolocationPermissions.Callback pendingGeoCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private PermissionRequest pendingWebPermission;
    private boolean wantSpeech = false;
    private String speechLang = "ar-SA";

    private boolean hasMic() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void emit(String type, String text, double confidence) {
        if (webView == null) return;
        String js = "window.__androidSpeech&&window.__androidSpeech(" + JSONObject.quote(type) + "," + JSONObject.quote(text == null ? "" : text) + "," + confidence + ")";
        webView.evaluateJavascript(js, null);
    }

    private void beginListening() {
        if (!wantSpeech) { emit("end", "", -1); return; }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override public void onPartialResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) emit("partial", r.get(0), -1);
                }

                @Override public void onResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    float[] c = b.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                    if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) emit("final", r.get(0), c != null && c.length > 0 ? c[0] : -1);
                    restartOrEnd(80);
                }

                @Override public void onError(int error) {
                    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) fatal("not-allowed");
                    else if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || error == SpeechRecognizer.ERROR_SERVER) fatal("network");
                    else if (error == SpeechRecognizer.ERROR_AUDIO) fatal("audio-capture");
                    else if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) fatal("language-not-supported");
                    else {
                        // No match / silence timeout / busy: keep listening while the user recites.
                        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY && recognizer != null) recognizer.cancel();
                        restartOrEnd(250);
                    }
                }
            });
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, speechLang);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, speechLang);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        try {
            recognizer.startListening(intent);
        } catch (RuntimeException e) {
            fatal("audio-capture");
        }
    }

    private void restartOrEnd(long delay) {
        handler.postDelayed(() -> {
            if (wantSpeech) beginListening();
            else emit("end", "", -1);
        }, delay);
    }

    private void fatal(String code) {
        wantSpeech = false;
        emit("error", code, -1);
        emit("end", "", -1);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == GEO_REQUEST) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (pendingGeoCallback != null) pendingGeoCallback.invoke(pendingGeoOrigin, ok, false);
            pendingGeoCallback = null; pendingGeoOrigin = null;
            return;
        }
        if (requestCode != MIC_REQUEST) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingWebPermission != null) {
            if (granted) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        }
        if (wantSpeech) {
            if (granted) beginListening();
            else fatal("not-allowed");
        }
    }

    /** Read-only app identity for "About this build" (native wrapper version; the frontend ID comes from build-info.json). */
    private class AppInfoBridge {
        @JavascriptInterface
        public String versionName() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "unknown"; }
        }

        /** 1 = this build answers /__hifz-audio/fetch (native download for automatic offline audio). */
        @JavascriptInterface
        public int audioProxyVersion() { return 1; }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public long versionCode() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; } catch (Exception e) { return -1; }
        }
    }

    private class SpeechBridge {
        @JavascriptInterface
        public boolean available() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void start(String lang) {
            runOnUiThread(() -> {
                if (lang != null && !lang.isEmpty()) speechLang = lang;
                wantSpeech = true;
                if (!hasMic()) requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                else beginListening();
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(() -> {
                wantSpeech = false;
                if (recognizer != null) recognizer.stopListening();
                else emit("end", "", -1);
            });
        }
    }


    // ---- Urdu translation audio: Android TextToSpeech (the WebView has no usable speechSynthesis) ----
    // Only an Urdu voice is ever used; when none is installed the page is told "no-urdu" and shows a message.
    private android.speech.tts.TextToSpeech tts;
    private volatile String ttsState = "idle"; // idle | pending | ok | no-urdu | no-engine
    private volatile String ttsVoice = "";

    private void emitTts(String type) {
        runOnUiThread(() -> { if (webView != null) webView.evaluateJavascript("window.__androidTts&&window.__androidTts(" + JSONObject.quote(type) + ")", null); });
    }

    private void initTts() {
        if (tts != null) return;
        ttsState = "pending";
        tts = new android.speech.tts.TextToSpeech(this, status -> {
            if (status != android.speech.tts.TextToSpeech.SUCCESS) { ttsState = "no-engine"; return; }
            android.speech.tts.Voice best = null;
            try {
                java.util.Set<android.speech.tts.Voice> voices = tts.getVoices();
                if (voices != null) for (android.speech.tts.Voice v : voices) {
                    if (v.getLocale() == null || !"ur".equals(v.getLocale().getLanguage())) continue;
                    if (v.getFeatures() != null && v.getFeatures().contains(android.speech.tts.TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    if (best == null || (best.isNetworkConnectionRequired() && !v.isNetworkConnectionRequired())) best = v;
                }
            } catch (RuntimeException ignored) { }
            if (best != null && tts.setVoice(best) == android.speech.tts.TextToSpeech.SUCCESS) {
                ttsVoice = best.getName(); ttsState = "ok";
            } else {
                int r = tts.setLanguage(new Locale("ur", "PK"));
                if (r == android.speech.tts.TextToSpeech.LANG_MISSING_DATA || r == android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED) r = tts.setLanguage(new Locale("ur"));
                boolean urdu = r >= android.speech.tts.TextToSpeech.LANG_AVAILABLE && tts.getVoice() != null && tts.getVoice().getLocale() != null && "ur".equals(tts.getVoice().getLocale().getLanguage());
                ttsState = urdu ? "ok" : "no-urdu";
                ttsVoice = urdu ? tts.getVoice().getName() : "";
            }
            tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                @Override public void onStart(String id) { emitTts("start"); }
                @Override public void onDone(String id) { emitTts("end"); }
                @Override @SuppressWarnings("deprecation") public void onError(String id) { emitTts("error"); }
                @Override public void onStop(String id, boolean interrupted) { emitTts("stop"); }
            });
        });
    }

    private class TtsBridge {
        /** {"state": "pending"|"ok"|"no-urdu"|"no-engine", "voice": name}. The first call starts the engine. */
        @JavascriptInterface
        public String status() {
            runOnUiThread(MainActivity.this::initTts);
            try { return new JSONObject().put("state", "idle".equals(ttsState) ? "pending" : ttsState).put("voice", ttsVoice).toString(); }
            catch (Exception e) { return "{\"state\":\"error\"}"; }
        }

        @JavascriptInterface
        public boolean speak(String text) {
            if (!"ok".equals(ttsState) || tts == null || text == null || text.trim().isEmpty()) return false;
            return tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "urdu-translation") == android.speech.tts.TextToSpeech.SUCCESS;
        }

        @JavascriptInterface
        public void stop() { if (tts != null) tts.stop(); }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tts != null && tts.isSpeaking()) tts.stop(); // leaving the app ends translation audio
        if (wantSpeech) {
            wantSpeech = false;
            if (recognizer != null) recognizer.cancel();
            emit("end", "", -1);
        }
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    private static final int FILE_REQUEST = 42;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_REQUEST || fileCallback == null) return;
        fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
