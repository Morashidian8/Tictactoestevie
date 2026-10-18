// Service Worker — کش کامل برای کارکرد آفلاین اپ «ارزیابی ورود به منهول»
const CACHE = "manhole-pwa-v39";
// پادکست‌ها در کش جداگانه نگه داشته می‌شوند تا با آپدیت اپ پاک نشوند
const POD_CACHE = "hse-podcasts-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/logo.png",
  "./fonts/Vazirmatn-Regular.woff2",
  "./fonts/Vazirmatn-Medium.woff2",
  "./fonts/Vazirmatn-Bold.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith("hse-podcasts")).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// پاسخ بازه‌ای (Range) از فایل کامل ذخیره‌شده — لازمهٔ پخش صدا در Safari/iOS
async function rangeResponse(req, res) {
  const range = req.headers.get("range");
  if (!range) return res;
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start, end;
  if (m[1] === "" && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]) || 0; end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": res.headers.get("Content-Type") || "audio/mp4",
    "Content-Range": "bytes " + start + "-" + end + "/" + size,
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // پادکست: اگر قبلاً «ذخیره برای آفلاین» شده از کش، وگرنه مستقیم از شبکه (بدون کش‌کردن خودکار)
  if (new URL(e.request.url).pathname.includes("/podcasts/")) {
    e.respondWith(caches.open(POD_CACHE).then((c) => c.match(e.request.url))
      .then((r) => r ? rangeResponse(e.request, r) : fetch(e.request)));
    return;
  }
  // سایر فایل‌ها Network-first: با هر رفرش آخرین نسخه از شبکه گرفته می‌شود تا آپدیت‌ها فوری
  // دیده شوند؛ در حالت آفلاین از کش استفاده می‌شود.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
