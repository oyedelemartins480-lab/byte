import { getSession } from "@/lib/supabase/server";
import { liveStreak } from "@/lib/utils";
import { weekCard } from "@/lib/week-card";

export const runtime = "nodejs";

type Row = { focus_seconds: number; focus_score: number | null; goal_met: string | null; dropped_at: string };

function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A shareable 1200×630 PNG of the signed-in person's last 7 days. */
export async function GET(req: Request) {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return new Response("Sign in first", { status: 401 });
  const dark = new URL(req.url).searchParams.get("theme") === "dark";
  const tz = (() => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: profile.timezone });
      return profile.timezone;
    } catch {
      return "UTC";
    }
  })();

  const since = new Date(Date.now() - 7 * 86_400_000);
  const [{ data }, { data: streakRow }] = await Promise.all([
    supabase
      .from("session_participants")
      .select("focus_seconds, focus_score, goal_met, dropped_at")
      .eq("user_id", user.id)
      .not("dropped_at", "is", null)
      .gte("dropped_at", since.toISOString()),
    supabase.from("streaks").select("current_days, last_session_date").eq("user_id", user.id).maybeSingle(),
  ]);
  const rows = (data ?? []) as Row[];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    return {
      key: dayKey(d, tz),
      label: new Intl.DateTimeFormat("en", { timeZone: tz, weekday: "narrow" }).format(d),
      secs: 0,
    };
  });
  for (const r of rows) {
    const k = dayKey(new Date(r.dropped_at), tz);
    const day = days.find((d) => d.key === k);
    if (day) day.secs += r.focus_seconds;
  }
  const totalSecs = rows.reduce((a, r) => a + r.focus_seconds, 0);
  const hours = totalSecs / 3600;
  const scored = rows.filter((r) => r.focus_score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.focus_score ?? 0), 0) / scored.length) : null;
  const hit = rows.filter((r) => r.goal_met === "yes").length;
  const streak = liveStreak(streakRow);
  const range = `${new Intl.DateTimeFormat("en", { timeZone: tz, month: "short", day: "numeric" }).format(since)} – ${new Intl.DateTimeFormat("en", { timeZone: tz, month: "short", day: "numeric" }).format(new Date())}`;

  const img = await weekCard({ name: profile.name, range, hours, sessions: rows.length, hit, avg, streak, days, dark });
  img.headers.set("Cache-Control", "private, no-store");
  return img;
}
