$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$androidDir = Join-Path $projectRoot "android"
$webOut = Join-Path $projectRoot "out"
$assetDir = Join-Path $androidDir "app\src\main\assets\public"
$apk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"

if (!(Test-Path (Join-Path $sdk "platforms\android-36\android.jar"))) {
    throw "Android SDK platform 36 was not found at $sdk. Install it with Android Studio SDK Manager."
}
$gradle = Get-ChildItem (Join-Path $env:USERPROFILE ".gradle\wrapper\dists") -Recurse -Filter "gradle.bat" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*gradle-8.14.3*" } | Select-Object -First 1 -ExpandProperty FullName
if (!$gradle) { throw "Gradle 8.14.3 was not found in the local Gradle cache." }

$java = (Get-Command java -ErrorAction Stop).Source
$env:JAVA_HOME = Split-Path (Split-Path $java -Parent) -Parent
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:BUILD_ANDROID = "1"
$sdkProperty = $sdk.Replace("\", "/")
Set-Content -LiteralPath (Join-Path $androidDir "local.properties") -Value "sdk.dir=$sdkProperty" -Encoding ascii
# With output:"export", Next writes the static site into distDir when NEXT_DIST_DIR is set, otherwise into ./out.
# Never package a leftover export from an earlier build: remove it first, then verify the fresh one.
if ($env:NEXT_DIST_DIR) { $webOut = Join-Path $projectRoot $env:NEXT_DIST_DIR }
if (Test-Path -LiteralPath $webOut) { Remove-Item -LiteralPath $webOut -Recurse -Force }
$buildStarted = Get-Date
# ---- Build identity: one ID embedded in the JS bundle (NEXT_PUBLIC_BUILD_ID), recorded with a fingerprint of every
# exported file in build-info.json, used as the service-worker cache name, and verified inside the final APK.
$appVersion = (Get-Content (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
$stamp = $buildStarted.ToUniversalTime()
$buildId = "{0}-{1}" -f $stamp.ToString("yyyyMMdd-HHmm"), ([guid]::NewGuid().ToString("N").Substring(0, 6))
$builtAt = $stamp.ToString("yyyy-MM-ddTHH:mm:ssZ")
# Android versionCode must increase for in-place updates: minutes since 2024-01-01 UTC (fits in an int for decades).
$versionCode = [int][math]::Floor(($stamp - [datetime]::new(2024, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)).TotalMinutes)
$env:NEXT_PUBLIC_BUILD_ID = $buildId; $env:NEXT_PUBLIC_BUILD_TIME = $builtAt; $env:NEXT_PUBLIC_APP_VERSION = $appVersion
Write-Output "Building frontend $buildId (app $appVersion, versionCode $versionCode)"
Push-Location $projectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Next.js Android export failed with exit code $LASTEXITCODE." }
} finally {
    Remove-Item Env:BUILD_ANDROID -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_BUILD_ID, Env:NEXT_PUBLIC_BUILD_TIME, Env:NEXT_PUBLIC_APP_VERSION -ErrorAction SilentlyContinue
    Pop-Location
}

$index = Join-Path $webOut "index.html"
if (!(Test-Path $index)) { throw "Next.js did not create the static app at $webOut." }
if ((Get-Item $index).LastWriteTime -lt $buildStarted) { throw "The static app at $webOut is older than this build; refusing to package a stale export." }
foreach ($page in "learn.html", "recall.html", "assess.html", "memorize.html", "maps\manifest.json") {
    if (!(Test-Path (Join-Path $webOut $page))) { throw "The export is missing $page; refusing to package an incomplete app." }
}
foreach ($page in "mushaf.html", "recite.html", "mind-maps.html", "profile.html", "sw.js", "pdfjs\pdf.min.mjs", "pdfjs\pdf.worker.min.mjs") {
    if (!(Test-Path (Join-Path $webOut $page))) { throw "The export is missing $page; refusing to package an incomplete app." }
}
node (Join-Path $projectRoot "scripts/build-info.mjs") stamp $webOut $buildId $builtAt $appVersion
if ($LASTEXITCODE -ne 0) { throw "Build identity stamping failed; refusing to package." }
if (Test-Path -LiteralPath $assetDir) { Remove-Item -LiteralPath $assetDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
Copy-Item -Path (Join-Path $webOut "*") -Destination $assetDir -Recurse -Force
if (Test-Path (Join-Path $assetDir "_next")) {
    Move-Item -LiteralPath (Join-Path $assetDir "_next") -Destination (Join-Path $assetDir "next") -Force
}

$iconDir = Join-Path $androidDir "app\src\main\res\drawable-nodpi"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "public\icons\icon-192.png") -Destination (Join-Path $iconDir "ic_launcher.png") -Force

Push-Location $androidDir
try {
    & $gradle --offline --no-daemon --console plain "-PhifzVersionCode=$versionCode" "-PhifzVersionName=$appVersion ($buildId)" assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Android debug APK build failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

if (!(Test-Path -LiteralPath $apk)) { throw "Gradle completed without producing $apk." }
if ((Get-Item -LiteralPath $apk).LastWriteTime -lt $buildStarted) { throw "The APK at $apk is older than this build; Gradle did not repackage it." }
# Open the real APK and prove it carries exactly this export (build ID, fingerprint, file list, bytes, required routes).
node (Join-Path $projectRoot "scripts/build-info.mjs") verify $apk $webOut
if ($LASTEXITCODE -ne 0) { throw "APK verification failed; the APK does not contain this frontend build." }
# Unique, verified copy next to the project; earlier APKs are never overwritten.
$named = Join-Path (Split-Path $projectRoot -Parent) ("Hifz-Journey-{0}-debug.apk" -f $buildId)
Copy-Item -LiteralPath $apk -Destination $named
Write-Output "Verified APK: $named (frontend $buildId, versionCode $versionCode)"
if (Test-Path -LiteralPath $assetDir) { Remove-Item -LiteralPath $assetDir -Recurse -Force }
if (Test-Path -LiteralPath $webOut) { Remove-Item -LiteralPath $webOut -Recurse -Force }
$item = Get-Item -LiteralPath $apk
Write-Output "Debug APK ready: $($item.FullName) ($([math]::Round($item.Length / 1MB, 1)) MB)"
