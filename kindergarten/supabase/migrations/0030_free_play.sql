-- ============================================================
-- بازی آزاد و نقشه علایق — ماژول M8، بخش ۵.۴
-- ============================================================
--
-- سند خودش می‌گوید: «این ماژول منبع تمام تحلیل علایق است و
-- شکننده‌ترین بخش محصول. اگر سنگین طراحی شود، رها می‌شود.»
--
-- ── پنج تصمیمی که این مهاجرت می‌گیرد و باید صریح بماند ────────
--
-- الف) **مدت زمان ثبت نمی‌شود.** فقط «انتخاب». بخش ۵.۴ صریح است:
--      فراوانی انتخاب برای نقشه علایق کافی است. پرسیدنِ مدت، ثبت را
--      از بیست ثانیه به دو دقیقه می‌برد و ماژول رها می‌شود.
--
-- ب) **کودکی که جابه‌جا نشده، ثبت نمی‌شود.** هیچ ردیف «نامشخص»ی
--      ساخته نمی‌شود. داده ناقص بهتر از داده جعلی است — و نقشه
--      علایقی که از حدس ساخته شده، بدتر از نداشتنش است.
--
-- ج) **گوشه‌ها داده‌اند، نه کد.** پیوست الف هشت گوشه پیش‌فرض داده و
--      گفته «قابل تغییر توسط مهد». مهدی که گوشه موسیقی ندارد نباید
--      در گزارشش «موسیقی: صفر» ببیند.
--
-- د) **آستانه انتشار.** بخش ۹: کمتر از هشت ثبت در ماه یعنی نمودار
--      نشان داده نمی‌شود. نمودارِ سه‌نقطه‌ای، الگو نیست؛ نویز است —
--      و خانواده آن را الگو می‌خواند.
--
-- ه) **هم‌بازی از ثبت جفتی می‌آید، نه از هم‌گوشه بودن.** دو کودک در
--      یک گوشه، لزوماً با هم نبوده‌اند. شمردن هم‌حضوری، رابطه‌ای
--      می‌سازد که هیچ‌کس ندیده — همان قاعده مشاهده تکاملی.
-- ============================================================

create table activity_corner (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  title text not null,
  /* نشان کوتاه، برای ستون‌های صفحه بازی آزاد. */
  glyph text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint activity_corner_title check (length(btrim(title)) between 1 and 60),
  constraint activity_corner_unique unique (center_id, title)
);

create index activity_corner_center_idx on activity_corner (center_id, sort_order)
  where active;

/*
 * نوبت بازی آزاد: صبح یا بعدازظهر.
 *
 * دو نوبت در روز، چون کودکی که صبح بلوک بازی کرده و بعدازظهر نقاشی،
 * دو انتخاب کرده نه یکی — و نقشه علایق باید هر دو را ببیند.
 */
create type app.play_session as enum ('morning', 'afternoon');

create table free_choice_log (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete cascade,
  corner_id uuid not null references activity_corner(id) on delete restrict,

  date date not null,
  session app.play_session not null default 'morning',

  staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),

  /*
   * یک انتخاب برای هر کودک در هر نوبت.
   *
   * مربی‌ای که دوباره می‌کشد، نظرش را عوض کرده — ردیف دوم نمی‌سازد.
   * بی این قید، کودکی که سه بار جابه‌جا شده در نقشه سه انتخاب دارد.
   */
  constraint free_choice_once unique (child_id, date, session)
);

create index free_choice_child_idx on free_choice_log (child_id, date desc);
create index free_choice_corner_idx on free_choice_log (center_id, date);

/*
 * بازی جفتی — بخش ۵.۴.
 *
 * «کدام کودکان بیشتر با هم بودند؟» یک پرسش اختیاری پایان روز. هفته‌ای
 * دو تا سه بار کافی است، و همین است که تعامل اجتماعی گزارش را می‌سازد.
 */
create table play_pair (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  date date not null,
  child_a uuid not null references child(id) on delete cascade,
  child_b uuid not null references child(id) on delete cascade,
  created_at timestamptz not null default now(),

  /* جفت مرتب‌شده: «الف با ب» و «ب با الف» یکی‌اند. */
  constraint play_pair_ordered check (child_a < child_b),
  constraint play_pair_once unique (date, child_a, child_b)
);

create index play_pair_child_idx on play_pair (child_a, date desc);
create index play_pair_child_b_idx on play_pair (child_b, date desc);

-- ------------------------------------------------------------
-- گوشه‌های پیش‌فرض — پیوست الف
--
-- هر مرکز تازه این هشت‌تا را می‌گیرد و بعد خودش عوضشان می‌کند.
-- ------------------------------------------------------------
create or replace function app.seed_activity_corners()
returns trigger
language plpgsql
as $$
begin
  insert into activity_corner (center_id, title, glyph, sort_order)
  values
    (new.id, 'بلوک و ساخت‌وساز', '🧱', 10),
    (new.id, 'نقاشی و کاردستی', '🎨', 20),
    (new.id, 'کتاب و قصه', '📖', 30),
    (new.id, 'خانه‌بازی', '🏠', 40),
    (new.id, 'شن و آب', '🪣', 50),
    (new.id, 'موسیقی', '🥁', 60),
    (new.id, 'پازل و بازی فکری', '🧩', 70),
    (new.id, 'حیاط', '🌳', 80);
  return new;
