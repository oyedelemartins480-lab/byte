-- Byte · Profile photos, room management, reading goals, integrations.
-- Run after the three earlier migrations.

-- ───────────────────────── Profile photos ─────────────────────────
-- Public bucket: photos are shown to room members and on invite pages.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Each person can only write inside avatars/<their user id>/
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "list own avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 600));

-- ───────────────────────── Room management ─────────────────────────
-- Owners can remove members (but not themselves; owners delete the room instead).
create policy "owner removes members" on public.room_members
  for delete to authenticated using (
    user_id <> (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid()))
  );

-- ───────────────────────── Reading goals ─────────────────────────
alter table public.session_participants
  add column goal_kind text not null default 'task' check (goal_kind in ('task', 'reading')),
  add column pages_total int check (pages_total is null or pages_total between 1 and 20000),
  add column pages_read int check (pages_read is null or pages_read >= 0);

drop function public.session_checkin(uuid, text, text, text);

create or replace function public.session_checkin(
  sid uuid,
  kind text,
  body text,
  met text default null,
  page int default null,
  total_pages int default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.sessions;
  p public.session_participants;
  m public.messages;
  ends timestamptz;
  slot int;
  clean text := btrim(coalesce(body, ''));
  reading boolean;
  pg int;
begin
  select * into s from public.sessions where id = sid;
  if s.id is null or uid is null or not public.is_room_member(s.room_id) then
    raise exception 'Session not found.';
  end if;
  ends := public.session_end_at(s);
  if clean = '' then raise exception 'Write a line first.'; end if;

  select * into p from public.session_participants where session_id = sid and user_id = uid;

  if kind = 'goal' then
    if now() >= ends then raise exception 'This session has ended.'; end if;
    if char_length(clean) > 500 then raise exception 'Keep your goal under 500 characters.'; end if;
    reading := total_pages is not null;
    if reading and (total_pages < 1 or total_pages > 20000) then raise exception 'Pages should be between 1 and 20000.'; end if;
    pg := case when reading then least(greatest(coalesce(page, 0), 0), total_pages) end;
    insert into public.session_participants (session_id, room_id, user_id, goal, goal_kind, pages_total, pages_read)
    values (sid, s.room_id, uid, clean, case when reading then 'reading' else 'task' end, total_pages, pg)
    on conflict (session_id, user_id) do update
      set goal = excluded.goal, goal_kind = excluded.goal_kind,
          pages_total = excluded.pages_total, pages_read = excluded.pages_read;
    insert into public.messages (room_id, user_id, type, body, session_id, meta)
    values (s.room_id, uid, 'checkin', clean, sid,
            jsonb_build_object('kind', 'goal') || case when reading
              then jsonb_build_object('reading', true, 'page', pg, 'pages_total', total_pages) else '{}'::jsonb end)
    returning * into m;

  elsif kind = 'progress' then
    if p.goal is null then raise exception 'Drop your goal first.'; end if;
    if now() < s.starts_at or now() >= ends then raise exception 'Updates open while the session is running.'; end if;
    if char_length(clean) > 1000 then raise exception 'Keep updates under 1000 characters.'; end if;
    slot := floor(extract(epoch from (now() - s.starts_at)) / (s.checkin_interval_min * 60))::int;
    if p.goal_kind = 'reading' and page is not null then
      pg := least(greatest(page, 0), p.pages_total);
      update public.session_participants set pages_read = pg where session_id = sid and user_id = uid;
    end if;
    begin
      insert into public.messages (room_id, user_id, type, body, session_id, meta)
      values (s.room_id, uid, 'progress', clean, sid,
              jsonb_build_object('slot', slot) || case when pg is not null
                then jsonb_build_object('page', pg, 'pages_total', p.pages_total) else '{}'::jsonb end)
      returning * into m;
    exception when unique_violation then
      raise exception 'You already posted an update for this check-in.';
    end;

  elsif kind = 'done' then
    if p.goal is null then raise exception 'You did not drop a goal for this session.'; end if;
    if p.dropped_at is not null then raise exception 'You already dropped what you did.'; end if;
    if now() < s.starts_at then raise exception 'The session has not started yet.'; end if;
    if met not in ('yes', 'partly', 'no') then raise exception 'Say whether you hit your goal.'; end if;
    if p.goal_kind = 'reading' and page is not null then
      pg := least(greatest(page, 0), p.pages_total);
    end if;
    update public.session_participants
    set done_text = left(clean, 1000), goal_met = met, dropped_at = now(), on_break = false,
        pages_read = coalesce(pg, pages_read)
    where session_id = sid and user_id = uid;
    insert into public.messages (room_id, user_id, type, body, session_id, meta)
    values (s.room_id, uid, 'done', left(clean, 1000), sid,
            jsonb_build_object('goal_met', met) || case when pg is not null
              then jsonb_build_object('page', pg, 'pages_total', p.pages_total) else '{}'::jsonb end)
    returning * into m;

  else
    raise exception 'Unknown check-in.';
  end if;
  return m;
end;
$$;

revoke execute on function public.session_checkin from public, anon;
grant execute on function public.session_checkin to authenticated, service_role;

-- ───────────────────────── Integrations ─────────────────────────
alter table public.messages drop constraint messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'gif', 'sticker', 'file', 'voice', 'system', 'checkin', 'progress', 'done', 'ai', 'recap', 'integration'));
alter table public.messages drop constraint messages_author_check;
alter table public.messages add constraint messages_author_check
  check (user_id is not null or type in ('ai', 'recap', 'integration'));

-- One GitHub feed per room. The secret signs webhook deliveries; only the owner can see it.
create table public.room_integrations (
  room_id uuid not null references public.rooms (id) on delete cascade,
  kind text not null check (kind in ('github')),
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, kind)
);
alter table public.room_integrations enable row level security;

create policy "owner manages integrations" on public.room_integrations
  for all to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid())))
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid()))
  );

-- ───────────────────────── Privileges ─────────────────────────
grant select, insert, delete on public.room_integrations to authenticated;
grant all on public.room_integrations to service_role;

-- ───────────────────────── Editing messages ─────────────────────────
-- People can fix the text of their own plain text messages. Byte stamps
-- edited_at itself, and deleted messages stay deleted.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type is distinct from old.type
     or new.room_id is distinct from old.room_id
     or new.user_id is distinct from old.user_id
     or new.session_id is distinct from old.session_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the text of a message can change.';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'Deleted messages stay deleted.';
  end if;
  if new.deleted_at is null and new.body is distinct from old.body then
    if old.deleted_at is not null or old.type <> 'text' then
      raise exception 'Only text messages can be edited.';
    end if;
    if char_length(btrim(new.body)) = 0 then
      raise exception 'A message can''t be empty. Delete it instead.';
    end if;
    new.edited_at := now();
  elsif new.edited_at is distinct from old.edited_at then
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;
