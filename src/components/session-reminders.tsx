"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { notifyOnce, pushActive, refreshPush, remindersOn, REMINDERS_EVENT } from "@/lib/reminders";

type Upcoming = { id: string; title: string; starts_at: string; room_id: string; rooms: { name: string } | null };

const LEAD_MS = 10 * 60_000;
const POLL_MS = 3 * 60_000;
const clock = (t: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(t);

/**
 * Lives in the app shell. Looks up lock-in sessions in your rooms starting in
 * the next day and pings you 10 minutes before and when they start.
 */
export function SessionReminders() {
  const supabase = useMemo(() => createClient(), []);
  const [on, setOn] = useState(false);

  useEffect(() => {
    void refreshPush();
  }, []);

  useEffect(() => {
    // With server push on, the server sends these; the tab stays quiet.
    const sync = () => setOn(remindersOn() && !pushActive());
    sync();
    window.addEventListener(REMINDERS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(REMINDERS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;

    async function load() {
      const now = Date.now();
      const { data } = await supabase
        .from("sessions")
        .select("id, title, starts_at, room_id, rooms(name)")
        .is("ended_at", null)
        .gt("starts_at", new Date(now - 60_000).toISOString())
        .lt("starts_at", new Date(now + 24 * 3_600_000).toISOString())
        .order("starts_at")
        .limit(20);
      if (stopped) return;
      timers.forEach(clearTimeout);
      timers = [];
      for (const s of (data ?? []) as unknown as Upcoming[]) {
        const start = new Date(s.starts_at).getTime();
        const where = s.rooms?.name ? ` in ${s.rooms.name}` : "";
        const url = `/app/r/${s.room_id}`;
        const soon = start - LEAD_MS - Date.now();
        if (soon > 0 && soon < POLL_MS * 2)
          timers.push(
            setTimeout(() => notifyOnce(`soon:${s.id}`, `${s.title} starts at ${clock(start)}`, `10 minutes to go${where}. Get your goal ready.`, url), soon),
          );
        const atStart = start - Date.now();
        if (atStart > -60_000 && atStart < POLL_MS * 2)
          timers.push(
            setTimeout(() => notifyOnce(`start:${s.id}`, `${s.title} is live`, `Lock in${where}. Drop your goal.`, url), Math.max(0, atStart)),
          );
      }
    }

    void load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
      timers.forEach(clearTimeout);
    };
  }, [on, supabase]);

  return null;
}
