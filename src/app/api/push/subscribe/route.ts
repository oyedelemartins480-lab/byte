import { NextResponse } from "next/server";
import { pushConfig } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Saves this browser's push subscription for the signed-in user. */
export async function POST(req: Request) {
  if (!pushConfig().ready) return NextResponse.json({ error: "Desktop notifications aren't set up on this server." }, { status: 503 });
  const user = await me();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = b.endpoint ?? "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !b.keys?.p256dh || !b.keys?.auth)
    return NextResponse.json({ error: "That subscription looks wrong." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      endpoint,
      user_id: user.id,
      p256dh: b.keys.p256dh.slice(0, 200),
      auth: b.keys.auth.slice(0, 100),
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "Couldn't turn notifications on." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Removes this browser's subscription. */
export async function DELETE(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (!b.endpoint) return NextResponse.json({ ok: true });
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", b.endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
