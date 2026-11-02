-- ============================================================
-- ارسال خودکار گزارش روزانه — بخش ۵.۹ سند
--
-- «ارسال خودکار در ساعت تعیین‌شده (پیش‌فرض ۱۷:۳۰) حتی اگر مربی دکمه را
-- نزند.»
--
-- کلمه «حتی» اینجا تعیین‌کننده است. اپ نمی‌تواند این را تضمین کند: گوشی
-- مربی ممکن است خاموش باشد، اپ بسته، یا اینترنت قطع. پس ارسال خودکار
-- کار سرور است و این تابع را یک زمان‌بند دوره‌ای صدا می‌زند.
--
-- بخش ۱۷ این را مهم‌ترین معیار پذیرش کل محصول می‌داند: «ارسال ۱۰۰٪
-- گزارش‌های روزانه.» پس مسیرش نباید به حضور مربی گره بخورد.
-- ============================================================

/**
 * گزارش‌های امروزِ یک مرکز را می‌فرستد و قفل می‌کند.
 *
 * قفل‌کردن یعنی sent_at و locked_at پر می‌شوند؛ از آن پس تریگر
 * daily_report_locked_guard فقط اصلاحیه می‌پذیرد.
 *
 * گزارش ناقص هم فرستاده می‌شود. بخش ۵.۹ ناقص‌ها را فهرست می‌کند تا مربی
 * ببیند، ولی جلوی ارسال را نمی‌گیرد؛ نرفتن گزارش بدتر از ناقص رفتن است.
 */
create or replace function app.auto_send_due_reports(at_time timestamptz default now())
returns table (center_id uuid, sent integer)
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  with due as (
    select c.id
    from center c
    where (at_time at time zone 'Asia/Tehran')::time >= c.auto_send_report_at
  ),
  -- روز تعطیل از ارسال کنار گذاشته می‌شود؛ گزارشی برای آن روز وجود ندارد.
  open_days as (
    select d.id
    from due d
    where not exists (
      select 1 from closure cl
      where cl.center_id = d.id
        and cl.date = (at_time at time zone 'Asia/Tehran')::date
        and cl.type = 'full_closure'
        and cl.class_id is null
    )
  ),
  locked as (
    update daily_report r
    set sent_at = at_time,
        locked_at = at_time,
        status = 'sent'
    from open_days o
    where r.center_id = o.id
      and r.date = (at_time at time zone 'Asia/Tehran')::date
      and r.locked_at is null
    returning r.center_id
  )
  select l.center_id, count(*)::integer from locked l group by l.center_id;
end;
$$;

comment on function app.auto_send_due_reports is
  'بخش ۵.۹: ارسال خودکار گزارش‌های روز در ساعت تنظیم‌شده هر مرکز. یک زمان‌بند دوره‌ای صدایش می‌زند.';
