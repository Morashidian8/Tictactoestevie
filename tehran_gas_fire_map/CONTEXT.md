# Context: Tehran gas–fire map

نقشه تعاملی ادارات گاز شهر تهران و نزدیک‌ترین ایستگاه آتش‌نشانی به هرکدام، با مسیر رانندگی، مسافت و زمان تقریبی رسیدن خودروی آتش‌نشانی.

## Domain terms

- **اداره گاز (gas office)**: ساختمان اداری/امدادی شرکت گاز استان تهران. منبع: جدول ساختمان‌های ۱۴۰۵ (فایل اکسل کاربر). فقط ردیف‌های داخل محدوده شهر تهران (مناطق ۲۲گانه شهرداری) در `data/gas_offices.json` آمده‌اند؛ شهرستان‌ها در کلید `excluded_outside_tehran` فهرست شده‌اند.
- **ایستگاه آتش‌نشانی (fire station)**: از OpenStreetMap (`amenity=fire_station`) در کادر مختصات شهر تهران.
- **نزدیک‌ترین ایستگاه**: کمینه‌ی «زمان رانندگی OSRM» بین ۴ ایستگاه نزدیک هوایی، نه صرفاً فاصله هوایی.
- **زمان رسیدن**: تخمین OSRM بدون ترافیک؛ برای خودروی امدادی با آژیر، حد قابل قبولی از واقعیت است اما رسمی نیست.

## Pipeline

1. `data/gas_offices.json` — ورودی curated (مختصات برآوردی + کوئری ژئوکد).
2. `.github/workflows/tehran-geo.yml` → `scripts/fetch_geo.py` — در GitHub Actions اجرا می‌شود (سندباکس توسعه به Overpass/OSRM/Nominatim دسترسی ندارد؛ رانر Actions دارد) و `data/geo_results.json` را commit می‌کند.
3. `scripts/build_map.py` — از روی نتایج، `output/tehran_gas_fire_map.html` (folium/Leaflet، فارسی RTL) می‌سازد.
