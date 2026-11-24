"use client";

import { GOAL_MET_LABEL, clock, expectedCheckins, focusPct } from "@/lib/session";
import type { Member, Message, Participant, Session } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { PagesBar } from "./pages-bar";

/** Everyone's goal, check-ins and drop for the current session, side by side. */
export function Board({
  session,
  participants,
  events,
  members,
  meId,
}: {
  session: Session;
  participants: Participant[];
  events: Message[];
  members: Map<string, Member>;
  meId: string;
}) {
  const expected = expectedCheckins(session);
  const joined = participants
    .filter((p) => p.goal)
    .sort((a, b) => (a.user_id === meId ? -1 : b.user_id === meId ? 1 : a.joined_at.localeCompare(b.joined_at)));
  const notYet = Array.from(members.values()).filter((m) => !participants.some((p) => p.user_id === m.id && p.goal));

  return (
    <div className="flex flex-col gap-4">
      {joined.length === 0 ? (
        <p className="m-0 rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          Nobody has dropped a goal yet. Be the first.
        </p>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
          {joined.map((p) => {
            const m = members.get(p.user_id);
            const mine = events.filter((e) => e.user_id === p.user_id);
            const updates = new Set(
              mine
                .filter((e) => e.type === "progress")
                .map((e) => Number((e.meta as { slot?: number }).slot))
                .filter((s) => s >= 1 && s <= expected),
            ).size;
            const focus = focusPct(p);
            const status = p.dropped_at
              ? GOAL_MET_LABEL[p.goal_met ?? "no"]
              : p.on_break
                ? "On research break"
                : focus !== null
                  ? `Focused · ${focus}%`
                  : "Locked in";
            const isMe = p.user_id === meId;
            return (
              <article
                key={p.user_id}
                className={`flex flex-col gap-3.5 rounded-2xl bg-surface p-[18px] ${isMe ? "border-[1.5px] border-fg" : "border border-line"}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={m?.name ?? "?"} url={m?.avatar_url} size={40} tone={isMe ? "inv" : "sunk"} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{isMe ? "You" : m?.name ?? "Someone"}</span>
                    <span className="text-[13px] text-muted">{status}</span>
                  </div>
                  {p.focus_score !== null && (
                    <span className="rounded-full bg-hi px-2.5 py-1 text-xs font-semibold tabular-nums text-hi-fg">{p.focus_score}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-base font-medium leading-snug">{p.goal}</span>
                  {p.goal_kind === "reading" && <PagesBar read={p.pages_read ?? 0} total={p.pages_total ?? null} />}
                  {expected > 0 && (
                    <>
                      <div className="h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
                        <div className="h-full rounded-full bg-fg" style={{ width: `${(updates / expected) * 100}%` }} />
                      </div>
                      <span className="text-[13px] tabular-nums text-muted">
                        {updates} of {expected} check-ins
                      </span>
                    </>
                  )}
                </div>
                {mine.length > 0 && (
                  <ol className="m-0 flex list-none flex-col gap-2 border-t border-line p-0 pt-3">
                    {mine.map((e) => (
                      <li key={e.id} className="flex gap-2.5 text-sm leading-snug">
                        <span className="w-[4.75rem] shrink-0 whitespace-nowrap pt-px font-mono text-xs text-muted">{clock(e.created_at)}</span>
                        <span>
                          {e.type === "checkin" && <span className="text-muted">Goal: </span>}
                          {e.type === "done" && (
                            <span className="font-semibold">
                              {GOAL_MET_LABEL[((e.meta as { goal_met?: "yes" | "partly" | "no" }).goal_met ?? "no")]}:{" "}
                            </span>
                          )}
                          {e.body}
                          {typeof (e.meta as { page?: number }).page === "number" && (
                            <span className="ml-1.5 whitespace-nowrap text-xs text-muted">· p. {(e.meta as { page: number }).page}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}
      {notYet.length > 0 && (
        <p className="m-0 text-[13px] text-muted">
          Not in yet: {notYet.map((m) => (m.id === meId ? "you" : m.name.split(" ")[0])).join(", ")}
        </p>
      )}
    </div>
  );
}
