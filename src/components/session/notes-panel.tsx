"use client";

import { clock } from "@/lib/session";
import type { Recap, SessionSummary } from "@/lib/types";
import { SparkleIcon } from "../icons";

/** Side-panel tab: live AI notes for the running session, plus the "Last time…" brief. */
export function NotesPanel({
  summary,
  live,
  aiState,
  lastRecap,
}: {
  summary: SessionSummary | null;
  live: boolean;
  aiState: "on" | "room-off" | "not-configured";
  lastRecap: Recap | null;
}) {
  const ex = summary?.extracted ?? {};
  return (
    <div className="flex flex-col gap-5">
      {lastRecap && (
        <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-bg p-3.5">
          <h3 className="m-0 text-sm font-semibold">Last time…</h3>
          <p className="m-0 text-[13px] text-muted">
            {lastRecap.session_title} · {new Date(lastRecap.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </p>
          <p className="m-0 text-sm leading-relaxed">{lastRecap.summary}</p>
          {lastRecap.tasks.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {lastRecap.tasks.slice(0, 6).map((t, i) => (
                <li key={i}>
                  {t.who && <span className="font-semibold">{t.who}: </span>}
                  {t.what}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
          <SparkleIcon size={14} /> Live notes
          {summary && <span className="font-normal text-muted">· updated {clock(summary.updated_at)}</span>}
        </h3>
        {aiState === "not-configured" && (
          <p className="m-0 text-sm text-muted">AI notes are off on this server. Add an AI provider in the settings to turn them on.</p>
        )}
        {aiState === "room-off" && <p className="m-0 text-sm text-muted">The room owner turned AI notes off.</p>}
        {aiState === "on" && !summary && (
          <p className="m-0 text-sm text-muted">
            {live ? "Notes show up here after the team has talked a bit." : "Start a session and Byte keeps notes while you work."}
          </p>
        )}
        {aiState === "on" && summary && (
          <>
            {summary.summary && <p className="m-0 text-sm leading-relaxed">{summary.summary}</p>}
            <NoteList label="Decisions" items={ex.decisions ?? []} />
            {ex.tasks && ex.tasks.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">Tasks</span>
                {ex.tasks.map((t, i) => (
                  <span key={i} className="text-sm">
                    {t.who && <span className="font-semibold">{t.who}: </span>}
                    {t.what}
                  </span>
                ))}
              </div>
            )}
            <NoteList label="Blockers" items={ex.blockers ?? []} />
          </>
        )}
      </section>
    </div>
  );
}

function NoteList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {items.map((d, i) => (
        <span key={i} className="text-sm">
          {d}
        </span>
      ))}
    </div>
  );
}
