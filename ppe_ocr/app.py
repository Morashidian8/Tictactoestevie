"""رابط کاربری فارسی برای استخراج حواله‌ها و ساخت اکسل.

اجرا:  streamlit run ppe_ocr/app.py
نیازمند تنظیم ANTHROPIC_API_KEY در محیط.
"""
from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

# اجازه‌ی اجرا هم به‌صورت ماژول و هم مستقیم
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ppe_ocr import excel_writer, extractor, logic  # noqa: E402

st.set_page_config(page_title="استخراج حواله تجهیزات → اکسل", page_icon="📋", layout="wide")

st.markdown(
    "<h2 style='text-align:right'>📋 استخراج حواله تجهیزات حفاظت فردی و ساخت اکسل</h2>",
    unsafe_allow_html=True,
)
st.markdown(
    "<p style='text-align:right'>عکس حواله‌ها را آپلود کنید؛ اپ مشخصات را می‌خواند و فایل اکسل استاندارد را می‌سازد. "
    "برای دقت بالا، عکس‌ها را صاف و روشن و بدون کجی بگیرید.</p>",
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("راهنما")
    st.write("۱) عکس حواله‌ها را در «حواله تجهیزات» بگذارید.")
    st.write("۲) اگر لیست اسامی جدا دارید، در بخش دومش بگذارید تا به اقلام تخصیص یابد.")
    st.write("۳) دکمه‌ی «استخراج و ساخت اکسل» را بزنید.")
    st.write("۴) فایل خروجی را دانلود کنید.")
    st.divider()
    import os as _os
    _has_key = bool(_os.getenv("GOOGLE_API_KEY") or _os.getenv("GEMINI_API_KEY"))
    st.caption(f"موتور: Google Gemini (رایگان) — کلید تنظیم شده: {'✅' if _has_key else '❌'}")
    if not _has_key:
        st.warning("کلید رایگان از aistudio.google.com/apikey بگیر و در GOOGLE_API_KEY بگذار.")
    st.caption("ستون‌ها: نام، خانوادگی، کد پرسنلی/ملی، جنسیت، منطقه، نوع قرارداد، لوازم، سایز، تعداد، تاریخ تحویل، شماره حواله …")

col1, col2 = st.columns(2)
with col1:
    voucher_files = st.file_uploader(
        "🧾 عکس حواله‌های تجهیزات (می‌توانید چندتا انتخاب کنید)",
        type=["png", "jpg", "jpeg", "webp"], accept_multiple_files=True,
    )
with col2:
    namelist_files = st.file_uploader(
        "👥 (اختیاری) عکس لیست اسامی جدا",
        type=["png", "jpg", "jpeg", "webp"], accept_multiple_files=True,
    )

run = st.button("🚀 استخراج و ساخت اکسل", type="primary", use_container_width=True)

if run:
    if not voucher_files:
        st.warning("حداقل یک عکس حواله آپلود کنید.")
        st.stop()

    vouchers = []
    with st.status("در حال خواندن عکس‌ها با هوش مصنوعی…", expanded=True) as status:
        try:
            for f in voucher_files:
                st.write(f"خواندن حواله: {f.name}")
                vouchers.append(extractor.extract(f.getvalue(), f.name, mode="voucher"))

            if namelist_files:
                # لیست اسامی جدا: اسامی را از این‌ها بگیر و به اقلامِ حواله‌ها تخصیص بده
                names = []
                for f in namelist_files:
                    st.write(f"خواندن لیست اسامی: {f.name}")
                    nl = extractor.extract(f.getvalue(), f.name, mode="namelist")
                    names.extend(nl.get("personnel", []) or [])
                merged = []
                for v in vouchers:
                    v2 = dict(v)
                    if names:
                        v2 = logic.combine_namelist_with_voucher({"personnel": names}, v2)
                    merged.append(v2)
                vouchers = merged

            rows = logic.build_all(vouchers)
            status.update(label=f"تمام شد — {len(rows)} ردیف ساخته شد.", state="complete")
        except Exception as e:  # noqa: BLE001
            status.update(label="خطا در پردازش", state="error")
            st.error(f"خطا: {e}")
            st.stop()

    if not rows:
        st.warning("هیچ ردیفی استخراج نشد. کیفیت عکس را بهتر کنید.")
        st.stop()

    st.success(f"✅ {len(rows)} ردیف آماده شد.")
    st.dataframe(rows, use_container_width=True, hide_index=True)

    xlsx = excel_writer.to_bytes(rows)
    st.download_button(
        "⬇️ دانلود فایل اکسل", data=xlsx, file_name="جدول_پرسنل.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True,
    )
    st.info("توجه: جنسیت از روی نام حدس زده می‌شود و سایزِ ننوشته به‌صورت چرخشی تخصیص می‌یابد. قبل از استفاده یک مرور کوتاه بکنید.")
