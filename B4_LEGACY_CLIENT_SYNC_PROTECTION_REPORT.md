# B4 — Legacy Client Sync Protection: Report

Date 2026-11-14 · Implementer: Claude · Scope: B4 only.

## 1. Root cause and actual legacy write behaviour

The legacy sync code, quoted from the pre-Phase-3 source (`checkpoints/…-before-phase3-master.zip`, `src/lib/supabase.ts`):

```ts
// on start
const { data } = await sb.from("user_state").select("state").eq("user_id", user.id).maybeSingle();
if (remote && (remote.t || 0) > (local.t || 0)) replaceState(remote);
else if (local.t) await push(user, local, gen);
// 2 s after ANY change
await sb.from("user_state").upsert({ user_id: user.id, state: snapshot, updated_at: new Date(snapshot.t || Date.now()).toISOString() });
```

**How an old client destroys newer progress:**
1. The old client starts; if its own clock-based `t` looks newer, it pushes immediately.
2. Otherwise it adopts the cloud copy once.
3. **From then on, every local change upserts its entire state.** PostgREST performs `INSERT … ON CONFLICT (user_id) DO UPDATE SET state = …, updated_at = …`, unconditionally.
4. Whatever modern devices merged into the row since that device last read it is overwritten.

Nothing on the server stopped this: the only protection was RLS (own row only).

**Why a client-only fix is not enough:** modern clients cannot stop an old build from writing. Protection must live where the write lands: the database.

## 2. Backend enforcement

**A `BEFORE INSERT OR UPDATE` trigger on `public.user_state` plus a server-enforced monotonic `revision`** (`supabase/migrations/20261114_b4_user_state_revision_guard.sql`):

| Rule | Effect |
|---|---|
| `UPDATE` must set `revision = old.revision + 1` exactly | **Legacy clients never send `revision`**: their upsert leaves it unchanged, so the trigger raises `HIFZ_SYNC_OUTDATED_CLIENT`. A wrong or skipped revision raises `HIFZ_SYNC_REVISION_CONFLICT`. |
| `INSERT` requires `sync_protocol >= 2` and `revision = 1` | Legacy clients cannot create a row either. |
| `sync_protocol` may never decrease | No downgrade path. |
| `updated_at := now()` on every write | **Client timestamps are ignored.** A stale or old client cannot win by sending a future time. |
| RLS unchanged | Account isolation as before (own row only). |
| `hifz.admin_override` session setting | Deliberate repair from the SQL editor only (e.g. restoring a backup row). |

Why this is the simplest compatible option:
- **No new tables and no RPC:** it works with the existing table, existing RLS and the supabase-js calls the app already makes.
- **Concurrency:** modern clients write with `.eq("revision", expected)`, so a stale modern write simply matches **0 rows** (a clean compare-and-swap miss) and the existing `reconcile()` loop re-reads, merges and retries.

## 3. Source and schema changes

- **`src/lib/supabase.ts`:**
  - **Protocol 2:** `SYNC_PROTOCOL = 2`. Read `state, revision`; insert `{revision: 1, sync_protocol: 2}`; update `{state, revision: r+1, sync_protocol: 2}` filtered by `.eq("revision", r)`.
  - **Server refusals:** a conflict is a retry; an outdated/forbidden refusal throws `SyncRejected` with an actionable message: *"The cloud refused this update because this copy of the app uses an outdated sync method. Your progress is safe on this device; please install the latest version of the app to sync."*
  - **Before deployment:** if the columns don't exist (`42703` / `PGRST204`), the app falls back to the previous `updated_at` compare-and-swap and reports **"Cloud protection against older app versions is not installed on the server yet"**.
  - **Local data:** never touched by a failed or refused cloud write. B1 durability is unchanged; the store merges only on success.
- **`src/app/profile/page.tsx`:** shows the sync detail line (refusal reason or protection status).
- **New:**
  - `supabase/migrations/20261114_b4_user_state_revision_guard.sql` (idempotent);
  - `…_rollback.sql`;
  - `supabase/schema.sql` note pointing to the migration;
  - `scripts/test-sync-guard.mjs`;
  - `package.json` `test:sync-guard`.
- **Unchanged:** Quran text and layout, SRS, lessons, recall, recovery, maps, ASR, claims, backups, IndexedDB persistence, merge rules (`mergeStates`).

## 4. SQL migration

See `supabase/migrations/20261114_b4_user_state_revision_guard.sql`:
- adds `revision bigint not null default 0` and `sync_protocol integer not null default 1`;
- adds `user_state_guard()` and its trigger;
- runs in one transaction.

**Existing rows keep `state` untouched.** They start at revision 0 / protocol 1, and the first protocol-2 write moves them to revision 1 (tested).

## 5. Old-client compatibility

After deployment, **all protocol-1 builds can no longer write.** That includes the original app and the Phase 3.1A–B1 debug APKs that used `updated_at` compare-and-swap.
- Their reads still work.
- Their local progress stays on their device (B1 keeps it durable).
- They show their existing "Sync failed" status.

**Users must install the protocol-2 build to sync again.** When they do, the field-level merge combines that device's local progress with the cloud on the first sync (nothing is lost). Older builds cannot display the new explanation; only the new build can.

