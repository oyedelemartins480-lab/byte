import type { Message, Participant, Session } from "./types";

/** Same rules as the database: a session ends at ends_at, or earlier if someone ended it. */
export function sessionEnd(s: Session) {
  const planned = new Date(s.ends_at).getTime();
  return s.ended_at ? Math.min(planned, new Date(s.ended_at).getTime()) : planned;
}

export type SessionPhase = "scheduled" | "live" | "ended";

export function sessionPhase(s: Session, now: number): SessionPhase {
  if (now < new Date(s.starts_at).getTime()) return "scheduled";
  if (now < sessionEnd(s)) return "live";
  return "ended";
}

export function intervalMs(s: Session) {
  return s.checkin_interval_min * 60_000;
}

/** Check-in boundaries strictly inside the session (4h at 60 min → 3). */
export function expectedCheckins(s: Session) {
  const len = sessionEnd(s) - new Date(s.starts_at).getTime();
  return Math.max(0, Math.ceil(len / intervalMs(s)) - 1);
}

export function currentSlot(s: Session, now: number) {
  return Math.floor((now - new Date(s.starts_at).getTime()) / intervalMs(s));
}

export function nextCheckinAt(s: Session, now: number) {
  const next = new Date(s.starts_at).getTime() + (currentSlot(s, now) + 1) * intervalMs(s);
  return next < sessionEnd(s) ? next : null;
}

/** The check-in the user owes right now, if any (slot ≥ 1 with no update yet). */
export function dueSlot(s: Session, now: number, mine: Message[]) {
  if (sessionPhase(s, now) !== "live") return null;
  const slot = currentSlot(s, now);
  if (slot < 1 || slot > expectedCheckins(s)) return null;
  const done = mine.some((m) => m.type === "progress" && Number((m.meta as { slot?: number }).slot) === slot);
  return done ? null : slot;
}

export function focusPct(p: Pick<Participant, "focus_seconds" | "away_seconds">) {
  const total = p.focus_seconds + p.away_seconds;
  return total > 0 ? Math.round((p.focus_seconds / total) * 100) : null;
}

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
export const clock = (t: number | string) => clockFmt.format(new Date(t));

export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function humanDuration(ms: number) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const GOAL_MET_LABEL = { yes: "Hit goal", partly: "Partly", no: "Missed" } as const;