end;
$$;

create trigger center_seed_activity_corners
  after insert on center
  for each row execute function app.seed_activity_corners();

-- مرکزهای موجود هم گوشه بگیرند.
insert into activity_corner (center_id, title, glyph, sort_order)
select c.id, x.title, x.glyph, x.ord
  from center c
 cross join (values
   ('بلوک و ساخت‌وساز', '🧱', 10),
   ('نقاشی و کاردستی', '🎨', 20),
   ('کتاب و قصه', '📖', 30),
   ('خانه‌بازی', '🏠', 40),
   ('شن و آب', '🪣', 50),
   ('موسیقی', '🥁', 60),
   ('پازل و بازی فکری', '🧩', 70),
   ('حیاط', '🌳', 80)
 ) as x(title, glyph, ord)
on conflict (center_id, title) do nothing;

-- ------------------------------------------------------------
-- نقشه علایق یک کودک
--
-- بخش ۹: منبع **منحصراً** free_choice_log. هیچ داده دیگری — نه خلق،
-- نه غذا، نه مشاهده — وارد این نقشه نمی‌شود؛ وگرنه «علاقه» با «آنچه
-- مربی نوشته» قاطی می‌شود و معلوم نیست کدام است.
-- ------------------------------------------------------------
create or replace function app.interest_map(
  centre uuid,
  target uuid,
  from_date date,
  to_date date
)
returns table (
  corner_id uuid,
  title text,
  glyph text,
  times integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select a.id, a.title, a.glyph,
         count(f.id)::integer
    from activity_corner a
    left join free_choice_log f
      on f.corner_id = a.id and f.child_id = target
     and f.date between from_date and to_date
   where a.center_id = centre and a.active
   group by a.id, a.title, a.glyph, a.sort_order
   order by 4 desc, a.sort_order
$$;

/**
 * شمار ثبت‌های ماه — آستانه انتشار.
 *
 * بخش ۹: کمتر از هشت ثبت یعنی «داده کافی برای این ماه ثبت نشده».
 * نمودارِ سه‌نقطه‌ای الگو نیست؛ و خانواده آن را الگو می‌خواند.
 */
create or replace function app.interest_sample(
  centre uuid,
  target uuid,
  from_date date,
  to_date date
)
returns integer
language sql
stable
security definer
set search_path = public, app
as $$
  select count(*)::integer from free_choice_log
   where center_id = centre and child_id = target
     and date between from_date and to_date
$$;

/**
 * هم‌بازی‌های پرتکرار — از ثبت جفتی، نه از هم‌گوشه بودن.
 *
 * دو کودک در یک گوشه لزوماً با هم نبوده‌اند. شمردن هم‌حضوری رابطه‌ای
 * می‌سازد که هیچ‌کس ندیده.
 */
create or replace function app.play_partners(
  centre uuid,
  target uuid,
  from_date date,
  to_date date
)
returns table (child_id uuid, first_name text, times integer)
language sql
stable
security definer
set search_path = public, app
as $$
  select c.id, c.first_name, count(*)::integer
    from play_pair p
    join child c
      on c.id = case when p.child_a = target then p.child_b else p.child_a end
   where p.center_id = centre
     and (p.child_a = target or p.child_b = target)
     and p.date between from_date and to_date
   group by c.id, c.first_name
   order by 3 desc, 2
$$;

/**
 * کودکی که در بازه هیچ جفتی برایش ثبت نشده.
 *
 * برای مربی و مدیر، نه برای خانواده — و عمداً «منزوی» نامش نیست:
 * نبودِ ثبت یعنی کسی ننوشته، نه اینکه کودک تنها بوده. اپ نباید از
 * سکوتِ داده، نتیجه درباره کودک بگیرد.
 */
create or replace function app.unpaired_children(
  centre uuid,
  from_date date,
  to_date date
)
returns table (child_id uuid, full_name text, class_name text)
language sql
stable
security definer
set search_path = public, app
as $$
  select c.id, c.first_name || ' ' || c.last_name, cl.name
    from child c
    left join class cl on cl.id = c.class_id
   where c.center_id = centre and c.status = 'active' and c.deleted_at is null
     and not exists (
       select 1 from play_pair p
        where p.center_id = centre
          and (p.child_a = c.id or p.child_b = c.id)
          and p.date between from_date and to_date
     )
   order by 2
$$;

-- ------------------------------------------------------------
-- سیاست سطر-محور
-- ------------------------------------------------------------
alter table activity_corner enable row level security;
alter table activity_corner force row level security;
alter table free_choice_log enable row level security;
alter table free_choice_log force row level security;
alter table play_pair enable row level security;
alter table play_pair force row level security;

create policy activity_corner_visible on activity_corner
  for select using (center_id = app.current_center_id());

create policy activity_corner_manager on activity_corner
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

/*
 * ثبت خام بازی آزاد را کارکنان می‌بینند، نه خانواده.
 *
 * آنچه به خانواده می‌رسد نقشه علایقِ گزارش ماهانه است — یک نما، نه
 * فهرست روزبه‌روزِ «امروز باز هم بلوک».
 */
create policy free_choice_staff on free_choice_log
  for all using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  )
  with check (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  );

create policy play_pair_staff on play_pair
  for all using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  )
  with check (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  );
