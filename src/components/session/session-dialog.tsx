"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoomType, Session } from "@/lib/types";
import { XIcon } from "../icons";
import { Spinner } from "../setup-chat";

const LENGTHS = [
  [25, "25 min"],
  [50, "50 min"],
  [90, "90 min"],
  [120, "2 hours"],
  [180, "3 hours"],
  [240, "4 hours"],
] as const;
const INTERVALS = [30, 45, 60] as const;

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionDialog({
  open,
  roomId,
  roomType,
  onClose,
  onCreated,
}: {
  open: boolean;
  roomId: string;
  roomType: RoomType;
  onClose: () => void;
  onCreated: (s: Session) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(roomType === "lockin" ? "Lock-in" : "Build session");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState("");
  const [length, setLength] = useState<number>(roomType === "lockin" ? 120 : 90);
  const [interval, setInterval_] = useState<number>(60);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const next = new Date(Date.now() + 60 * 60_000);
      next.setMinutes(0, 0, 0);
      setStartAt(localInputValue(next));
      setError("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return setError("Give the session a name.");
    const start = when === "now" ? new Date() : new Date(startAt);
    if (Number.isNaN(start.getTime())) return setError("Pick a start time.");
    if (when === "later" && start.getTime() < Date.now() - 60_000) return setError("Pick a time from now on.");
    const end = new Date(start.getTime() + length * 60_000);
    setBusy(true);
    setError("");
    const { data, error: err } = await createClient().rpc("create_session", {
      rid: roomId,
      session_title: name,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      interval_min: interval,
    });
    setBusy(false);
    if (err || !data) return setError(err?.message ?? "Couldn't start the session.");
    onCreated(data as Session);
    onClose();
  }

  const chip = (on: boolean) =>
    `btn min-h-10 rounded-full border px-3.5 text-sm font-medium ${on ? "border-fg bg-sunk text-fg" : "border-line text-muted"}`;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(480px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
              {roomType === "lockin" ? "Start a lock-in" : "Start a session"}
            </h2>
            <p className="m-0 text-sm text-muted">Everyone drops a goal, checks in as you go, and drops what they did at the end.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="btn size-9 shrink-0 rounded-lg text-muted">
            <XIcon />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="session-title" className="text-sm font-medium">
            Name
          </label>
          <input
            id="session-title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-12 rounded-xl border border-line bg-bg px-3.5 text-base text-fg outline-none focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
          />
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">When</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(when === "now")} aria-pressed={when === "now"} onClick={() => setWhen("now")}>
              Start now
            </button>
            <button type="button" className={chip(when === "later")} aria-pressed={when === "later"} onClick={() => setWhen("later")}>
              Schedule it
            </button>
          </div>
          {when === "later" && (
            <>
              <label htmlFor="session-start" className="sr-only">
                Start time
              </label>
              <input
                id="session-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="min-h-12 rounded-xl border border-line bg-bg px-3.5 text-base text-fg outline-none focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
              />
            </>
          )}
        </fieldset>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">How long</legend>
          <div className="flex flex-wrap gap-2">
            {LENGTHS.map(([mins, label]) => (
              <button key={mins} type="button" className={chip(length === mins)} aria-pressed={length === mins} onClick={() => setLength(mins)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">Check in every</legend>
          <div className="flex flex-wrap gap-2">
            {INTERVALS.map((m) => (
              <button key={m} type="button" className={chip(interval === m)} aria-pressed={interval === m} onClick={() => setInterval_(m)}>
                {m} min
              </button>
            ))}
          </div>
          {length <= interval && (
            <p className="m-0 mt-2 text-[13px] text-muted">Short session: no check-ins in the middle, just a goal and a drop.</p>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="m-0 text-sm text-err">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn min-h-11 rounded-[10px] px-4 font-medium text-fg">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn min-h-11 rounded-[10px] bg-inv px-5 font-semibold text-inv-fg">
            {busy ? (
              <>
                <Spinner /> Starting…
              </>
            ) : when === "now" ? (
              "Start session"
            ) : (
              "Schedule session"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
