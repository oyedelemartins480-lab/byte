import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GOAL_MET_LABEL } from "@/lib/session";
import { Blob, Squiggle } from "@/components/decor";
import { getSession } from "@/lib/supabase/server";
import { liveStreak } from "@/lib/utils";

export const metadata: Metadata = { title: "Your stats · Byte" };

const BADGES = [
  { key: "early_bird", name: "Early Bird", how: "Finish a session that started before 8am." },
  { key: "night_owl", name: "Night Owl", how: "Finish a session that ended after 10pm." },
  { key: "deep_diver", name: "Deep Diver", how: "90+ minutes with Byte in focus and under a minute away." },
  { key: "finisher", name: "Finisher", how: "Hit your goal 5 sessions in a row." },
] as const;

type Row = {
  goal: string | null;
  done_text: string | null;
  goal_met: "yes" | "partly" | "no" | null;
  focus_score: number | null;
  focus_seconds: number;
  dropped_at: string;
  sessions: { title: string; starts_at: string; room_id: string; rooms: { name: string } | null } | null;
};

export default async function StatsPage() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/login?next=/app/me");

  const [{ data: streak }, { data: badges }, { data: rows }] = await Promise.all([
    supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("badges").select("badge_key, earned_at").eq("user_id", user.id),
    supabase
      .from("session_participants")
      .select("goal, done_text, goal_met, focus_score, focus_seconds, dropped_at, sessions(title, starts_at, room_id, rooms(name))")
      .eq("user_id", user.id)
      .not("dropped_at", "is", null)
      .order("dropped_at", { ascending: false })
      .limit(30),
  ]);

  const history = (rows ?? []) as unknown as Row[];
  const scored = history.filter((h) => h.focus_score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + (h.focus_score ?? 0), 0) / scored.length) : null;
  const hours = Math.round((history.reduce((a, h) => a + h.focus_seconds, 0) / 3600) * 10) / 10;
  const hit = history.filter((h) => h.goal_met === "yes").length;
  const earned = new Set((badges ?? []).map((b) => b.badge_key as string));
  const current = liveStreak(streak);

  return (
    <div className="scroll-thin relative isolate h-full overflow-y-auto overflow-x-hidden">
      <Blob variant={1} float className="-right-28 -top-28 -z-10 size-[360px] opacity-80" />
      <Blob variant={3} outline tone="line" className="right-[18%] top-24 -z-10 size-[180px]" />
      <div className="mx-auto flex max-w-[880px] flex-col gap-8 px-5 py-8 sm:px-8">
        <header className="relative flex flex-col gap-2 pt-4">
          <Squiggle className="left-0 top-0 h-4 w-20" />
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-tight tracking-[-0.02em]">Your stats</h1>
          <p className="m-0 text-muted">Your focus score is 50% time with Byte in focus, 35% hitting your goal, 15% checking in on time.</p>
        </header>

        <section aria-label="Summary" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          <Stat label="Current streak" value={`${current} ${current === 1 ? "day" : "days"}`} hint={`Best: ${streak?.best_days ?? 0}`} strong />
          <Stat label="Average score" value={avg !== null ? String(avg) : "—"} hint={`${scored.length} scored sessions`} />
          <Stat label="Goals hit" value={`${hit} of ${history.length}`} hint="Sessions you dropped in" />
          <Stat label="Focused time" value={`${hours}h`} hint="With Byte in focus" />
        </section>

        <section aria-labelledby="badges-h" className="flex flex-col gap-3">
          <h2 id="badges-h" className="m-0 text-lg font-semibold">
            Badges
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            {BADGES.map((b) => {
              const has = earned.has(b.key);
              return (
                <li
                  key={b.key}
                  className={`flex flex-col gap-1 rounded-2xl border p-4 ${has ? "border-fg bg-surface" : "border-dashed border-line"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{b.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${has ? "bg-hi text-hi-fg" : "bg-sunk text-muted"}`}>
                      {has ? "Earned" : "Locked"}
                    </span>
                  </span>
                  <span className="text-[13px] leading-normal text-muted">{b.how}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="history-h" className="flex flex-col gap-3">
          <h2 id="history-h" className="m-0 text-lg font-semibold">
            Recent sessions
          </h2>
          {history.length === 0 ? (
            <p className="m-0 rounded-2xl border border-dashed border-line p-6 text-muted">
              No finished sessions yet. Start a lock-in, drop a goal, and drop what you did at the end. Your score shows up here.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-2xl border border-line bg-surface p-0">
              {history.map((h, i) => (
                <li key={i} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">
                      {h.sessions?.title ?? "Session"}
                      {h.sessions?.rooms?.name && (
                        <Link href={`/app/r/${h.sessions.room_id}`} className="ml-2 text-[13px] font-normal text-muted">
                          in {h.sessions.rooms.name}
                        </Link>
                      )}
                    </span>
                    <span className="truncate text-sm text-muted">{h.goal}</span>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs">{GOAL_MET_LABEL[h.goal_met ?? "no"]}</span>
                    <span className="w-14 text-right font-semibold tabular-nums">{h.focus_score ?? "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-4 ${strong ? "bg-hi text-hi-fg" : "border border-line bg-surface"}`}>
      <span className={`text-[13px] ${strong ? "" : "text-muted"}`}>{label}</span>
      <span className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums">{value}</span>
      <span className={`text-xs ${strong ? "opacity-80" : "text-muted"}`}>{hint}</span>
    </div>
  );
}
