"use client";

import Link from "next/link";
import { useState } from "react";
import { PageBackdrop } from "@/components/decor";
import { GoogleIcon, Logo } from "@/components/icons";
import { Spinner, safeNext } from "@/components/setup-chat";
import { ThemeToggle } from "@/components/theme-provider";
import { CODE_RE, useAuthHashError } from "@/lib/auth-hash";
import { createClient } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ next: rawNext, initialError }: { next: string | null; initialError: string }) {
  const next = safeNext(rawNext) ?? "/app";
  const [email, setEmail] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState<"" | "email" | "google">("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const hashError = useAuthHashError();
  const shownError = error || hashError;

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!CODE_RE.test(code)) return setError("Type the 6-digit code from the email.");
    setBusy("email");
    setError("");
    const { error: err } = await createClient().auth.verifyOtp({ email: sentTo, token: code, type: "email" });
    if (err) {
      setBusy("");
      return setError(
        err.message.toLowerCase().includes("expired")
          ? "That code expired. Use a different email or send a new link."
          : "That code didn't work. Check it and try again.",
      );
    }
    window.location.assign(next);
  }

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setBusy("google");
    setError("");
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (err) {
      setBusy("");
      setError(`Google sign-in didn't start: ${err.message}`);
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) return setError("That email looks off. Try something like you@school.edu.");
    setBusy("email");
    setError("");
    const { error: err } = await createClient().auth.signInWithOtp({
      email: v,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy("");
    if (err) {
      setError(err.status === 429 ? "Too many links sent. Wait a minute, then try again." : err.message);
      return;
    }
    setSentTo(v);
  }

  return (
    <div className="isolate flex min-h-dvh flex-col bg-bg">
      <PageBackdrop />
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-6 py-3.5">
        <Link href="/" aria-label="Byte home" className="no-underline">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="rise flex w-full max-w-[400px] flex-col gap-6 rounded-[24px] border border-line bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-display text-[32px] font-extrabold leading-tight tracking-[-0.02em]">Welcome back</h1>
            <p className="m-0 text-muted">Log in to get back to your rooms.</p>
          </div>

          {sentTo ? (
            <div role="status" className="flex flex-col gap-3 rounded-xl bg-hi p-4 text-hi-fg">
              <span className="font-semibold">Check your inbox</span>
              <span className="text-sm leading-normal">
                We sent a sign-in link to {sentTo}. Open it on this device, or type the 6-digit code from the email
                here.
              </span>
              <form onSubmit={verifyCode} noValidate className="flex gap-2">
                <label htmlFor="login-code" className="sr-only">
                  6-digit code
                </label>
                <input
                  id="login-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  placeholder="123456"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-hi-fg/25 bg-surface px-3.5 font-mono text-base tracking-[0.2em] text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
                />
                <button type="submit" disabled={Boolean(busy)} className="btn min-h-11 rounded-xl bg-inv px-4 font-semibold text-inv-fg">
                  {busy === "email" ? <Spinner /> : null} Sign in
                </button>
              </form>
              <button type="button" onClick={() => setSentTo("")} className="btn self-start p-0 text-sm font-semibold underline">
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={google}
                disabled={Boolean(busy)}
                className="btn min-h-12 rounded-xl border border-line bg-surface px-4 font-medium text-fg"
              >
                {busy === "google" ? <Spinner /> : <GoogleIcon />} Continue with Google
              </button>
              <div className="flex items-center gap-3 text-[13px] text-muted">
                <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
              </div>
              <form onSubmit={sendLink} noValidate className="flex flex-col gap-3">
                <label htmlFor="login-email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder="you@school.edu"
                  aria-invalid={Boolean(error)}
                  className="min-h-12 rounded-xl border border-line bg-bg px-3.5 text-base text-fg outline-none placeholder:text-muted focus-visible:border-fg focus-visible:ring-1 focus-visible:ring-fg"
                />
                <button
                  type="submit"
                  disabled={Boolean(busy)}
                  className="btn min-h-12 rounded-xl bg-inv font-semibold text-inv-fg"
                >
                  {busy === "email" ? (
                    <>
                      <Spinner /> Sending link…
                    </>
                  ) : (
                    "Email me a sign-in link"
                  )}
                </button>
              </form>
            </>
          )}

          {shownError && (
            <p role="alert" className="m-0 text-sm text-err">
              {shownError}
            </p>
          )}

          <p className="m-0 text-sm text-muted">
            New to Byte?{" "}
            <Link href={`/signup${rawNext ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-fg">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
