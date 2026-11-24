/* Byte service worker: shows desktop notifications, even when no Byte tab is open. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Byte", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/app";
  event.waitUntil(
    (async () => {
      // Already looking at that room? Don't interrupt.
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const watching = open.some((c) => c.focused && c.visibilityState === "visible" && new URL(c.url).pathname === url);
      if (watching && data.tag && String(data.tag).startsWith("room:")) return;
      await self.registration.showNotification(data.title || "Byte", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of open) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if ("navigate" in c && new URL(c.url).pathname !== url) await c.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
