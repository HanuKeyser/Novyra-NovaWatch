// NovaWatch service worker
//
// Scope intentionally kept small:
//   - Makes the app installable (browsers require a fetch handler + manifest).
//   - Caches only the app shell (this HTML page) so a repeat visit still
//     loads something if the network briefly drops.
//   - Handles taps on notifications so they focus/open the app.
//
// It deliberately does NOT cache TMDB/Firebase API responses or images —
// that data changes constantly and should always come from the network.
//
// NOTE: this alone does not enable "notify me even when the app/tab is
// fully closed" — true closed-app push requires a backend push service
// (e.g. Firebase Cloud Messaging) sending to this worker. What this DOES
// enable is registration.showNotification() working reliably while the
// service worker is active (e.g. app open in a background tab).

const CACHE_NAME = "novawatch-shell-v1";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    // Only ever serve the cached app shell for navigation requests, and only
    // as a fallback when the network fails — never intercept API calls.
    if (event.request.mode !== "navigate") return;

    event.respondWith(
        fetch(event.request).catch(() => caches.match("/"))
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if ("focus" in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow("/");
        })
    );
});
