"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/env";
import { isAllowedAvatar } from "@/lib/avatar";

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

export type ProfileState = { error?: string; field?: string; ok?: boolean } | undefined;

export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const name = String(form.get("name") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "").trim();
  if (!name) return { error: "Add your name so your team knows who you are.", field: "name" };
  if (name.length > 60) return { error: "Keep your name under 60 characters.", field: "name" };
  if (!/^[a-z0-9_]{3,24}$/.test(username))
    return { error: "Usernames are 3–24 characters: lowercase letters, numbers and underscores.", field: "username" };
  if (role.length > 40) return { error: "Keep your role under 40 characters.", field: "role" };
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: "Pick a time zone from the list.", field: "timezone" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/settings");
  const { error } = await supabase
    .from("profiles")
    .update({ name, username, role: role || null, timezone })
    .eq("id", user.id);
  if (error) {
    if (error.code === "23505") return { error: `@${username} is taken. Try another.`, field: "username" };
    return { error: error.message };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function setAvatar(url: string | null): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/settings");
  if (url !== null) {
    if (!isAllowedAvatar(url, supabaseUrl())) return { error: "That photo link isn't supported." };
    // Uploaded photos must live in this person's own folder.
    if (url.includes("/storage/v1/object/public/avatars/") && !url.includes(`/avatars/${user.id}/`))
      return { error: "That photo belongs to someone else." };
  }
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
}

export async function renameRoom(roomId: string, rawName: string): Promise<ActionState> {
  const name = rawName.trim();
  if (!name) return { error: "Give the room a name, even a short one." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rooms").update({ name }).eq("id", roomId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the room owner can rename it." };
  revalidatePath("/app", "layout");
}

export async function removeMember(roomId: string, userId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.id === userId) return { error: "You own this room. Delete it instead of removing yourself." };
  const { data, error } = await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId).select("user_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the room owner can remove people." };
  revalidatePath(`/app/r/${roomId}`);
}

export async function deleteRoom(roomId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("rooms").delete().eq("id", roomId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the room owner can delete it." };
  revalidatePath("/app", "layout");
}
