import { NextResponse } from "next/server";
import { notionConfig, searchNotion } from "@/lib/notion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Searches your connected Notion for pages to share in a room. */
export async function GET(req: Request) {
  if (!notionConfig().ready) return NextResponse.json({ error: "Notion isn't set up on this server." }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const items = await searchNotion(createAdminClient(), user.id, q);
    if (items === "not-connected") return NextResponse.json({ connected: false, items: [] });
    return NextResponse.json({ connected: true, items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Notion didn't answer. Try again." }, { status: 502 });
  }
}
