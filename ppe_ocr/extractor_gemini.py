"""استخراج داده از عکس حواله با Google Gemini (لایه‌ی رایگان).

کلید رایگان از https://aistudio.google.com/apikey گرفته می‌شود و در متغیر محیطی
GOOGLE_API_KEY (یا GEMINI_API_KEY) قرار می‌گیرد. خروجی دقیقاً همان ساختاری است که
logic.py انتظار دارد، پس بقیه‌ی اپ بدون تغییر کار می‌کند.
"""
from __future__ import annotations

import json
import os
import re

from .extractor import _PROMPT_NAMELIST, _PROMPT_VOUCHER, _media_type

# مدل‌ها به ترتیب اولویت؛ اگر یکی شلوغ بود (503) بعدی امتحان می‌شود.
MODELS = [os.getenv("PPE_GEMINI_MODEL", "gemini-2.5-flash"), "gemini-2.0-flash", "gemini-2.5-flash-lite"]
MODEL = MODELS[0]

# قالب JSON که از مدل می‌خواهیم دقیقاً همین شکل را برگرداند.
_JSON_TEMPLATE = """
خروجی را فقط و فقط به‌صورت یک شیء JSON با این ساختار بده (بدون توضیح اضافه):
{
  "voucher_number": "رشته یا null",
  "requesting_unit": "رشته یا null",
  "delivery_date": "رشته یا null",
  "personnel_type": "official یا contractor یا null",
  "company": "رشته یا null",
  "contract_number": "رشته یا null",
  "items": [
    {"mesc_code": "رشته یا null", "item_name": "رشته یا null", "unit": "رشته یا null", "req_qty": عدد یا null}
  ],
  "personnel": [
    {"first_name": "رشته یا null", "last_name": "رشته یا null", "code": "رشته یا null", "job_title": "رشته یا null", "size": "رشته یا null"}
  ]
}
"""


def _api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError(
            "کلید Gemini پیدا نشد. یک کلید رایگان از https://aistudio.google.com/apikey بگیر "
            "و در متغیر محیطی GOOGLE_API_KEY بگذار."
        )
    return key


def _strip_code_fence(text: str) -> str:
    """اگر مدل خروجی را داخل ```json ... ``` گذاشت، پاک می‌کند."""
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    return m.group(0) if m else text


def extract_gemini(image_bytes: bytes, filename: str = "voucher.jpg", mode: str = "voucher") -> dict:
    import time

    import google.generativeai as genai

    genai.configure(api_key=_api_key())
    base = _PROMPT_NAMELIST if mode == "namelist" else _PROMPT_VOUCHER
    prompt = base + "\n" + _JSON_TEMPLATE
    parts = [{"mime_type": _media_type(filename), "data": image_bytes}, prompt]
    cfg = {"response_mime_type": "application/json", "temperature": 0}

    last = None
    for name in MODELS:  # اگر مدلی شلوغ بود، بعدی
        for attempt in range(3):
            try:
                resp = genai.GenerativeModel(name).generate_content(parts, generation_config=cfg)
                return json.loads(_strip_code_fence(resp.text))
            except Exception as e:  # noqa: BLE001
                last = e
                if any(s in str(e) for s in ("503", "429", "500", "overloaded", "UNAVAILABLE")):
                    time.sleep(1.5 * (attempt + 1))
                    continue
                break
    raise last if last else RuntimeError("Gemini extraction failed")
