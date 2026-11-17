# Dashboard: Worldwide Date, Time & Prayer Settings

Date: 2026-11-16 · Debug APK: `Hifz-Journey-20261116-1400-48e99c-debug.apk`
- **Frontend parity:** 296/296 files.
- **Installs as an update:** same package `com.hifzcompanion`, same signing certificate (`866123fa…`), versionCode 1512840.
- **New permission:** adds `ACCESS_COARSE_LOCATION`, which is requested only when “Use my current location” is tapped.

## What changed
1. **Settings button removed from the header.** Prayer and calendar settings are now under **More → Settings → Prayer Times & Calendar** (`/prayer-settings`). “Account & App Settings” is renamed **Settings** and has a link card at the top. All settings still work as before.
2. **Automatic local date, clock and Hijri date** (`src/lib/localTime.ts`):
   - **Time zone:** the device's IANA zone, read again on every tick, so travelling or changing the zone needs no reload. Daylight-saving time comes from the time-zone database; no offsets are hardcoded.
   - **Format:** dates use the device locale. The clock follows the locale's 12/24-hour default unless you choose one; a chosen 24-hour clock shows two digits (“00:05”).
   - **Hijri calendar:** chosen in settings: Umm al-Qura (default), tabular/civil, tabular (Thursday epoch), or astronomical. The ±2-day adjustment applies to the local calendar day. The Hijri date is in the device language.
   - **Updates:** the clock ticks on every minute boundary, which also rolls the date over at local midnight. It refreshes immediately when the app returns to the foreground. No page refresh, location or GPS is needed.
3. **Prayer times worldwide:**
   - **Manual city selection** (unchanged) or a custom location. The city, method and Asr convention are remembered.
   - **New: “Use my current location”.** It asks for permission only when tapped. If you allow it, coarse coordinates and the device time zone are filled in; if you deny it, a clear message appears and manual selection stays.
   - **Android app:** coarse location is used through the WebView only after the tap. This adds `ACCESS_COARSE_LOCATION` to the manifest and a `onGeolocationPermissionsShowPrompt` handler, limited to the app's own origin.
   - **Not configured:** the dashboard card shows a short line, “Prayer location not set yet. Set it in Settings…”. No city is assumed and no times are shown.
   - **Calculation:** times are calculated offline in the prayer location's own time zone (existing Adhan.js code).
4. **Text encoding:** the corrupted `â€¢` and `Â·` separators in the header are gone. The separator is now drawn by CSS (`content: "\00B7"`), and on phones the date and Hijri date are on separate lines, so a separator never starts a wrapped line. A test checks the header code for mojibake. No other UI file had mojibake. The Quran text was not touched.
5. **More compact header.** The title, greeting, date, live clock (top right, with the zone abbreviation), Hijri date and the geometric background are kept. The tagline pill, the large button and the extra calendar/location line are removed, and the padding and title size are smaller.

| Width | Header height | Continue/Start button top |
|---|---|---|
| 320 | 129 px | 341 px |
| 360 | 129 px | 341 px |
| 393 | 132 px | 349 px |
| 430 | 132 px | 349 px |
| 1280 (desktop) | 126 px | 267 px |

I could not measure the old header in the same harness: the previous APK's export renames `_next`, so it could not be served as-is. The removed elements are listed above.

## Verification
- **Unit tests, `npm run test:local-time`: 15/15 pass.**
  - Local midnight rollover in Saudi Arabia, India, the UK, the USA, Japan and Australia; the Hijri date advances with the local day.
  - The same instant shows each zone's own date.
  - Daylight-saving changes: UK BST→GMT, USA EST→EDT, Australia AEDT→AEST.
  - Zones without daylight saving stay fixed all year.
  - Locale and 12/24-hour formatting.
  - Hijri adjustment and every listed calendar.
  - The tick lands on the minute boundary.
  - No hardcoded zone or offset, and no mojibake.
- **Browser test, `scripts/test-dashboard-time-e2e.mjs`** (headless Edge, device time zone and locale overridden). It covers:
  - the six countries (local time shown, no button, no mojibake; Arabic and Japanese locales render natively)
  - widths 320, 360, 393 and 430, plus desktop
  - More → Settings → Prayer Times & Calendar
  - the prayer card with no location set
  - location denied, then granted (Tokyo)
  - offline: the clock advances on the minute without a reload, and prayer times still show

  Results are in `artifacts/dashboard-time/results.json`.
- **Other suites:** 153/153 pass. Quran text SHA `fab6e908…` is unchanged, with the same 2 known differences.

Screenshots are in `artifacts/dashboard-time/`: `zone-*-360.png`, `dashboard-{320,360,393,430,1280}.png`, `settings-360.png`, `prayer-location-denied-360.png` and `prayer-times-tokyo-360.png`.

## Not changed
Hifz progress, learning settings, Quran text, revision scheduling, notifications, and the existing prayer calculation and storage (same localStorage keys; older saved display preferences still load).

## Limitations
- **Real device not tested.** Midnight and daylight-saving changes are tested with fixed instants, and in the browser by overriding the zone. They have not been observed on a real phone.
- **Location in the app.** Location inside the Android WebView needs this new APK, and it has not been tested on a device.
- **Zone abbreviations.** These come from the device (for example, London shows “GMT+0” in some English locales instead of “GMT”).
- **Calculated calendars.** Hijri calendars can differ by a day from local moon-sighting; the adjustment setting covers this.
