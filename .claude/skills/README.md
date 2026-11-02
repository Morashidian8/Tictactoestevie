# راهنمای اسکیل‌ها و ایجنت‌ها (Skills & Agents Cheat-Sheet)

این فایل یک فهرست سریع از همه‌ی اسکیل‌ها و ایجنت‌های نصب‌شده در این ریپوست تا یادت بمونه
کدوم چی‌کار می‌کنه. منبع اسکیل‌ها: [github.com/mattpocock/skills](https://github.com/mattpocock/skills).

> برای اجرای هر اسکیل کافیه اسمش رو با اسلش تایپ کنی، مثل `/tdd`. خیلی‌هاشون هم
> به‌صورت خودکار وقتی کارِ مرتبط رو بگی فعال می‌شن.

> ⚠️ **اول این رو اجرا کن:** `/setup-matt-pocock-skills` — تنظیمات اولیه (issue tracker، لیبل‌ها، محل داک‌ها) که اسکیل‌های engineering بهش وابسته‌ان.

---

## 🤖 ایجنت‌ها (Agents)

| ایجنت | کارش |
|-------|------|
| `android-senior-dev` | دولوپر سنیور اندروید — Kotlin، Jetpack Compose، معماری MVVM/MVI، تست، Gradle و انتشار در Play Store |

---

## 🧩 اسکیل‌های Engineering (مهندسی نرم‌افزار)

| اسکیل | کارش |
|-------|------|
| `setup-matt-pocock-skills` | راه‌اندازی اولیه‌ی ریپو برای بقیه‌ی اسکیل‌ها (یک بار اجرا کن) |
| `grill-with-docs` | قبل از شروع کار با سؤال‌های تیز دقیق می‌فهمه چی می‌خوای، و در حین کار ADR و glossary می‌سازه |
| `grill-me` | همون «گریل کردن» ولی بدون ساختِ داک — فقط شفاف‌سازی پلن |
| `grilling` | استرس‌تستِ یک پلن/طراحی با سؤال‌پیچ کردنِ بی‌امان |
| `tdd` | توسعه‌ی تست‌محور (red-green-refactor) و تست یکپارچه |
| `prototype` | ساخت پروتوتایپِ دورریختنی برای روشن کردن طراحی (ترمینالی یا چند نسخه‌ی UI) |
| `diagnosing-bugs` | حلقه‌ی تشخیص برای باگ‌های سخت و افت پرفورمنس |
| `codebase-design` | واژگان مشترک برای طراحی ماژول‌های «عمیق» و تصمیم درباره‌ی مرزها (seams) |
| `improve-codebase-architecture` | اسکنِ کدبیس برای فرصت‌های بهبود معماری + گزارش HTML بصری |
| `domain-modeling` | ساخت و پالایش مدلِ دامنه و زبانِ مشترک پروژه + ثبت تصمیم‌های معماری |
| `to-issues` | شکستن یک پلن/PRD به issueهای مستقل و قابل‌برداشت روی issue tracker |
| `to-prd` | تبدیل گفتگوی فعلی به یک PRD و انتشارش روی issue tracker |
| `triage` | عبور دادن issueها و PRها از یک ماشین‌حالتِ دسته‌بندی و نوشتن brief آماده‌ی ایجنت |
| `ask-matt` | راهنما/روتر: می‌گه برای موقعیتت کدوم اسکیل مناسبه |

---

## ⚡ اسکیل‌های Productivity (بهره‌وری)

| اسکیل | کارش |
|-------|------|
| `handoff` | فشرده‌سازی گفتگوی فعلی به یک سند تحویل برای ایجنت بعدی |
| `teach` | آموزشِ یک مهارت یا مفهوم به تو، داخل همین workspace |
| `writing-great-skills` | مرجعِ نوشتن و ویرایشِ خودِ اسکیل‌ها (اصول و واژگان) |

---

## 🛠️ اسکیل‌های Misc (ابزارهای متفرقه)

| اسکیل | کارش |
|-------|------|
| `git-guardrails-claude-code` | نصب هوک‌هایی که دستورهای خطرناک git (push, reset --hard, clean, branch -D) رو قبل از اجرا بلاک می‌کنن |
| `setup-pre-commit` | راه‌اندازی pre-commit با Husky + lint-staged (Prettier، type-check، تست) |
| `migrate-to-shoehorn` | مهاجرتِ فایل‌های تست از `as` به `@total-typescript/shoehorn` |
| `scaffold-exercises` | ساختِ ساختار دایرکتوریِ تمرین‌ها (بخش، مسئله، راه‌حل، توضیح) |

---

## 🎨 اسکیل‌های طراحی (Design)

| اسکیل | کارش |
|-------|------|
| `design-taste-frontend` | «سلیقهٔ طراحی» برای صفحه‌های وب و صفحه‌های اپ (taste-skill): به‌جای طرحِ تکراریِ «ساختِ هوش مصنوعی»، از کتابخانه‌ای برگرفته از ۲۴۷ سایتِ برتر جهتِ هنری، تایپوگرافی، رنگ و چیدمان پیشنهاد می‌دهد، صفحه را در مرورگرِ واقعی بررسی می‌کند و با اسکرین‌شات اصلاح می‌کند. منبع: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) |
| `web-design-guidelines` | بازبینیِ کدِ رابطِ کاربری با «رهنمودهای رابطِ وب» ورسل: دسترس‌پذیری، فوکوسِ صفحه‌کلید، فرم‌ها، انیمیشن، تصویرها، کارایی، حالتِ تاریک و… — خروجی به‌شکلِ `فایل:خط`. قواعدِ مخصوصِ انگلیسی برای پروژه‌های فارسی تطبیق داده شده. منبع: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) |
| `awesome-design-md` | سیستمِ طراحیِ آماده از ۸۴ برندِ شناخته‌شده (Apple، Stripe، Linear، Notion، Airbnb، Spotify و…) به‌شکلِ DESIGN.md: رنگ، تایپوگرافی، فاصله‌ها، کامپوننت‌ها و قواعد — برای وقتی که طرحی «به سبکِ» یک برند یا یک زبانِ بصریِ آماده می‌خواهی (فقط الهام، نه کپیِ لوگو). منبع: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) |
| `image-to-code` | تبدیلِ تصویرِ یک طرح (اسکرین‌شات، ماکاپ، عکسِ رابط) به کدِ فرانت: چیدمان، رنگ، تایپوگرافی، کامپوننت‌ها و جزئیاتِ شاخص را درمی‌آورد، اول نقشه می‌کشد بعد می‌سازد، و نتیجه را کنارِ تصویرِ مرجع مقایسه می‌کند. منبع: [djd933/claude-design-plugins](https://github.com/djd933/claude-design-plugins) |
| `playwright-cli` | ابزارِ رسمیِ مایکروسافت برای کار با مرورگر: باز کردنِ سایت، کلیک و پر کردنِ فرم، اسکرین‌شات، ضبطِ ویدیو و نوشتنِ تستِ Playwright — تا Claude سایت را واقعاً ببیند و خرابی‌های ظاهری را بگیرد. ابزارِ `@playwright/cli` باید نصب باشد. منبع: [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) |
| `impeccable` | طراحی و بهبودِ رابطِ کاربری مثلِ یک مدیرِ هنری: طراحیِ تازه، نقد و بازبینی (audit/critique)، پرداخت (polish)، رنگ، تایپوگرافی، چیدمان، انیمیشن، متنِ رابط و سیستمِ طراحی؛ با زیرفرمان‌هایی مثلِ `/impeccable audit`، `polish`، `bolder`، `quieter`. بدونِ hook و با telemetryِ خاموش نصب شده. منبع: [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `emil-design-eng` | فلسفهٔ Emil Kowalski دربارهٔ ظرافتِ رابط، طراحیِ کامپوننت و جزئیاتِ نامرئی که نرم‌افزار را خوش‌حس می‌کنند. منبع: [emilkowalski/skill](https://github.com/emilkowalski/skill) |
| `animate` · `review-animations` · `improve-animations` · `find-animation-opportunities` · `remove-animations` · `animation-performance` · `animation-vocabulary` | مجموعهٔ انیمیشنِ Emil Kowalski: ساختن، نقد، ممیزیِ کلِ پروژه، پیدا کردنِ جای انیمیشن، حذفِ انیمیشن‌های زائد، روانیِ ۶۰ فریم، و نامِ درستِ هر افکت |
| `apple-design` · `mobile-native` · `break-ui` · `ask-sonner` · `emil-prototype` | طراحی به سبکِ اپل برای وب؛ حسِ «اپِ نصب‌شده» روی گوشی (PWA)؛ شکستنِ رابط با دادهٔ بدترین‌حالت؛ راهنمای Sonner؛ ساختِ چند نسخهٔ مختلف از یک بخش برای انتخاب (`/emil-prototype`) |
| `animate-expo` · `write-swift` | انیمیشن در React Native/Expo و نوشتنِ Swiftِ مدرن (برای اپ‌های بومی) |

---

## 🧪 اسکیل‌های In-Progress (در حال توسعه)

| اسکیل | کارش |
|-------|------|
| `decision-mapping` | تبدیل یک ایده‌ی خام به نقشه‌ای از تیکت‌های بررسی و حلشون یکی‌یکی |
| `review` | بازبینی تغییرات از یک نقطه‌ی مشخص (commit/branch/tag) از دو محور: استانداردها و درستی |
| `writing-shape` | شکل دادنِ یک فایل خامِ مارک‌داون به مقاله از طریق یک سشن گفتگویی |
| `writing-beats` | ساختِ مقاله به‌صورت «بیت‌به‌بیت» و انتخابی (choose-your-own-adventure) |
| `writing-fragments` | استخراج «قطعه‌ها»ی نوشتاری از ذهن تو و جمعشون به‌عنوان مواد خام مقاله |

---

## ✍️ اسکیل‌های Personal (شخصی — خاصِ متّ پوکاک)

| اسکیل | کارش |
|-------|------|
| `edit-article` | ویرایش و بهبود مقاله‌ها (بازچینش بخش‌ها، شفافیت، فشرده‌سازی نثر) |
| `obsidian-vault` | جستجو، ساخت و مدیریت یادداشت‌ها در Obsidian با wikilink و index note |

---

### نکته‌ها
- اسکیل‌های دسته‌ی `deprecated` (منسوخ) عمداً نصب نشده‌اند.
- اسکیل‌ها **project-scoped** هستند (فقط همین ریپو). برای دسترسیِ سراسری باید در `~/.claude/skills/` نصب بشن.
- برای دیدن لیست زنده‌ی اسکیل‌های لودشده، در Claude Code فقط `/` را بزن.
