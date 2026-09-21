-- ============================================================
-- دوره حضور کودک — ویژگی ثبت‌نام، نه ویژگی کودک
-- ============================================================
--
-- عمداً روی child نمی‌نشیند: کودکی که از صبحانه‌ای به تمام‌روز تغییر
-- می‌کند نباید تاریخچه‌اش را از دست بدهد، و شهریه به همین ردیف بسته
-- می‌شود نه به خود کودک.

create extension if not exists btree_gist;

create type app.attendance_type as enum ('morning', 'afternoon', 'full_day');

/*
 * کدام بازه‌ها در کدام نوع حضور می‌آیند.
 *
 * این نگاشت روی خود بازه است، نه در کد: بازه سومی که فردا اضافه شود
 * خودش می‌گوید در کدام نوع‌ها هست، و هیچ تابعی لازم نیست عوض شود.
 */
alter table day_period
  add column included_in app.attendance_type[] not null default '{}';

update day_period set included_in = array['morning', 'full_day']::app.attendance_type[]
where key = 'morning';
update day_period set included_in = array['afternoon', 'full_day']::app.attendance_type[]
where key = 'afternoon';

/*
 * مرکز تازه باید بازه‌هایش را خودش بگیرد.
 *
 * مهاجرت فقط مرکزهای موجود را پر کرد؛ بدون این تریگر، اولین مهدی که
 * فردا ثبت‌نام کند هیچ بازه‌ای ندارد و آن وقت هیچ کودکی در هیچ شبکه‌ای
 * دیده نمی‌شود. این را تست پیدا کرد، نه بازبینی کد.
 */
create or replace function app.seed_day_periods()
returns trigger
language plpgsql
as $$
begin
  insert into day_period (
    center_id, key, title, start_time, end_time, sort_order, report_fields, included_in
  )
  values
    (new.id, 'morning', 'صبح', new.work_start, time '13:00', 1,
     array['mood_morning', 'mood_noon'],
     array['morning', 'full_day']::app.attendance_type[]),
    (new.id, 'afternoon', 'بعدازظهر', time '13:00', new.work_end, 2,
     array['nap', 'mood_afternoon'],
     array['afternoon', 'full_day']::app.attendance_type[]);
  return new;
end;
$$;

create trigger center_seed_day_periods
  after insert on center
  for each row execute function app.seed_day_periods();

create table child_enrollment (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  -- cascade، نه restrict: ثبت‌نام بدون کودک بی‌معناست و نگه داشتنش فقط
  -- جلوی حذف کودک را می‌گیرد. رد پای حذف در audit_log می‌ماند، چون آن
  -- جدول به child کلید خارجی ندارد.
  child_id uuid not null references child(id) on delete cascade,
  class_id uuid not null references class(id) on delete restrict,

  start_date date not null,
  -- خالی یعنی هنوز ادامه دارد.
  end_date date,

  attendance_type app.attendance_type not null default 'full_day',
  -- روزهای هفته‌ای که می‌آید. شنبه صفر، مثل i18n/week.ts.
  weekdays smallint[] not null default array[0, 1, 2, 3, 4],

  fee_plan_id uuid references fee_plan(id) on delete restrict,
  discount_percent numeric(5, 2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint child_enrollment_dates_ordered
    check (end_date is null or end_date >= start_date),
  constraint child_enrollment_weekdays_valid
    check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and array_length(weekdays, 1) > 0),
  constraint child_enrollment_discount_range check (discount_percent between 0 and 100),

  -- دو ثبت‌نام هم‌زمان برای یک کودک ممکن نیست. بدون این، «ثبت‌نام فعال»
  -- تعریف روشنی ندارد و شهریه دوباره حساب می‌شود.
  constraint child_enrollment_no_overlap exclude using gist (
    child_id with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  )
);
create index child_enrollment_active_idx on child_enrollment (center_id, class_id, start_date);

create trigger child_enrollment_touch before update on child_enrollment
  for each row execute function app.touch_updated_at();

