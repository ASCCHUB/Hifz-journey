# B4 — PostgreSQL Verification Report

Date 2026-11-14 · Verifier: Claude.
- **No production data touched.** No Supabase project was contacted, and no migration was applied anywhere except a throw-away in-memory PostgreSQL.
- **No project files changed** for this verification. The harness and PGlite live in the session scratch folder, not in the app's `package.json`.

## 1. Method

- **Engine:** PGlite **0.4.6** = **PostgreSQL 17.4** (WebAssembly, in-process). 0.3.3 was tried first; its build crashed in its own error-recovery path after a trigger `RAISE` (`setTempRet0` linking error, and "cannot drop active portal"). That is a PGlite defect, not a database result; 0.4.6 ran cleanly.
- **Supabase-like setup** inside that database:
  - `auth` schema, `auth.users`, `auth.uid()` reading `request.jwt.claim.sub` (as Supabase does);
  - `anon` and `authenticated` roles with Supabase-style default grants;
  - then the **project's real `supabase/schema.sql`** (tables, RLS policies, signup trigger);
  - then the **real migration file, unmodified**.
- **REST simulation:** each REST request is a transaction that sets `role = authenticated` and the user's JWT `sub`, so **RLS and the trigger are both live**, then runs the SQL PostgREST generates for the supabase-js call:

| Client call | PostgREST SQL executed |
|---|---|
| Legacy `.upsert({user_id, state, updated_at})` | `INSERT … VALUES … ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, state = EXCLUDED.state, updated_at = EXCLUDED.updated_at` |
| Modern `.insert({user_id, state, revision: 1, sync_protocol: 2})` | `INSERT … VALUES …` |
| Modern `.update({state, revision: r+1, sync_protocol: 2}).eq('user_id', u).eq('revision', r).select('revision')` | `UPDATE … SET … WHERE user_id = u AND revision = r RETURNING revision` |

- **Library check:** `@supabase/postgrest-js` **2.119.0**, the version in this project:
  - `upsert()` = `POST` + `Prefer: resolution=merge-duplicates` (dist line 3259) → PostgREST `INSERT … ON CONFLICT … DO UPDATE SET <payload columns>`;
  - `.select()` after a write adds `Prefer: return=representation` (line 712) → `RETURNING`.
  - The legacy app used the same client API (`upsert` with the same three columns), so its requests have the same shape.

## 2. Static review of `20261114_b4_user_state_revision_guard.sql`

