import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";
import type { Room, Session } from "./types";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Signed-in user who can see this session (row-level security does the membership check). */
export async function sessionForUser(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: "Sign in first." }, 401) } as const;
  const { data: session } = await supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return { error: json({ error: "Session not found." }, 404) } as const;
  const { data: room } = await supabase.from("rooms").select("*").eq("id", session.room_id).maybeSingle();
  if (!room) return { error: json({ error: "Room not found." }, 404) } as const;
  return { supabase, user, session: session as Session, room: room as Room } as const;
}

export async function roomForUser(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: "Sign in first." }, 401) } as const;
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (!room) return { error: json({ error: "Room not found." }, 404) } as const;
  const { data: member } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { error: json({ error: "You're not in this room." }, 403) } as const;
  return { supabase, user, room: room as Room } as const;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
