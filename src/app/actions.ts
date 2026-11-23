"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string } | undefined;

export async function joinRoom(code: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_room_by_code", { code });
  if (error || !data) return { error: error?.message ?? "We couldn't join that room." };
  revalidatePath("/app", "layout");
  redirect(`/app/r/${data}`);
}

export async function createRoom(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = String(form.get("name") ?? "").trim();
  const type = form.get("type") === "lockin" ? "lockin" : "build";
  const visibility = form.get("public") === "on" ? "public" : "private";
  if (!name) return { error: "Give the room a name, even a short one." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_room", {
    room_name: name,
    room_type: type,
    room_visibility: visibility,
  });
  if (error || !data) return { error: error?.message ?? "We couldn't create the room." };
  revalidatePath("/app", "layout");
  redirect(`/app/r/${(data as { id: string }).id}`);
}

export async function resetInvite(roomId: string): Promise<{ code?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_invite_code", { rid: roomId });
  if (error) return { error: error.message };
  revalidatePath(`/app/r/${roomId}`);
  return { code: data as string };
}

export async function leaveRoom(roomId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function joinPublicRoom(roomId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_public_room", { rid: roomId });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  redirect(`/app/r/${roomId}`);
}

export async function setCalmMode(on: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ calm_mode: on }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
}
