"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleIcon } from "@/components/icons";
import {
  type ChatLine,
  ProfilePreview,
  SetupChatLayout,
  Spinner,
  TextAnswer,
  safeNext,
} from "@/components/setup-chat";
import { CODE_RE, EMAIL_CODE_ON, useAuthHashError } from "@/lib/auth-hash";
import { createClient } from "@/lib/supabase/client";

// Set NEXT_PUBLIC_GOOGLE_AUTH=off to hide Google sign-in (e.g. before it is set up in Supabase).
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "off";

export const NAME_KEY = "byte:signup-name";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "name" | "method" | "sent";

function callbackUrl(next: string | null) {
  const after = `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(after)}`;
}

export function SignupChat({ next: rawNext }: { next: string | null }) {
  const next = safeNext(rawNext);
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "email" | "google">("");
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");
  const hashError = useAuthHashError();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const lines: ChatLine[] = [
    { from: "bot", text: "Hey, I'm Byte. Let's get you set up. It takes about a minute." },
    { from: "bot", text: "First, what should your team call you?" },
  ];
  if (step !== "name") {
    lines.push({ from: "me", text: name });
    lines.push({
      from: "bot",
      text: `Nice to meet you, ${name.split(" ")[0]}. ${GOOGLE_ON ? "How do you want to sign in? Google is quickest, or type your email and I'll send you a sign-in link." : "What's your email? I'll send you a sign-in link."} No password needed.`,
    });
  }
  if (step === "sent") {
    lines.push({ from: "me", text: email });
    lines.push({
      from: "bot",
      text: EMAIL_CODE_ON
        ? `Done. Check ${email}: open the link on this device, or type the 6-digit code from the email below. Check spam if it's not there in a minute.`
        : `Done. Open the link I sent to ${email} on this device and we'll pick up right where we left off. Check spam if it's not there in a minute.`,
    });
  }

  async function sendLink(address: string) {
    setBusy("email");
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl(next), data: { full_name: name } },
    });
    setBusy("");
    if (err) {
      setError(
        err.status === 429
          ? "Too many links sent. Wait a minute, then try again."
          : `We couldn't send the link: ${err.message}`,
      );
      return false;
    }
    setCooldown(60);
    return true;
  }

  async function google() {
    setBusy("google");
    setError("");
    window.localStorage.setItem(NAME_KEY, name);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    if (err) {
      setBusy("");
      setError(`Google sign-in didn't start: ${err.message}`);
    }
  }

  let controls: React.ReactNode = null;
  if (step === "name") {
    controls = (
      <TextAnswer
        id="signup-name"
        label="Your name"
        autoComplete="name"
        maxLength={60}
        value={draft}
        error={error || hashError}
        onChange={(v) => {
          setDraft(v);
          setError("");
        }}
        onSubmit={() => {
          const v = draft.trim();
          if (!v) return setError("Type a name so your team knows who you are.");
          setName(v);
          window.localStorage.setItem(NAME_KEY, v);
          setDraft("");
          setStep("method");
        }}
      />
    );
  } else if (step === "method") {
    controls = (
      <>
        {GOOGLE_ON && (
        <button
          type="button"
          onClick={google}
          disabled={Boolean(busy)}
          className="btn min-h-11 self-start rounded-[10px] border border-line bg-surface px-4 text-[15px] font-medium text-fg"
        >
          {busy === "google" ? <Spinner /> : <GoogleIcon />} Continue with Google
        </button>
        )}
        <TextAnswer
          id="signup-email"
          label="you@school.edu"
          type="email"
          autoComplete="email"
          value={draft}
          busy={busy === "email"}
          error={error}
          onChange={(v) => {
            setDraft(v);
            setError("");
          }}
          onSubmit={async () => {
            const v = draft.trim().toLowerCase();
            if (!EMAIL_RE.test(v)) return setError("That email looks off. Try something like you@school.edu.");
            if (await sendLink(v)) {
              setEmail(v);
              setDraft("");
              setStep("sent");
            }
          }}
        />
      </>
    );
  } else {
    controls = (
      <div className="flex flex-col gap-2">
        {EMAIL_CODE_ON && (
        <TextAnswer
          id="signup-code"
          label="6-digit code from the email"
          type="text"
          autoComplete="one-time-code"
          maxLength={8}
          value={code}
          busy={busy === "email"}
          onChange={(v) => {
            setCode(v.replace(/\D/g, ""));
            setError("");
          }}
          onSubmit={async () => {
            if (!CODE_RE.test(code)) return setError("Type the 6-digit code from the email.");
            setBusy("email");
            const { error: err } = await createClient().auth.verifyOtp({ email, token: code, type: "email" });
            if (err) {
              setBusy("");
              return setError(
                err.message.toLowerCase().includes("expired")
                  ? "That code expired. Tap “Resend the link” for a new one."
                  : "That code didn't work. Check it and try again.",
              );
            }
            // Full reload so the server sees the new session cookie.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign(`/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`);
          }}
        />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={cooldown > 0 || Boolean(busy)}
            onClick={() => sendLink(email)}
            className="btn min-h-11 rounded-full border border-line bg-surface px-4 text-[15px] font-medium text-fg"
          >
            {busy === "email" ? <Spinner /> : null}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("method");
              setDraft(email);
              setError("");
            }}
            className="btn min-h-11 rounded-full border border-line bg-surface px-4 text-[15px] font-medium text-fg"
          >
            Use a different email
          </button>
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-err">
            {error}
          </p>
        )}
      </div>
    );
  }

  const stepIndex = step === "name" ? 0 : 1;

  return (
    <SetupChatLayout
      step={stepIndex}
      total={6}
      lines={lines}
      controls={controls}
      onRestart={
        step === "name"
          ? undefined
          : () => {
              setStep("name");
              setName("");
              setEmail("");
              setDraft("");
              setError("");
            }
      }
      topRight={
        <span className="text-sm text-muted">
          <span className="hidden sm:inline">Already have an account? </span>
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-fg">
            Log in
          </Link>
        </span>
      }
      aside={<ProfilePreview name={name} signIn={step === "sent" ? "Email link" : undefined} />}
    />
  );
}
