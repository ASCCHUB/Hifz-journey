-- Rollback for 20261114_b4_user_state_revision_guard.sql.
-- Removes the write guard. Learner data (`state`) is untouched. The extra columns are kept by default so a
-- later re-deploy keeps revision history; uncomment the drops only if you are sure no protocol-2 client is live.
-- WARNING: after rollback, outdated clients can again overwrite cloud progress (B4 re-opens).
begin;
drop trigger if exists user_state_guard on public.user_state;
drop function if exists public.user_state_guard();
-- alter table public.user_state drop column if exists sync_protocol;
-- alter table public.user_state drop column if exists revision;
commit;
