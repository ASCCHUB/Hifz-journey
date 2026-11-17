# Phase 3.1A — Cloud Sync and Progress Consistency: Report

Date 2026-11-13 · Implementer: Claude (sole agent) · Checkpoint taken first: `../checkpoints/hifz-app-source-20261113-2203-before-phase3-master.zip`. The zip holds source, config, data and reports; it excludes `node_modules`, build output, model weights, `.venv` and `.env.local`.

## Features implemented

1. **Field-level reconciliation, replacing "newer whole state wins"** (`src/lib/sync.ts`, `mergeStates`). Per field:
   - **Per-Ayah records (`mergeMem`):**
     - history events from both sides are unioned and de-duplicated by `(at, result, interval)`, capped at the existing 100;
     - `reps`, `successes` and `failures` are the maximum of either side or the merged history count;
     - schedule fields (`iv`, `due`, `dueAt`, `bad`, `successDays`) come from the record with the most recent practice event;
     - **a record with practice evidence always beats an evidence-free one** (legacy "Mark memorized").
   - **Weak and word mistakes:**
     - `weak`: the newer `d` wins; ties go to the smaller clean count;
     - `mw`: the maximum per word.
   - **Reading and history data:**
     - `readPages` and `log`: the maximum per entry;
     - `hist` and `recSessions`: union by key;
     - `bookmarks`: the newer `t` wins;
     - `mapProgress`: the newer `last` wins;
     - `lastLocation` + `lastPage`: the newer location wins, as a pair.
   - **Journey:**
     - claims and paths: per item by `updatedAt`, with tombstones as items, so a deletion is never resurrected;
     - primary path: only a live path;
     - onboarding: the furthest state wins;
     - preferences: by their own `updatedAt`.
   - **Preferences and settings** (`settings`, legacy `journey`, `goals`): from the newer state, or from a fixed side for guest merge (the account wins).
   - **Properties:** commutative, idempotent, deterministic tie-breaks by content.
2. **Cloud sync loop with compare-and-swap** (`src/lib/supabase.ts`, `reconcile` in `sync.ts`):
   - **Round:** read row → merge → `UPDATE … WHERE updated_at = <version read>`; if another device wrote in between, the update matches 0 rows and the loop re-reads and merges again (up to 5 tries). A first row uses `INSERT` with a duplicate-key (`23505`) retry.
   - **No database change:** the existing `updated_at` column is the version token; its uniqueness matters, not clock accuracy.
   - **Edits during a round:** local edits made while a round is in flight are merged in, never dropped.
   - **Serialization:** rounds are serialized and coalesced.
   - **Triggers:** 2 s after a change, on reconnect (`online`), and every 60 s while visible.
   - **Failures and offline:** on failure or offline, local state is untouched and the status shows "offline" or "error".
3. **Local recovery snapshots** (`store.ts`):
   - **When:** taken before applying changes from another device, before guest merge, before backup restore and before restoring a snapshot.
   - **Size:** at most 3 per profile key.
   - **UI:** Profile → Backup → "Undo a recent change".
   - **Credentials:** none are stored, since AppState holds no tokens.
4. **Guest → account merge** now uses the same `mergeStates` (account preferences win). It is still explicit and repeatable, and the guest copy is kept.
5. **Backup restore** keeps a snapshot first. When signed in, a restored backup is *merged* with the account copy on the next sync instead of overwriting it, and the UI says so.
6. **One source of daily preferences** (`src/lib/prefs.ts`):
   - `studentJourney.preferences` is authoritative; `setDailyPrefs()` mirrors `journey.studyMinutes/learningDays` and `settings.newTarget/revTarget`;
   - every existing control (the Journey "Daily study time", the "New ayat each day" and "Ayat to revise each day" steppers, and the journey Save) goes through it;
   - unit helpers: `newPagesPerDay` and `revisionPagesPerDay`, assuming 15 Ayahs per page as a labelled default.
7. **Coverage classes** (`src/lib/coverage.ts`): `retained / learning / weak / legacy_marked / claimed / none`, plus `isVerified`. The Journey card shows a "What the app knows" strip, with solid squares for recited and dashed for not yet recited here. `isMemorized()` and SRS are unchanged.
8. **Destructive legacy "Clear" buttons:** already protected by explicit confirmation since Phase 3.1, and unchanged.

## Data migrations

None destructive. New optional fields `lessons`, `dailyPlan` and `assessments` (used by later phases) hydrate to empty defaults; schema stays `v: 1`.

## Tests (`npm run test:phase3`, new file `scripts/test-phase3.mjs`)

12/12 pass. They cover:
- two offline devices;
- conflicting practice on the same Ayah;
- legacy record vs evidence;
- clock skew of +10 years;
- tombstones in both directions;
- commutativity and idempotency;
- concurrent pushes with compare-and-swap retry;
- network failure with no data change and a no-op repeat sync;
- old v1 save;
- snapshots and backup restore with undo;
- preference mirroring;
- coverage classes.

Regression: `test:hifz` 24/24, `tsc` clean.

## Files changed

- **New:** `src/lib/sync.ts`, `src/lib/prefs.ts`, `src/lib/coverage.ts`, `scripts/test-phase3.mjs`.
- **Modified:**
  - `src/lib/store.ts`: new optional types and fields, guest merge via `mergeStates`, snapshots, `restoreBackup`;
  - `src/lib/supabase.ts`: rewritten sync loop;
  - `src/app/profile/page.tsx`: restore via snapshot, undo list, offline status text;
  - `src/app/memorize/page.tsx`: preference controls go through `setDailyPrefs`;
  - `src/components/PersonalizedJourney.tsx`: coverage strip, preferences through `setDailyPrefs`;
  - `package.json`: `test:phase3` script.

## Remaining risks (honest)

- **Not tested against a live Supabase project:** no keys are configured on this machine. The compare-and-swap contract is proven against an in-memory fake with the same semantics. The real `update … eq(updated_at)` and the `23505` path need one manual two-device check (see the final QA report).
- **Bookmark removals and weak-list clearances have no tombstones,** so a removal on one device can be undone by an older copy on another. This only errs toward *more* revision or bookmarks, never toward losing evidence.
- **Clock-dependent choices:** `settings` and legacy `journey` preferences follow the newer device clock, and the per-Ayah *schedule* follows the latest event time. Evidence itself is clock-independent.
- **Whole-row writes:** every push writes the whole JSON row (unchanged cost). Very large histories would make this heavier; caps exist.
- **The guest merge's choice of learner name** follows the journey's `updatedAt` (documented in Phase 3.1).

## Quran integrity

Untouched. SHA-256 `fab6e908…1680` is verified in the final QA run.
