# B1 — Storage Progress Protection: Report

Date 2026-11-14 · Implementer: Claude · Checkpoint before changes: `../checkpoints/hifz-app-source-20261114-0907-before-B1.zip`. Scope: B1 only (B2, B3, B4 not started).

## 1. Root cause

1. **Progress could stop being saved without anyone knowing.** The entire app state, including every Ayah's practice history (up to 100 events each), was saved as **one JSON string in `localStorage`** on every change. `commit()` wrapped the write in `try { … } catch { /* storage full or blocked */ }`.
   - **Effect:** once the quota was reached, the in-memory state kept changing while nothing was persisted, and progress was lost on restart with no indication.
2. **Snapshots competed with progress for the same space.** Phase 3.1A recovery snapshots stored up to **three more full copies** in the same `localStorage`, reaching the quota sooner. Their failures were also swallowed.
3. **A second silent-loss path in `load()`.** The oldest shared key was copied to the guest key and then **removed even if the copy had failed**.

## 2. Previous persistence architecture

- Synchronous `localStorage.setItem(profileKey, JSON.stringify(state))` in `commit()`, with errors ignored.
- Snapshots: `localStorage` key `<profile>:snapshots`, with errors ignored.
- No save status; result screens said "saved/added to your Hifz record" regardless.

## 3. New persistence architecture (`src/lib/persist.ts`, `src/lib/store.ts`)

- **In memory:** the store keeps its synchronous API (`update`, `getState`, `useStore`), so no screen rewrite was needed.
- **Durable (primary): IndexedDB**, database `hifz-companion`, store `states` keyed by profile key, record `{ t, savedAt, state }`.
  - Writes go through a **per-profile queue**: serialized and **coalesced**, so only the newest pending state is written.
  - Each write uses a **`putIfNewer` in a single transaction**: an existing record with a newer `t` is never replaced. Together with strictly increasing `t` (`update()` now uses `max(now, prev + 1)`), this makes out-of-order or delayed writes harmless.
- **Mirror: `localStorage`**, written synchronously on each change, **best effort**.
  - It provides instant start-up and backward compatibility with older builds.
  - The mirror is **never deleted** on failure.
  - If IndexedDB is unavailable or fails, a successful mirror write of the *same version* counts as saved ("basic storage").
- **Hydration before writing:** on start, a profile's IndexedDB record is read and **merged** with what was loaded from the mirror, using the existing field-level `mergeStates`, which unions evidence.
  - Writes for that profile are held until this completes, so a change made in the first moments can never overwrite real progress.
  - An empty or unreadable IndexedDB never replaces anything.
- **Save status** (`getSaveStatus()`): `saving` → `saved` (`where: indexeddb | localstorage`, `lastSavedT`) or `unsaved` (`error`, `pendingT`, `acknowledged`). It is distinct from **cloud sync status** (Profile → Account), so a local save is never described as a cloud sync.
- **Retry:** after a failure the unsaved state stays queued. The next change retries automatically; **Retry save** retries immediately.
- **Snapshots moved to IndexedDB** (`aux` store; max 3).
  - Existing `localStorage` snapshots are copied over and the `localStorage` key is removed **only after a verified copy**.
  - Without IndexedDB they fall back to `localStorage` only if there is room. A failed snapshot never blocks a save.
- **Legacy-key fix:** the old shared key is removed only after its copy to the guest key verifiably exists.

## 4. Migration and backward compatibility

- **First start on the new build:** the existing `localStorage` state is copied to IndexedDB and **read back to verify**; the `localStorage` copy is kept.
- **Interrupted migration** (e.g. IndexedDB quota): nothing is lost, the mirror is untouched, the learner sees all progress, and migration retries on the next start (tested).
- **Unchanged:**
  - schema stays `v: 1`;
  - backup/restore codes work as before (restore takes an IndexedDB snapshot first);
  - Supabase sync still reads and adopts state through the store (`replaceState` → the same queue);
  - guest/account keys stay separate in both stores (tested).
- **Older app builds** still read the `localStorage` mirror. While it fits, they see current data.

