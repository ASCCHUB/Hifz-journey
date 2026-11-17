# Final Integration Review and Android Readiness

Date: 2026-11-14. Reviewer: Claude.

**Scope:** the combined work from Claude and Codex: unified Mushaf (Read / Learn / Recall / Revise), the 604-page tracker, Home and Journey links, and the Reference PDF library.

**Constraints followed:**
- no new feature stage;
- no change to Quran data, Hifz scheduling rules, map approval data or the cloud schema;
- no Supabase deployment.

**Physical Android device: NOT tested.** Everything below is desktop Chrome (headless, phone and desktop sizes), unit tests, build output and code inspection.

## 1. Bugs found and fixed

| # | Severity | Defect (confirmed by test) | Fix |
|---|---|---|---|
| 1 | **High: duplicate Hifz results** | In `Practice` (used by **Revise mode**, Today's Hifz revision, the weak-Ayah drill and custom practice), a fast **double tap on the last rating** called `applyResults` twice. Observed: 2 history entries and every Ayah counted twice (successes +2, failures +2). | `src/components/Practice.tsx`: a synchronous `useRef` guard allows one save per session; "Recite again" resets it. Re-test: 1 entry, +1 per Ayah. |
| 2 | **Medium: duplicate Hifz results** | Same pattern in **Mushaf Recall** (`mushaf/page.tsx` `rate`): `saved` is React state, so a double tap on the last Ayah could run `savePageRecall` twice. | A synchronous `recallSavedRef` guard, reset by "Recall again" / page change. Re-test: a double tap saves once. |

**Not defects:**
- **Guided-lesson finish** is already idempotent: `saveLessonEvidence` checks `savedToHifz` inside the store update.
- **Lesson final ratings** overwrite a key, so a repeat can't double-count.

No other confirmed defects were found. Nothing else was changed.

## 2. Revise mode (added by Codex) review

**How it works:**
- **Route:** `/mushaf?p=N&mode=revise&kind=rev|weak&ayahs=s:a,…` (`mushaf/page.tsx`).
- **Selection:** the Ayahs are parsed by `parsePageAyahSelection` (`pageRecall.ts`).
- **Session:** handled by the existing `Practice` component.

| Check | Result | Evidence |
|---|---|---|
| 1. Uses the existing recall / evidence path | **Yes**: `Practice` → `applyResults(kind "rev"/"weak")`, the same as Today's Hifz | code + browser |
| 2. No second SRS or scheduler | **Yes**: no new state, intervals or plan logic; `dailyPlan` untouched by Revise | browser (`dailyPlan` unchanged) |
| 3. Each rated Ayah attributed correctly | **Yes**: 2:1 (hint) failure +1; 2:2 mistake +1 and weak-listed; 2:3–2:5 success +1 each | browser |
| 4. Hints counted as help | **Yes**: "Correct" after a hint is saved as "Hesitated". "Check ayah" (reveal after reciting) is the normal step, as in all Practice sessions. | browser |
| 5. Opening doesn't mark anything completed | **Yes**: state byte-identical after opening | browser |
| 6. Partial / abandoned saves nothing | **Yes**: rated 1 of 5 then Back → state byte-identical | browser |
| 7. Finishing twice doesn't duplicate | **Was broken (double tap); fixed** (#1). After "done" the buttons are gone; "Recite again" is a new, real session | browser |
| 8. Reaches the correct page | **Yes**: the tracker Revise link `/mushaf?p=2&mode=revise&kind=rev&ayahs=2:1,…,2:5` opens "Page 2 · revision"; Back returns to `/memorize?page=2`. Ayahs from another page are rejected ("Revision selection not valid"; also unit-tested, including duplicates). Home and Journey revision actions are Today's Hifz tasks, which run `Practice` inline for the task's own page. | browser + unit test |

**Codex's other change:** reading location (`lastPage`) is updated only in **Read** mode. Verified: reading page 10, then learning page 2, leaves the reading location at 10. This keeps reading and learning locations separate, as Stage 3 required.

## 3. Cross-feature integration (Chrome headless, 360×740): 29/29 pass

| Flow | Result |
|---|---|
| Read page 10 → reading location 10; Learn page 2 doesn't move it | PASS |
| Start lesson (page 2, 2:1–2:3) → step 3 → **Save & exit** → chooser shows "in progress (step 3)" | PASS |
| **Restart** (fresh load) → **Home → Resume lesson** = `/mushaf?p=2&mode=learn&from=2:1&to=2:3` → step 3 of 13 | PASS |
| **Read / Learn / Recall switching:** page 2 kept; lesson still step 3, not completed | PASS |
| **Journey → tracker** (`/memorize?page=2`) → **Learn** = Continue lesson (exact URL); **Recall** = `mode=recall`; status "Currently learning" | PASS |
| Recall page 2 (with final double tap) → 5 Ayahs saved once | PASS |
| **Tracker → Revise** → correct page and Ayahs; open / abandon / complete checks (§2) | PASS |
| **Learn → Recite → "Back to your lesson"** → same step | PASS |
| **Visual Maps → imported PDF → close → reopen** (also offline) at the saved page | PASS (separate suite, §5) |
| No non-GET requests (no uploads); no page errors | PASS |

## 4. Android readiness (code inspection; not device-tested)

**PDF file picker** (`MainActivity.java`, added in the PDF stage; present in `classes2.dex` of the final APK):

| Item | Finding |
|---|---|
| Callbacks | `onShowFileChooser` stores the callback and launches `fileChooserParams.createIntent()`. `onActivityResult` returns `FileChooserParams.parseResult(...)` and clears it. Any previous pending callback is cancelled first, so the WebView is never left waiting. |
| Cancel | Back from the picker → `parseResult` returns `null` → the WebView gets `null`; the page stays as it was. |
| No picker app | `ActivityNotFoundException` → callback answered with `null`, returns `false`. |
| Rotation during the picker | `configChanges="orientation\|screenSize\|keyboardHidden"`, so the Activity is not recreated and the callback survives. **Risk:** if Android kills the app process while the picker is open (low memory), the selection is lost and the user must choose again. |
| File-type restriction | Input `accept="application/pdf,.pdf"`. The system picker may show all files on some devices (the mixed MIME + extension list). **The app independently checks the `%PDF-` signature**, so other files are rejected with an honest error. |
| Storage failure | Handled in the web layer: size limit 200 MB, `navigator.storage.estimate()` pre-check, `QuotaExceededError` → "Not enough storage space", IndexedDB unavailable → message; nothing partial is kept. (Unit + browser tested; not on the WebView.) |
| Multiple imports | One PDF per Juz; Replace overwrites; all nine Juz import independently (unit-tested). |
| Large PDFs / memory | The whole file is read into memory, then handed to pdf.js (in a worker); pages are rendered at up to 2× device pixel ratio. 84 MB rendered on desktop. **Risk on low-RAM phones** with the 60–84 MB maps (Juz 1, 3, 4, 5): the renderer process may run out of memory. The app shows "could not be opened", but this needs a real-device check. |
| Offline reopening | In the APK, pdf.js, the worker, character maps and fonts are local assets (no network). The PDF is in IndexedDB. Verified offline in the browser. |
| Back navigation | Android Back = `webView.goBack()`. In the PDF viewer, Back leaves the Visual Maps page instead of only closing the viewer; the reading position is saved, so reopening resumes. Usability note, not data loss. |
| No uploads | The PDF code has no network calls (source-checked by a test); there are no Supabase or non-GET requests in browser runs; `setAllowFileAccess(false)` and no storage permissions are requested. The system picker grants a one-time read. |
| Content URI read with `setAllowContentAccess(false)` | **Unverified on a device.** The file-input path is expected to work, but if Import picks a file and nothing happens, this setting is the first thing to check. |

**Other Android risks (unchanged from earlier reports):**
- WebView audio and autoplay;
- microphone permission and native speech;
- sticky lesson panel and scrolling in the WebView;
- IndexedDB eviction in the WebView;
- pdf.js module worker needs WebView version 80 or later (minSdk 24 devices with an old WebView would fail to open PDFs).

## 5. Tests performed (final code)

| Suite | Result |
|---|---|
| `test:phase3` | 56/56 (includes Codex's revise-selection test) |
| `test:hifz` | 24/24 |
| `test:storage` | 17/17 |
| `test:sync-guard` | 15/15 |
| `test:navigation` | 10/10 |
| `test:refpdfs` | 7/7 |
| TypeScript (`tsc --noEmit`) | clean |
| `validate:quran` | 6,236 Ayahs compared; **2 known differences** (2:72, 11:41; unchanged, documented); the script exits 1 by design when any difference is listed |
| Quran fingerprint | `quran.json` SHA-256 `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680` (unchanged; same inside the APK) |
| Browser: integration (this review) | 29/29 |
| Browser: Stage 2 Mushaf learning | 48/48 |
| Browser: Stage 3 tracker + mobile panel | 36/36 |
| Browser: Reference PDF maps (the user's Juz 30 and 84 MB Juz 4 files) | 32/32 |
| Production static export + Android build | succeeded (stale-export guard active) |

## 6. APK

> **Superseded:** the parity audit later produced the verified build `Hifz-Companion-20261114-0845-53cadd-debug.apk` (see `DESKTOP_ANDROID_FEATURE_PARITY_REPORT.md`). That build also fixes Android packaging dropping `_`-prefixed Next.js files. Install that one.

- **Path:** `C:\Users\sajid\Downloads\QURAN COMPANION\Hifz-Companion-debug.apk`. Also at `hifz-app\android\app\build\outputs\apk\debug\app-debug.apk`.
- **Built:** **2026-11-14 11:40**; 5.2 MB (5,486,188 bytes); SHA-256 begins `475aa4408150f43f`.
- **Contents verified:**
  - revise mode;
  - 604-page tracker;
  - PDF import UI and pdf.js;
  - compact lesson panel;
  - Recite return link;
  - both double-tap fixes (Practice chunk);
  - `onShowFileChooser` in the compiled code;
  - **0 PDF files** inside;
  - Quran data unchanged.
- **Type:** debug build (debug-signed). It is not a release-signed build.

## 7. Remaining release blockers

1. **B3: physical Android testing (open).** Install this APK on at least one real phone (ideally also a low-RAM one) and check:
   - PDF import, cancel and reopen offline, including a 60–84 MB map;
   - Learn panel scrolling;
   - audio;
   - microphone, Recite and return;
   - Back button behaviour;
   - IndexedDB persistence across app restarts.
2. **B2: live Supabase sync (open).** Not tested against a real project.
3. **B4: server-side legacy-client guard (implemented and verified in PostgreSQL, NOT deployed).** Needs a test Supabase project run and the user's authorization before production.
4. **Release signing:** only a debug APK exists; a release keystore and signed build are needed for distribution.

**Not blockers, but recommended before release:**
- Back in the PDF viewer should close the viewer first;
- pdf.js fallback messaging for very old WebViews;
- a teacher review of the Ayah-linked maps (the approval data is unchanged and gated as before).

**No production Supabase deployment was made.**