## 6. Tests and results

**`npm run test:sync-guard`: 15/15 pass.**
- **What runs for real:** the actual `supabaseBackend()` and `reconcile()` code, plus the **legacy push code copied verbatim**.
- **What is mocked:** the database. The mock models PostgREST upsert as `INSERT … ON CONFLICT DO UPDATE SET <sent columns>`, filtered update with `.select()` returning the updated rows, RLS (own rows; `42501` on foreign insert), missing columns (`42703`/`PGRST204`), and a line-by-line JS port of the trigger.
- A sanity test asserts that the shipped SQL contains each rule the mock implements.

| # | Test | Result |
|---|---|---|
| 1 | Legacy client overwriting a modern row | rejected `OUTDATED_CLIENT`; row unchanged |
| 2 | Legacy timestamp trick (`updated_at` 2099) | rejected; server owns `updated_at`; guessed revision jump → `REVISION_CONFLICT` |
| 3 | Concurrent modern clients | the interleaved write is a compare-and-swap miss → retry → both histories in the cloud and the device |
| 4 | Offline modern client reconnecting | offline work + others' work merged |
| 5 | Stale revision | filtered update = 0 rows; mismatched revision refused by the trigger |
| 6 | Claim tombstones | survive; older copies and legacy clients can't resurrect them |
| 7 | History | both devices' events preserved |
| 8 | Account isolation | B can't read, update or insert A's row |
| 9 | Missing/invalid protocol | legacy insert, protocol-1 update and downgrade refused |
| 10 | Network failure | local state untouched; retry succeeds |
| 11 | Server refusal | surfaces as `SyncRejected` (actionable), never success; local untouched |
| 12 | Repeated sync | idempotent: no writes, revision unchanged |
| 13 | Pre-migration row (rev 0) | the first protocol-2 write keeps the data; legacy is then blocked |
| 14 | **Migration not deployed** | **the legacy overwrite still succeeds**: protection depends on deployment |

**Regression:**

| Check | Result |
|---|---|
| `test:storage` | 17/17 |
| `test:hifz` | 24/24 |
| `test:phase3` | 33/33 |
| `test:navigation` | 10/10 |
| `tsc` | clean |
| Quran SHA-256 | `fab6e908…1680` unchanged; validator: 2 known differences |
| Static export + APK | built; the APK (2026-11-14 09:45) was inspected and contains the protocol-2 sync code and all 10 pages |

**Not done:**
- The SQL has **not been executed in PostgreSQL**. Installing PGlite (an in-process PostgreSQL) to run it was **blocked by the tool permission policy**, and no Supabase project is available. The trigger logic is therefore verified only through the JS port.
- No live Supabase verification (B2).

## 7. Deployment instructions

1. **Test project first:** in the Supabase dashboard → SQL editor, run `supabase/migrations/20261114_b4_user_state_revision_guard.sql`.
2. **Verify** with two test accounts (the commented checks at the end of the file):
   1. A legacy-style upsert (no revision, future `updated_at`) fails with `HIFZ_SYNC_OUTDATED_CLIENT`.
   2. A correct protocol-2 update returns revision+1.
   3. A stale update matches 0 rows.
   4. User B can't touch A's row.
   5. Two devices running the new APK, one offline, practice different Ayahs and reconnect: both histories are present and the revision increases.
3. **Release the protocol-2 app build** (the APK at `../Hifz-Companion-debug.apk`, or later builds) **before or together with** running the migration on production. Tell existing users to update; old builds will stop syncing, though their local data is safe.
4. **Production:** run the same file. Confirm `select revision, sync_protocol from user_state` shows rows moving to protocol 2 as users sync.

**No SQL was executed against any project in this task.**

## 8. Rollback and recovery

- **Rollback:** `supabase/migrations/20261114_b4_user_state_revision_guard_rollback.sql` drops the trigger and function. Columns are kept by default; there's an optional drop. **This re-opens B4.**
- **Recovery of a damaged row:**
  1. In the SQL editor: `begin; set local hifz.admin_override = 'on'; update user_state set state = <backup json> where user_id = …; commit;`
  2. Then the next protocol-2 write continues from the row's revision.
- **Learners:** device-side snapshots and backup codes (B1/3.1A) remain available.

## 9. Remaining risks

- **Not deployed:** until the migration runs, legacy clients can still overwrite the cloud (test 14).
- **SQL not executed in PostgreSQL:** run it on a test project or allow PGlite to execute it locally.
- **Whole-row writes remain heavy** for long-term learners (6–30 MB per write; see B1). This doesn't affect correctness; it's a B2 / performance item.
- **The `hifz.admin_override` bypass** exists by design for repairs. It requires SQL-editor access (it can't be set through the REST API by clients).
- **Modern-client clocks** still decide which *preference and schedule* values win when two devices changed the same record. Evidence is unioned regardless (unchanged).

## 10. B4 status: **IMPLEMENTED BUT NOT DEPLOYED**

The server-side guard, the protocol-2 client, tests, and deployment and rollback scripts are complete. **Old clients are blocked only once the migration has been run on the Supabase project**, which requires your access and authorization. After deployment plus the §7 verification on a test project (which also covers part of B2), B4 can be marked **FIXED**.
