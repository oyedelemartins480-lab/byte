"use client";

import { useState } from "react";
import {
  clock,
  countdown,
  currentSlot,
  dueSlot,
  humanDuration,
  intervalMs,
  nextCheckinAt,
  sessionEnd,
  sessionPhase,
} from "@/lib/session";
import type { Message, Participant, Session } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { ArrowRightIcon, TimerIcon } from "../icons";
import { Spinner } from "../setup-chat";

export type CheckinFn = (kind: "goal" | "progress" | "done", body: string, met?: "yes" | "partly" | "no") => Promise<string | null>;

export const RECAP_GRACE_MS = 15 * 60_000;

export function SessionBar({
  session,
  participants,
  events,
  meId,
  canEnd,
  onCheckin,
  onBreak,
  onEnd,
  onRecap,
  recapBusy,
}: {
  session: Session;
  participants: Participant[];
  events: Message[];
  meId: string;
  canEnd: boolean;
  onCheckin: CheckinFn;
  onBreak: (on: boolean) => void;
  onEnd: () => void;
  onRecap: () => void;
  recapBusy: boolean;
}) {
  const now = useNow(1000);
  const phase = sessionPhase(session, now);
  const start = new Date(session.starts_at).getTime();
  const end = sessionEnd(session);
  const me = participants.find((p) => p.user_id === meId);
  const mine = events.filter((e) => e.user_id === meId);
  const due = me?.goal ? dueSlot(session, now, mine) : null;
  const next = nextCheckinAt(session, now);
  const slotNow = currentSlot(session, now);
  const updatedThisSlot = mine.some((m) => m.type === "progress" && Number((m.meta as { slot?: number }).slot) === slotNow);
  const [extraUpdate, setExtraUpdate] = useState(false);
  const elapsedPct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));

  const goalHolders = participants.filter((p) => p.goal);
  const waitingOn = goalHolders.filter((p) => !p.dropped_at).length;

  let prompt: React.ReactNode = null;
  if (phase !== "ended" && !me?.goal) {
    prompt = (
      <PromptForm
        key="goal"
        label={`What will you finish by ${clock(end)}?`}
        placeholder="e.g. Ship the login screen"
        cta="Drop goal"
        maxLength={500}
        onSubmit={(v) => onCheckin("goal", v)}
      />
    );
  } else if (phase === "live" && me?.goal && !me.dropped_at && (due !== null || extraUpdate)) {
    prompt = (
      <PromptForm
        key={`progress-${slotNow}`}
        label={
          due !== null
            ? `It's ${clock(start + due * intervalMs(session))}. What did you get done this ${
                session.checkin_interval_min === 60 ? "hour" : "stretch"
              }?`
            : "Post an update"
        }
        placeholder="One line is enough"
        cta="Post update"
        maxLength={1000}
        onSubmit={async (v) => {
          const err = await onCheckin("progress", v);
          if (!err) setExtraUpdate(false);
          return err;
        }}
        secondary={
          <button
            type="button"
            onClick={() => onBreak(!me.on_break)}
            className="btn min-h-11 rounded-xl border border-hi-fg/40 px-4 text-sm font-medium text-hi-fg"
          >
            {me.on_break ? "End research break" : "Research break"}
          </button>
        }
      />
    );
  } else if (phase === "ended" && me?.goal && !me.dropped_at) {
    prompt = <DoneForm goal={me.goal} onSubmit={(v, met) => onCheckin("done", v, met)} />;
  }

  return (
    <section aria-label="Session" className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
              phase === "live" ? "bg-inv text-inv-fg" : "bg-sunk text-muted"
            }`}
          >
            <TimerIcon size={18} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold">{session.title}</span>
            <span className="text-[13px] text-muted">
              {phase === "scheduled" && `Starts ${clock(start)} · ${humanDuration(end - start)}`}
              {phase === "live" &&
                `${clock(start)}–${clock(end)}${next ? ` · next check-in ${clock(next)}` : " · last stretch"}`}
              {phase === "ended" && `Ended ${clock(end)} · ${goalHolders.length} locked in`}
            </span>
          </div>
        </div>

        {phase !== "ended" && (
          <div className="flex items-center gap-2" aria-live="off">
            <span className="text-[13px] text-muted">{phase === "scheduled" ? "Starts in" : "Left"}</span>
            <span className="font-mono text-[26px] leading-none tabular-nums tracking-[-0.02em]">
              {countdown((phase === "scheduled" ? start : end) - now)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {phase === "live" && me?.goal && !me.dropped_at && due === null && !extraUpdate && !updatedThisSlot && (
            <button
              type="button"
              onClick={() => setExtraUpdate(true)}
              className="btn min-h-10 rounded-[10px] border border-line px-3 text-sm font-medium text-fg"
            >
              Post update
            </button>
          )}
          {phase === "live" && me?.goal && !me.dropped_at && due === null && (
            <button
              type="button"
              onClick={() => onBreak(!me.on_break)}
              aria-pressed={me.on_break}
              className={`btn min-h-10 rounded-[10px] border px-3 text-sm font-medium ${
                me.on_break ? "border-fg bg-sunk text-fg" : "border-line text-fg"
              }`}
            >
              {me.on_break ? "End break" : "Research break"}
            </button>
          )}
          {canEnd && phase !== "ended" && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(phase === "scheduled" ? "Cancel this session?" : "End the session for everyone now?")) onEnd();
              }}
              className="btn min-h-10 rounded-[10px] px-3 text-sm font-medium text-muted"
            >
              {phase === "scheduled" ? "Cancel" : "End now"}
            </button>
          )}
        </div>
      </div>

      {phase === "live" && (
        <div className="h-1 bg-sunk" aria-hidden="true">
          <div className="h-full bg-fg transition-[width] duration-1000 ease-linear" style={{ width: `${elapsedPct}%` }} />
        </div>
      )}

      {me?.goal && !prompt && phase !== "ended" && (
        <p className="m-0 px-4 py-2.5 text-sm sm:px-5">
          <span className="text-muted">Your goal: </span>
          {me.goal}
          {me.on_break && <span className="ml-2 rounded-full bg-sunk px-2 py-0.5 text-xs text-muted">On research break</span>}
        </p>
      )}

      {prompt && <div className="bg-hi px-4 py-3 text-hi-fg sm:px-5">{prompt}</div>}

      {phase === "ended" && session.recap_status !== "done" && (!me?.goal || me.dropped_at) && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
          <span className="flex-1 text-muted">
            {session.recap_status === "working" || recapBusy
              ? "Writing the recap…"
              : waitingOn > 0
                ? `Waiting for ${waitingOn} more ${waitingOn === 1 ? "person" : "people"} to drop what they did. The recap posts when everyone's in, or at ${clock(end + RECAP_GRACE_MS)}.`
                : "Everyone's in. Posting the recap…"}
          </span>
          {session.recap_status === "working" || recapBusy ? (
            <Spinner />
          ) : (
            <button type="button" onClick={onRecap} className="btn min-h-10 rounded-[10px] bg-inv px-4 font-semibold text-inv-fg">
              Post the recap now
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PromptForm({
  label,
  placeholder,
  cta,
  maxLength,
  onSubmit,
  secondary,
}: {
  label: string;
  placeholder: string;
  cta: string;
  maxLength: number;
  onSubmit: (v: string) => Promise<string | null>;
  secondary?: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `prompt-${cta.replace(/\s/g, "")}`;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return setError("Write one line first.");
        setBusy(true);
        const err = await onSubmit(v);
        setBusy(false);
        if (err) setError(err);
        else setValue("");
      }}
    >
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          className="min-h-11 min-w-0 flex-[1_1_260px] rounded-xl border border-hi-fg/25 bg-surface px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
        />
        <button type="submit" disabled={busy} className="btn min-h-11 rounded-xl bg-inv px-4 font-semibold text-inv-fg">
          {busy ? <Spinner /> : <ArrowRightIcon size={16} />} {cta}
        </button>
        {secondary}
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm font-medium">
          {error}
        </p>
      )}
    </form>
  );
}

