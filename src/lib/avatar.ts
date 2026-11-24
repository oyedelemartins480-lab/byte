import "server-only";
import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";

/** The profile photo Google (or another OAuth provider) gave us, if any. */
export function providerPhoto(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const url = String(meta.avatar_url ?? meta.picture ?? "");
  return /^https:\/\//.test(url) && url.length <= 600 ? url : null;
}

export function gravatarUrl(email: string, size = 256) {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/** Gravatar answers 404 (because of d=404) when the email has no picture. */
export async function findGravatar(email: string | undefined | null): Promise<string | null> {
  if (!email) return null;
  const url = gravatarUrl(email);
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2500), cache: "no-store" });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

/** Only accept photos we know how to serve: our avatars bucket, Google, or Gravatar. */
export function isAllowedAvatar(url: string, supabaseUrl: string) {
  if (url.length > 600) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const own = new URL(supabaseUrl);
  if (u.host === own.host && u.pathname.startsWith("/storage/v1/object/public/avatars/")) return true;
  return u.host === "gravatar.com" || u.host === "www.gravatar.com" || u.host.endsWith(".googleusercontent.com");
}
