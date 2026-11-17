# Reference PDF Maps: Integration Report

Date: 2026-11-14.

**Result:** the Visual Maps page now has two sections.
- **Ayah-linked maps:** the 3 existing authored maps, unchanged, with their review and permission gate unchanged.
- **Reference PDF maps:** Juz 1, 2, 3, 4, 5, 26, 28, 29 and 30. The learner imports their own PDF from the device; it is stored only in this browser's local database and rendered offline by a bundled PDF viewer.

**Verification:**
- **Desktop Chrome (headless), at phone (360 px) and desktop widths:** verified with the user's real Juz 30 PDF (8 MB, 43 pages) and Juz 4 PDF (84 MB, 24 pages).
- **Android:** **not** tested on a device.

## 1. Design

| Part | Choice | Why |
|---|---|---|
| Viewer | **pdf.js 4.10.38** (`pdfjs-dist`, Apache-2.0), legacy build, copied to `public/pdfjs/` with its licence, character maps and standard fonts (about 4 MB) | Android WebView has **no built-in PDF viewer**. Bundling pdf.js renders pages to a canvas from app assets, with no CDN and no network. Loaded only when a PDF is opened. |
| Storage | Separate IndexedDB database `hifz-reference-pdfs` (one row per Juz: name, size, date, file data) | Keeps PDF data **out of** Hifz progress (`hifz-companion`), the localStorage mirror, snapshots, backups and Supabase sync. |
| Reading position | `localStorage` `hifz-refpdf-pos:<juz>` (page and zoom) | Per-device convenience; cleared when the PDF is removed. |
| Offline (web) | One pdf.js worker reused for the session; the service worker (v4) precaches `/pdfjs/pdf.min.mjs` and the worker, and serves `/pdfjs/*` cache-first | Reopening while offline works. In the APK everything is a local asset anyway. |
| Android serving | The WebView already serves `.mjs` as `application/javascript` (`MainActivity.mimeType`) | Module script and module worker load from `https://<app host>/pdfjs/…`. |

**Files:**
- **New:**
  - `src/lib/refPdfs.ts` (storage, validation, quota checks, position);
  - `src/components/ReferencePdfMaps.tsx` (Juz cards, import, remove, viewer);
  - `scripts/test-refpdfs.mjs` (`npm run test:refpdfs`);
  - `public/pdfjs/*`.
- **Changed:**
  - `src/app/mind-maps/page.tsx` (section heading "Ayah-linked maps"; new section mounted);
  - `public/sw.js` (v4);
  - `package.json` / lock (`pdfjs-dist` 4.10.38 and the test script).

## 2. Behaviour

**Juz cards:**
- English and Arabic labels (`dir="rtl" lang="ar"`);
- status "On this device" / "Not imported", with file name and size;
- buttons: **Open**, **Import PDF from device** / **Replace**, **Remove** (with confirmation that says Hifz progress is not affected).

**Import:**
- **File picker:** the browser's own picker (`accept=application/pdf`). Every new import or replacement starts at page 1.
- **Checks before saving:**
  - the file starts with `%PDF-`;
  - it is at most 200 MB;
  - free space is checked against the browser's storage estimate;
  - persistent storage is requested (best effort).
- **Honest errors**, each with "you can choose the file again":
  - not a PDF;
  - too large;
  - not enough space (with the MB needed and free);
  - quota exceeded during the save (nothing partial is left);
  - IndexedDB unavailable (for example a private window).

**Viewer:**
- Close, Prev, Next, "Page [n] of N" (typed jump), zoom −/+ (100–400%), Fit;
- fits the screen width in portrait; panning when zoomed;
- rendered at device pixel ratio (capped at 2× for memory);
- reopening returns to the last page and zoom;
- the canvas has an accessible label ("Juz 30 · ‘Amma map, PDF page 3 of 43");
- when opened, it scrolls into view.

**Safety boundaries (all enforced, and source-checked by a test):**
- no network or upload code;
- no Supabase;
- no `teacher_reviewed`;
- no `applyResults` or other Hifz writes;
- no text extraction, commentary or hints;
- PDFs are not used in lessons or recall.

