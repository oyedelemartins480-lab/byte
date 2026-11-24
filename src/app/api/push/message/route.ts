import { NextResponse } from "next/server";
import { notifyUsers, pushConfig, wanting } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MENTION = /(^|\s)@([a-z0-9_]{3,24})\b/gi;

/** After you send a message: notifies people you @mentioned or replied to. */
export async function POST(req: Request) {
  if (!pushConfig().ready) return NextResponse.json({ ok: true, skipped: true });
  const { messageId } = (await req.json().catch(() => ({}))) as { messageId?: string };
  if (!messageId || !/^[0-9a-f-]{36}$/i.test(messageId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // Read through the user's own client: row-level security proves membership.
  const { data: m } = await supabase
    .from("messages")
    .select("id, room_id, user_id, type, body, reply_to, created_at, rooms(name)")
    .eq("id", messageId)
    .maybeSingle();
  if (!m || m.user_id !== user.id || Date.now() - new Date(m.created_at as string).getTime() > 5 * 60_000)
    return NextResponse.json({ ok: true, skipped: true });

  const admin = createAdminClient();
  const body = String(m.body ?? "");
  const names = [...body.matchAll(MENTION)].map((x) => x[2].toLowerCase()).filter((n) => n !== "ai");
  const { data: members } = await admin
    .from("room_members")
    .select("user_id, profiles(username)")
    .eq("room_id", m.room_id);
  const list = (members ?? []) as unknown as { user_id: string; profiles: { username: string } | null }[];
  const mentioned = list.filter((x) => x.profiles && names.includes(x.profiles.username)).map((x) => x.user_id);

  let repliedTo: string | null = null;
  if (m.reply_to) {
    const { data: orig } = await admin.from("messages").select("user_id").eq("id", m.reply_to).maybeSingle();
    if (orig?.user_id && list.some((x) => x.user_id === orig.user_id)) repliedTo = orig.user_id as string;
  }

  const { data: me } = await admin.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const who = (me?.name as string) ?? "Someone";
  const room = (m.rooms as unknown as { name: string } | null)?.name ?? "a room";
  const snippet = m.type === "voice" ? "🎙 Voice note" : body.replace(/\s+/g, " ").slice(0, 160);
  const url = `/app/r/${m.room_id}`;

  const mentionIds = await wanting(admin, mentioned.filter((id) => id !== user.id), "mentions");
  let sent = await notifyUsers(admin, mentionIds, `msg:${m.id}`, { title: `${who} mentioned you in ${room}`, body: snippet, url, tag: `room:${m.room_id}` });
  if (repliedTo && repliedTo !== user.id && !mentionIds.includes(repliedTo)) {
    const ids = await wanting(admin, [repliedTo], "mentions");
    sent += await notifyUsers(admin, ids, `msg:${m.id}`, { title: `${who} replied to you in ${room}`, body: snippet, url, tag: `room:${m.room_id}` });
  }
  return NextResponse.json({ ok: true, sent });
}
