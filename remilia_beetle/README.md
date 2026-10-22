# کلیم خودکار سوسک BeetleBoy (remilia.net)

هر ۳۰ دقیقه یک GitHub Action با مرورگر headless وارد اکانت شما می‌شود و اگر
دکمه‌ی **CLAIM BEETLE** آماده بود آن را می‌زند. اگر هنوز «… TO NEXT CLAIM»
نوشته بود کاری نمی‌کند.

## راه‌اندازی (یک بار)

1. روی یک کامپیوتر:
   ```
   pip install playwright && playwright install chromium
   python remilia_beetle/login.py
   ```
   در پنجره‌ای که باز می‌شود وارد Remilia شوید و بعد Enter بزنید. یک رشته‌ی
   طولانی base64 چاپ می‌شود.
2. در GitHub: **Settings → Secrets and variables → Actions → New secret**
   - نام: `REMILIA_STATE` — مقدار: همان رشته‌ی base64
   - (اختیاری) اگر BeetleBoy روی آدرس خاصی است (`remilia.net/home?cartridge=…`)
     آن را در Variable با نام `REMILIA_URL` بگذارید.
3. از تب **Actions** گزینه‌ی **Remilia Beetle Claim → Run workflow** را بزنید و
   اسکرین‌شات‌ها (artifact با نام `beetle-shots`) را ببینید تا مطمئن شوید
   دکمه پیدا و زده شده است.

اگر `TELEGRAM_TOKEN` و `TELEGRAM_CHAT_ID` از قبل در secretها باشند، بعد از هر
کلیم یا خطا پیام تلگرام می‌آید.

## نکته‌ها

- `storage_state.json` و secret عملاً رمز ورود شماست؛ هرگز commit نکنید.
- اگر سشن منقضی شد (پیام «claim button not found») دوباره login.py را اجرا و
  secret را عوض کنید.
- خودکارسازی ممکن است خلاف قوانین سایت باشد؛ مسئولیت ریسک بن شدن با خودتان است.
- cron گیت‌هاب گاهی چند دقیقه تأخیر دارد؛ کلیم با کمی تأخیر انجام می‌شود.
