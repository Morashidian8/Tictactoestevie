# اپ «ارزیابی ورود به منهول» (جعبه‌ابزار HSE)

یک وب‌اپ نصب‌شدنی (PWA) و کاملاً آفلاین برای ابزارهای رایج ایمنی و آتش‌نشانی.
همه‌چیز در یک فایل `index.html` است (بدون وابستگی خارجی) و با Service Worker
آفلاین کار می‌کند.

## ابزارها

- **ورود به منهول** — ارزیابی گاز (LEL / O₂ / H₂S / CO) و صدور حکم ورود
- **کار گرم/سرد** — ارزیابی شرایط مجاز
- **انتخاب کپسول آتش‌نشانی مناسب**
- **تبدیل مقادیر** (واحدها)
- **فاصله ایمن حفاری**
- **راهنمای پرمیت کار (PTW)**
- **محاسبه پرج**
- **حریم خطوط گاز**
- **شعاع تخلیه نشت گاز**
- **خواص گازها** (جدول)
- **اقدامات اولیه حوادث**
- **تحلیل اطفا و اعلام ساختمان**

## اجرای محلی

```bash
cd manhole_pwa
python3 -m http.server 8000
# سپس مرورگر: http://localhost:8000
```

Service Worker فقط روی `https` یا `localhost` فعال می‌شود.

## دیپلوی

این اپ همراه بقیه اپ‌های مخزن روی GitHub Pages منتشر می‌شود؛ ورک‌فلوی
`.github/workflows/pwa.yml` پوشه‌ی `manhole_pwa/` را در مسیر `/manhole/`
سایت کپی می‌کند. پس از اجرای موفق ورک‌فلو، اپ از این آدرس در دسترس است:

```
https://<user>.github.io/<repo>/manhole/
```

## ساختار فایل‌ها

```
manhole_pwa/
├── index.html              ← کل اپ (HTML/CSS/JS یکجا)
├── manifest.json           ← مانیفست PWA
├── sw.js                   ← Service Worker (آفلاین)
└── icons/
    ├── icon-192.png
    ├── apple-touch-icon.png
    └── favicon-32.png
```

## 🔒 قفل و رمزنگاری (از نسخهٔ v39)

اپ و پادکست‌ها **رمزنگاری‌شده** منتشر می‌شوند. `index.html` منتشرشده فقط صفحهٔ ورود و محتوای رمزشده را دارد
(AES-256-GCM؛ کلید محتوا با PBKDF2-SHA256 و ۶۰۰٬۰۰۰ تکرار از رمز ورود یا کلید بازیابی باز می‌شود).
ابزار در `hse_tools/hse-lock.mjs` است و `hse_tools/keystore.json` فقط کلیدِ پیچیده‌شده را دارد.

**ویرایش اپ** (رمز ورود یا کلید بازیابی لازم است؛ هیچ‌کدام در مخزن ذخیره نمی‌شوند):

```bash
export HSE_PASS='…'                                   # یا HSE_RECOVERY='XXXX-XXXX-…'
node hse_tools/hse-lock.mjs open  hse_src/app.plain.html   # باز کردن برای ویرایش
# … ویرایش hse_src/app.plain.html …
node hse_tools/hse-lock.mjs build hse_src/app.plain.html   # ساخت دوبارهٔ manhole_pwa/index.html
node hse_tools/hse-lock.mjs audio in.mp3 manhole_pwa/podcasts/epNN.enc   # قسمت جدید پادکست
```

`hse_src/`، `*.plain.html` و فایل‌های mp3/m4a پوشهٔ پادکست در `.gitignore` هستند و هرگز نباید commit شوند.
**تغییر رمز:** `HSE_NEW_PASS='…' node hse_tools/hse-lock.mjs rekey` و سپس open و build.

### دسترسی اختصاصی همکاران (از نسخهٔ v45)

هر همکار رمز شخصی خودش را دارد. وقتی با آن وارد می‌شود، اسمش به‌صورت واترمارک روی همهٔ صفحه‌ها و روی
تصویرهای خروجی می‌آید. برای او راست‌کلیک، کپی متن، ذخیرهٔ صفحه و چاپ هم بسته است. آپدیت‌ها مثل بقیه
خودکار به او می‌رسد.

```bash
node hse_tools/hse-lock.mjs user-add c2 "نام همکار"     # رمز شخصی چاپ می‌شود؛ بعد build
node hse_tools/hse-lock.mjs user-list                   # شناسه‌ها و نام‌ها
HSE_RECOVERY='…' node hse_tools/hse-lock.mjs user-revoke c1   # قطع دسترسی؛ بعد build و انتشار
```

قطع دسترسی کلید محتوا را عوض می‌کند و پادکست‌ها را دوباره رمز می‌کند. پس رمز آن همکار حتی روی گوشی‌ای
که «به خاطر سپرده» شده دیگر کار نمی‌کند (اولین باری که آنلاین شود). بقیه فقط یک بار دوباره رمزشان
را وارد می‌کنند. نام همکاران فقط رمزشده در `keystore.json` ذخیره می‌شود.
