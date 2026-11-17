# Local Quran speech server

Runs the Quran-trained speech model `tarteel-ai/whisper-base-ar-quran` (Apache-2.0, revision `5c3c53f`)
on this computer for the app's **Recite → Live recitation** screen.

- Audio is sent only to this server and processed in memory. It is never written to disk or logged.
- It listens on `127.0.0.1:8765` (this computer only) by default.
- If it is not running, the app falls back to browser/phone speech recognition (generic Arabic).

## Start / stop

```powershell
cd "C:\Users\sajid\Downloads\QURAN COMPANION\hifz-app"
powershell -ExecutionPolicy Bypass -File speech-server\start.ps1
```

Wait for `Quran speech server listening on http://127.0.0.1:8765`. **Stop:** press `Ctrl+C` or close the window.
Check it: open http://127.0.0.1:8765/health.

## Files

| Path | What |
|---|---|
| `server.py` | HTTP server: `GET /health`, `POST /transcribe` (16 kHz mono PCM16, max 28 s) |
| `start.ps1` | Start script (`-Port 8765`, `-Lan` to listen on the network — trusted networks only) |
| `model/` | Original model files from Hugging Face (PyTorch, 290 MB) |
| `model-ct2/` | Same weights converted to CTranslate2 int8 (76 MB), used by default (about 3x faster on CPU) |
| `.venv/` | Python 3.12 environment |

## Rebuild from scratch

```powershell
winget install -e --id Python.Python.3.12 --scope user
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv speech-server\.venv
speech-server\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
speech-server\.venv\Scripts\python.exe -m pip install transformers==4.46.3 ctranslate2==4.5.0 numpy psutil huggingface_hub
speech-server\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('tarteel-ai/whisper-base-ar-quran', revision='5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c', local_dir='speech-server/model', allow_patterns=['*.json','merges.txt','pytorch_model.bin','README.md'])"
speech-server\.venv\Scripts\ct2-transformers-converter.exe --model speech-server\model --output_dir speech-server\model-ct2 --quantization int8 --copy_files tokenizer_config.json vocab.json merges.txt added_tokens.json special_tokens_map.json normalizer.json preprocessor_config.json
```

`soundfile` in `requirements.txt` is only used by the test scripts (decoding MP3 test audio).

## Configuration

| Variable | Default |
|---|---|
| `QURAN_ASR_HOST` | `127.0.0.1` |
| `QURAN_ASR_PORT` | `8765` |
| `QURAN_ASR_THREADS` | `min(8, CPU count)` |
| `QURAN_ASR_ORIGINS` | extra allowed browser origins, comma-separated |
| App: `NEXT_PUBLIC_QURAN_ASR_URL` | `http://127.0.0.1:8765` (also changeable in the Recite settings panel) |

No API keys are involved. If a hosted server is added later, put it behind HTTPS and keep any keys on the server.

## Limits

- Checks which words were recognized. It does **not** assess Tajweed, harakat or pronunciation.
- Tested on professional reciters (everyayah.com audio); accuracy for students reciting from memory is not yet measured.
- CPU speed matters: about 0.8 s per audio piece when plugged in, 6–9 s on battery power on this laptop.
