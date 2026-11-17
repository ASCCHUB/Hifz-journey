"""Local Quran speech-recognition server for Hifz Companion.

Model: tarteel-ai/whisper-base-ar-quran (Apache-2.0), pinned revision 5c3c53f, from Hugging Face.
Runs with CTranslate2 int8 (speech-server/model-ct2) when converted, else PyTorch (speech-server/model).
The app sends short 16 kHz mono PCM16 chunks; the server returns the Arabic transcript.
Audio is processed in memory only and is never written to disk or logged.

Start:  powershell -ExecutionPolicy Bypass -File speech-server\\start.ps1
Stop:   Ctrl+C (or close the window)
Env:    QURAN_ASR_HOST (127.0.0.1), QURAN_ASR_PORT (8765), QURAN_ASR_THREADS (8),
        QURAN_ASR_ORIGINS (comma-separated extra allowed browser origins)
"""
import json
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import psutil
from transformers import WhisperProcessor

HERE = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("QURAN_ASR_HOST", "127.0.0.1")
PORT = int(os.environ.get("QURAN_ASR_PORT", "8765"))
THREADS = int(os.environ.get("QURAN_ASR_THREADS", str(min(8, os.cpu_count() or 4))))
CT2_DIR, PT_DIR = os.path.join(HERE, "model-ct2"), os.path.join(HERE, "model")
MODEL_NAME = "tarteel-ai/whisper-base-ar-quran@5c3c53f"
ALLOWED_ORIGINS = {
    "http://localhost:3000", "http://localhost:3001", "http://localhost:3002",
    "http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3002",
    "https://appassets.androidplatform.net",
} | {o.strip() for o in os.environ.get("QURAN_ASR_ORIGINS", "").split(",") if o.strip()}
SAMPLE_RATE = 16000
MAX_SECONDS = 28  # Whisper's window is 30 s

print(f"Loading {MODEL_NAME} ...", flush=True)
t0 = time.time()
if os.path.isfile(os.path.join(CT2_DIR, "model.bin")):
    import ctranslate2
    ENGINE = "ctranslate2-int8"
    processor = WhisperProcessor.from_pretrained(CT2_DIR)
    ct2 = ctranslate2.models.Whisper(CT2_DIR, device="cpu", compute_type="int8", intra_threads=THREADS)
    PROMPT = processor.tokenizer.convert_tokens_to_ids(["<|startoftranscript|>", "<|ar|>", "<|transcribe|>", "<|notimestamps|>"])
else:
    import torch
    from transformers import WhisperForConditionalGeneration
    ENGINE = "pytorch-fp32"
    torch.set_num_threads(THREADS)
    processor = WhisperProcessor.from_pretrained(PT_DIR)
    pt = WhisperForConditionalGeneration.from_pretrained(PT_DIR).eval()
    # The model's 2022 generation config predates `language=`; force Arabic via decoder prompt ids.
    FORCED_IDS = processor.get_decoder_prompt_ids(language="arabic", task="transcribe")
    pt.generation_config.forced_decoder_ids = None
    pt.config.forced_decoder_ids = None
print(f"Model ready in {time.time() - t0:.1f}s ({ENGINE}, {THREADS} threads)", flush=True)

lock = threading.Lock()  # one inference at a time keeps latency predictable on CPU
proc = psutil.Process()
stats = {"requests": 0, "audio_seconds": 0.0, "compute_seconds": 0.0}


def run_model(audio: np.ndarray) -> tuple[str, float | None]:
    if ENGINE.startswith("ctranslate2"):
        feats = ctranslate2.StorageView.from_array(processor(audio, sampling_rate=SAMPLE_RATE, return_tensors="np").input_features)
        r = ct2.generate(feats, [PROMPT], beam_size=1, max_length=200, return_scores=True, suppress_blank=True)[0]
        text = processor.decode(r.sequences_ids[0], skip_special_tokens=True)
        conf = math.exp(r.scores[0]) if r.scores else None  # average token log-prob -> probability
        return text, conf
    feats = processor(audio, sampling_rate=SAMPLE_RATE, return_tensors="pt").input_features
    with torch.inference_mode():
        out = pt.generate(feats, forced_decoder_ids=FORCED_IDS, max_new_tokens=200, return_dict_in_generate=True, output_scores=True)
    text = processor.batch_decode(out.sequences, skip_special_tokens=True)[0]
    try:
        conf = float(torch.exp(pt.compute_transition_scores(out.sequences, out.scores, normalize_logits=True)[0]).mean())
    except Exception:
        conf = None
    return text, conf


def collapse_loops(text: str) -> str:
    """Whisper sometimes loops on one word ("سبع سبع سبع سبع"). No word occurs three times in a row in the
    Quran, so a run of 3+ identical words is a decoding loop: keep one copy (and drop a cut-off tail word)."""
    words, out = text.split(), []
    i = 0
    while i < len(words):
        j = i
        while j + 1 < len(words) and words[j + 1] == words[i]:
            j += 1
        out.extend(words[i:i + (1 if j - i >= 2 else j - i + 1)])
        i = j + 1
    # A loop usually ends in a truncated fragment of the same word; drop it.
    if len(words) != len(out) and len(out) >= 2 and out[-2].startswith(out[-1]):
        out.pop()
    return " ".join(out)


def transcribe(pcm: np.ndarray) -> dict:
    audio = pcm.astype(np.float32) / 32768.0
    seconds = len(audio) / SAMPLE_RATE
    if seconds < 0.3:
        return {"text": "", "seconds": round(seconds, 2), "ms": 0, "skipped": "too-short"}
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < 0.004:  # near silence: Whisper tends to invent text on silence
        return {"text": "", "seconds": round(seconds, 2), "ms": 0, "skipped": "silence", "rms": round(rms, 4)}
    audio = audio[: MAX_SECONDS * SAMPLE_RATE]
    with lock:
        start = time.perf_counter()
        text, conf = run_model(audio)
        ms = (time.perf_counter() - start) * 1000
    stats["requests"] += 1
    stats["audio_seconds"] = round(stats["audio_seconds"] + seconds, 2)
    stats["compute_seconds"] = round(stats["compute_seconds"] + ms / 1000, 2)
    # `confidence` is the recognizer's own certainty about the words it output. It is NOT a measure of
    # whether the recitation was correct.
    return {"text": collapse_loops(text.strip()), "seconds": round(seconds, 2), "ms": round(ms),
            "confidence": None if conf is None else round(conf, 3), "rms": round(rms, 4)}


class Handler(BaseHTTPRequestHandler):
    server_version = "QuranASR/1.0"

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._json(200, {
                "ok": True, "model": MODEL_NAME, "license": "apache-2.0", "engine": ENGINE, "threads": THREADS,
                "rss_mb": round(proc.memory_info().rss / 2**20), "cpu_percent": proc.cpu_percent(interval=None), **stats,
            })
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/transcribe"):
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_SECONDS * SAMPLE_RATE * 2 + 1024:
            return self._json(413, {"error": "audio must be 16 kHz mono PCM16, at most 28 s"})
        body = self.rfile.read(length)
        try:
            pcm = np.frombuffer(body[: len(body) // 2 * 2], dtype="<i2")
            self._json(200, transcribe(pcm))
        except Exception as exc:  # report, never crash the server
            self._json(500, {"error": str(exc)})

    def log_message(self, fmt, *args):
        pass  # no request logging: nothing about the user's audio is written anywhere


if __name__ == "__main__":
    print(f"Quran speech server listening on http://{HOST}:{PORT}  (Ctrl+C to stop)", flush=True)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")
