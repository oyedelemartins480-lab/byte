import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyUsers, pushConfig, wanting } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MIN = 60_000;

type Row = {
  id: string;
  room_id: string;
  title: string;
  created_by: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
  checkin_interval_min: number;
  rooms: { name: string } | null;
};

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

const clockIn = (iso: string, tz: string) => {
  try {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso));
  }
};

/**
 * Runs every minute (Supabase pg_cron calls it). Sends lock-in notifications:
 * 10 minutes before, at the start, when a check-in is due, and at the end.
 * Each one goes out once per person, however often this runs.
 */
async function tick(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfig().ready) return NextResponse.json({ ok: true, skipped: "push not configured" });
  const admin = createAdminClient();
  const now = Date.now();

  const { data } = await admin
    .from("sessions")
    .select("id, room_id, title, created_by, created_at, starts_at, ends_at, ended_at, checkin_interval_min, rooms(name)")
    .lte("starts_at", new Date(now + 12 * MIN).toISOString())
    .gte("ends_at", new Date(now - 15 * MIN).toISOString())
    .limit(500);
  const sessions = (data ?? []) as unknown as Row[];
  let sent = 0;

  for (const s of sessions) {
    const start = new Date(s.starts_at).getTime();
    const planned = new Date(s.ends_at).getTime();
    const end = s.ended_at ? Math.min(planned, new Date(s.ended_at).getTime()) : planned;
    const room = s.rooms?.name ?? "your room";
    const url = `/app/r/${s.room_id}`;
    const members = async () => {
      const { data: m } = await admin.from("room_members").select("user_id").eq("room_id", s.room_id);
      return (m ?? []).map((r) => r.user_id as string);
    };

    // 10 minutes before (only for sessions scheduled ahead, not "start now").
    if (start - now > 0 && start - now <= 11 * MIN && start - new Date(s.created_at).getTime() > 12 * MIN && !s.ended_at) {
      const ids = await wanting(admin, await members(), "sessions");
      const { data: tzs } = await admin.from("profiles").select("id, timezone").in("id", ids);
      // Times differ per person, so send per time zone.
      const byTz = new Map<string, string[]>();
      for (const p of tzs ?? []) byTz.set(p.timezone as string, [...(byTz.get(p.timezone as string) ?? []), p.id as string]);
      for (const [tz, users] of byTz)
        sent += await notifyUsers(admin, users, `soon:${s.id}`, {
          title: `${s.title} starts at ${clockIn(s.starts_at, tz)}`,
          body: `In ${room}. Get your goal ready, then put your phone away.`,
          url,
        });
    }

    // Starting now.
    if (now >= start && now - start < 5 * MIN && now < end) {
      const ids = (await wanting(admin, await members(), "sessions")).filter((id) => id !== s.created_by);
      sent += await notifyUsers(admin, ids, `start:${s.id}`, {
        title: `${s.title} is live`,
        body: `Lock in with ${room}. Drop your goal.`,
        url,
      });
    }

    const { data: parts } = await admin
      .from("session_participants")
      .select("user_id, goal, dropped_at, on_break")
      .eq("session_id", s.id);
    const goalHolders = (parts ?? []).filter((p) => p.goal && !p.dropped_at);

    // A check-in just came due.
    const interval = s.checkin_interval_min * MIN;
    const slot = Math.floor((now - start) / interval);
    const boundary = start + slot * interval;
    if (slot >= 1 && boundary < end && now < end && now - boundary < 5 * MIN && goalHolders.length) {
      const { data: done } = await admin
        .from("messages")
        .select("user_id")
        .eq("session_id", s.id)
        .eq("type", "progress")
        .eq("meta->>slot", String(slot));
      const posted = new Set((done ?? []).map((d) => d.user_id as string));
      const owe = goalHolders.filter((p) => !p.on_break && !posted.has(p.user_id as string)).map((p) => p.user_id as string);
      sent += await notifyUsers(admin, await wanting(admin, owe, "sessions"), `checkin:${s.id}:${slot}`, {
        title: `Check-in · ${s.title}`,
        body: "One line on what you got done this stretch.",
        url,
      });
    }

    // Time's up.
    if (now >= end && now - end < 15 * MIN && goalHolders.length) {
      const ids = await wanting(admin, goalHolders.map((p) => p.user_id as string), "sessions");
      sent += await notifyUsers(admin, ids, `end:${s.id}`, {
        title: `Time's up · ${s.title}`,
        body: "Drop what you did and whether you hit your goal. The recap posts when everyone's in.",
        url,
      });
    }
  }

  // Keep the sent log small.
  if (Math.random() < 0.02) await admin.from("push_sent").delete().lt("sent_at", new Date(now - 14 * 86_400_000).toISOString());

  return NextResponse.json({ ok: true, sessions: sessions.length, sent });
}

export const GET = tick;
export const POST = tick;
