import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RoomView } from "@/components/room/room-view";
import { getSession } from "@/lib/supabase/server";
import type { Member, Message, Reaction, Room } from "@/lib/types";

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

  const { supabase, user } = await getSession();
  if (!user) redirect(`/login?next=/app/r/${roomId}`);

  const [{ data: room }, { data: memberRows }, { data: msgRows }] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("room_members").select("role, profiles(id, name, username, role)").eq("room_id", roomId),
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(PAGE + 1),
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

  const { data: reactionRows } = messages.length
    ? await supabase
        .from("reactions")
        .select("message_id, user_id, emoji")
        .in(
          "message_id",
          messages.map((m) => m.id),
        )
    : { data: [] };

  return (
    <RoomView
      key={roomId}
      room={room as Room}
      meId={user.id}
      initialMembers={members}
      initialMessages={messages}
      initialReactions={(reactionRows ?? []) as Reaction[]}
      initialHasMore={hasMore}
    />
  );
}
