import { NextResponse } from "next/server";
import { huddleParticipants, livekitConfig } from "@/lib/livekit";
import { createClient } from "@/lib/supabase/server";

/** Who's in the room's voice huddle. Members only. */
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!livekitConfig().ready) return NextResponse.json({ configured: false, participants: [] });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { configured: true, participants: await huddleParticipants(roomId) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
