// Service Worker — اپ «پایش زمستانی گاز»
// شبکه مقدم: با هر بار باز شدن، آخرین نسخهٔ منتشرشده گرفته می‌شود؛ بدون اینترنت از کش اجرا می‌شود.
// اطلاعات نفرات و سوابق در localStorage گوشی است و ربطی به این کش ندارد.
const CACHE = "paiesh-v16";
const ASSETS = ["./", "./index.html", "./manifest.json", "./vendor/xlsx.full.min.js",
  "./fonts/Vazirmatn-Regular.woff2", "./fonts/Vazirmatn-Medium.woff2", "./fonts/Vazirmatn-Bold.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("paiesh-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // Google Fonts etc.: let the browser handle it
  if (url.pathname.startsWith('/data/') || url.pathname.endsWith('/access.json')) return;   // live data: never from cache
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }
        // e.g. 404 while a deploy from another branch left /paiesh/ out: keep running from the cached copy
        return caches.match(e.request, { ignoreSearch: true }).then((r) => r || res);
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
