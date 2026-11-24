import type { Message } from "@/lib/types";

export type GitHubEventMeta = {
  source: "github";
  event: "push" | "pull_request" | "issues" | "release" | "ping";
  repo: string;
  url: string;
  actor?: string;
  action?: string;
  branch?: string;
  number?: number;
  title?: string;
  commits?: { id: string; message: string; url: string }[];
  total_commits?: number;
};

const PILL: Record<string, string> = {
  opened: "bg-hi text-hi-fg",
  reopened: "bg-hi text-hi-fg",
  ready_for_review: "bg-hi text-hi-fg",
  merged: "bg-inv text-inv-fg",
  published: "bg-inv text-inv-fg",
};

/** A GitHub event posted into the room by the webhook. */
export function IntegrationCard({ m }: { m: Message }) {
  const meta = m.meta as unknown as GitHubEventMeta;
  if (meta?.source !== "github") return <p className="m-0 text-[15px]">{m.body}</p>;
  const label = meta.action ? meta.action.replaceAll("_", " ") : meta.event === "push" ? "pushed" : meta.event;
  return (
    <div className="flex max-w-[520px] flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span className="font-mono text-fg">{meta.repo}</span>
        {meta.branch && <span className="rounded-md bg-sunk px-1.5 py-0.5 font-mono text-xs">{meta.branch}</span>}
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${PILL[meta.action ?? ""] ?? "bg-sunk text-muted"}`}>{label}</span>
        {meta.actor && <span>by @{meta.actor}</span>}
      </div>
      <a href={meta.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold leading-snug text-fg no-underline hover:underline">
        {meta.number ? `#${meta.number} ` : ""}
        {meta.title ?? m.body}
      </a>
      {meta.commits && meta.commits.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {meta.commits.map((c) => (
            <li key={c.id} className="flex gap-2 text-[13px] leading-snug">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-muted no-underline hover:underline">
                {c.id.slice(0, 7)}
              </a>
              <span className="min-w-0 truncate">{c.message}</span>
            </li>
          ))}
          {(meta.total_commits ?? 0) > meta.commits.length && (
            <li className="text-xs text-muted">and {(meta.total_commits ?? 0) - meta.commits.length} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
