-- Byte · Private realtime channels, desktop notifications, connected apps.
-- Run after 20261124000000_profiles_rooms_reading_integrations.sql.

-- ───────────────────────── Private realtime channels ─────────────────────────
-- Room channels are named "room:<room id>". Only that room's members may join,
-- listen to or send broadcasts (typing, huddle pings, remove/delete notices).
-- After running this, turn OFF "Allow public access" in Realtime → Settings.
create or replace function public.room_topic_member(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_room_member(substring(topic from 6)::uuid)
    else false
  end;
$$;
revoke execute on function public.room_topic_member(text) from public, anon;
grant execute on function public.room_topic_member(text) to authenticated, service_role;

drop policy if exists "room members receive room broadcasts" on realtime.messages;
create policy "room members receive room broadcasts" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.room_topic_member((select realtime.topic()))
  );

drop policy if exists "room members send room broadcasts" on realtime.messages;
create policy "room members send room broadcasts" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.room_topic_member((select realtime.topic()))
  );

-- ───────────────────────── Desktop notifications ─────────────────────────
alter table public.profiles
  add column if not exists notify_sessions boolean not null default true,
  add column if not exists notify_mentions boolean not null default true;

-- One row per browser that turned notifications on. Written by the server only.
create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "see own push subscriptions" on public.push_subscriptions;
create policy "see own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "remove own push subscriptions" on public.push_subscriptions;
create policy "remove own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- Remembers which notifications went out so nobody gets the same one twice.
create table if not exists public.push_sent (
  key text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (key, user_id)
);
alter table public.push_sent enable row level security; -- no policies: server only
grant all on public.push_sent to service_role;

-- ───────────────────────── Connected apps (Notion) ─────────────────────────
-- Access tokens never reach the browser: no policies, server only.
create table if not exists public.user_connections (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('notion')),
  access_token text not null,
  refresh_token text,
  workspace_id text,
  workspace_name text,
  workspace_icon text,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_connections enable row level security;
grant all on public.user_connections to service_role;
