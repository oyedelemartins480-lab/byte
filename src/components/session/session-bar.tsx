"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { enableReminders, notifyOnce, remindersOn, REMINDERS_EVENT } from "@/lib/reminders";
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
import { ArrowRightIcon, BellIcon, BookIcon, CalendarIcon, TimerIcon } from "../icons";
import { PagesBar } from "./pages-bar";
import { useConfirm } from "../confirm-dialog";
import { Spinner } from "../setup-chat";

export type CheckinFn = (
  kind: "goal" | "progress" | "done",
  body: string,
  met?: "yes" | "partly" | "no",
  pages?: { page?: number; total?: number },
) => Promise<string | null>;

export const RECAP_GRACE_MS = 15 * 60_000;

function subscribeReminders(cb: () => void) {
  window.addEventListener(REMINDERS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(REMINDERS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

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

  // Nudge with a notification when a check-in comes due while Byte is in the background.
  useEffect(() => {
    if (due === null || !document.hidden) return;
    notifyOnce(`checkin:${session.id}:${due}`, `Check-in time · ${session.title}`, "One line on what you got done this stretch.", location.pathname);
  }, [due, session.id, session.title]);
  const reminders = useSyncExternalStore(subscribeReminders, remindersOn, () => true);
  const [reminderNote, setReminderNote] = useState("");
  const confirm = useConfirm();

  const goalHolders = participants.filter((p) => p.goal);
  const waitingOn = goalHolders.filter((p) => !p.dropped_at).length;

  let prompt: React.ReactNode = null;
  if (phase !== "ended" && !me?.goal) {
    prompt = <GoalForm key="goal" endLabel={clock(end)} onSubmit={(v, pages) => onCheckin("goal", v, undefined, pages)} />;
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
        page={me.goal_kind === "reading" && me.pages_total ? { current: me.pages_read ?? 0, total: me.pages_total } : undefined}
        onSubmit={async (v, page) => {
          const err = await onCheckin("progress", v, undefined, page === undefined ? undefined : { page });
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
    prompt = (
      <DoneForm
        goal={me.goal}
        page={me.goal_kind === "reading" && me.pages_total ? { current: me.pages_read ?? 0, total: me.pages_total } : undefined}
        onSubmit={(v, met, page) => onCheckin("done", v, met, page === undefined ? undefined : { page })}
      />
    );
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
          {phase === "scheduled" && (
            <a
              href={`/api/sessions/${session.id}/ics`}
              download
              className="btn min-h-10 rounded-[10px] border border-line px-3 text-sm font-medium text-fg"
            >
              <CalendarIcon size={16} /> Add to calendar
            </a>
          )}
          {phase !== "ended" && !reminders && (
            <button
              type="button"
              onClick={async () => {
                const res = await enableReminders();
                setReminderNote(
                  res.on ? "Reminders on. We'll ping you 10 minutes before." : res.blocked ? "Notifications are blocked for Byte in your browser settings." : "This browser can't show reminders.",
                );
              }}
              className="btn min-h-10 rounded-[10px] border border-line px-3 text-sm font-medium text-fg"
            >
              <BellIcon size={16} /> Remind me
            </button>
          )}
          {canEnd && phase !== "ended" && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm(
                  phase === "scheduled"
                    ? { title: "Cancel this session?", body: "It's removed for everyone in the room.", confirmLabel: "Cancel session", cancelLabel: "Keep it", danger: true }
                    : {
                        title: "End the session now?",
                        body: "It ends for everyone. Each person drops what they did, then the recap posts.",
                        confirmLabel: "End for everyone",
                        cancelLabel: "Keep going",
                        danger: true,
                      },
                );
                if (ok) onEnd();
              }}
              className="btn min-h-10 rounded-[10px] px-3 text-sm font-medium text-muted"
            >
              {phase === "scheduled" ? "Cancel" : "End now"}
            </button>
          )}
        </div>
      </div>

      {reminderNote && (
        <p role="status" className="m-0 px-4 pb-2.5 text-[13px] text-muted sm:px-5">
          {reminderNote}
        </p>
      )}

      {phase === "live" && (
        <div className="h-1 bg-sunk" aria-hidden="true">
          <div className="h-full bg-fg transition-[width] duration-1000 ease-linear" style={{ width: `${elapsedPct}%` }} />
        </div>
      )}

      {me?.goal && !prompt && phase !== "ended" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm sm:px-5">
          <p className="m-0">
            <span className="text-muted">{me.goal_kind === "reading" ? "Reading: " : "Your goal: "}</span>
            {me.goal}
            {me.on_break && <span className="ml-2 rounded-full bg-sunk px-2 py-0.5 text-xs text-muted">On research break</span>}
          </p>
          {me.goal_kind === "reading" && (
            <div className="w-full max-w-[260px]">
              <PagesBar read={me.pages_read ?? 0} total={me.pages_total ?? null} compact />
            </div>
          )}
        </div>
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
  page,
}: {
  label: string;
  placeholder: string;
  cta: string;
  maxLength: number;
  onSubmit: (v: string, page?: number) => Promise<string | null>;
  secondary?: React.ReactNode;
  page?: { current: number; total: number };
}) {
  const [value, setValue] = useState("");
  const [pageValue, setPageValue] = useState("");
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
        let pg: number | undefined;
        if (page && pageValue.trim()) {
          pg = Number(pageValue);
          if (!Number.isInteger(pg) || pg < 0 || pg > page.total) return setError(`Pick a page from 0 to ${page.total}.`);
        }
        setBusy(true);
        const err = await onSubmit(v, pg);
        setBusy(false);
        if (err) setError(err);
        else {
          setValue("");
          setPageValue("");
        }
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
        {page && <PageInput id={`${id}-page`} value={pageValue} onChange={setPageValue} total={page.total} placeholder={String(page.current)} />}
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

function PageInput({
  id,
  value,
  onChange,
  total,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  total: number;
  placeholder?: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-hi-fg/25 bg-surface pl-3 pr-2 text-sm text-muted">
      <BookIcon size={14} />
      <span className="sr-only">Page you&apos;re on</span>
      <span aria-hidden="true">p.</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={total}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 bg-transparent text-base tabular-nums text-fg outline-none placeholder:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="tabular-nums">/ {total}</span>
    </label>
  );
}

function GoalForm({ endLabel, onSubmit }: { endLabel: string; onSubmit: (v: string, pages?: { page: number; total: number }) => Promise<string | null> }) {
  const [kind, setKind] = useState<"task" | "reading">("task");
  const [value, setValue] = useState("");
  const [start, setStart] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field =
    "min-h-11 rounded-xl border border-hi-fg/25 bg-surface px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg";
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return setError(kind === "reading" ? "What are you reading?" : "Write one line first.");
        let pages: { page: number; total: number } | undefined;
        if (kind === "reading") {
          const t = Number(total);
          const s = start.trim() ? Number(start) : 0;
          if (!Number.isInteger(t) || t < 1 || t > 20000) return setError("How many pages does it have? Use a whole number.");
          if (!Number.isInteger(s) || s < 0 || s > t) return setError(`Your start page should be between 0 and ${t}.`);
          pages = { page: s, total: t };
        }
        setBusy(true);
        const err = await onSubmit(v, pages);
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="goal-input" className="text-[15px] font-semibold">
          {kind === "reading" ? `What are you reading until ${endLabel}?` : `What will you finish by ${endLabel}?`}
        </label>
        <div role="radiogroup" aria-label="Goal type" className="flex gap-0.5 rounded-[10px] border border-hi-fg/25 p-0.5">
          {(
            [
              ["task", "Task"],
              ["reading", "Reading"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setError("");
              }}
              className={`btn min-h-8 rounded-lg px-3 text-[13px] font-medium ${kind === k ? "bg-inv text-inv-fg" : ""}`}
            >
              {k === "reading" && <BookIcon size={13} />} {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          id="goal-input"
          value={value}
          maxLength={500}
          autoComplete="off"
          placeholder={kind === "reading" ? "e.g. Designing Data-Intensive Applications, ch. 4–6" : "e.g. Ship the login screen"}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          className={`${field} min-w-0 flex-[1_1_260px]`}
        />
        {kind === "reading" && (
          <>
            <label className="flex min-h-11 items-center gap-1.5 rounded-xl border border-hi-fg/25 bg-surface px-3 text-sm">
              <span className="text-muted">From p.</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={start}
                placeholder="0"
                onChange={(e) => setStart(e.target.value)}
                className="w-14 bg-transparent text-base tabular-nums text-fg outline-none placeholder:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <label className="flex min-h-11 items-center gap-1.5 rounded-xl border border-hi-fg/25 bg-surface px-3 text-sm">
              <span className="text-muted">of</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={total}
                required
                placeholder="320"
                onChange={(e) => setTotal(e.target.value)}
                className="w-16 bg-transparent text-base tabular-nums text-fg outline-none placeholder:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-muted">pages</span>
            </label>
          </>
        )}
        <button type="submit" disabled={busy} className="btn min-h-11 rounded-xl bg-inv px-4 font-semibold text-inv-fg">
          {busy ? <Spinner /> : <ArrowRightIcon size={16} />} Drop goal
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

function DoneForm({
  goal,
  page,
  onSubmit,
}: {
  goal: string;
  page?: { current: number; total: number };
  onSubmit: (v: string, met: "yes" | "partly" | "no", page?: number) => Promise<string | null>;
}) {
  const [met, setMet] = useState<"yes" | "partly" | "no" | null>(null);
  const [pageValue, setPageValue] = useState(page ? String(page.current) : "");
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
        let pg: number | undefined;
        if (page && pageValue.trim()) {
          pg = Number(pageValue);
          if (!Number.isInteger(pg) || pg < 0 || pg > page.total) return setError(`Pick a page from 0 to ${page.total}.`);
        }
        setBusy(true);
        const err = await onSubmit(value.trim(), met, pg);
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
          placeholder={page ? "Where did you get to? Any takeaways?" : "What did you finish?"}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          className="min-h-11 min-w-0 flex-[1_1_260px] rounded-xl border border-hi-fg/25 bg-surface px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
        />
        {page && <PageInput id="done-page" value={pageValue} onChange={setPageValue} total={page.total} />}
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
