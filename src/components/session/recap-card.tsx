import { GOAL_MET_LABEL, clock } from "@/lib/session";
import type { Recap } from "@/lib/types";
import { SparkleIcon } from "../icons";

/** The end-of-session card: goal vs. done per person, team score, and the AI's notes. */
export function RecapCard({ recap }: { recap: Recap }) {
  const lists: [string, string[]][] = [
    ["Decisions", recap.decisions],
    ["Blockers", recap.blockers],
  ];
  return (
    <article className="flex w-full max-w-[640px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[13px] text-muted">
            Session recap · {clock(recap.starts_at)}–{clock(recap.ends_at)}
          </span>
          <h3 className="m-0 text-lg font-semibold">{recap.session_title}</h3>
        </div>
        {recap.team_score !== null && (
          <span className="rounded-full bg-hi px-3 py-1.5 text-[13px] font-semibold text-hi-fg">
            Team score {recap.team_score}
          </span>
        )}
      </header>

      {recap.summary && <p className="m-0 text-[15px] leading-relaxed">{recap.summary}</p>}

      {recap.people.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-xl border border-line p-0">
          {recap.people.map((p) => (
            <li key={p.user_id} className="flex flex-col gap-1 px-3.5 py-3 text-sm sm:flex-row sm:items-start sm:gap-4">
              <span className="w-28 shrink-0 font-semibold">{p.name}</span>
              <span className="min-w-0 flex-1">
                <span className="text-muted">Goal:</span> {p.goal}
                {p.done && (
                  <>
                    <br />
                    <span className="text-muted">Did:</span> {p.done}
                  </>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-line px-2 py-0.5 text-xs">
                  {p.goal_met ? GOAL_MET_LABEL[p.goal_met] : "No drop"}
                </span>
                {p.score !== null && <span className="text-xs tabular-nums text-muted">{p.score} pts</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {recap.tasks.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="m-0 text-[13px] font-normal text-muted">Next up</h4>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {recap.tasks.map((t, i) => (
              <li key={i}>
                {t.who && <span className="font-semibold">{t.who}: </span>}
                {t.what}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lists
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => (
          <section key={label} className="flex flex-col gap-1.5">
            <h4 className="m-0 text-[13px] font-normal text-muted">{label}</h4>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
              {items.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </section>
        ))}

      {recap.links.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="m-0 text-[13px] font-normal text-muted">Links</h4>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {recap.links.map((l) => (
              <li key={l} className="truncate">
                <a href={l} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-2">
                  {l.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recap.ai && (
        <p className="m-0 flex items-center gap-1.5 text-xs text-muted">
          <SparkleIcon size={13} /> Notes written by AI from this session. Double-check anything important.
        </p>
      )}
    </article>
  );
}
