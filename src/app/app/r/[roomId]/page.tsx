import { livekitConfig } from "@/lib/livekit";
import { notionConfig } from "@/lib/notion";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { aiReady, transcribeReady } from "@/lib/ai";
import { RoomView } from "@/components/room/room-view";
import { getSession } from "@/lib/supabase/server";
import type { Member, Message, Participant, Reaction, Room, Session, SessionRecapRow, SessionSummary } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 50;

export async function generateMetadata({ params }: { params: Promise<{ roomId: string }> }): Promise<Metadata> {
  const { roomId } = await params;
  if (!UUID_RE.test(roomId)) return { title: "Byte" };
  const { supabase } = await getSession();
  const { data } = await supabase.from("rooms").select("name").eq("id", roomId).maybeSingle();
  return { title: data ? `${data.name} · Byte` : "Byte" };
}

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!UUID_RE.test(roomId)) notFound();

  const { supabase, user, profile } = await getSession();
  if (!user) redirect(`/login?next=/app/r/${roomId}`);
  if (!profile) redirect("/onboarding");

  const [{ data: room }, { data: memberRows }, { data: msgRows }, { data: sessRows }, { data: recapRows }] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("room_members").select("role, profiles(id, name, username, role, avatar_url)").eq("room_id", roomId),
    supabase.from("messages").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(PAGE + 1),
    supabase.from("sessions").select("*").eq("room_id", roomId).order("starts_at", { ascending: false }).limit(1),
    supabase.from("session_recaps").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(3),
  ]);

  if (!room) notFound();

  type MRow = { role: "owner" | "member"; profiles: Omit<Member, "member_role"> | null };
  const members: Member[] = ((memberRows ?? []) as unknown as MRow[])
    .filter((r) => r.profiles)
    .map((r) => ({ ...(r.profiles as Omit<Member, "member_role">), member_role: r.role }));
  if (!members.some((m) => m.id === user.id)) notFound();

  const rows = (msgRows ?? []) as Message[];
  const hasMore = rows.length > PAGE;
  const messages = rows.slice(0, PAGE).reverse();
  const session = ((sessRows ?? []) as Session[])[0] ?? null;

  const [{ data: reactionRows }, sessionData] = await Promise.all([
    messages.length
      ? supabase
          .from("reactions")
          .select("message_id, user_id, emoji")
          .in(
            "message_id",
            messages.map((m) => m.id),
          )
      : Promise.resolve({ data: [] }),
    session
      ? Promise.all([
          supabase.from("session_participants").select("*").eq("session_id", session.id),
          supabase
            .from("messages")
            .select("*")
            .eq("session_id", session.id)
            .in("type", ["checkin", "progress", "done"])
            .order("created_at", { ascending: true }),
          supabase.from("session_summaries").select("*").eq("session_id", session.id).maybeSingle(),
        ])
      : Promise.resolve(null),
  ]);

  return (
    <RoomView
      key={roomId}
      room={room as Room}
      meId={user.id}
      initialMembers={members}
      initialMessages={messages}
      initialReactions={(reactionRows ?? []) as Reaction[]}
      initialHasMore={hasMore}
      initialSession={session}
      initialParticipants={(sessionData?.[0].data ?? []) as Participant[]}
      initialEvents={(sessionData?.[1].data ?? []) as Message[]}
      initialSummary={(sessionData?.[2].data ?? null) as SessionSummary | null}
      initialRecaps={(recapRows ?? []) as SessionRecapRow[]}
      calm={Boolean(profile.calm_mode)}
      aiConfigured={aiReady()}
      transcribeOn={transcribeReady()}
      huddleOn={livekitConfig().ready}
      notionOn={notionConfig().ready}
    />
  );
}
