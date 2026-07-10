"""استخراج داده‌ی ساختاریافته از عکس حواله با استفاده از Claude Vision.

از خروجی ساختاریافته (output_config.format) استفاده می‌کند تا مدل دقیقاً طبق
اسکیمای JSON پاسخ بدهد. مدل: claude-opus-4-8.
"""
from __future__ import annotations

import base64
import json
import os

MODEL = "claude-opus-4-8"

# اسکیمای یک حواله
_PERSON = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "first_name": {"type": ["string", "null"], "description": "نام کوچک"},
        "last_name": {"type": ["string", "null"], "description": "نام خانوادگی"},
        "code": {"type": ["string", "null"], "description": "کد پرسنلی (۵-۷ رقم) یا کد ملی (۱۰ رقم) جلوی اسم"},
        "job_title": {"type": ["string", "null"], "description": "عنوان شغل اگر جلوی اسم نوشته شده (مثل امداد، تعمیرات، تکنسین)"},
        "size": {"type": ["string", "null"], "description": "سایز البسه اگر برای همین نفر مشخص شده"},
    },
    "required": ["first_name", "last_name", "code", "job_title", "size"],
}

_SIZE = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "size": {"type": ["string", "null"], "description": "سایز مثل 42 یا XL"},
        "count": {"type": ["integer", "null"], "description": "تعداد این سایز"},
    },
    "required": ["size", "count"],
}

_ITEM = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "mesc_code": {"type": ["string", "null"], "description": "کد طبقه‌بندی کالا MESC (ستون سمت راست)"},
        "item_name": {"type": ["string", "null"], "description": "نام پایه‌ی کالا (شرح/DESCRIPTION) بدون سایز، مثل «شلوار کار»"},
        "unit": {"type": ["string", "null"], "description": "واحد کالا مثل NO یا PR"},
        "req_qty": {"type": ["integer", "null"], "description": "مقدار کلِ REQ.QTY این قلم (کل، نه سهم هر نفر)"},
        "sizes": {"type": "array", "items": _SIZE, "description": "ریزِ سایز/تعداد اگر کالا سایز دارد (مثلا 6 عدد ۳۶، 3 عدد ۴۰)"},
    },
    "required": ["mesc_code", "item_name", "unit", "req_qty", "sizes"],
}

VOUCHER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "voucher_number": {"type": ["string", "null"], "description": "شماره حواله / جمع مقادیر (مثل 14040509)"},
        "requesting_unit": {"type": ["string", "null"], "description": "واحد متقاضی یا شرح کار (منطقه؛ مثل اجرای طرح‌ها)"},
        "delivery_date": {"type": ["string", "null"], "description": "تاریخ تحویل دست‌نویس کنار امضا؛ ماه و سال کافیست (مثل شهریور ۱۴۰۴)"},
        "personnel_type": {"type": ["string", "null"], "description": "official اگر متن بگوید پرسنل رسمی، contractor اگر پیمانکاری، وگرنه null"},
        "company": {"type": ["string", "null"], "description": "نام شرکت اگر روی حواله نوشته شده"},
        "contract_number": {"type": ["string", "null"], "description": "شماره پیمان اگر روی حواله نوشته شده"},
        "items": {"type": "array", "items": _ITEM},
        "personnel": {"type": "array", "items": _PERSON},
    },
    "required": ["voucher_number", "requesting_unit", "delivery_date",
                 "personnel_type", "company", "contract_number", "items", "personnel"],
}

