# اپ تحلیل تناوب کندل بیت‌کوین — راهنمای توسعه

خلاصه‌ی ساختار و نحوه‌ی build/deploy تا هرجای دیگه بتوانی ادامه بدهی.

## فایل‌ها
- **analyze_history.py** — هسته‌ی تحلیل: fetch از Binance و Coinbase، تشخیص جهت کندل
  (`candle_direction` / `directions_of` — دوجی با مقایسه به بسته‌ی کندل قبلی رنگ می‌گیرد)،
  ساخت بازه‌های راس‌ساعت و لغزان (`build_hour_samples` / `build_rolling_samples`)،
  آمار (`summarize_hour`)، و تحلیل فاصله/طول تناوب بعدی (`alternation_runs`,
  `gaps_for_threshold`, `next_run_stats`, `gap_summary`). قابل اجرای مستقل هم هست
  (خروجی متنی + حالت `--probe`).
- **build_pwa.py** — همه‌ی دیتاست‌ها را از قبل حساب می‌کند (Binance/Coinbase × ۵/۱۵/۶۰ دقیقه،
  طول‌بازه‌های ۳۰د تا ۱۰ ساعت، بازه‌های لغزان + راس‌ساعت + «رخدادهای اخیر» rc/rd +
  تحلیل gap) و در `site/data.json` می‌ریزد و پوسته‌ی PWA (`pwa/*`) را کنارش کپی می‌کند.
- **bot.py** — بات تلگرام زنده‌ی هشدار تناوب + توابع مشترک (candle_direction، هاست‌های
  Binance، fetch). analyze_history از این import می‌کند.
- **check_candles.py / monitor_loop.py** — اجراکننده‌های بات برای GitHub Actions.
- **pwa/** — خود اپ نصب‌شدنی (index.html, app.js, sw.js, manifest, icon).
- **.github/workflows/pwa.yml** — build و انتشار خودکار روی GitHub Pages
  (push به main + cron ساعتی + workflow_dispatch).
- **requirements.txt** — `requests`, `python-dotenv`.

## اجرای محلیِ تحلیل
```bash
pip install -r requirements.txt
ANALYSIS_SOURCE=binance ANALYSIS_DAYS=365 ANALYSIS_TZ=Asia/Tehran python analyze_history.py
```

## ساخت داده‌ی PWA به‌صورت محلی
```bash
pip install -r requirements.txt
PWA_OUT=site python build_pwa.py      # site/ آماده‌ی سرو
# تست محلی:
python -m http.server -d site 8000    # سپس http://localhost:8000
```

## استقرار (GitHub Pages)
1. مخزن را public کن و در Settings → Pages، منبع را «GitHub Actions» بگذار.
2. workflow `pwa.yml` با هر push به main، هر ساعت (cron)، یا دستی (Run workflow) اجرا می‌شود.
3. آدرس نهایی: `https://<user>.github.io/<repo>/`

## تعریف «تناوب»
طول بلندترین رشته‌ی پشت‌سرهمِ یک‌درمیون‌شدنِ رنگ کندل (سبز/قرمز)، برحسب تعداد
تغییر رنگ (flip). دوجی (بسته==باز) مطابق چارت رنگ می‌گیرد: سبز اگر بسته ≥ بسته‌ی
کندل قبلی، وگرنه قرمز.

## نکته‌ها
- منبع داده: API عمومی Binance/Coinbase (بدون کلید).
- تایم‌زون پیش‌فرض: Asia/Tehran (قابل تغییر با ANALYSIS_TZ).
- برای بات تلگرام: `TELEGRAM_TOKEN` و `TELEGRAM_CHAT_ID` را در env بگذار (نمونه در .env.example).
