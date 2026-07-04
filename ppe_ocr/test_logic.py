"""تست آفلاین منطق (بدون نیاز به هوش مصنوعی).

از داده‌ی همان حواله‌های تأییدشده استفاده می‌کند تا مطمئن شویم build_rows درست کار می‌کند.
اجرا:  python -m ppe_ocr.test_logic
"""
from __future__ import annotations

from . import logic


def _voucher_14040524():
    """حواله‌ی واضح — ۸ نفر، کلاه ایمنی، شهریور ۱۴۰۴."""
    people = [("حجت اله", "حیدری", "544947"), ("محمدرضا", "کریمی", "638135"),
              ("شهاب", "بابایی", "581099"), ("محمدرضا", "کردی", "668408"),
              ("معین", "فخاری", "714220"), ("محمد", "ماهروزاده", "575210"),
              ("هادی", "ملکی", "562851"), ("علی", "عرفانی", "716582")]
    return {
        "voucher_number": "14040524", "requesting_unit": "اجرای طرح‌ها",
        "delivery_date": "شهریور ۱۴۰۴", "personnel_type": "official",
        "company": None, "contract_number": None,
        "items": [{"mesc_code": "9643302722", "item_name": "کلاه ایمنی", "unit": "NO", "req_qty": 1}],
        "personnel": [{"first_name": n, "last_name": f, "code": c, "job_title": None, "size": None}
                      for n, f, c in people],
    }


def _voucher_14040509():
    people = [("ابوالفضل", "طهرابی", "632579"), ("حمیدرضا", "دولت آبادیان", "512413"),
              ("علی", "حسینی اصل", "576058")]
    return {
        "voucher_number": "14040509", "requesting_unit": "گازرسانی به صنایع",
        "delivery_date": "سهمیه سال ۱۴۰۴", "personnel_type": "official",
        "company": None, "contract_number": None,
        "items": [{"mesc_code": "9643210042", "item_name": "دستکش حالدار", "unit": "PR", "req_qty": 3},
                  {"mesc_code": "9649108222", "item_name": "عینک ایمنی", "unit": "NO", "req_qty": 3}],
        "personnel": [{"first_name": n, "last_name": f, "code": c, "job_title": None, "size": None}
                      for n, f, c in people],
    }


