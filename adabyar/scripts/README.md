# اسکریپت‌ها

## mkicons.mjs

آیکون‌های PWA را از `public/favicon.svg` می‌سازد (۱۹۲، ۵۱۲ و maskable).
به یک Chromium و بستهٔ `playwright-core` نیاز دارد:

```bash
npm i -D playwright-core
node scripts/mkicons.mjs      # مسیر Chromium را در فایل تنظیم کنید
npm un playwright-core
```

آیکون‌های ساخته‌شده در `public/` نگهداری می‌شوند، پس این اسکریپت فقط
هنگام تغییر طرح آیکون لازم است.
