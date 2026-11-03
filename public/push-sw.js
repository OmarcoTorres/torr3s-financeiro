/* Invest+ — recebe as notificações push e abre o app ao tocar. Carregado pelo service worker principal. */
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Invest+", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Invest+", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin) { await j.focus(); if ("navigate" in j) await j.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
