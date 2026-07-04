"""بارگذاری داده‌های پیکربندی (نگاشت کالا، مخزن سایز، جنسیت نام‌ها، ثابت‌ها).

همه‌ی داده‌ها در پوشه‌ی data/ به‌صورت JSON نگهداری می‌شوند تا کاربر بدون دست‌زدن به
کد بتواند آن‌ها را گسترش دهد (مثلاً افزودن یک کد کالای جدید یا یک نام).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"


def _load(name: str) -> dict:
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def mesc_items() -> dict:
    """کد کالا (MESC) -> {item, unit, sized}."""
    data = _load("mesc_items.json")
    return {k: v for k, v in data.items() if not k.startswith("_")}


@lru_cache(maxsize=1)
def size_pools() -> dict:
    """کلیدِ نام کالا -> لیست سایزهای ممکن."""
    return _load("size_pools.json").get("pools", {})


@lru_cache(maxsize=1)
def names_gender() -> dict:
    data = _load("names_gender.json")
    return {
        "female": set(data.get("female", [])),
        "male": set(data.get("male", [])),
        "ambiguous": set(data.get("ambiguous", [])),
    }


@lru_cache(maxsize=1)
def constants() -> dict:
    return _load("constants.json")


def headers() -> list[str]:
    return list(constants()["headers"])
