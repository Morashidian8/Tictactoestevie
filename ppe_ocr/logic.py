"""منطق تجاری تبدیل داده‌ی خام حواله به ردیف‌های اکسل.

این ماژول کاملاً قطعی (deterministic) و مستقل از هوش مصنوعی است تا بشود آفلاین تستش کرد.
ورودی: ساختار حواله (دیکشنری) که extractor از روی عکس درآورده.
خروجی: لیست ردیف‌ها مطابق ۱۷ ستون اکسل.
"""
from __future__ import annotations

import re

from . import config


# ---------- کمک‌تابع‌ها ----------

def _digits(s: str) -> str:
    """فقط ارقام را برمی‌گرداند و ارقام فارسی/عربی را به لاتین تبدیل می‌کند."""
    if s is None:
        return ""
    trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    s = str(s).translate(trans)
    return re.sub(r"\D", "", s)


def infer_gender(first_name: str) -> str:
    """جنسیت را از نام کوچک تشخیص می‌دهد."""
    ng = config.names_gender()
    first = (first_name or "").strip().split()[0] if (first_name or "").strip() else ""
    if first in ng["female"]:
        return "زن"
    if first in ng["ambiguous"]:
        return "نامشخص(بررسی شود)"
    if first in ng["male"]:
        return "مرد"
    # پیش‌فرض: مرد (اکثریت پرسنل)، ولی علامت می‌زنیم که قابل بازبینی باشد در صورت نیاز
    return "مرد"


def classify_code(code: str) -> tuple[str | None, str | None, str]:
    """کد را طبقه‌بندی می‌کند.

    خروجی: (کد پرسنلی, کد ملی, نوع قرارداد)
    - ۱۰ رقمی  -> کد ملی، پیمانکاری
    - ۵ تا ۷ رقمی -> کد پرسنلی، رسمی
    """
    d = _digits(code)
    if len(d) == 10:
        return None, d, "پیمانکاری"
    if 5 <= len(d) <= 7:
        return d, None, "رسمی"
    # نامشخص: در کد پرسنلی می‌گذاریم و رسمی فرض می‌کنیم
    return d or None, None, "رسمی"


def _mesc_lookup(mesc_code: str) -> dict:
    return config.mesc_items().get(_digits(mesc_code), {})


def resolve_item_name(item: dict) -> str:
    """نام کالا: اول از شرحِ خوانده‌شده، اگر نبود از نگاشت کد کالا."""
    name = (item.get("item_name") or "").strip()
    if name:
        return name
    return _mesc_lookup(item.get("mesc_code", "")).get("item", "")


def is_sized(item_name: str, item: dict | None = None) -> bool:
    """آیا این کالا سایز دارد؟ (البسه/کفش) — از نگاشت کد یا از روی نام."""
    if item is not None:
        info = _mesc_lookup(item.get("mesc_code", ""))
        if info.get("sized"):
            return True
    return any(key in item_name for key in config.size_pools().keys())


def _pool_for(item_name: str):
    """مخزن سایزِ مربوط به این کالا را برمی‌گرداند (یا None)."""
    for key, pool in config.size_pools().items():
        if key in item_name and pool:
            return pool
    return None


# ---------- ساخت ردیف‌ها ----------