## 5. Save-failure user experience (`src/components/SaveStatus.tsx`)

- **A persistent banner on every screen** (not a toast), mounted in `Shell`:
  - text: *"⚠ Your latest progress is NOT saved on this device."*;
  - the reason (e.g. "Device storage is full." or "Storage is blocked (private browsing…)");
  - *"closing or reloading the app may lose it"*;
  - buttons: **Retry save**, **Download a backup** (JSON of the in-memory state), and **I understand — remind me**.
- **Acknowledging** shrinks the banner to a **persistent badge** ("⚠ Progress not saved · Retry"). It is not removed and never implies saving.
- Both disappear only after a real successful save.
- **Leave-page warning** while anything is unsaved or still saving.
- **Result screens** show an honest save line: "✓ Saved on this device" / "Saving on this device…" / "⚠ Not saved on this device yet". This covers lesson completion, Recall results, page checks and the shared Practice screen. Two sentences that claimed "saved to your Hifz record" were reworded.

## 6. Storage size measurements (synthetic fixtures, JSON bytes)

| Learner | State | `localStorage` (UTF-16 ≈ ×2) |
|---|---|---|
| New learner | 0.00 MB | 0.0 MB |
| 1 Juz (~208 Ayahs), 6 months | 0.17 MB | 0.3 MB |
| 5 Juz (~1,040), 1 year | 1.34 MB | 2.7 MB |
| 15 Juz (~3,118), 1 year | 4.03 MB | 8.1 MB |
| Full Quran, 1 year (~18 revisions/Ayah) | 6.05 MB | 12.1 MB |
| Full Quran, history cap (100) | 29.47 MB | 58.9 MB |

From 15 Juz upward, `localStorage` alone is likely to overflow (typical limits are about 5–10 MB). With IndexedDB these learners save successfully: tested with a full-Quran fixture against a 5 MB mirror.

## 7. Automated test results (2026-11-14)

| Suite | Result |
|---|---|
| `npm run test:storage` (new, `scripts/test-storage.mjs`) | **17 / 17 pass** |
| `npm run test:hifz` | 24 / 24 |
| `npm run test:phase3` | 33 / 33 (snapshot test updated to the async API) |
| `npm run test:navigation` | 10 / 10 |
| `npx tsc --noEmit` | pass |
| Quran SHA-256 | `fab6e908…1680`, unchanged; validator: 2 known differences |
| Static export + APK (`npm run build:android`) | **pass**; the APK was opened: 10 pages present and the save-warning code is packaged |

The storage tests use fake storage with IndexedDB/`localStorage` semantics and assert on **what was persisted** (by reloading from the backends). They cover:

| Requirement | Test |
|---|---|
| 1. `localStorage` quota error (no IndexedDB) | reported as unsaved, kept in memory, saved by retry, survives reload |
| 2. IndexedDB quota / transaction failures | quota with a full mirror → unsaved → retry → saved → reload from IndexedDB alone; transaction failure with a working mirror counts as saved ("basic storage") |
| 3. Storage blocked | unsaved with a "blocked" explanation |
| 4. Failed save then retry | the next change retries automatically; acknowledging ≠ saved |
| 5–6. Interrupted migration | IndexedDB write fails → old data untouched and shown; completes on the next start |
| Empty / newer durable copy | an empty IndexedDB is never treated as "no progress"; a newer IndexedDB copy is merged over a stale mirror |
| Early change before loading finishes | merged, not lost |
| 7. Out-of-order saves | delayed writes coalesce and never replace newer progress |
| 8. Guest/account isolation | separate durable records |
| 9. Backup/restore and snapshots | snapshots in IndexedDB, not `localStorage`; restore is undoable and persisted; old `localStorage` snapshots migrated, then removed after verification |
| Legacy key | removed only after a successful copy |
| 10. Large data | full Quran (6,236 Ayahs) saved durably beyond a 5 MB mirror and restored |
| 11. Offline | saving makes no network calls |
| 12. Reload | each scenario reloads from the backends |
| 13. Warning visibility | status stays `unsaved` (acknowledged) until a real save |
| Measurements | sizes as above |

