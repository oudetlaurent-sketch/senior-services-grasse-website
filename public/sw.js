/*
 * Service Worker — offline support for the senior-services website (design §PWA,
 * Requirement 17.5–17.9). Hand-written, dependency-free, served at /sw.js with
 * root scope. Copied verbatim from public/ into dist/ by the Astro build.
 *
 * Strategy:
 *  - Non-GET requests are NEVER intercepted, so POST /api/service-request always
 *    reaches the network and is never cached or served stale (Req 17.8).
 *  - The /api/ route and all cross-origin requests (e.g. the Scheduling_Service
 *    iframe) are NEVER intercepted, so they always load from the network (Req 17.9).
 *  - Navigations: network-first with a cache fallback, then the /offline page
 *    (Req 17.6, 17.7).
 *  - Static same-origin assets: cache-first (Req 17.7).
 *
 * Bump CACHE_VERSION whenever PRECACHE_URLS changes so activate() evicts stale caches.
 */
const CACHE_VERSION = "pwa-cache-v1";

// Content pages precached on install so they are available offline after a first
// visit, plus the offline fallback, the manifest, and the app icons.
const PRECACHE_URLS = [
  "/",
  "/services/computer-learning",
  "/services/computer-repair",
  "/services/in-home-repair",
  "/about",
  "/rendez-vous",
  "/en/",
  "/en/services/computer-learning",
  "/en/services/computer-repair",
  "/en/services/in-home-repair",
  "/en/about",
  "/en/schedule",
  "/offline",
  "/manifest.webmanifest",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll fails if any single request fails; add individually and ignore
      // failures so one missing URL does not abort the whole precache.
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => {
              /* a page that 404s or is unreachable at install time is skipped */
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 1. Never intercept non-GET requests. POST /api/service-request always hits
  //    the network and is never cached or served stale (Req 17.8).
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // 2. Never intercept the API route or any cross-origin request. The serverless
  //    endpoint and the external Scheduling_Service iframe always load from the
  //    network (Req 17.8, 17.9).
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // 3. Navigations: network-first, falling back to the cached page, then /offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep the navigation cache fresh for next time (same-origin only).
          const copy = response.clone();
          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline")),
        ),
    );
    return;
  }

  // 4. Static same-origin assets (CSS, JS, images, icons, manifest): cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        // Only cache successful, basic (same-origin) responses.
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    }),
  );
});
