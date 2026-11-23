-- Byte · Phase 1: profiles, rooms, invite links, realtime chat, reactions, files.
-- Run in the Supabase SQL editor, or with `supabase db push`.

-- ───────────────────────── Types ─────────────────────────
create type public.room_type as enum ('build', 'lockin');
create type public.room_visibility as enum ('private', 'public');

-- ───────────────────────── Tables ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  role text check (role is null or char_length(role) <= 40),
  timezone text not null default 'UTC',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type public.room_type not null default 'build',
  visibility public.room_visibility not null default 'private',
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- checkin | progress | done arrive with lock-in sessions in phase 2
  type text not null default 'text'
    check (type in ('text', 'gif', 'sticker', 'file', 'system', 'checkin', 'progress', 'done')),
  body text not null default '' check (char_length(body) <= 4000),
  meta jsonb not null default '{}'::jsonb,
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index messages_room_created_idx on public.messages (room_id, created_at desc);

create table public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index reactions_room_idx on public.reactions (room_id);

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 10 URL-safe characters, e.g. 7Kq2mXa9Lb
  select translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=', 'xyz')::varchar(10);
$$;

create or replace function public.is_room_member(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = rid and user_id = (select auth.uid())
  );
$$;

-- Create a room and add the creator as its owner in one step.
create or replace function public.create_room(
  room_name text,
  room_type public.room_type default 'build',
  room_visibility public.room_visibility default 'private'
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
begin
  if uid is null then raise exception 'You need to be signed in.'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Finish setting up your profile first.';
  end if;

  insert into public.rooms (name, type, visibility, owner_id, invite_code)
  values (btrim(room_name), room_type, room_visibility, uid, public.new_invite_code())
  returning * into r;

  insert into public.room_members (room_id, user_id, role) values (r.id, uid, 'owner');

  insert into public.messages (room_id, user_id, type, body)
  values (r.id, uid, 'system', 'created the room');

  return r;
end;
$$;

-- What the join page shows before you join (works signed out too).
create or replace function public.room_preview(code text)
returns table (id uuid, name text, type public.room_type, member_count bigint, owner_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.type,
         (select count(*) from public.room_members m where m.room_id = r.id),
         p.name
  from public.rooms r
  join public.profiles p on p.id = r.owner_id
  where r.invite_code = code;
$$;

create or replace function public.join_room_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  inserted int;
begin
  if uid is null then raise exception 'You need to be signed in.'; end if;
  select id into rid from public.rooms where invite_code = code;
  if rid is null then raise exception 'This invite link is not valid anymore.'; end if;

  insert into public.room_members (room_id, user_id, role)
  values (rid, uid, 'member')
  on conflict do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    insert into public.messages (room_id, user_id, type, body) values (rid, uid, 'system', 'joined the room');
  end if;
  return rid;
end;
$$;

-- Owners can make a fresh link, which kills the old one.
create or replace function public.reset_invite_code(rid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text := public.new_invite_code();
begin
  update public.rooms set invite_code = code
  where id = rid and owner_id = auth.uid();
  if not found then raise exception 'Only the room owner can reset the link.'; end if;
  return code;
end;
$$;

revoke execute on function public.create_room, public.join_room_by_code, public.reset_invite_code from anon;
grant execute on function public.room_preview to anon, authenticated;

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;

-- profiles: any signed-in user can see names (needed for mentions and member lists)
create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- rooms
create policy "members and public rooms are readable" on public.rooms
  for select to authenticated using (visibility = 'public' or public.is_room_member(id));
create policy "owner updates room" on public.rooms
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes room" on public.rooms
  for delete to authenticated using (owner_id = (select auth.uid()));

-- room_members
create policy "members see each other" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));
create policy "join public rooms" on public.room_members
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.visibility = 'public')
  );
create policy "leave a room" on public.room_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- messages
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_room_member(room_id));
create policy "members send messages" on public.messages
  for insert to authenticated with check (
    user_id = (select auth.uid()) and type <> 'system' and public.is_room_member(room_id)
  );
create policy "authors edit or delete their messages" on public.messages
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- reactions
create policy "members read reactions" on public.reactions
  for select to authenticated using (public.is_room_member(room_id));
create policy "members react" on public.reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and public.is_room_member(room_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.room_id = reactions.room_id)
  );
create policy "remove own reaction" on public.reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── Realtime ─────────────────────────
-- The app only listens for INSERT/UPDATE here. DELETE events can't be filtered
-- per room, so reaction removals go over the room's broadcast channel instead.
alter publication supabase_realtime add table public.messages, public.reactions, public.room_members;

-- ───────────────────────── Storage (files up to 25 MB) ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Files live at attachments/<room_id>/<uuid>-<filename>
create policy "members read room files" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.is_room_member(((storage.foldername(name))[1])::uuid));

create policy "members upload room files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_room_member(((storage.foldername(name))[1])::uuid));
