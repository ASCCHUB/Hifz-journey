# Quran Companion — Final Independent Technical QA Audit

Auditor: Claude (Anthropic) · Date: 2026-11-14

**Mode:** read-only.
- **Not done:** no source edits, no builds, no changes to learner data.
- **Allowed and done:** the automated test suites (in-memory storage only), TypeScript checking, the Quran validator (report written to a temp folder), and opening the existing APK as a zip to inspect its contents.

**Scope note:** the referenced "CODEX — FINAL INDEPENDENT TECHNICAL QA" prompt text is not in the workspace. This audit follows the requested focus — **stale APK packaging, hidden-text recall, Hifz data integrity, Supabase synchronization** — plus build, test, security and platform checks.

**Independence caveat:** Claude implemented much of Phase 3. Findings below are based on fresh evidence gathered for this audit (test runs, APK inspection, measurements, code reading), not on earlier reports.

---

## 1. Verdict

| | |
|---|---|
| Web/PWA, guest use, one device | **Release candidate, with one blocker (B1)** |
| Android APK | **Not releasable yet**: B1 and B3 |
| Signed-in multi-device sync | **Not releasable yet**: B2 and B4 |

### Release blockers

| ID | Blocker | Area |
|---|---|---|
| **B1** | **Local storage can overflow and saving then fails silently.** The full state (every Ayah's history) is saved as one JSON string in `localStorage`, together with up to 3 snapshot copies. On a quota error, `commit()` (`store.ts:231`) swallows the exception, so progress keeps changing in memory, is **lost on restart**, and the learner is never told. Measured realistic sizes: 2 Juz / 6 months ≈ 1 MB state (≈ 4 MB with snapshots); **full-Quran hafiz / 1 year ≈ 6 MB** (≈ 24 MB with snapshots); history cap reached ≈ 30 MB. Typical per-origin `localStorage` limits are about 5–10 MB (browser- and WebView-dependent, not measured on a device here). The snapshot feature added in Phase 3.1A **makes this worse**. | Hifz data integrity |
| **B2** | **Live Supabase sync has never been run.** No project keys exist on this machine. The compare-and-swap loop is proven only against an in-memory fake. Unverified on the real API: the `UPDATE … WHERE updated_at = <read value>` filter (string form of a `timestamptz`), the `23505` insert race, RLS behaviour on `update(...).select()`, and payload size (the whole state, up to tens of MB, is re-sent on every debounced change). | Supabase |
| **B3** | **No Android device or emulator test.** `adb devices` lists nothing and no AVD is installed. The APK has never run: audio, lesson screens, storage limits in the WebView, offline use and RTL text are all unverified on Android. | Platform |
| **B4** | **Old clients can still overwrite the cloud.** Any device still running a pre-Phase-3.1A build (including APKs handed out earlier) uses the old *whole-state, newer-timestamp-replaces-everything* push. One such device can overwrite merged cloud progress from up-to-date devices. Releasing sync safely requires all clients to update first, or a server-side guard (e.g. a schema/version field the old client does not send, checked by an RLS policy or trigger). | Supabase |

### Specifically requested items

| Item | Status | Evidence |
|---|---|---|
| Stale APK packaging | **Resolved, verified** | See §3 |
| Hidden-text recall | **Resolved in the guided lesson, verified; minor accessibility leak remains** | See §4 |
| Hifz data integrity | **Logic sound and tested; storage overflow is a blocker (B1)** | See §5 |
| Supabase synchronization | **Design sound, but untested live (B2) and unsafe with old clients (B4)** | See §6 |

---

## 2. Automated checks (run 2026-11-14)

| Check | Result |
|---|---|
| `npm run test:hifz` | 24 / 24 pass |
| `npm run test:navigation` | 10 / 10 groups pass |
| `npm run test:phase3` | 33 / 33 pass |
| `npx tsc --noEmit --incremental false` | pass |
| `public/data/quran.json` SHA-256 | `fab6e90867736262658b840b28b91aaab46ade99b058531e2cdc072931201680` (matches every earlier report) |
| Quran validator | 114 Surahs / 6,236 Ayahs compared; **2 known differences** (2:72, 11:41), untouched |
| Lint | not available: no ESLint configuration in the project (**gap**) |
| Static export / APK build | **not re-run** (read-only mode, and to avoid concurrent builds). Last build: 2026-11-13 23:19, successful. |

The suites cover:
- Quran order (6,236 Ayahs), all 604 pages' words, Juz/Hizb/quarter boundaries;
- SRS outcomes, weak list and word mistakes;
- claims and paths with tombstones, merge commutativity and idempotency, compare-and-swap retry against a fake backend;
- chunking of all Ayahs, lesson evidence rules, planner, assessment, maps.

**Not covered by tests:** React components (only via ad-hoc headless-browser scripts kept outside the repo), the real Supabase client, the service worker, and Android.

---

## 3. Stale APK packaging

**History:**
- **Cause:** the APK delivered on 2026-11-13 at 22:27 contained a **pre-Phase-3 web export**. With `NEXT_DIST_DIR` set, Next writes the export into that folder, while `scripts/build-android.ps1` packaged a leftover `./out`.
- **Symptom:** the user saw different screens on phone and PC.

**Current state, verified now:**
- `scripts/build-android.ps1`:
  - resolves the real export folder;
  - deletes any previous export before building;
  - refuses an export older than the build;
  - requires `learn.html`, `recall.html`, `assess.html`, `memorize.html` and `maps/manifest.json`.
- `../Hifz-Companion-debug.apk` (2026-11-13 23:19:17), opened as a zip:
  - **pages:** assess, index, learn, login, memorize, mind-maps, mushaf, profile, recall, recite;
  - **maps:** the maps manifest is present;
  - **JavaScript:** the bundles contain "Smart Hifz Tutor", "Recall a page", "How this method works", "together without looking" and "Practise the …";
  - **hidden-text fix:** the lesson chunk shows the fixed reveal logic (`reveal` defaults to `Infinity`; a per-unit computed value replaces the old "only the last unit" expression).
- No file under `src/` or `public/` is newer than the APK.

**Residual risk (Medium):**
- The guard checks a fixed list of pages. A future new route would not be checked unless added.
- Recommend adding an automated "inspect the APK" step (list assets, check the build ID matches the export) to the build script's final output.

## 4. Hidden-text recall

**Guided lessons** (`LessonPlayer.tsx`):
- **Bug fixed (2026-11-13):** in multi-Ayah recall steps — links, groups, cumulative and the **final page test** — every Ayah except the last was visible.
- **Browser verification:** on "Now recite Ayahs 1–2 together without looking": **0** visible Quran words before reveal, **1** after one hint.
- **Map cues** are no longer shown during recall steps.

**Recall a Page and revision** (`Practice.tsx`):
- **Current Ayah:** hidden word by word (`w hid`: transparent text on a veil background, `user-select: none`).
- **Previous Ayahs:** shown as context, by design.
- **Upcoming Ayahs:** first 4 words rendered under `w hid` (visually hidden).

**Remaining issues:**

| Sev | Issue |
|---|---|
| Medium | Hidden words are **still in the page as text**: transparent colour only. Screen readers read them aloud, and in lessons (`UnitText`, which has no `user-select: none`) select-all/copy reveals them. Not a visual leak, but a leak for assistive technology and a way to "peek". Recommend rendering placeholders (e.g. word-length blanks) instead of the real words while hidden. |
| Low | A recall step's reveal state resets on step change but is not persisted. Reloading mid-recall shows the Ayah hidden again (safe direction). |

## 5. Hifz data integrity

**Sound, with test evidence:**
- **Evidence rules:**
  - only final-step lesson ratings, rated Recall-page Ayahs, prompted check Ayahs and Practice sessions write `mem`, through the existing `applyResults`;
  - claims, paths, map activity, quizzes and planning never do (tests);
  - unrated Ayahs are never saved as `ok` (`evidenceFromLesson` filters them out; Practice saves only when every Ayah is rated);
  - **hinted → `hes`** in both lessons and Practice;
  - lesson evidence is saved **once** (`savedToHifz`).
- **Merge** (guest→account and cloud): history events are unioned, so evidence is never dropped by clocks; evidence beats legacy marks; tombstones are respected; the merge is commutative and idempotent (tests).
- **Legacy destructive "Clear"** (Juz/range) is still present, behind an explicit confirmation that says history will be deleted.
- `isMemorized()` is unchanged, so SRS behaviour is preserved. `coverage.ts` separates claimed, legacy-marked, learning, weak and long-term.

**Findings:**

| Sev | Finding |
|---|---|
| **Blocker (B1)** | Silent persistence failure on storage quota (see §1). Fix options: (a) surface quota errors to the learner; (b) store `mem`/history in IndexedDB instead of `localStorage`; (c) compact history (e.g. keep the last N events per Ayah plus aggregates); (d) keep snapshots smaller (evidence-only diffs) or in IndexedDB; (e) don't snapshot when space is low. |
| Medium | `mergeMem` takes the **maximum** of `successes`/`failures`/`reps`, not the true combined count, when two devices each added events and history was capped or absent (legacy records). It undercounts, never overcounts. Acceptable, but document it. |
| Medium | Bookmark removals and weak-list clearances have no tombstones, so an older device copy can bring them back. This errs toward *more* revision; no evidence is lost. |
| Low | `TodayPlan` marks the "new lesson" task done if **any** path lesson was completed that day, not necessarily the planned page. |
| Low | `isAyahDue()` (`hifz.ts`) ignores its `now` argument for day-based records. This is harmless in live use (now = today), but the planner had to work around it; a latent trap for future callers. |
| Low | Home / older stats still use `memorizedCount()` (which counts legacy marks) while the Journey header now shows "recited in this app", so two different "memorized" numbers can appear on different screens. |

## 6. Supabase synchronization

**Design (code review):**
- **Round:** `reconcile()` reads the row → `mergeStates` → conditional write (`update … eq(updated_at, read)` / `insert`) → retries on conflict (up to 5).
- **Concurrency:** rounds are serialized, and local edits made during a round are merged in, not dropped.
- **Snapshots:** a snapshot is taken before adopting remote changes.
- **Failures:** on network failure, local state is untouched.

**Verified:** only against an in-memory backend: concurrent pushes, network failure, repeat sync with no write, old-save merge.

**Findings:**

| Sev | Finding |
|---|---|
| **Blocker (B2)** | Untested against real Supabase (see §1). Needs a live two-device test (manual check list in the summary report). |
| **Blocker (B4)** | Old clients overwrite merged state (see §1). |
| High | **Payload size:** each sync uploads the whole state (MBs for long-term users, §5), triggered 2 s after any change and polled every 60 s. Expect slow or failed requests on mobile data, and Supabase request/row-size limits. Field-level storage (rows per Ayah or per day) or delta sync is the long-term fix. |
| Medium | Device clocks still decide which *schedule* and which *preferences* win when both devices changed the same record. Evidence (history) is clock-independent. |
| Medium | After sign-out, the signed-in user's state remains in this device's `localStorage` under `…:user:<id>` (a privacy consideration on shared devices). |
| Low | `nextVersion()` uses the client clock to create the version token. Uniqueness, not accuracy, matters, and collisions are only possible within the same millisecond. |

## 7. Platform, offline and security

| Sev | Finding |
|---|---|
| **Blocker (B3)** | No Android runtime verification (see §1). |
| Medium | **Service worker inside the Android WebView:** `Shell.tsx` registers `sw.js` in production builds, and the APK *is* a production export served from `https://appassets.androidplatform.net`. Whether the service worker registers and caches correctly alongside the app's own request interception is untested. It is network-first for pages, so stale-page risk is low, but needs a device check. |
| Medium | **Local speech server:** no authentication. It binds to `127.0.0.1` by default; `start.ps1 -Lan` exposes it on the LAN without TLS or auth. The Android app cannot reach it (HTTPS origin + cleartext disabled) and falls back to on-device recognition. Document clearly. |
| Low | Audio depends on everyayah.com (third-party availability); lessons degrade gracefully with a message. |
| Low | No lint configuration; no component-level automated tests in the repo; the browser test scripts live outside the repo (temp scratchpad). Recommend committing them. |
| Info | **Untouched:** Quran text, page layout and the two known reference differences, as required. |

## 8. Prioritized remediation (not yet applied — awaiting review)

1. **B1:** surface storage-write failures immediately (banner + do not take snapshots when space is low). Then move `mem`/history and snapshots to IndexedDB, with a one-time, non-destructive migration plus tests.
2. **B4:** add a client schema/version marker to the synced row and a server-side check (RLS `with check` or trigger) that rejects writes from older clients. Publish a forced-update note.
3. **B2:** run the two-device live test; fix any filter/RLS issues found; measure payload sizes.
4. **B3:** install the APK on a real device and run the manual checklist.
5. **Hidden-text accessibility:** render placeholders instead of transparent real words.
6. **APK build:** add a post-build asset inspection to the script; commit the browser test scripts.
