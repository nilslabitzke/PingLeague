'use strict';

const CACHE_NAME = 'pingleague-v1';

// App shell — pre-cached on install
const PRECACHE_URLS = [
  '/PingLeague/',
  '/PingLeague/index.html',
  '/PingLeague/manifest.json',
  '/PingLeague/icon.svg',
];

// ── INSTALL: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Supabase (DB, Auth, Realtime) — always network-only, never cache
  //    Auth tokens are short-lived; realtime uses WebSockets; caching would break both.
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

  // 2. jsDelivr CDN (Supabase JS SDK) — network-first, cache as fallback
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Same-origin (index.html, manifest.json, icon.svg) — stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // 4. Everything else — network-only (pass through)
});
