import { NextResponse } from "next/server";
import { notifyUsers, pushConfig } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Sends a test notification to your own browsers. */
export async function POST() {
  if (!pushConfig().ready) return NextResponse.json({ error: "Desktop notifications aren't set up on this server." }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const sent = await notifyUsers(createAdminClient(), [user.id], `test:${Date.now()}`, {
    title: "Byte notifications are on",
    body: "You'll hear from Byte here, even with the tab closed. Phone down.",
    url: "/app/settings",
  });
  if (!sent) return NextResponse.json({ error: "No browser to send to. Turn notifications off and on again." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
