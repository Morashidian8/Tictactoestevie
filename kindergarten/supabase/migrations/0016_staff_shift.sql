-- ============================================================
-- شیفت مربی — با ساعت، نه با بازه
-- ============================================================
--
-- عمداً به day_period گره نمی‌خورد: مربی ۸:۰۰ تا ۱۶:۰۰ هر دو بازه را
-- می‌پوشاند و مربی ۸:۰۰ تا ۱۳:۰۰ فقط یکی را. اگر شیفت را با بازه تعریف
-- می‌کردیم، این تفاوت اصلاً قابل بیان نبود.

create table staff_shift (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  staff_id uuid not null references staff(id) on delete cascade,
  class_id uuid not null references class(id) on delete cascade,

  -- شنبه صفر، مثل بقیه سامانه.
  weekday smallint not null,
  start_time time not null,
  end_time time not null,

  effective_from date not null default current_date,
  effective_to date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_shift_weekday_valid check (weekday between 0 and 6),
  constraint staff_shift_time_ordered check (start_time < end_time),
  constraint staff_shift_dates_ordered
    check (effective_to is null or effective_to >= effective_from)
);
create index staff_shift_lookup_idx on staff_shift (center_id, class_id, weekday);

create trigger staff_shift_touch before update on staff_shift
  for each row execute function app.touch_updated_at();

/**
 * بازه‌هایی که شیفت‌های یک مربی در یک تاریخ می‌پوشانند.
 *
 * از تقاطع ساعت شیفت با ساعت بازه ساخته می‌شود، پس افزودن بازه سوم
 * هیچ تغییری اینجا لازم ندارد.
 */
create or replace function app.shift_periods(target_staff uuid, on_date date)
returns setof day_period
language sql
stable
as $$
  select distinct p.*
  from staff_shift s
  join day_period p
    on p.center_id = s.center_id
   and s.start_time < p.end_time
   and s.end_time > p.start_time
  where s.staff_id = target_staff
    and s.weekday = ((extract(dow from on_date)::int + 1) % 7)::smallint
    and on_date >= s.effective_from
    and (s.effective_to is null or on_date <= s.effective_to)
  order by p.sort_order
$$;

/**
 * مربی‌هایی که در یک لحظه روی یک کلاس شیفت دارند.
 *
 * می‌تواند بیش از یک نفر باشد؛ هیچ‌جا نباید فرض کند «مربی فعال» یک
 * نفر است. نسبت مربی به کودک از همین شمرده می‌شود.
 */
create or replace function app.staff_on_duty(target_class uuid, at_moment timestamptz)
returns setof staff
language sql
stable
as $$
  select distinct st.*
  from staff_shift s
  join staff st on st.id = s.staff_id
  where s.class_id = target_class
    and s.weekday = ((extract(dow from (at_moment at time zone 'Asia/Tehran')::date)::int + 1) % 7)::smallint
    and (at_moment at time zone 'Asia/Tehran')::time >= s.start_time
    and (at_moment at time zone 'Asia/Tehran')::time <  s.end_time
    and (at_moment at time zone 'Asia/Tehran')::date >= s.effective_from
    and (s.effective_to is null or (at_moment at time zone 'Asia/Tehran')::date <= s.effective_to)
$$;

-- ── مهاجرت داده موجود ──────────────────────────────────────────
-- هر تخصیص کلاس، یک شیفت تمام‌روز در همه روزهای کاری می‌شود.
insert into staff_shift (center_id, staff_id, class_id, weekday, start_time, end_time)
select cl.center_id, sc.staff_id, sc.class_id, d.weekday, c.work_start, c.work_end
from staff_class sc
join class cl on cl.id = sc.class_id
join center c on c.id = cl.center_id
cross join (select generate_series(0, 4) as weekday) d;

-- ── سیاست سطر-محور ─────────────────────────────────────────────
alter table staff_shift enable row level security;
alter table staff_shift force row level security;

-- برنامه کاری بین همکاران دیده می‌شود؛ مربی باید بداند چه کسی با اوست.
create policy staff_shift_visible on staff_shift
  for select using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  );

create policy staff_shift_manager_write on staff_shift
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());
