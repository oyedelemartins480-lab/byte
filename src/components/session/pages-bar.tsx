import { BookIcon } from "../icons";

/** Reading progress: "p. 112 of 168" with a bar. */
export function PagesBar({ read, total, compact = false }: { read: number | null; total: number | null; compact?: boolean }) {
  if (!total) return null;
  const page = Math.min(read ?? 0, total);
  const pct = Math.round((page / total) * 100);
  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
      <div
        role="progressbar"
        aria-label="Pages read"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={page}
        aria-valuetext={`Page ${page} of ${total}`}
        className={`overflow-hidden rounded-full bg-sunk ${compact ? "h-1" : "h-1.5"}`}
      >
        <div className="h-full rounded-full bg-live" style={{ width: `${pct}%` }} />
      </div>
      <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-muted">
        <BookIcon size={13} /> p. {page} of {total} · {pct}%
      </span>
    </div>
  );
}
