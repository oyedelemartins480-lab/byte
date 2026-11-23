-- Byte · Phases 2–5: lock-in sessions, AI notes and recaps, focus score,
-- streaks and badges, @ai, voice notes, public rooms and calm mode.
-- Run after 20261123000000_phase1.sql.

-- ───────────────────────── Profiles: calm mode ─────────────────────────
alter table public.profiles add column calm_mode boolean not null default false;

-- ───────────────────────── Sessions ─────────────────────────
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  ended_at timestamptz, -- set when someone ends the session early
  checkin_interval_min int not null default 60 check (checkin_interval_min between 15 and 240),
  finalized_at timestamptz,
  team_score int,
  recap_status text not null default 'none' check (recap_status in ('none', 'working', 'done', 'failed')),
  recap_claimed_at timestamptz,
  summary_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours')
);
create index sessions_room_idx on public.sessions (room_id, starts_at desc);

create table public.session_participants (
  session_id uuid not null references public.sessions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal text check (goal is null or char_length(goal) <= 500),
  done_text text check (done_text is null or char_length(done_text) <= 1000),
  goal_met text check (goal_met in ('yes', 'partly', 'no')),
  focus_seconds int not null default 0,
  away_seconds int not null default 0,
  break_seconds int not null default 0,
  on_break boolean not null default false,
  focus_score int,
  joined_at timestamptz not null default now(),
  dropped_at timestamptz,
  primary key (session_id, user_id)
);
create index session_participants_room_idx on public.session_participants (room_id);
create index session_participants_user_idx on public.session_participants (user_id, dropped_at desc);

create table public.session_summaries (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  summary text not null default '',
  extracted jsonb not null default '{}'::jsonb, -- { decisions[], tasks[{who,what}], blockers[] }
  last_message_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.session_recaps (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  summary text not null default '',
  recap jsonb not null default '{}'::jsonb, -- { decisions[], tasks[], blockers[], links[], people[] }
  team_score int,
  ai boolean not null default false,
  created_at timestamptz not null default now(),
  fts tsvector generated always as (to_tsvector('english', coalesce(summary, ''))) stored
);
create index session_recaps_room_idx on public.session_recaps (room_id, created_at desc);
create index session_recaps_fts_idx on public.session_recaps using gin (fts);

create table public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_days int not null default 0,
  best_days int not null default 0,
  last_session_date date
);

create table public.badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_key text not null check (badge_key in ('early_bird', 'night_owl', 'deep_diver', 'finisher')),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

-- ───────────────────────── Messages: sessions, AI, voice, search ─────────────────────────
alter table public.messages add column session_id uuid references public.sessions (id) on delete set null;
alter table public.messages alter column user_id drop not null;
alter table public.messages drop constraint messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'gif', 'sticker', 'file', 'voice', 'system', 'checkin', 'progress', 'done', 'ai', 'recap'));
alter table public.messages add constraint messages_author_check
  check (user_id is not null or type in ('ai', 'recap'));
alter table public.messages add column fts tsvector
  generated always as (to_tsvector('english', coalesce(body, '') || ' ' || coalesce(meta ->> 'transcript', ''))) stored;
create index messages_fts_idx on public.messages using gin (fts);
create index messages_session_idx on public.messages (session_id) where session_id is not null;
-- One hourly update per person per slot.
create unique index messages_progress_slot_idx on public.messages (session_id, user_id, ((meta ->> 'slot')))
  where type = 'progress';

-- Authors may edit body/meta or soft-delete, but never change what a message is or where it lives.
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
  return new;
end;
$$;
create trigger messages_guard_update before update on public.messages
  for each row execute function public.guard_message_update();

-- Members send everyday messages themselves; check-ins go through session_checkin(),
-- and AI or system messages only come from the server.
drop policy "members send messages" on public.messages;
create policy "members send messages" on public.messages
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and type in ('text', 'gif', 'sticker', 'file', 'voice')
    and session_id is null
    and public.is_room_member(room_id)
  );

-- ───────────────────────── Session helpers ─────────────────────────
create or replace function public.session_end_at(s public.sessions)
returns timestamptz
language sql
immutable
as $$
  select least(s.ends_at, coalesce(s.ended_at, s.ends_at));
$$;

