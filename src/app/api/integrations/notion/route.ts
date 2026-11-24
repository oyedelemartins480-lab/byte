import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Disconnects Notion: Byte forgets the access token. */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await createAdminClient().from("user_connections").delete().eq("user_id", user.id).eq("provider", "notion");
  return NextResponse.json({ ok: true });
}
