# Starts the local Quran speech-recognition server (Ctrl+C or close this window to stop).
# Usage:  powershell -ExecutionPolicy Bypass -File speech-server\start.ps1
# Phone on the same Wi-Fi:  add -Lan  (listens on all interfaces; only use on a trusted network)
param([switch]$Lan, [int]$Port = 8765)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $here ".venv\Scripts\python.exe"
if (!(Test-Path $py)) { throw "Python environment missing. See speech-server\README.md for setup." }
$env:QURAN_ASR_PORT = "$Port"
if ($Lan) { $env:QURAN_ASR_HOST = "0.0.0.0" }
& $py (Join-Path $here "server.py")
