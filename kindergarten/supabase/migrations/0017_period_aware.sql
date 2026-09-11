-- ============================================================
-- قاعده‌های وابسته به بازه، و ثبت مربی تحویل‌دهنده و تحویل‌گیرنده
-- ============================================================

-- ── ۱. چه کسی کودک را گرفت و چه کسی تحویل داد ──────────────────
--
-- تا امروز فقط سرپرستِ آورنده و برنده ثبت می‌شد، نه مربی. برای سرپرست
-- مهم است بداند کودکش را دست چه کسی داده و از چه کسی گرفته، و برای
-- بازرسی هم همین سؤال پرسیده می‌شود.
--
-- هر مربیِ آن کلاس حق تحویل دارد، نه فقط یک نفر: در همپوشانی شیفت،
-- هر کدام که دم در بود کار را انجام می‌دهد.
alter table attendance
  add column checked_in_by_staff_id  uuid references staff(id) on delete set null,
  add column checked_out_by_staff_id uuid references staff(id) on delete set null;

comment on column attendance.checked_in_by_staff_id is
  'مربی‌ای که کودک را تحویل گرفت. به سرپرست نشان داده می‌شود.';
comment on column attendance.checked_out_by_staff_id is
  'مربی‌ای که کودک را تحویل داد.';

-- ── ۲. فیلدهای قابل اعمال برای هر کودک ─────────────────────────
--
-- تعریف «گزارش کامل» دیگر ثابت نیست: کودک صبحانه‌ای خلق عصر ندارد، و
-- نبودش نقص نیست. ناهار بیرون از بازه‌هاست و برای همه اعمال می‌شود.
create or replace function app.applicable_fields(target_child uuid, on_date date)
returns text[]
language sql
stable
as $$
  select array['lunch'] || coalesce(
    (select array_agg(f order by f)
     from app.enrollment_periods(target_child, on_date) p,
          unnest(p.report_fields) f),
    '{}'
  )
$$;

-- ── ۳. کامل بودن گزارش، وابسته به همان کودک ────────────────────
create or replace function app.refresh_report_status(report_id uuid)
returns void
language plpgsql
as $$
declare
  r daily_report;
  fields text[];
  has_lunch boolean;
  is_complete boolean;
begin
  select * into r from daily_report where id = report_id;
  if r.id is null or r.locked_at is not null then
    return;
  end if;

  fields := app.applicable_fields(r.child_id, r.date);

  select exists (
    select 1 from meal_log where daily_report_id = report_id and meal_type = 'lunch'
  ) into has_lunch;

  is_complete :=
        (not ('lunch'          = any (fields)) or has_lunch)
    and (not ('nap'            = any (fields)) or r.nap_start     is not null)
    and (not ('mood_morning'   = any (fields)) or r.mood_morning  is not null)
    and (not ('mood_noon'      = any (fields)) or r.mood_noon     is not null)
    and (not ('mood_afternoon' = any (fields)) or r.mood_afternoon is not null);

  update daily_report
  set status = case when is_complete then 'complete'::app.report_status
                    else 'draft'::app.report_status end
  where id = report_id;
end;
$$;

-- ── ۴. تأخیر از پایان بازه خود کودک ────────────────────────────
--
-- پیش‌تر از center.work_end می‌آمد، پس کودک صبحانه‌ای که ساعت ۱۳ می‌رفت
-- سه ساعت و نیم زودتر از موعد به نظر می‌رسید و هیچ تأخیری هم هرگز
-- برایش حساب نمی‌شد.
create or replace function app.child_day_end(target_child uuid, on_date date)
returns time
language sql
stable
as $$
  select coalesce(
    (select max(p.end_time) from app.enrollment_periods(target_child, on_date) p),
    (select c.work_end from center c
      join child ch on ch.center_id = c.id where ch.id = target_child)
  )
$$;

create or replace function app.set_late_minutes()
returns trigger
language plpgsql
as $$
declare
  day_end time;
begin
  if new.check_out_at is null then
    new.late_minutes := 0;
    return new;
  end if;
  day_end := app.child_day_end(new.child_id, new.date);
  new.late_minutes := greatest(
    0,
    ceil(extract(epoch from (
      (new.check_out_at at time zone 'Asia/Tehran')::time - day_end
    )) / 60)::integer
  );
  return new;
end;
$$;

create trigger attendance_late_minutes
  before insert or update of check_out_at on attendance
  for each row execute function app.set_late_minutes();

-- ── ۵. «بی‌خبر» از ساعت شروع بازه خود کودک ─────────────────────
--
-- ساعت ۹ ثابت بود. کودک بعدازظهری ساعت ۹ هنوز نباید آمده باشد و
-- هشدار گرفتنش غلط است.
create or replace function app.child_day_start(target_child uuid, on_date date)
returns time
language sql
stable
as $$
  select coalesce(
    (select min(p.start_time) from app.enrollment_periods(target_child, on_date) p),
    (select c.work_start from center c
      join child ch on ch.center_id = c.id where ch.id = target_child)
  )
$$;

/**
 * کودکانی که باید امروز در این لحظه در مهد باشند.
 *
 * سه شرط: ثبت‌نام فعال دارد، امروز روزِ اوست، و لحظه جاری در یکی از
 * بازه‌های اوست. صفحه «امروز» مربی از همین می‌خواند، پس کودک بعدازظهری
 * صبح اصلاً در شبکه نمی‌آید.
 */
create or replace function app.children_in_session(target_class uuid, at_moment timestamptz)
returns setof child
language sql
stable
as $$
  select ch.*
  from child ch
  join child_enrollment e on e.child_id = ch.id
   and (at_moment at time zone 'Asia/Tehran')::date >= e.start_date
   and (e.end_date is null or (at_moment at time zone 'Asia/Tehran')::date <= e.end_date)
  where e.class_id = target_class
    and ch.left_at is null
    and app.enrolled_today(ch.id, (at_moment at time zone 'Asia/Tehran')::date)
    and exists (
      select 1
      from app.enrollment_periods(ch.id, (at_moment at time zone 'Asia/Tehran')::date) p
      where (at_moment at time zone 'Asia/Tehran')::time >= p.start_time
        and (at_moment at time zone 'Asia/Tehran')::time <  p.end_time
    )
  order by ch.first_name
$$;

/**
 * نسبت مربی به کودک در یک لحظه — بخش ۷.۲.
 *
 * در مرز بازه‌ها کودکان هر دو گروه با هم حاضرند و همان‌جا بحرانی‌ترین
 * نقطه روز است؛ چون از children_in_session می‌آید، خودکار حساب می‌شود.
 */
create or replace function app.staff_ratio(target_class uuid, at_moment timestamptz)
returns table (children integer, staff integer, max_allowed integer, breached boolean)
language sql
stable
as $$
  select
    (select count(*)::integer from app.children_in_session(target_class, at_moment)),
    (select count(*)::integer from app.staff_on_duty(target_class, at_moment)),
    c.max_children_per_staff,
    (select count(*) from app.children_in_session(target_class, at_moment))
      > c.max_children_per_staff
        * greatest((select count(*) from app.staff_on_duty(target_class, at_moment)), 1)
  from class cl
  join center c on c.id = cl.center_id
  where cl.id = target_class
$$;