-- Number of check-in boundaries strictly inside the session (a 4h session at 60 min = 3).
create or replace function public.session_expected_checkins(s public.sessions)
returns int
language sql
immutable
as $$
  select greatest(
    0,
    ceil(extract(epoch from (public.session_end_at(s) - s.starts_at)) / (s.checkin_interval_min * 60.0))::int - 1
  );
$$;

create or replace function public.create_session(
  rid uuid,
  session_title text,
  start_at timestamptz,
  end_at timestamptz,
  interval_min int default 60
)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.sessions;
  starts timestamptz := greatest(start_at, now());
begin
  if uid is null or not public.is_room_member(rid) then
    raise exception 'You need to be in this room to start a session.';
  end if;
  if start_at < now() - interval '5 minutes' then raise exception 'Pick a start time from now on.'; end if;
  if end_at - starts < interval '10 minutes' then raise exception 'Sessions need to be at least 10 minutes long.'; end if;
  if end_at - starts > interval '12 hours' then raise exception 'Keep sessions under 12 hours.'; end if;
  if exists (
    select 1 from public.sessions x
    where x.room_id = rid and public.session_end_at(x) > now()
  ) then
    raise exception 'This room already has a session planned or running. End it before starting another.';
  end if;

  insert into public.sessions (room_id, created_by, title, starts_at, ends_at, checkin_interval_min)
  values (rid, uid, btrim(session_title), starts, end_at, interval_min)
  returning * into s;

  insert into public.session_participants (session_id, room_id, user_id) values (s.id, rid, uid);

  insert into public.messages (room_id, user_id, type, body, session_id)
  values (rid, uid, 'system',
          case when starts <= now() + interval '1 minute' then 'started a session' else 'scheduled a session' end,
          s.id);
  return s;
end;
$$;

