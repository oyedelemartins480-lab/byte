-- Byte · Table privileges.
-- New Supabase projects no longer grant the API roles access to new tables
-- automatically, so grant exactly what the app needs. Row-level security
-- (in the earlier migrations) still decides WHICH rows each user can touch.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, update, delete on public.rooms to authenticated;
grant select, insert, delete on public.room_members to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select, insert, delete on public.reactions to authenticated;

grant select on
  public.sessions,
  public.session_participants,
  public.session_summaries,
  public.session_recaps,
  public.streaks,
  public.badges
to authenticated;

-- The server (secret key) writes AI notes, recaps and transcripts.
grant all on all tables in schema public to service_role;