function DoneForm({ goal, onSubmit }: { goal: string; onSubmit: (v: string, met: "yes" | "partly" | "no") => Promise<string | null> }) {
  const [met, setMet] = useState<"yes" | "partly" | "no" | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!met) return setError("Did you hit your goal? Pick one.");
        if (!value.trim()) return setError("Write what you finished, even one line.");
        setBusy(true);
        const err = await onSubmit(value.trim(), met);
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <span className="text-[15px] font-semibold">Time&apos;s up. Did you hit your goal?</span>
      <span className="text-sm opacity-80">Your goal: {goal}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Did you hit your goal?">
        {(
          [
            ["yes", "Yes, done"],
            ["partly", "Partly"],
            ["no", "Not this time"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={met === v}
            onClick={() => {
              setMet(v);
              setError("");
            }}
            className={`btn min-h-10 rounded-full border px-4 text-sm font-medium ${
              met === v ? "border-inv bg-inv text-inv-fg" : "border-hi-fg/30 text-hi-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label htmlFor="done-text" className="sr-only">
        What did you finish?
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="done-text"
          value={value}
          maxLength={1000}
          autoComplete="off"
          placeholder="What did you finish?"
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          className="min-h-11 min-w-0 flex-[1_1_260px] rounded-xl border border-hi-fg/25 bg-surface px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
        />
        <button type="submit" disabled={busy} className="btn min-h-11 rounded-xl bg-inv px-4 font-semibold text-inv-fg">
          {busy ? <Spinner /> : null} Drop it
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm font-medium">
          {error}
        </p>
      )}
    </form>
  );
}