create or replace function public.end_session(sid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where id = sid;
  if s.id is null or not public.is_room_member(s.room_id) then raise exception 'Session not found.'; end if;
  if s.created_by <> auth.uid()
     and not exists (select 1 from public.rooms r where r.id = s.room_id and r.owner_id = auth.uid()) then
    raise exception 'Only the person who started the session or the room owner can end it.';
  end if;
  if public.session_end_at(s) <= now() then return; end if;

  update public.sessions
  set ended_at = case when starts_at > now() then starts_at + interval '1 second' else now() end
  where id = sid;

  insert into public.messages (room_id, user_id, type, body, session_id)
  values (s.room_id, auth.uid(), 'system',
          case when s.starts_at > now() then 'cancelled the session' else 'ended the session early' end, sid);
end;
$$;

-- Goals, hourly updates and the end-of-session drop. Each writes the participant row
-- and posts a structured message so the room (and the AI) sees it.
create or replace function public.session_checkin(sid uuid, kind text, body text, met text default null)
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
    insert into public.session_participants (session_id, room_id, user_id, goal)
    values (sid, s.room_id, uid, clean)
    on conflict (session_id, user_id) do update set goal = excluded.goal;
    insert into public.messages (room_id, user_id, type, body, session_id, meta)
    values (s.room_id, uid, 'checkin', clean, sid, jsonb_build_object('kind', 'goal'))
    returning * into m;

  elsif kind = 'progress' then
    if p.goal is null then raise exception 'Drop your goal first.'; end if;
    if now() < s.starts_at or now() >= ends then raise exception 'Updates open while the session is running.'; end if;
    if char_length(clean) > 1000 then raise exception 'Keep updates under 1000 characters.'; end if;
    slot := floor(extract(epoch from (now() - s.starts_at)) / (s.checkin_interval_min * 60))::int;
    begin
      insert into public.messages (room_id, user_id, type, body, session_id, meta)
      values (s.room_id, uid, 'progress', clean, sid, jsonb_build_object('slot', slot))
      returning * into m;
    exception when unique_violation then
      raise exception 'You already posted an update for this check-in.';
    end;

  elsif kind = 'done' then
    if p.goal is null then raise exception 'You did not drop a goal for this session.'; end if;
    if p.dropped_at is not null then raise exception 'You already dropped what you did.'; end if;
    if now() < s.starts_at then raise exception 'The session has not started yet.'; end if;
    if met not in ('yes', 'partly', 'no') then raise exception 'Say whether you hit your goal.'; end if;
    update public.session_participants
    set done_text = left(clean, 1000), goal_met = met, dropped_at = now(), on_break = false
    where session_id = sid and user_id = uid;
    insert into public.messages (room_id, user_id, type, body, session_id, meta)
    values (s.room_id, uid, 'done', left(clean, 1000), sid, jsonb_build_object('goal_met', met))
    returning * into m;

  else
    raise exception 'Unknown check-in.';
  end if;
  return m;
end;
$$;

-- The browser reports focused/away/break seconds every ~30s while a session runs.
create or replace function public.report_focus(sid uuid, focus int, away int, brk int default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions;
  f int := least(greatest(coalesce(focus, 0), 0), 120);
  a int := least(greatest(coalesce(away, 0), 0), 120);
  b int := least(greatest(coalesce(brk, 0), 0), 120);
begin
  select * into s from public.sessions where id = sid;
  if s.id is null then return; end if;
  if now() < s.starts_at or now() > public.session_end_at(s) + interval '2 minutes' then return; end if;
  if f + a + b > 130 then return; end if; -- reports arrive every ~30s; ignore anything implausible
  update public.session_participants
  set focus_seconds = focus_seconds + f, away_seconds = away_seconds + a, break_seconds = break_seconds + b
  where session_id = sid and user_id = auth.uid() and dropped_at is null;
end;
$$;

create or replace function public.set_break(sid uuid, on_break_now boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.session_participants set on_break = on_break_now
  where session_id = sid and user_id = auth.uid();
$$;

-- Scores everyone, updates streaks and badges. Safe to call more than once.
-- Score = 50% focus time + 35% goal + 15% check-ins on time, out of 100.
create or replace function public.finalize_session(sid uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions;
  ends timestamptz;
  expected int;
  team int;
  r record;
  local_day date;
  st public.streaks;
begin
  select * into s from public.sessions where id = sid for update;
  if s.id is null or not (public.is_room_member(s.room_id) or auth.role() = 'service_role') then
    raise exception 'Session not found.';
  end if;
  ends := public.session_end_at(s);
  if now() < ends then raise exception 'The session is still running.'; end if;
  if s.finalized_at is not null then return s.team_score; end if;

  expected := public.session_expected_checkins(s);

  update public.session_participants sp
  set focus_score = round(
        50 * case when sp.focus_seconds + sp.away_seconds > 0
                  then sp.focus_seconds::numeric / (sp.focus_seconds + sp.away_seconds) else 0 end
      + 35 * case sp.goal_met when 'yes' then 1 when 'partly' then 0.5 else 0 end
      + 15 * case when expected = 0 then 1 else least(1, (
              select count(distinct (m.meta ->> 'slot'))::numeric from public.messages m
              where m.session_id = sid and m.user_id = sp.user_id and m.type = 'progress'
                and (m.meta ->> 'slot')::int between 1 and expected
            ) / expected) end
      )::int
  where sp.session_id = sid and sp.goal is not null;

  select round(avg(focus_score))::int into team
  from public.session_participants where session_id = sid and goal is not null;

  update public.sessions set finalized_at = now(), team_score = team where id = sid;

  -- Streaks and badges for everyone who dropped what they did.
  for r in
    select sp.*, coalesce(p.timezone, 'UTC') as tz
    from public.session_participants sp join public.profiles p on p.id = sp.user_id
    where sp.session_id = sid and sp.dropped_at is not null
  loop
    begin
      local_day := (ends at time zone r.tz)::date;
    exception when others then
      local_day := (ends at time zone 'UTC')::date;
      r.tz := 'UTC';
    end;

    select * into st from public.streaks where user_id = r.user_id;
    if st.user_id is null then
      insert into public.streaks (user_id, current_days, best_days, last_session_date) values (r.user_id, 1, 1, local_day);
    elsif st.last_session_date = local_day then
      null;
    elsif st.last_session_date = local_day - 1 then
      update public.streaks set current_days = current_days + 1, best_days = greatest(best_days, current_days + 1),
        last_session_date = local_day where user_id = r.user_id;
    else
      update public.streaks set current_days = 1, best_days = greatest(best_days, 1), last_session_date = local_day
      where user_id = r.user_id;
    end if;

    if extract(hour from (s.starts_at at time zone r.tz)) < 8 then
      insert into public.badges (user_id, badge_key) values (r.user_id, 'early_bird') on conflict do nothing;
    end if;
    if extract(hour from (ends at time zone r.tz)) >= 22 or extract(hour from (ends at time zone r.tz)) < 4 then
      insert into public.badges (user_id, badge_key) values (r.user_id, 'night_owl') on conflict do nothing;
    end if;
    if ends - s.starts_at >= interval '90 minutes' and r.away_seconds <= 60 and r.focus_seconds >= 81 * 60 then
      insert into public.badges (user_id, badge_key) values (r.user_id, 'deep_diver') on conflict do nothing;
    end if;
    if (select count(*) = 5 and bool_and(goal_met = 'yes') from (
          select goal_met from public.session_participants
          where user_id = r.user_id and dropped_at is not null
          order by dropped_at desc limit 5) last5) then
      insert into public.badges (user_id, badge_key) values (r.user_id, 'finisher') on conflict do nothing;
    end if;
  end loop;

  return team;
end;
$$;

-- Server-side AI workers claim a job so two browsers never trigger the same summary twice.
create or replace function public.claim_ai_job(sid uuid, job text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed int;
begin
  if job = 'summary' then
    update public.sessions set summary_claimed_at = now()
    where id = sid and (summary_claimed_at is null or summary_claimed_at < now() - interval '90 seconds');
  elsif job = 'recap' then
    update public.sessions set recap_status = 'working', recap_claimed_at = now()
    where id = sid and (recap_status in ('none', 'failed')
                        or (recap_status = 'working' and recap_claimed_at < now() - interval '3 minutes'));
  else
    raise exception 'Unknown job.';
  end if;
  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

-- ───────────────────────── Public rooms ─────────────────────────
create or replace function public.list_public_rooms()
returns table (id uuid, name text, type public.room_type, member_count bigint, live boolean, joined boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.type,
         (select count(*) from public.room_members m where m.room_id = r.id),
         exists (select 1 from public.sessions s where s.room_id = r.id
                 and s.starts_at <= now() and public.session_end_at(s) > now()),
         exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = auth.uid())
  from public.rooms r
  where r.visibility = 'public'
  order by 5 desc, 4 desc, r.created_at desc
  limit 100;
$$;

create or replace function public.join_public_room(rid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted int;
begin
  if auth.uid() is null then raise exception 'You need to be signed in.'; end if;
  if not exists (select 1 from public.rooms where id = rid and visibility = 'public') then
    raise exception 'This room is not open to everyone.';
  end if;
  insert into public.room_members (room_id, user_id, role) values (rid, auth.uid(), 'member') on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    insert into public.messages (room_id, user_id, type, body) values (rid, auth.uid(), 'system', 'joined the room');
  end if;
  return rid;
end;
$$;

-- Functions are executable by PUBLIC by default; lock them down explicitly.
revoke execute on function public.create_session, public.end_session, public.session_checkin, public.report_focus,
  public.set_break, public.finalize_session, public.list_public_rooms, public.join_public_room from public, anon;
grant execute on function public.create_session, public.end_session, public.session_checkin, public.report_focus,
  public.set_break, public.finalize_session, public.list_public_rooms, public.join_public_room to authenticated, service_role;
-- AI job claims are for the server (service role) only.
revoke execute on function public.claim_ai_job from public, anon, authenticated;
grant execute on function public.claim_ai_job to service_role;

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_summaries enable row level security;
alter table public.session_recaps enable row level security;
alter table public.streaks enable row level security;
alter table public.badges enable row level security;

-- Everything is written through the functions above or by the server; members can read.
create policy "members read sessions" on public.sessions
  for select to authenticated using (public.is_room_member(room_id));
create policy "members read participants" on public.session_participants
  for select to authenticated using (public.is_room_member(room_id));
create policy "members read summaries" on public.session_summaries
  for select to authenticated using (public.is_room_member(room_id));
create policy "members read recaps" on public.session_recaps
  for select to authenticated using (public.is_room_member(room_id));
create policy "streaks are visible" on public.streaks
  for select to authenticated using (true);
create policy "badges are visible" on public.badges
  for select to authenticated using (true);

-- ───────────────────────── Realtime ─────────────────────────
alter publication supabase_realtime add table
  public.rooms, public.sessions, public.session_participants, public.session_summaries, public.session_recaps;
