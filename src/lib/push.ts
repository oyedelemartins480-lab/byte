import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as webpush from "web-push";

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@example.com";
  return { publicKey, privateKey, subject, ready: Boolean(publicKey && privateKey) };
}

let configured = false;
function setup() {
  const c = pushConfig();
  if (!c.ready) return false;
  if (!configured) {
    webpush.setVapidDetails(c.subject, c.publicKey, c.privateKey);
    configured = true;
  }
  return true;
}

/**
 * Sends a notification to each user once per key (a user who already got
 * `key` is skipped), on every browser they turned notifications on in.
 */
export async function notifyUsers(admin: SupabaseClient, userIds: string[], key: string, payload: PushPayload) {
  if (!setup() || userIds.length === 0) return 0;
  const unique = [...new Set(userIds)];
  const { data: fresh } = await admin
    .from("push_sent")
    .upsert(
      unique.map((user_id) => ({ key, user_id })),
      { onConflict: "key,user_id", ignoreDuplicates: true },
    )
    .select("user_id");
  const targets = (fresh ?? []).map((r) => r.user_id as string);
  if (!targets.length) return 0;

  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", targets);
  const body = JSON.stringify({ ...payload, tag: payload.tag ?? key });
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          body,
          { TTL: 60 * 30, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The browser dropped this subscription; forget it.
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }),
  );
  return sent;
}

/** Keeps only users who want this kind of notification. */
export async function wanting(admin: SupabaseClient, ids: string[], kind: "sessions" | "mentions") {
  if (!ids.length) return [];
  const col = kind === "sessions" ? "notify_sessions" : "notify_mentions";
  const { data } = await admin.from("profiles").select(`id, ${col}`).in("id", [...new Set(ids)]);
  return ((data ?? []) as unknown as Record<string, unknown>[]).filter((p) => p[col] !== false).map((p) => p.id as string);
}
