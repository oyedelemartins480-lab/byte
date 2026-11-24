import { NextResponse } from "next/server";
import { huddleToken, livekitConfig } from "@/lib/livekit";
import { getSession } from "@/lib/supabase/server";

/** A short-lived LiveKit token to join the room's huddle. Members only. */
export async function POST(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cfg = livekitConfig();
  if (!cfg.ready)
    return NextResponse.json({ error: "Voice huddles aren't set up. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET." }, { status: 503 });
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // Row-level security only returns rooms you're a member of.
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "You're not in this room." }, { status: 403 });
  const token = await huddleToken(roomId, user.id, profile.name, profile.avatar_url);
  return NextResponse.json({ url: cfg.url, token }, { headers: { "Cache-Control": "no-store" } });
}