## 8. Browser verification (Chrome headless, 360×740, real IndexedDB, dev build)

1. Recall page 1 → *"✓ Saved on this device."*; IndexedDB contains 1:1–1:7.
2. `IDBObjectStore.put` and `Storage.setItem` forced to throw `QuotaExceededError`; recall page 2 → **banner visible**: "⚠ Your latest progress is NOT saved on this device. Device storage is full…". The result screen says "⚠ Not saved on this device yet"; nothing for page 2 in IndexedDB.
3. "I understand" → the **badge "⚠ Progress not saved · Retry" stays**.
4. Storage restored → **Retry** → banner and badge gone. **After a page reload** IndexedDB holds page 2 (5 Ayahs) and the app shows it.
5. **No page errors.** A first run showed an uncaught `QuotaExceededError` from a synchronous `put()` inside an IndexedDB callback; it is now caught and turned into a rejected save.

**Not verified:** a real Android device or emulator (none available); real browser quota limits (simulated by throwing the real error type).

## 9. Files modified

- **New:** `src/lib/persist.ts`, `src/components/SaveStatus.tsx`, `scripts/test-storage.mjs`, this report.
- **Modified:**
  - `src/lib/store.ts`: load, hydration, commit, snapshots, legacy-key fix, durable guest read;
  - `src/app/profile/page.tsx`: async snapshots, durable guest merge;
  - `src/components/Shell.tsx`: banner;
  - `src/components/LessonPlayer.tsx`, `Practice.tsx`, `src/app/recall/page.tsx`, `src/app/assess/page.tsx`: save line and wording;
  - `scripts/test-phase3.mjs`: async snapshot test;
  - `package.json`: `test:storage`.
- **APK:** `../Hifz-Companion-debug.apk` rebuilt (2026-11-14 09:18) and inspected.
- **Unchanged:** Quran data, Mushaf layout, SRS/Hifz engine, sync merge rules, ASR.

## 10. Remaining risks

- **IndexedDB is not unlimited.** At the browser's quota, the banner appears, which is correct; history compaction has not been implemented (history was deliberately not deleted).
- **Multiple tabs** of the app on one device each run a queue. `putIfNewer` prevents older overwrites, but two tabs editing simultaneously may still clobber each other's *unsynced in-memory* changes (pre-existing; the field-level merge only runs at start-up and in cloud sync).
- **The mirror can be stale** when it overflows. Start-up merges IndexedDB in, but older app builds reading only the mirror would see older data.
- **The browser may evict IndexedDB** under storage pressure if the origin isn't persistent. `navigator.storage.persist()` is not requested yet (recommended next).
- **Android WebView** IndexedDB behaviour is not verified on a device (B3).

## 11. Recommendations for B4 and B2

- **B4 (old clients):** add a `syncSchema` field to the synced row and an RLS `with check` / trigger rejecting writes without it (old clients don't send it), plus an in-app "update required" message. Keep the field-level merge.
- **B2 (live Supabase):**
  1. Two signed-in devices, one offline, practice different Ayahs, reconnect: both histories should be present.
  2. Claim deletion should stay deleted.
  3. Verify the `updated_at` compare-and-swap filter and the `23505` path against the real API.
  4. Measure row size against the §6 table. Whole-state uploads of 6–30 MB per change are too heavy for long-term users; plan delta or row-per-record sync.

## 12. Final B1 verdict: **FIXED**

- **Failures are never silent:** a failed save can no longer pass as a successful one. It is always reported, persistently, with Retry and a backup option, and success is shown only after a durable write of that version.
- **Growth:** growing histories have room (IndexedDB), and snapshots no longer compete with progress.
- **Migration:** existing data migrates non-destructively, survives interrupted migration, and is never replaced by an empty store.
- **Evidence:** proven by 17 persistence-level tests and a real-IndexedDB browser run.
- **Caveat:** Android on-device behaviour remains part of B3.
