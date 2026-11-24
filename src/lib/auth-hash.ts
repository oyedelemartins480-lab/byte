"use client";

import { useEffect, useState } from "react";

/**
 * Supabase puts sign-in errors in the URL hash (e.g. #error_code=otp_expired when an
 * email link was already used, or opened by an email scanner first). Read it once,
 * turn it into a friendly message, and clean the address bar.
 */
const EMAIL_CODE_ON_MSG =
  process.env.NEXT_PUBLIC_EMAIL_CODE === "on"
    ? "That sign-in link expired or was already used. Type the 6-digit code from the same email, or get a new link."
    : "That sign-in link expired or was already used. Each link works once: ask for a new one and open only the newest email.";

export function useAuthHashError() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.includes("error")) return;
    const params = new URLSearchParams(hash);
    const code = params.get("error_code") ?? "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    // Reading the URL hash only works in the browser, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(
      code === "otp_expired"
        ? EMAIL_CODE_ON_MSG
        : params.get("error_description")?.replace(/\+/g, " ") ?? "Sign-in didn't finish. Try again.",
    );
  }, []);
  return message;
}

/** Signs in with the 6-digit code from the email (works even if the link was used up). */
export const CODE_RE = /^\d{6,8}$/;

/**
 * Only show the "type the code" box once the email templates include {{ .Token }}.
 * Editing templates needs custom SMTP on new free Supabase projects, so it's opt-in.
 */
export const EMAIL_CODE_ON = process.env.NEXT_PUBLIC_EMAIL_CODE === "on";
