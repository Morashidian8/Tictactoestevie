# منبع

- مخزن: [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — نسخهٔ 2.15.0، کامیتِ `713eef5` (افزودنِ سطحِ سازگاری با RTL و فیلترِ `--rtl`)
- مجوز: MIT (فایلِ `LICENSE` در همین پوشه)
- روشِ نصب: کپیِ هفت اسکیلِ پوشهٔ `.claude/skills` همان مخزن (همان کاری که `uipro init` برای Claude Code می‌کند)، بدونِ اجرای نصب‌کننده:
  `ui-ux-pro-max` (اصلی)، `design`، `design-system`، `brand`، `slides`، `banner-design`، `ui-styling`.
- تغییرِ محلی: مسیرِ اسکریپت در `SKILL.md` از `${CLAUDE_PLUGIN_ROOT}/...` به مسیرِ نسبی در پروژه عوض شد و بخشِ «Local notes» اضافه شد.

## نکته‌های امنیتی

- هستهٔ `ui-ux-pro-max` فقط پایتونِ خالص روی CSVهای محلی است؛ به اینترنت وصل نمی‌شود.
- `design` (ساختِ لوگو/آیکون/هویتِ بصری) و `banner-design` برای ساختِ تصویر به APIهای بیرونی (Gemini، Atlas Cloud، MuAPI) و کلیدِ API نیاز دارند؛ بدونِ کلید فقط بخش‌های جست‌وجو/راهنمایشان کار می‌کند. کلید را هرگز در چت یا مخزن نگذار.
- `design-system/scripts/fetch-background.py` عکسِ پس‌زمینه از Pexels دانلود می‌کند.
- `ui-styling/scripts/shadcn_add.py` دستورِ `npx shadcn@… add` را اجرا می‌کند؛ قبل از اجرا تأیید بگیر.
