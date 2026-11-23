import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/supabase/server";
import type { SidebarRoom } from "@/lib/types";
import { liveStreak } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getSession();
  if (!user) redirect("/login?next=/app");
  if (!profile) redirect("/onboarding");

  const [{ data }, { data: streakRow }] = await Promise.all([
    supabase
    .from("room_members")
    .select("role, joined_at, rooms(id, name, type, visibility)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true }),
    supabase.from("streaks").select("current_days, last_session_date").eq("user_id", user.id).maybeSingle(),
  ]);
  const streak = liveStreak(streakRow);

  type Row = { role: string; rooms: Omit<SidebarRoom, "member_role"> | null };
  const rooms: SidebarRoom[] = ((data ?? []) as unknown as Row[])
    .filter((r) => r.rooms)
    .map((r) => ({ ...(r.rooms as Omit<SidebarRoom, "member_role">), member_role: r.role }));

  return (
    <AppShell profile={profile} rooms={rooms} streak={streak}>
      {children}
    </AppShell>
  );
}
