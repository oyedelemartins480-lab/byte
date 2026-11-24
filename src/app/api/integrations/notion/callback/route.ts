import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, notionConfig, notionRedirect } from "@/lib/notion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Notion sends you back here after you approve Byte. */
export async function GET(req: NextRequest) {
  const { origin, searchParams } = req.nextUrl;
  const nextCookie = req.cookies.get("byte_notion_next")?.value ?? "";
  const dest = /^\/app(\/[\w-]+)*$/.test(nextCookie) ? nextCookie : "/app/settings";
  const back = (result: string) => {
    const res = NextResponse.redirect(`${origin}${dest}?notion=${result}`);
    res.cookies.delete({ name: "byte_notion_state", path: "/api/integrations/notion" });
    res.cookies.delete({ name: "byte_notion_next", path: "/api/integrations/notion" });
    return res;
  };
  if (!notionConfig().ready) return back("not-configured");
  if (searchParams.get("error")) return back("cancelled");

  const state = searchParams.get("state") ?? "";
  const saved = req.cookies.get("byte_notion_state")?.value ?? "";
  if (!state || state.length !== saved.length || !timingSafeEqual(Buffer.from(state), Buffer.from(saved))) return back("expired");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/app/settings`);

  try {
    const t = await exchangeCode(searchParams.get("code") ?? "", notionRedirect(origin));
    const { error } = await createAdminClient()
      .from("user_connections")
      .upsert(
        {
          user_id: user.id,
          provider: "notion",
          access_token: t.access_token,
          refresh_token: t.refresh_token ?? null,
          workspace_id: t.workspace_id ?? null,
          workspace_name: t.workspace_name?.slice(0, 120) ?? null,
          workspace_icon: t.workspace_icon?.slice(0, 600) ?? null,
        },
        { onConflict: "user_id,provider" },
      );
    if (error) return back("failed");
  } catch {
    return back("failed");
  }
  return back("connected");
}
