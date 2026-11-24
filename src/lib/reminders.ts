"use client";

/**
 * Notifications. With push set up on the server (VAPID keys), Byte sends real
 * desktop notifications that arrive even when no Byte tab is open. Without it,
 * it falls back to notifications from an open tab.
 */
const PREF = "byte:reminders"; // "push" | "on" (tab only) | "off"
const SENT = "byte:reminded";
export const REMINDERS_EVENT = "byte:reminders-changed";
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function pushSupported() {
  return Boolean(VAPID) && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function pref() {
  try {
    return localStorage.getItem(PREF) ?? "off";
  } catch {
    return "off";
  }
}

export function remindersOn() {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  const p = pref();
  return p === "push" || p === "on";
}

/** True when this browser gets server push (so tab-only notifications stay quiet). */
export function pushActive() {
  return remindersOn() && pref() === "push";
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribePush() {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) }));
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save the subscription.");
}

/** Asks the browser for permission and turns notifications on for this device. */
export async function enableReminders(): Promise<{ on: boolean; push?: boolean; blocked?: boolean; error?: string }> {
  if (!notificationsSupported()) return { on: false };
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") {
    window.dispatchEvent(new Event(REMINDERS_EVENT));
    return { on: false, blocked: perm === "denied" };
  }
  let mode = "on";
  let error: string | undefined;
  if (pushSupported()) {
    try {
      await subscribePush();
      mode = "push";
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't turn on background notifications.";
    }
  }
  try {
    localStorage.setItem(PREF, mode);
  } catch {}
  window.dispatchEvent(new Event(REMINDERS_EVENT));
  return { on: true, push: mode === "push", error };
}

export async function disableReminders() {
  try {
    localStorage.setItem(PREF, "off");
  } catch {}
  window.dispatchEvent(new Event(REMINDERS_EVENT));
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  }
}

/** Keeps the server's copy of this browser's subscription fresh (call on app load). */
export async function refreshPush() {
  if (!pushActive() || !pushSupported()) return;
  try {
    await subscribePush();
  } catch {}
}

/** Tab notification, once per key. Skipped when server push already covers it. */
export function notifyOnce(key: string, title: string, body: string, url?: string) {
  if (!remindersOn() || pushActive()) return;
  try {
    const sent: Record<string, number> = JSON.parse(localStorage.getItem(SENT) ?? "{}");
    if (sent[key]) return;
    const weekAgo = Date.now() - 7 * 86_400_000;
    for (const k of Object.keys(sent)) if (sent[k] < weekAgo) delete sent[k];
    sent[key] = Date.now();
    localStorage.setItem(SENT, JSON.stringify(sent));
  } catch {}
  const n = new Notification(title, { body, tag: key, icon: "/icon-192.png" });
  n.onclick = () => {
    window.focus();
    if (url && location.pathname !== url) location.assign(url);
    n.close();
  };
}
