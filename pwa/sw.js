// Simple offline-first service worker for the BTC alternation PWA.
const CACHE = 'btc-tanavob-v23';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './data.json',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: always try the network so a new deploy is picked up
// immediately; fall back to cache only when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // The HSE inspection app (/hse/) and the manhole HSE toolkit (/manhole/)
  // each manage their own service worker — do not intercept their requests so
  // the co-hosted apps never collide.
  const reqPath = new URL(e.request.url).pathname;
  if (reqPath.includes('/hse/') || reqPath.includes('/manhole/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