def _run():
    failures = []

    def check(cond, msg):
        if not cond:
            failures.append(msg)

    # حواله 14040524
    rows = logic.build_rows(_voucher_14040524())
    check(len(rows) == 8, f"14040524 باید ۸ ردیف باشد، شد {len(rows)}")
    r0 = rows[0]
    check(r0["کد پرسنلی"] == "544947" and r0["کد ملی"] is None, "کد پرسنلی باید در ستون C باشد")
    check(r0["نوع قرارداد"] == "رسمی", "نوع قرارداد باید رسمی باشد")
    check(r0["جنسیت"] == "مرد", "جنسیت حجت اله باید مرد باشد")
    check(r0["عنوان لوازم"] == "کلاه ایمنی", "لوازم باید کلاه ایمنی باشد")
    check(r0["عنوان شغل"] == "کارمند رسمی", "شغل باید کارمند رسمی باشد")
    check(r0["شهرستان/منطقه"] == "اجرای طرح‌ها", "منطقه باید اجرای طرح‌ها باشد")
    check(r0["تاریخ تحویل"] == "شهریور ۱۴۰۴", "تاریخ باید شهریور ۱۴۰۴ باشد")
    check(r0["شماره حواله"] == "14040524", "شماره حواله")
    check(r0["نام شرکت"] == "شرکت گاز استان تهران", "شرکت پیش‌فرض")
    check(r0["شماره پیمان"] == "035982", "پیمان پیش‌فرض")
    check(r0["سایز"] is None, "کلاه ایمنی سایز ندارد")

    # حواله 14040509 (۳ نفر × ۲ قلم = ۶ ردیف)
    rows2 = logic.build_rows(_voucher_14040509())
    check(len(rows2) == 6, f"14040509 باید ۶ ردیف باشد، شد {len(rows2)}")
    items = {r["عنوان لوازم"] for r in rows2}
    check(items == {"دستکش حالدار", "عینک ایمنی"}, "دو قلم باید باشد")
    # REQ.QTY=3 برای ۳ نفر => سهم هر نفر ۱
    check(all(r["تعداد"] == 1 for r in rows2), "تعداد هر نفر باید ۱ باشد (کل۳÷۳نفر)")

    # تست تقسیم مقدار کل: ۱۷ عدد برای ۱۷ نفر => هر نفر ۱
    many = {
        "voucher_number": "14040536", "requesting_unit": "اجرای طرح‌ها", "delivery_date": None,
        "personnel_type": "official", "company": None, "contract_number": None,
        "items": [{"mesc_code": "9646108242", "item_name": "عینک آفتابی", "unit": "NO", "req_qty": 17}],
        "personnel": [{"first_name": "علی", "last_name": f"ن{i}", "code": f"50000{i}", "job_title": None, "size": None}
                      for i in range(17)],
    }
    mrows = logic.build_rows(many)
    check(len(mrows) == 17, f"باید ۱۷ ردیف باشد، شد {len(mrows)}")
    check(all(r["تعداد"] == 1 for r in mrows), "هر نفر باید ۱ بگیرد نه ۱۷ (کل۱۷÷۱۷نفر)")

    # تست کد ملی ۱۰ رقمی -> پیمانکاری
    contractor = {
        "voucher_number": "1", "requesting_unit": "منطقه ۱", "delivery_date": "مهر ۱۴۰۴",
        "personnel_type": "contractor", "company": None, "contract_number": None,
        "items": [{"mesc_code": None, "item_name": "کفش ایمنی", "unit": "PR", "req_qty": 1}],
        "personnel": [{"first_name": "رضا", "last_name": "کارگر", "code": "0012345678",
                       "job_title": "تکنسین", "size": None}],
    }
    rc = logic.build_rows(contractor)[0]
    check(rc["کد ملی"] == "0012345678" and rc["کد پرسنلی"] is None, "کد ملی ۱۰ رقمی -> ستون D")
    check(rc["نوع قرارداد"] == "پیمانکاری", "باید پیمانکاری باشد")
    check(rc["عنوان شغل"] == "تکنسین", "شغل دست‌نویس باید استفاده شود")
    check(rc["سایز"] in {"40", "41", "42", "43", "44", "45"}, "کفش باید سایز رندوم بگیرد")

    # تست تخصیص سایز چرخشی برای البسه بدون سایز
    garment = {
        "voucher_number": "2", "requesting_unit": "منطقه ۲", "delivery_date": "آبان ۱۴۰۴",
        "personnel_type": "official", "company": None, "contract_number": None,
        "items": [{"mesc_code": None, "item_name": "لباس کار", "unit": "NO", "req_qty": 1}],
        "personnel": [{"first_name": "علی", "last_name": "الف", "code": "123456", "job_title": None, "size": None},
                      {"first_name": "رضا", "last_name": "ب", "code": "123457", "job_title": None, "size": None},
                      {"first_name": "حسن", "last_name": "ج", "code": "123458", "job_title": None, "size": None}],
    }
    gr = logic.build_rows(garment)
    sizes = [r["سایز"] for r in gr]
    check(all(s in {"M", "L", "XL", "XXL", "XXXL"} for s in sizes), "لباس کار باید سایز حرفی بگیرد")
    check(len(set(sizes)) == 3, "سه نفر باید سه سایز متفاوت بگیرند (توزیع چرخشی)")

    # تست: سایزِ یک نفر در دو قلم البسه باید یکسان باشد
    two_garments = {
        "voucher_number": "3", "requesting_unit": "م", "delivery_date": None,
        "personnel_type": "official", "company": None, "contract_number": None,
        "items": [{"mesc_code": None, "item_name": "لباس کار", "unit": "NO", "req_qty": 2},
                  {"mesc_code": None, "item_name": "لباس گرم", "unit": "NO", "req_qty": 2}],
        "personnel": [{"first_name": "علی", "last_name": "الف", "code": "111111", "job_title": None, "size": None},
                      {"first_name": "رضا", "last_name": "ب", "code": "222222", "job_title": None, "size": None}],
    }
    tg = logic.build_rows(two_garments)
    by_person = {}
    for r in tg:
        by_person.setdefault(r["نام خانوادگی"], set()).add(r["سایز"])
    check(all(len(s) == 1 for s in by_person.values()), "سایزِ هر نفر باید در همه‌ی البسه یکسان باشد")

    # تست: پُرشدنِ کد جا‌افتاده از حواله‌ی دیگر
    va = {"voucher_number": "A", "requesting_unit": None, "delivery_date": None, "personnel_type": "official",
          "company": None, "contract_number": None, "items": [{"mesc_code": None, "item_name": "کلاه ایمنی", "unit": "NO", "req_qty": 1}],
          "personnel": [{"first_name": "علی", "last_name": "حسینی", "code": "576058", "job_title": None, "size": None}]}
    vb = {"voucher_number": "B", "requesting_unit": None, "delivery_date": None, "personnel_type": "official",
          "company": None, "contract_number": None, "items": [{"mesc_code": None, "item_name": "کلاه ایمنی", "unit": "NO", "req_qty": 1}],
          "personnel": [{"first_name": "علی", "last_name": "حسینی", "code": None, "job_title": None, "size": None}]}
    logic.backfill_codes([va, vb])
    check(vb["personnel"][0]["code"] == "576058", "کدِ جا‌افتاده باید از حواله‌ی دیگر پُر شود")

    if failures:
        print("❌ تست‌های ناموفق:")
        for m in failures:
            print("  -", m)
        raise SystemExit(1)
    print("✅ همه‌ی تست‌ها موفق بودند.")


if __name__ == "__main__":
    _run()
