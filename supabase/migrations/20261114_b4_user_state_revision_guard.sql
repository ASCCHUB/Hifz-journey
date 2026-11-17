-- B4 — Prevent outdated clients from overwriting Quran progress in public.user_state.
--
-- Enforced at the authoritative write boundary (a BEFORE INSERT/UPDATE trigger), so it applies to every
-- write that reaches the table through the Supabase REST API, whatever the client sends.
--
-- Rules
--   * Every row carries a monotonic `revision`. An UPDATE must set revision = old.revision + 1, exactly.
--     - Legacy clients never send `revision`: their upsert leaves it unchanged -> rejected (OUTDATED_CLIENT).
--     - A modern client working from a stale read sends a revision that is not old+1 -> rejected
--       (REVISION_CONFLICT); modern clients also filter `.eq("revision", expected)`, so a stale write normally
--       matches 0 rows and is retried after re-reading and merging.
--   * An INSERT must declare sync_protocol >= 2 and revision = 1 (legacy clients cannot create rows either).
--   * sync_protocol can never decrease.
--   * updated_at is set by the server (now()); client-supplied timestamps are ignored, so a stale client
--     cannot win by sending a "newer" time.
--   * Row Level Security is unchanged: users can still only read/write their own row.
--
-- Deployment (Supabase dashboard -> SQL editor), on a TEST project first:
--   1. Run this whole file once. It is idempotent (safe to re-run).
--   2. Verify with the checks at the bottom (commented out) using two test accounts.
--   3. Release the app build that speaks protocol 2 BEFORE or AT THE SAME TIME as running this on production:
--      after this runs, older builds (including earlier debug APKs) can no longer write — they keep their
--      progress locally and show "Sync failed" until updated.
--
-- Rollback: run supabase/migrations/20261114_b4_user_state_revision_guard_rollback.sql.
-- Existing rows keep their data: `state` is untouched; existing rows start at revision 0 / protocol 1 and the
-- first protocol-2 write moves them to revision 1.

begin;

alter table public.user_state add column if not exists revision bigint not null default 0;
alter table public.user_state add column if not exists sync_protocol integer not null default 1;

create or replace function public.user_state_guard()
returns trigger
language plpgsql
as $$
begin
  -- Deliberate administrative repair only (e.g. restoring a backup row from the SQL editor):
  --   set local hifz.admin_override = 'on';
  if coalesce(current_setting('hifz.admin_override', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.sync_protocol, 1) < 2 then
      raise exception 'HIFZ_SYNC_OUTDATED_CLIENT: this app version cannot create cloud progress; please update the app'
        using errcode = 'P0001';
    end if;
    if new.revision is distinct from 1 then
      raise exception 'HIFZ_SYNC_REVISION_CONFLICT: a new cloud row must start at revision 1 (got %)', new.revision
        using errcode = 'P0001';
    end if;
  else -- UPDATE
    if new.revision = old.revision then
      raise exception 'HIFZ_SYNC_OUTDATED_CLIENT: this app version cannot update cloud progress safely; please update the app'
        using errcode = 'P0001';
    end if;
    if new.revision is distinct from old.revision + 1 then
      raise exception 'HIFZ_SYNC_REVISION_CONFLICT: expected revision %, got %', old.revision + 1, new.revision
        using errcode = 'P0001';
    end if;
    if coalesce(new.sync_protocol, 1) < coalesce(old.sync_protocol, 1) or coalesce(new.sync_protocol, 1) < 2 then
      raise exception 'HIFZ_SYNC_OUTDATED_CLIENT: sync protocol % is not accepted (row is at %)', new.sync_protocol, old.sync_protocol
        using errcode = 'P0001';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'HIFZ_SYNC_FORBIDDEN: user_id cannot change' using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_state_guard on public.user_state;
create trigger user_state_guard
  before insert or update on public.user_state
  for each row execute function public.user_state_guard();

commit;

-- ---------------------------------------------------------------- verification (run manually, test project)
-- As test user A (e.g. via the app on two devices, or the REST API with A's JWT):
--   * Legacy-style write must FAIL with HIFZ_SYNC_OUTDATED_CLIENT:
--       upsert {user_id: A, state: {...}, updated_at: '2099-01-01'}            (no revision)
--   * Stale write must FAIL / match 0 rows:
--       update set state=..., revision=<old>+1, sync_protocol=2 where user_id=A and revision=<old-1>
--   * Correct write must SUCCEED and return revision old+1:
--       update set state=..., revision=<old>+1, sync_protocol=2 where user_id=A and revision=<old>
--   * As user B, reading or writing A's row must return 0 rows (RLS unchanged).
-- Inspect: select user_id, revision, sync_protocol, updated_at from public.user_state;