_PROMPT_VOUCHER = """این تصویر یک «حواله صدور کالا / MATERIAL ISSUE VOUCHER» شرکت گاز است.
تمام اطلاعات را با دقت استخراج کن:

- شماره حواله: عدد چاپی کنار «جمع مقادیر / TOTAL QTY» یا بالای برگه.
- اقلام کالا: از جدول بالا. هر قلم یک MESC NO، یک شرح (DESCRIPTION مثل «کلاه ایمنی»)، یک واحد (NO/PR) و REQ.QTY (مقدار کل) دارد.
  اگر یک کالا با چند سایز آمده (مثل «شلوار کار» با سایزهای مختلف)، آن را یک قلمِ واحد بده که item_name فقط نام پایه («شلوار کار») است و ریزِ سایز و تعدادِ هر سایز را در sizes بگذار؛ آن را به چند قلمِ جدا نشکن. REQ.QTY همان مقدار کل است.
- فهرست افراد: در قسمت DESCRIPTION دست‌نویس، هر نفر با یک شماره ردیف (۱- ۲- ۳- …) مشخص است و نام و نام خانوادگی و یک کد دارد.
  نام و نام خانوادگی ممکن است به خط بعد بشکند؛ حتماً نام خانوادگیِ کاملِ هر نفر را بیاور و با کد و ردیفِ درست همان نفر تطبیق بده و هیچ نفری را جا نینداز.
  تقریباً هر نفر یک کد جلوی نامش دارد؛ کد را با دقت بخوان و تا جای ممکن خالی نگذار. کد ۵ تا ۷ رقمی = کد پرسنلی؛ کد ۱۰ رقمی = کد ملی. اگر جلوی اسم شغل نوشته شده (امداد/تعمیرات/تکنسین) آن را در job_title بگذار.
- req_qty همان REQ.QTY است و «مقدار کل برای همه‌ی نفرات» است (نه سهم هر نفر)؛ همان عدد کل را بده.
- واحد متقاضی / شرح کار = منطقه (requesting_unit).
- اگر جمله‌ای مثل «پرسنل رسمی» یا «پیمانکاری» دیدی، personnel_type را بر همان اساس تعیین کن.
- تاریخ تحویل: فقط تاریخِ **دست‌نویس** (با خودکار، معمولاً بالای برگه یا کنار امضاها) را بردار؛ تاریخ‌های چاپی/تایپ‌شده را کاملاً نادیده بگیر. ماه و سال کافی است (مثل «۱۴۰۳/۰۲» یا «اردیبهشت ۱۴۰۳»). اعداد کم‌رنگ را هم دقیق نگاه کن.

ارقام را دقیق بخوان. اگر چیزی خوانا نبود، null بگذار (حدس نزن)."""

_PROMPT_NAMELIST = """این تصویر یک «لیست اسامی» پرسنل است (جدا از حواله تجهیزات).
فقط افراد را استخراج کن: نام، نام خانوادگی، کد پرسنلی (۵-۷ رقم) یا کد ملی (۱۰ رقم)، و شغل اگر نوشته شده.
اگر منطقه/واحد یا تاریخ روی همین برگه بود آن‌ها را هم پر کن. اقلام (items) را خالی بگذار.
ارقام را دقیق بخوان؛ ناخوانا = null."""


def _client():
    import anthropic
    return anthropic.Anthropic()


def _media_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/jpeg")


def _normalize(data: dict) -> dict:
    """اطمینان از وجود همه‌ی کلیدها تا logic.py هرگز خطا نگیرد."""
    data = dict(data or {})
    for key in ("voucher_number", "requesting_unit", "delivery_date",
                "personnel_type", "company", "contract_number"):
        data.setdefault(key, None)
    data.setdefault("items", [])
    data.setdefault("personnel", [])
    return data


def extract(image_bytes: bytes, filename: str = "voucher.jpg",
            mode: str = "voucher", provider: str | None = None) -> dict:
    """یک عکس را می‌خواند و ساختار حواله (یا لیست اسامی) را برمی‌گرداند.

    provider: "gemini" (پیش‌فرض، رایگان) یا "anthropic". با متغیر PPE_PROVIDER هم قابل تنظیم.
    """
    provider = provider or os.getenv("PPE_PROVIDER", "gemini")
    if provider == "gemini":
        from . import extractor_gemini
        return _normalize(extractor_gemini.extract_gemini(image_bytes, filename, mode))
    return _normalize(_extract_anthropic(image_bytes, filename, mode))


def _extract_anthropic(image_bytes: bytes, filename: str = "voucher.jpg", mode: str = "voucher") -> dict:
    """پیاده‌سازی با Anthropic Claude (نیازمند ANTHROPIC_API_KEY)."""
    prompt = _PROMPT_NAMELIST if mode == "namelist" else _PROMPT_VOUCHER
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
    client = _client()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": VOUCHER_SCHEMA}},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": _media_type(filename), "data": b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    text = next((b.text for b in resp.content if b.type == "text"), "{}")
    return json.loads(text)
