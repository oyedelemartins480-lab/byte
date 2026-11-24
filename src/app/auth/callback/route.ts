import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Turns Supabase's sign-in errors into something a person can act on. */
function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("code verifier") || m.includes("code_verifier"))
    return "Open the sign-in link in the same browser you asked for it in (not inside your email app). Or ask for a new link from that browser.";
  if (m.includes("expired") || m.includes("invalid") || m.includes("already"))
    return "That sign-in link expired or was already used. Ask for a new one and open only the newest email.";
  return message;
}

/**
 * Google and email sign-in links land here. Handles both Supabase link styles:
 * ?code=… (PKCE, the default) and ?token_hash=…&type=… (works in any browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/onboarding";

  const supabase = await createClient();
  let failure = searchParams.get("error_description") ?? "";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    failure = error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    failure = error.message;
  }

  // Signed in already (e.g. the link was clicked twice)? Just carry on.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return NextResponse.redirect(`${origin}${next}`);

  console.error("[auth/callback] sign-in failed:", failure || "no code in URL");
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(friendly(failure || "That sign-in link didn't work. Ask for a new one."))}`,
  );
}
