import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const PROTECTED = ["/app", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup"];

/** Refreshes the Supabase session cookie and guards signed-in routes. */
export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next();

  // If Supabase didn't accept our redirect URL, it sends the sign-in code to the Site URL
  // (e.g. "/?code=…") instead of /auth/callback. Catch that and finish sign-in properly.
  const strayCode = request.nextUrl.searchParams.get("code");
  const strayHash = request.nextUrl.searchParams.get("token_hash");
  const path0 = request.nextUrl.pathname;
  // API routes (e.g. Notion's OAuth callback) use ?code= for their own flows.
  if ((strayCode || strayHash) && path0 !== "/auth/callback" && !path0.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (!url.searchParams.get("next")) url.searchParams.set("next", "/onboarding");
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not put code between createServerClient and getUser: it keeps the session fresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    const [pathname, search] = to.split("?");
    url.pathname = pathname;
    url.search = search ? `?${search}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    return redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (user && AUTH_PAGES.includes(path)) {
    const next = request.nextUrl.searchParams.get("next");
    return redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/app");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|stickers/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
