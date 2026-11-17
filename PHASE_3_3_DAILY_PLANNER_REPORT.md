# Phase 3.3 — Smart Daily Revision Planner: Report

Date 2026-11-13 · Implementer: Claude

## Features implemented

- **`buildPlan()`** (`src/lib/planner.ts`) is a pure function of the existing per-Ayah SRS records, so there is no second scheduler. It groups Ayah records by Mushaf page into tasks, in priority order:
  1. **Recent:** pages first learned in the last 14 days, revised daily until then.
  2. **Weak:** pages with weak-list Ayahs or open mistakes; the task targets only the weak Ayahs and runs in the existing weak drill.
  3. **Due:** SRS-due pages, most overdue first.
  4. **Rotation:** the least-recently revised remaining pages, `ceil(pages / cycle)` per day, so every memorized page comes round about every *cycle* days. The cycle is derived from the budget, at least 7 days. Pages from different Juz mix in one day.
  5. **New:** the next page-sized portion of the primary path, opened as a guided lesson.
  6. **Check:** one self-reported page per day as a sampling check (Phase 3.4). Claims never become revision or evidence.
- **Each page appears once,** in its highest-priority queue.
- **Workload:**
  - revision is capped to the day's minutes (all of them when "prioritize revision" is on, otherwise 70%);
  - anything beyond is **carried over**, reported as a count, so a missed fortnight gives a normal-size day, not a dump;
  - if revision exceeds 80% of the budget, new memorization is **paused by recommendation**; the learner can override for today ("Add a new lesson anyway");
  - non-learning days are rest days for new material.
- **Time estimates:**
  - measured from the learner's own logged practice (`log.t ÷ log.a`, last 28 days, with at least 30 Ayahs and 10 minutes of data);
  - otherwise **labelled defaults**: 3 min per revision page, 30 min per new page;
  - the UI states which source is used.
- **Today's Hifz card** (`src/components/TodayPlan.tsx`) on **Home** and **My Hifz Journey**:
  - a "Time today" control writes the authoritative preference;
  - **one primary action, "▶ Start Today's Hifz"**;
  - per task: kind, page, Surah and Ayah, size, estimate and **a reason** ("Review due 3 days ago", "1 weak ayah from earlier mistakes", "Rotation — last revised 12 days ago…");
  - Start and "Later" (defer) per task;
  - "Choose any page instead" as the manual override;
  - a revision-first banner with an override.
- **Completion:**
  - revision tasks run in the existing `Practice` component, and `markTask(…, "done")` is called only from its `onComplete`, after ratings are saved by `applyResults`;
  - **opening never marks done**;
  - a new-lesson task is done when a path lesson is completed that day;
  - task status lives in `AppState.dailyPlan`, which resets each day and is synced by the 3.1A merge.
- **Learner name** is shown in the Home greeting.

## Problem found and corrected

The existing `isAyahDue()` compares against the *real* current date, ignoring its `now` argument for day-based records, which made plans for any other day wrong. The planner now computes due-ness against the plan's own day. `isAyahDue` itself is unchanged, because the existing SRS depends on it.

## Files

- **New:** `src/lib/planner.ts`, `src/components/TodayPlan.tsx`.
- **Modified:** `src/app/page.tsx` (Home: Today's Hifz and name), `src/app/memorize/page.tsx` (Today's Hifz above the journey card).

## Data migrations

None. `dailyPlan` is optional and defaults to `null`.

## Tests

`npm run test:phase3`: 24/24 (6 new for 3.3). They cover:
- queue priorities and order, no duplicate pages, weak tasks target weak Ayahs, building never marks done, every task has a reason;
- rotation over 60 simulated days reaches all 40 pages across several Juz;
- missed-fortnight capping and carry-over;
- overload pause, override and rest day;
- claims → one check task with no records created, and partly-known pages list only known Ayahs;
- per-day task status, and measured vs default estimate.

## Browser testing (Chrome headless, 360×740)

The Home card showed "Weak ayahs · page 2 (1 ayah)" before "Older revision · due · page 1 (due 3 days ago)", with reasons and a default-estimate label. Starting ran Practice; after rating, only that task was recorded as done ("1 of 2 done"). No page errors and no horizontal scroll. Not tested on an Android device.

## Remaining risks

- Time estimates are coarse; the default per-page minutes are a placeholder until real usage data accumulates.
- Rotation uses `mem.last`, which any review updates, including partial page reviews, so a page reviewed partly counts as recently revised.
- A deferred task reappears tomorrow only if it is still due or in rotation (by design: no hidden debt list).
- Plans are recomputed live from state; two devices on the same day share task statuses through sync, but a task completed offline on one device shows as "todo" on the other until they sync.

## Quran integrity

Untouched.
