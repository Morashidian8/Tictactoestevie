// Service Worker — کش کامل برای کارکرد آفلاین
const CACHE = "hse-pwa-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./checklist_data.json",
  "./manifest.webmanifest",
  "./vendor/exceljs.min.js",
  "./vendor/docx.umd.js",
  "./vendor/FileSaver.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: با هر رفرش آخرین نسخه از شبکه گرفته می‌شود تا آپدیت‌ها فوری
// دیده شوند؛ در حالت آفلاین از کش استفاده می‌شود.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
