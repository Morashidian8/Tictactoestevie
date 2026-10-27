// Service Worker — اپ «Renewal Intelligence»
// شبکه مقدم: هر بار که اپ باز می‌شود آخرین نسخهٔ منتشرشده گرفته می‌شود؛
// کش برای وقتی است که اینترنت نیست. کتابخانهٔ اکسل و فونت محلی‌اند تا اپ آفلاین کامل کار کند.
const CACHE = "renewal-intel-v1";
const ASSETS = ["./", "./index.html", "./manifest.json", "./vendor/xlsx.full.min.js",
  "./fonts/Vazirmatn-Regular.woff2", "./fonts/Vazirmatn-Medium.woff2", "./fonts/Vazirmatn-Bold.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes("fonts.g"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
