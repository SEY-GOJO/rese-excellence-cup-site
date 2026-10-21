const CACHE_NAME = "rese-excellence-cup-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./organisateurs.html",
  "./styles.css",
  "./organisateurs.css",
  "./matches-data.js",
  "./bracket.js",
  "./app.js",
  "./organisateurs.js",
  "./affiche.js",
  "./notifications.js",
  "./shared-store.js",
  "./manifest.webmanifest",
  "./logo-rese.jpg",
  "./app-icon-192.png",
  "./app-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("rese-excellence-cup-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "Suivez les dernières nouvelles du tournoi." }; }
  event.waitUntil(self.registration.showNotification(payload.title || "RES.E Excellence Cup", {
    body: payload.body || "Une nouvelle information de match est disponible.",
    icon: "./app-icon-192.png",
    badge: "./app-icon-192.png",
    tag: payload.tag || "rese-cup-update",
    data: { url: payload.url || "./index.html#matchs" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./index.html#matchs", self.location.href).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.navigate(url).then(() => existing.focus());
    return self.clients.openWindow(url);
  }));
});
