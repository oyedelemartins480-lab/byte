import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unfurl } from "@/lib/unfurl";

export const runtime = "nodejs";

// A light per-user limit so link previews can't be used to hammer other sites.
const hits = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 40) return false;
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return true;
}

/** Link preview data (title, description, image) for a URL shared in chat. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!url || url.length > 2000) return NextResponse.json({ preview: null }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!allow(user.id)) return NextResponse.json({ preview: null }, { status: 429 });
  const preview = await unfurl(url);
  return NextResponse.json({ preview }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