**Not bundled:** the original PDFs are not in `public/`, the export or the APK (verified: 0 `.pdf` files in the APK).

## 3. Verification

**Unit tests (`test:refpdfs`): 7/7.**
- **Juz list:** nine Juz in order with Arabic labels.
- **Round trip:** import → list → reopen (bytes intact) → remove, for all nine. Replacing keeps one entry per Juz. Listing never returns the file data. Only the separate database is used, and no Hifz key is touched.
- **Validation:** non-PDF, over the limit and unknown Juz are rejected.
- **Storage errors:** quota exceeded (nothing left behind), low space estimate ("needs about 80 MB"), and IndexedDB unavailable.
- **Large file:** an 84 MB file imports and reads back.
- **Reading position:** per Juz; survives reopening; cleared on removal.
- **No network:** no network calls and no upload, review or progress-write code in the source.

**Browser (Chrome headless against the dev server, the user's own files, 360×740 and 1280×900): 32/32.**
- **Page:** Ayah-linked maps present; nine Juz cards; Arabic labels RTL; no sideways scroll.
- **Juz 30:** imported with the real file picker; renders 43 pages, not blank; fits width (324 px on the phone); Next twice → page 3; zoom 125% enlarges (324 → 405 px) and pans; Fit.
- **Offline:** Close, browser set **offline**, reopen → **page 3 restored and rendered**.
- **Desktop:** the **84 MB Juz 4 PDF imports and renders** (24 pages).
- **Errors:** a non-PDF file gives "not a PDF".
- **Remove:** card returns to "Not imported".
- **Isolation:** Hifz progress byte-identical before and after; **no non-GET or Supabase requests**; no page errors.
- **Visual check:** an Arabic map page renders correctly at 125% on a 360 px screen.

**Regression:**
- phase3 56/56, hifz 24/24, storage 17/17, sync-guard 15/15, navigation 10/10;
- TypeScript clean;
- Quran SHA-256 still `fab6e908…`;
- Stage 2 browser checks 48/48, Stage 3 36/36.

**Build:**
- production static export and debug APK (rebuilt after the file-chooser fix, **5.2 MB**, up from 3.1 MB because of pdf.js);
- the APK contains `pdfjs/pdf.min.mjs`, the worker, the licence and the new UI strings; `sw.js` is v4; **no PDFs inside**;
- copied to `../Hifz-Companion-debug.apk`.

## 4. Needs Android testing (not done)

1. **The file picker in the app.** The wrapper had **no** `onShowFileChooser`, so Import would have done nothing on Android. I added it to `MainActivity.java`:
   - `fileChooserParams.createIntent()` (system picker, PDF type) and `onActivityResult` → `FileChooserParams.parseResult`;
   - it cancels cleanly if a picker is already open or none is available.

   **Status:** the APK compiles with it (rebuilt 11:31). **Picking a file on a real phone is untested.** If the picked file can't be read with `setAllowContentAccess(false)`, that setting may need revisiting.
2. pdf.js module worker in the WebView: needs a Chromium-based WebView version 80 or later.
3. Memory with the 60–84 MB PDFs (Juz 1, 3, 4, 5): the whole file is read into memory when opened; low-memory phones may fail. The app then shows "could not be opened".
4. IndexedDB quota and eviction in the WebView, and whether `navigator.storage.persist()` is honoured.
5. Pinch-zoom inside the canvas area versus whole-page zoom; the buttons work everywhere.

## 5. Other notes

- **Juz 26:** the user's "جزء الذاريات" file can be imported under Juz 26 as requested. Surah Adh-Dhariyat begins in Juz 26 and continues into Juz 27. The app does not check which Juz a PDF covers; the learner chooses.
- **Another editor:** while this work ran, another editor (a Codex process was running) added a Mushaf **revise mode**:
  - `mode=revise&ayahs=…`, with `parsePageAyahSelection` in `pageRecall.ts`;
  - Stage 3 tracker Revise buttons switched to it;
  - one new phase3 test.

  I did not change or revert it. All suites pass with it, and it is included in this APK. It should be reviewed as that editor's work.
- **No backend change:** no Supabase change and no deployment.
