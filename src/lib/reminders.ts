"use client";

/** Browser-notification reminders. Off until the person turns them on. */
const PREF = "byte:reminders";
const SENT = "byte:reminded";
export const REMINDERS_EVENT = "byte:reminders-changed";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function remindersOn() {
  if (!notificationsSupported()) return false;
  try {
    return localStorage.getItem(PREF) === "on" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** Asks the browser for permission. Returns whether reminders are now on. */
export async function enableReminders(): Promise<{ on: boolean; blocked?: boolean }> {
  if (!notificationsSupported()) return { on: false };
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  const on = perm === "granted";
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(REMINDERS_EVENT));
  return { on, blocked: perm === "denied" };
}

export function disableReminders() {
  try {
    localStorage.setItem(PREF, "off");
  } catch {}
  window.dispatchEvent(new Event(REMINDERS_EVENT));
}

/** Shows a notification once per key, even with Byte open in several tabs. */
export function notifyOnce(key: string, title: string, body: string, url?: string) {
  if (!remindersOn()) return;
  try {
    const sent: Record<string, number> = JSON.parse(localStorage.getItem(SENT) ?? "{}");
    if (sent[key]) return;
    const weekAgo = Date.now() - 7 * 86_400_000;
    for (const k of Object.keys(sent)) if (sent[k] < weekAgo) delete sent[k];
    sent[key] = Date.now();
    localStorage.setItem(SENT, JSON.stringify(sent));
  } catch {}
  const n = new Notification(title, { body, tag: key, icon: "/icon.svg" });
  n.onclick = () => {
    window.focus();
    if (url && location.pathname !== url) location.assign(url);
    n.close();
  };
}
