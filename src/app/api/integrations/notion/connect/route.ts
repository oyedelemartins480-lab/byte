import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { notionConfig, notionRedirect } from "@/lib/notion";
import { createClient } from "@/lib/supabase/server";

/** Starts "Connect Notion": sends you to Notion to pick which pages Byte may see. */
export async function GET(req: NextRequest) {
  const { origin } = req.nextUrl;
  if (!notionConfig().ready) return NextResponse.redirect(`${origin}/app/settings?notion=not-configured`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/app/settings`);

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", notionConfig().clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", notionRedirect(origin));
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  const next = req.nextUrl.searchParams.get("next") ?? "";
  if (/^\/app(\/[\w-]+)*$/.test(next)) res.cookies.set("byte_notion_next", next, { httpOnly: true, sameSite: "lax", path: "/api/integrations/notion", maxAge: 600 });
  res.cookies.set("byte_notion_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/integrations/notion",
    maxAge: 600,
  });
  return res;
}