| Area | Finding | Result |
|---|---|---|
| PostgreSQL correctness | Valid PL/pgSQL; one transaction; `add column if not exists`, `create or replace function`, `drop trigger if exists` → idempotent. `NOT NULL DEFAULT` columns fill existing rows. | **PASS** (executed) |
| RLS / account isolation | Migration does not touch policies; RLS stays enabled; trigger adds checks, never bypasses RLS. Trigger is `SECURITY INVOKER` (default), so it runs with the caller's rights. | **PASS** |
| Revision enforcement | UPDATE must set exactly `old+1`; unchanged revision → `OUTDATED_CLIENT`; other values → `REVISION_CONFLICT`; INSERT must be revision 1. | **PASS** (executed) |
| Old-client rejection | Legacy payload never contains `revision`/`sync_protocol`. INSERT requires protocol ≥ 2; UPDATE with unchanged revision refused. | **PASS** (executed) |
| Timestamp trust | `new.updated_at := now()` on every write | **PASS** |
| Admin repair path | `hifz.admin_override` honoured only when set in-session (SQL editor). PostgREST exposes no way for clients to set arbitrary settings, and no `set_config` RPC exists in the exposed schema. | **PASS** (design) |
| Hardening (Low) | Supabase's linter flags functions without a fixed `search_path`. The function references no unqualified objects (only `NEW`/`OLD`, `current_setting`, `now`), so there's no exploit path, but adding `set search_path = ''` would silence the warning. Optionally `revoke execute … from public` (trigger functions can't be called via RPC anyway). | **Recommendation only, not applied** |
| Deletes (out of scope) | RLS `for all` still lets a user delete their own row; legacy clients never delete, and cannot re-create a row afterwards (INSERT needs protocol 2). | Note |

## 3. Executed checks: **26 / 26 PASS** (PostgreSQL 17.4)

| # | Check | Result | Server message |
|---|---|---|---|
| 1 | Migration executes cleanly | PASS | |
| 2 | Migration is idempotent (second run) | PASS | |
| 3 | Columns added `NOT NULL` with defaults (`revision bigint 0`, `sync_protocol integer 1`) | PASS | |
| 4 | RLS still enabled, original policy present | PASS | |
| 5 | **Old client cannot INSERT a new row** | PASS | `HIFZ_SYNC_OUTDATED_CLIENT` |
| 6 | Modern INSERT at revision 1 | PASS | |
| 7 | Modern revision-safe UPDATE 1→2 returns the new revision | PASS | `[{"revision":2}]` |
| 8 | **Old client cannot overwrite a protected row** (upsert); row byte-identical | PASS | `OUTDATED_CLIENT` |
| 9 | **Old client cannot win with a future `updated_at`** (2099) | PASS | `OUTDATED_CLIENT` |
| 10 | Plain UPDATE without revision (any old code path) refused | PASS | `OUTDATED_CLIENT` |
| 11 | Stale modern write (expects 1, row is 2) → **0 rows**, nothing changes | PASS | |
| 12 | Revision skip 2→5 refused | PASS | `REVISION_CONFLICT: expected revision 3, got 5` |
| 13 | Revision rewind 2→1 refused | PASS | `REVISION_CONFLICT` |
| 14 | Protocol downgrade 2→1 refused | PASS | `OUTDATED_CLIENT: sync protocol 1 is not accepted` |
| 15 | Changing `user_id` refused | PASS | `FORBIDDEN` |
| 16 | `updated_at` set by the server; client value ignored | PASS | |
| 17 | User B cannot read A's row (RLS) | PASS | |
| 18 | User B cannot update A's row (0 rows) | PASS | |
| 19 | User B cannot insert a row for A | PASS | `new row violates row-level security policy` |
| 20 | User B can create and own their row | PASS | |
| 21 | Signed-out (`anon`) sees no rows | PASS | |
| 22 | Admin override (SQL editor) allows a deliberate repair | PASS | |
| 23 | Pre-existing row keeps its `state`, starts at revision 0 / protocol 1 | PASS | |
| 24 | **Old client blocked even before any modern write** (row at revision 0) | PASS | `OUTDATED_CLIENT` |
| 25 | First modern write moves 0→1 and sets protocol 2 | PASS | |
| 26 | Rollback removes the guard (old client can write again → B4 re-opens); data and columns kept | PASS | |

**Finding from execution (PostgreSQL behaviour):**
- **What happens:** for `INSERT … ON CONFLICT DO UPDATE`, PostgreSQL fires the **BEFORE INSERT trigger before conflict detection**. Every legacy upsert is therefore rejected at the INSERT stage, even when the row exists. The error text reads "cannot *create* cloud progress" in that case.
- **Impact:** outcome correct, and stricter than designed (no legacy upsert can succeed). Cosmetic only: the message wording.
- **Implication for modern clients:** they must **not** use `upsert`, and they don't (they use `insert`, then `update … eq(revision)`). If a modern INSERT hits an existing row, the trigger passes (protocol 2, revision 1) and PostgreSQL returns `23505`, which the client treats as "re-read and merge" (as the app does).

## 4. Does the app match real Supabase REST behaviour?

| Aspect | Status |
|---|---|
| Upsert/insert/update SQL shapes | **Matches** (§1; postgrest-js 2.119.0 source) |
| Stale-update outcome | `UPDATE … WHERE revision = r` → 0 rows → `.select()` returns `[]` → app returns "not written" → `reconcile` re-reads and merges. **Matches** (#11) |
| Trigger errors | PostgREST returns PostgreSQL `RAISE` (SQLSTATE P0001) as HTTP 400 with `{code: "P0001", message: "HIFZ_SYNC_…"}`. supabase-js exposes it as `error.message`; the app's matchers (`/HIFZ_SYNC_REVISION_CONFLICT/` → retry, `/HIFZ_SYNC_(OUTDATED_CLIENT\|FORBIDDEN)/` → `SyncRejected`) read exactly those messages. Messages verified in execution; the HTTP mapping is PostgREST's documented behaviour, **not exercised live** |
| Duplicate insert | `23505` → retry. **Matches** |
| Missing columns (migration not deployed) | PostgREST reports unknown columns (`42703` for select / `PGRST204` for writes). The app falls back to `updated_at` compare-and-swap and reports "not installed". Error codes follow PostgREST docs; **not exercised live** |
| Concurrent updates | Under READ COMMITTED, a second `UPDATE … WHERE revision = r` waiting on the row lock re-checks its `WHERE` after the first commits and matches **0 rows**. Standard PostgreSQL behaviour; **not reproducible** in single-connection PGlite (sequential stale-write check #11 passes) |

## 5. Safe deployment sequence

1. **Back up** before anything:
   - Supabase dashboard → Database → Backups: confirm a recent backup / PITR;
   - also export the table: `copy (select * from public.user_state) to stdout with csv header` (or Table editor → Export CSV);
   - keep the CSV off-device.
2. **Test project first** (a separate Supabase project, or a branch with the same `schema.sql`):
   1. Run `supabase/migrations/20261114_b4_user_state_revision_guard.sql` in the SQL editor.
   2. Create **two test accounts** (A, B) and check:
      - an **old APK/build** signed in as A: sync shows "failed", the table row is unchanged, and the old device keeps its progress locally;
      - the **new APK** (protocol 2) signed in as A on two devices, one offline: practice different Ayahs, reconnect. Both histories appear on both devices, `revision` increments, and `sync_protocol = 2`;
      - B cannot see A's row (Table editor as B via the app; or the REST API with B's JWT).
   3. Rollback rehearsal: run the rollback file and confirm data is intact. Re-run the migration.
3. **Release the protocol-2 app** to users *before or together with* step 4. Communicate: "Update required to keep syncing; your progress on this device is safe."
4. **Production:** run the migration in a quiet period. Then check:
   - `select count(*) filter (where sync_protocol = 2), count(*) from public.user_state;` (rows convert as users sync);
   - the API logs show `HIFZ_SYNC_OUTDATED_CLIENT` from not-yet-updated devices, which is expected.
5. **Mark B4 FIXED** only after steps 2 and 4 are completed and observed.

**Rollback implications:**
- The rollback script removes the trigger and function **immediately re-opening B4**: old clients can overwrite again.
- Columns and data stay.
- Protocol-2 apps keep working after rollback: with the columns present they still write revision-safely among themselves, but nothing stops old clients.
- To restore a row damaged before deployment: use the CSV backup with `set local hifz.admin_override = 'on'` in a SQL-editor transaction.

## 6. Results summary

| Item | Result |
|---|---|
| SQL valid on PostgreSQL 17 | **PASS** |
| Old clients cannot insert new rows | **PASS** |
| Old clients cannot overwrite protected rows (incl. future timestamps, plain updates) | **PASS** |
| Modern revision-safe insert/update | **PASS** |
| Stale/skipped/rewound revisions rejected | **PASS** |
| RLS / account isolation preserved | **PASS** |
| Existing data preserved; pre-existing rows convert on first modern write | **PASS** |
| Rollback works (and re-opens B4, as documented) | **PASS** |
| App request shapes match supabase-js / PostgREST | **PASS** (source-verified) |
| HTTP error mapping and true concurrent locking on a live Supabase | **NOT VERIFIED** (needs a test project) |
| Production deployment | **NOT DONE** (requires your authorization) |

## 7. Remaining deployment requirements

1. Run the migration on a **test Supabase project** with two accounts, an old build and the new build (§5 step 2). This also covers most of **B2**.
2. Back up production (§5 step 1), release the protocol-2 build, then apply the migration to production.
3. Optional hardening: add `set search_path = ''` to the function, in a follow-up migration after review.

**B4 status after this verification: IMPLEMENTED AND VERIFIED IN POSTGRESQL — NOT DEPLOYED.** It becomes **FIXED** after the test-project run and production deployment above.
