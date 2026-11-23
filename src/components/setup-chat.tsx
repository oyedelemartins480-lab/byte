"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRightIcon, Logo } from "./icons";
import { ThemeToggle } from "./theme-provider";

export type ChatLine = { from: "bot" | "me"; text: string };

/** Page chrome + chat card + side card for the sign-up and onboarding conversations. */
export function SetupChatLayout({
  step,
  total,
  lines,
  controls,
  aside,
  topRight,
  footerNote = "Byte only asks what it needs. No phone number, ever.",
  onRestart,
  children,
}: {
  step: number;
  total: number;
  lines: ChatLine[];
  controls: React.ReactNode;
  aside?: React.ReactNode;
  topRight?: React.ReactNode;
  footerNote?: string;
  onRestart?: () => void;
  children?: React.ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length, children]);

  const pct = Math.round((Math.min(step, total) / total) * 100);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-4 px-6 py-3.5">
          <Link href="/" aria-label="Byte home" className="flex-1 no-underline">
            <Logo />
          </Link>
          {topRight}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1160px] flex-1 flex-wrap items-start gap-6 px-6 py-8">
        <section
          aria-label="Setup chat"
          className="flex h-[min(760px,calc(100dvh-130px))] min-h-[520px] min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-[20px] border border-line bg-surface"
        >
          <div className="flex flex-col gap-2.5 border-b border-line px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Set up your account</span>
              <span className="text-[13px] tabular-nums text-muted">
                {step < total ? `Step ${step + 1} of ${total}` : "All set"}
              </span>
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-sunk"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Setup progress"
            >
              <div className="h-full bg-fg transition-[width] duration-300 ease-out-quint" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div role="log" aria-live="polite" className="scroll-thin flex-1 overflow-y-auto px-5 py-6">
            <div className="flex flex-col gap-3">
              {lines.map((l, i) =>
                l.from === "bot" ? <BotBubble key={i}>{l.text}</BotBubble> : <MeBubble key={i}>{l.text}</MeBubble>,
              )}
              {children}
              <div ref={endRef} />
            </div>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line px-5 py-4">
            {controls}
            <div className="flex justify-between gap-3 text-[13px] text-muted">
              <span>{footerNote}</span>
              {onRestart && (
                <button type="button" onClick={onRestart} className="btn p-0 text-[13px] font-medium text-muted underline">
                  Start over
                </button>
              )}
            </div>
          </div>
        </section>
        {aside && <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">{aside}</aside>}
      </main>
    </div>
  );
}

export function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="rise flex max-w-[85%] items-end gap-2.5 sm:max-w-[78%]">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-inv font-mono text-[13px] text-inv-fg"
      >
        b
      </span>
      <div className="rounded-2xl rounded-bl-[4px] bg-sunk px-4 py-3 text-[15px] leading-normal">{children}</div>
    </div>
  );
}

export function MeBubble({ children }: { children: React.ReactNode }) {
  return (
    <p className="rise m-0 max-w-[70%] self-end break-words rounded-2xl rounded-br-[4px] bg-inv px-4 py-3 text-[15px] leading-normal text-inv-fg">
      {children}
    </p>
  );
}

export function Chips({
  options,
  onPick,
  disabled,
}: {
  options: string[];
  onPick: (o: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o)}
          className="btn min-h-11 rounded-full border border-line bg-surface px-4 text-[15px] font-medium text-fg"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function TextAnswer({
  id,
  label,
  value,
  onChange,
  onSubmit,
  type = "text",
  autoComplete,
  prefix,
  busy,
  error,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  type?: string;
  autoComplete?: string;
  prefix?: string;
  busy?: boolean;
  error?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [id]);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div
          className={`flex min-h-12 flex-1 items-center gap-1 rounded-xl border bg-bg px-3.5 transition-colors focus-within:border-fg focus-within:ring-1 focus-within:ring-fg ${
            error ? "border-err" : "border-line"
          }`}
        >
          {prefix && <span className="text-muted">{prefix}</span>}
          <input
            ref={ref}
            id={id}
            type={type}
            value={value}
            autoComplete={autoComplete}
            maxLength={maxLength}
            placeholder={label}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => onChange(e.target.value)}
            className="h-[46px] min-w-0 flex-1 border-0 bg-transparent text-base text-fg outline-none placeholder:text-muted"
          />
        </div>
        <button
          type="submit"
          aria-label="Send answer"
          disabled={busy}
          className="btn size-12 shrink-0 rounded-xl bg-inv text-inv-fg"
        >
          {busy ? <Spinner /> : <ArrowRightIcon />}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="m-0 text-sm text-err">
          {error}
        </p>
      )}
    </form>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

export function ProfilePreview({
  name,
  username,
  role,
  timezone,
  signIn,
}: {
  name?: string;
  username?: string;
  role?: string;
  timezone?: string;
  signIn?: string;
}) {
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";
  return (
    <>
      <div className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-6">
        <span className="text-[13px] text-muted">This is how your team will see you</span>
        <div className="flex items-center gap-3.5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-inv text-lg font-semibold text-inv-fg">
            {initials}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-lg font-semibold">{name || "Your name"}</span>
            <span className="text-sm text-muted">{username ? `@${username}` : "@username"}</span>
          </div>
        </div>
        <dl className="m-0 flex flex-col gap-3 text-sm">
          <Row k="Role" v={role || "—"} />
          <Row k="Time zone" v={timezone || "—"} />
          <Row k="Sign-in" v={signIn || "—"} />
          <Row k="Focus score" v="After your first session" />
        </dl>
      </div>
      <div className="flex flex-col gap-1.5 rounded-[20px] bg-hi px-6 py-5 text-hi-fg">
        <span className="font-semibold">Why a chat?</span>
        <span className="text-sm leading-normal">
          One question at a time is faster than a form, and you can see your profile take shape as you go.
        </span>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="m-0 truncate text-right">{v}</dd>
    </div>
  );
}

/** Only allow same-site relative paths as redirect targets. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}
