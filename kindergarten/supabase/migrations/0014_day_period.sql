-- ============================================================
-- بازه‌های روز — مرجع مشترک دوره حضور کودک و شیفت مربی
-- ============================================================
--
-- دو مفهوم جدا به این جدول ارجاع می‌دهند و هیچ‌کدام تعدادش را فرض
-- نمی‌کنند: مهد می‌تواند مرز را جابه‌جا کند یا بازه سوم اضافه کند و
-- هیچ کوئری‌ای نمی‌شکند. به همین دلیل هیچ‌جا عدد دو نوشته نشده.

create table day_period (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  key text not null,
  title text not null,
  start_time time not null,
  end_time time not null,
  sort_order integer not null,

  /*
   * کدام فیلدهای گزارش به این بازه تعلق دارند.
   *
   * ناهار عمداً اینجا نیست: به تصمیم مالک محصول، ناهار برای همه کودکان
   * است، فارغ از بازه. پس همیشه قابل اعمال می‌ماند و در هیچ بازه‌ای
   * فهرست نمی‌شود.
   */
  report_fields text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint day_period_key_unique unique (center_id, key),
  constraint day_period_order_unique unique (center_id, sort_order),
  constraint day_period_time_ordered check (start_time < end_time)
);
create index day_period_center_idx on day_period (center_id, sort_order);

create trigger day_period_touch before update on day_period
  for each row execute function app.touch_updated_at();

/**
 * بازه‌های دربرگیرنده یک لحظه.
 *
 * جمع است، نه مفرد: مرز دو بازه می‌تواند همپوشان باشد و در آن لحظه
 * کودکان هر دو گروه با هم در مهدند. هیچ‌جا نباید فرض کند «بازه فعلی»
 * یکی است.
 */
create or replace function app.periods_at(target_center uuid, at_time time)
returns setof day_period
language sql
stable
as $$
  select * from day_period
  where center_id = target_center
    and at_time >= start_time
    and at_time < end_time
  order by sort_order
$$;

-- ── دو بازه پیش‌فرض برای مرکزهای موجود ─────────────────────────
--
-- مرز پیش‌فرض پایان ناهار است. مهد می‌تواند جابه‌جایش کند.
--
-- خواب در بازه بعدازظهر است: کودکی که بعد از ناهار می‌رود نمی‌خوابد.
-- خلق ظهر به بازه صبح داده شده، چون همان کودک تا بعد از ناهار هست.
insert into day_period (center_id, key, title, start_time, end_time, sort_order, report_fields)
select
  c.id, 'morning', 'صبح', c.work_start, time '13:00', 1,
  array['mood_morning', 'mood_noon']
from center c
union all
select
  c.id, 'afternoon', 'بعدازظهر', time '13:00', c.work_end, 2,
  array['nap', 'mood_afternoon']
from center c;

-- ── سیاست سطر-محور ─────────────────────────────────────────────
alter table day_period enable row level security;
alter table day_period force row level security;

-- همه نقش‌های مرکز آن را می‌خوانند؛ فقط مدیر تغییرش می‌دهد.
create policy day_period_visible on day_period
  for select using (center_id = app.current_center_id());

create policy day_period_manager_write on day_period
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());
