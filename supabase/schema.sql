-- Hifz Companion: Supabase schema.
-- Run this once in the Supabase SQL editor. Every table is protected by row level security,
-- so each user can read and write only their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- One row per user holding their private app state: settings, memorization records,
-- bookmarks, goals, reading log and session history. The app keeps the newest copy.
create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;

drop policy if exists "profiles are private" on public.profiles;
create policy "profiles are private" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "state is private" on public.user_state;
create policy "state is private" on public.user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- REQUIRED for safe multi-device sync (release blocker B4): after this file, run
--   supabase/migrations/20261114_b4_user_state_revision_guard.sql
-- It adds a server-enforced revision guard so outdated app versions cannot overwrite cloud progress.
