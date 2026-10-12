// Service Worker für Mitteilungen (SIN-425). Keine `actions`: iOS zeigt bei Web-Apps keine eigenen Knöpfe.
self.addEventListener("push", (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch {
    daten = {};
  }
  const titel = typeof daten.titel === "string" && daten.titel ? daten.titel : "Leitstand";
  const url = typeof daten.url === "string" && /^\/(?![/\\])/.test(daten.url) ? daten.url : "/";
  event.waitUntil(self.registration.showNotification(titel, { body: typeof daten.text === "string" ? daten.text : "", icon: "/icons/icon-192.png", data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenster) => {
      for (const f of fenster) {
        if ("navigate" in f) return f.navigate(ziel).then((c) => (c || f).focus());
      }
      return self.clients.openWindow(ziel);
    }),
  );
});