/** ثبت‌نام فعال یک کودک در یک تاریخ. حداکثر یکی، به خاطر قید بالا. */
create or replace function app.active_enrollment(target_child uuid, on_date date)
returns child_enrollment
language sql
stable
as $$
  select * from child_enrollment
  where child_id = target_child
    and on_date >= start_date
    and (end_date is null or on_date <= end_date)
  limit 1
$$;

/**
 * آیا امروز روزِ این کودک است؟
 *
 * روز هفته از شنبه صفر شمرده می‌شود. extract(dow) یکشنبه را صفر
 * می‌گیرد، پس جابه‌جا می‌شود تا با تقویم ایرانی بخواند.
 */
create or replace function app.enrolled_today(target_child uuid, on_date date)
returns boolean
language sql
stable
as $$
  select coalesce(
    (((extract(dow from on_date)::int + 1) % 7)::smallint
      = any((app.active_enrollment(target_child, on_date)).weekdays)),
    false
  )
$$;

/** بازه‌هایی که برای این کودک در این تاریخ معنا دارند. */
create or replace function app.enrollment_periods(target_child uuid, on_date date)
returns setof day_period
language sql
stable
as $$
  select p.*
  from day_period p
  join child_enrollment e on e.id = (app.active_enrollment(target_child, on_date)).id
  where p.center_id = e.center_id
    and e.attendance_type = any (p.included_in)
  order by p.sort_order
$$;

-- ── مهاجرت داده موجود ──────────────────────────────────────────
--
-- هر کودک یک ثبت‌نام تمام‌روز روی همه روزهای کاری می‌گیرد. شهریه از
-- child_fee کپی می‌شود؛ خود child_fee می‌ماند و در مهاجرت بعدی کنار
-- می‌رود، چون حذف هم‌زمانش مالی موجود را لحظه‌ای می‌شکند.
insert into child_enrollment (
  center_id, child_id, class_id, start_date, attendance_type, weekdays,
  fee_plan_id, discount_percent
)
select
  ch.center_id,
  ch.id,
  ch.class_id,
  coalesce(ch.created_at::date, current_date),
  'full_day',
  array[0, 1, 2, 3, 4]::smallint[],
  cf.fee_plan_id,
  coalesce(cf.discount_percent, 0)
from child ch
left join child_fee cf on cf.child_id = ch.id
where ch.class_id is not null
  and ch.left_at is null;

/*
 * کودک تازه هم باید ثبت‌نام بگیرد.
 *
 * مهاجرت فقط کودکان موجود را پوشاند. بدون این تریگر، هر کودکی که فردا
 * ثبت‌نام شود ثبت‌نام فعال ندارد، یعنی نه بازه‌ای دارد، نه در هیچ شبکه‌ای
 * دیده می‌شود، و نه گزارشش هرگز کامل می‌شود. پیش‌فرض تمام‌روز است و مدیر
 * بعداً تغییرش می‌دهد.
 *
 * این را هم تست پیدا کرد: مهاجرت روی پایگاه خالی هیچ ردیفی نساخت و
 * همه کودکان بعدی بی‌ثبت‌نام ماندند.
 */
create or replace function app.seed_child_enrollment()
returns trigger
language plpgsql
as $$
begin
  if new.class_id is null or new.left_at is not null then
    return new;
  end if;
  insert into child_enrollment (center_id, child_id, class_id, start_date)
  values (new.center_id, new.id, new.class_id, current_date)
  on conflict do nothing;
  return new;
end;
$$;

create trigger child_seed_enrollment
  after insert on child
  for each row execute function app.seed_child_enrollment();

-- ── سیاست سطر-محور ─────────────────────────────────────────────
alter table child_enrollment enable row level security;
alter table child_enrollment force row level security;

create policy child_enrollment_visible on child_enrollment
  for select using (
    center_id = app.current_center_id() and app.can_see_child(child_id)
  );

-- ثبت‌نام قرارداد است؛ فقط مدیر می‌نویسد.
create policy child_enrollment_manager_write on child_enrollment
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create trigger audit_child_enrollment
  after insert or update or delete on child_enrollment
  for each row execute function app.write_audit();