def build_rows(voucher: dict) -> list[dict]:
    """یک حواله را به ردیف‌های اکسل تبدیل می‌کند (هر نفر × هر قلم = یک ردیف)."""
    c = config.constants()
    region = (voucher.get("requesting_unit") or "").strip() or None
    delivery = (voucher.get("delivery_date") or "").strip() or None
    ptype = voucher.get("personnel_type")  # official | contractor | None
    voucher_no = _digits(voucher.get("voucher_number", "")) or None
    sherkat = (voucher.get("company") or c["sherkat_default"]).strip()
    peyman = (voucher.get("contract_number") or c["peyman_default"]).strip()

    people = voucher.get("personnel", []) or []
    items = voucher.get("items", []) or []

    rows: list[dict] = []
    n_people = len(people) or 1
    for item in items:
        item_name = resolve_item_name(item)
        # REQ.QTY روی حواله «مقدار کل» برای همه‌ی نفرات است؛ سهم هر نفر = کل ÷ تعداد نفرات
        raw_qty = item.get("req_qty")
        qty = max(1, round(raw_qty / n_people)) if raw_qty else 1
        sized = is_sized(item_name, item)
        pool = _pool_for(item_name)
        for idx, person in enumerate(people):
            code_field = person.get("code", "")
            C, D, contract = classify_code(code_field)
            # جمله‌ی «پرسنل رسمی/پیمانکاری» روی حواله می‌تواند نوع قرارداد را تأیید کند
            if D is None and ptype == "contractor":
                contract = "پیمانکاری"
            # عنوان شغل: اگر جلوی اسم نوشته شده از آن، وگرنه از نوع پرسنل
            job = (person.get("job_title") or "").strip()
            if not job:
                job = c["shoghl_official_default"] if contract == "رسمی" else ""

            # سایزِ هر نفر ثابت است (بر اساس جایگاهِ همان نفر) تا همه‌ی البسه‌اش یک سایز شود
            size = (person.get("size") or "").strip() or None
            if size is None and sized and pool:
                size = pool[idx % len(pool)]

            rows.append({
                "نام": (person.get("first_name") or "").strip() or None,
                "نام خانوادگی": (person.get("last_name") or "").strip() or None,
                "کد پرسنلی": C,
                "کد ملی": D,
                "جنسیت": infer_gender(person.get("first_name", "")),
                "مدیریت": None,
                "شهرستان/منطقه": region,
                "نوع قرارداد": contract,
                "شماره پیمان": peyman,
                "نام شرکت": sherkat,
                "عنوان شغل": job or None,
                "شماره سند": None,
                "عنوان لوازم": item_name or None,
                "سایز": size,
                "تعداد": qty,
                "تاریخ تحویل": delivery,
                "شماره حواله": voucher_no,
            })
    return rows


def combine_namelist_with_voucher(name_list: dict, voucher: dict) -> dict:
    """حالتی که لیست اسامی جدا از حواله‌ی تجهیزات آمده.

    اسامی را از name_list و اقلام/متادیتا را از voucher می‌گیرد و یک حواله‌ی
    یکپارچه می‌سازد که آماده‌ی build_rows است.
    """
    merged = dict(voucher)
    merged["personnel"] = name_list.get("personnel", []) or []
    # اگر لیست اسامی خودش منطقه/تاریخ داشت و حواله نداشت، از لیست پر کن
    for key in ("requesting_unit", "delivery_date", "personnel_type"):
        if not merged.get(key) and name_list.get(key):
            merged[key] = name_list[key]
    return merged


def backfill_codes(vouchers: list[dict]) -> None:
    """اگر کدِ کسی در یک حواله خوانده نشد، از حواله‌ای دیگر که همان نام کدش را دارد پُر می‌کند."""
    def nk(p):
        return (p.get("first_name") or "").strip() + "|" + (p.get("last_name") or "").strip()

    known: dict[str, str] = {}
    for v in vouchers:
        for p in v.get("personnel", []) or []:
            code = _digits(p.get("code"))
            key = nk(p)
            if code and len(key) > 1 and key not in known:
                known[key] = p["code"]
    for v in vouchers:
        for p in v.get("personnel", []) or []:
            if not _digits(p.get("code")):
                key = nk(p)
                if key in known:
                    p["code"] = known[key]


def group_by_person(rows: list[dict]) -> list[dict]:
    """ردیف‌های هر نفر را کنار هم می‌چیند (همه‌ی اقلامِ یک نفر زیر هم)."""
    order: list[str] = []
    groups: dict[str, list[dict]] = {}
    for r in rows:
        key = _digits(r.get("کد پرسنلی")) or _digits(r.get("کد ملی")) \
            or f"{r.get('نام') or ''}|{r.get('نام خانوادگی') or ''}"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)
    out: list[dict] = []
    for k in order:
        out.extend(groups[k])
    return out


def build_all(vouchers: list[dict]) -> list[dict]:
    """چند حواله را با هم پردازش می‌کند: پُرکردنِ کدهای جا‌افتاده + چیدنِ اسامی مشابه پشت هم."""
    backfill_codes(vouchers)
    rows: list[dict] = []
    for v in vouchers:
        rows.extend(build_rows(v))
    return group_by_person(rows)
