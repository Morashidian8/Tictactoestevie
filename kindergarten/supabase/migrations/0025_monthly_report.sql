-- ============================================================
-- گزارش ماهانه کودک — جلسه با خانواده
--
-- خواسته: گزارشی که کودک را از همه نظر ببیند — چه چیزی دوست دارد،
-- چه چالشی داشته، با چه کسانی بیشتر است — و چیزی از قلم نیفتد.
--
-- ── مسئله واقعی، و اینکه چرا جواب «هوش مصنوعی» نیست ───────────
--
-- مربی خوب همه این‌ها را می‌داند. آنچه ندارد جایی برای ثبتشان است.
-- گزارش روزانه فعلی غذا و خواب و خلق و یک یادداشت آزاد دارد؛ یعنی
-- «امروز با آرتین برج ساخت و دو ساعت رهایش نکرد» یا در همان یادداشت
-- گم می‌شود یا اصلاً نوشته نمی‌شود.
--
-- پس مسئله تولید متن نیست، ثبت ساختاریافته است. اگر در طول ماه بیست
-- مشاهده با برچسب درست ثبت شده باشد، گزارش ماهانه خودش ساخته است.
--
-- ── قاعده یک: مشاهده رویدادِ تاریخ‌دار است، نه صفتِ کودک ───────
--
-- «۱۲ مهر: نخواست نقاشی کند» یک واقعیت است.
-- «این کودک نقاشی دوست ندارد» یک برچسب است.
--
-- اپ فقط اولی را ذخیره می‌کند و هرگز دومی را نمی‌سازد. جمع‌بندی را
-- مربی در جمله خودش می‌نویسد و پایش امضا می‌کند — چون او دیده و
-- مسئولش است، نه یک تابع.
--
-- ── قاعده دو: کودک دیگر فقط نام کوچک ─────────────────────────
--
-- «با آرتین بازی کرد» لازم است و ارزشمند. ولی گزارشی که به خانواده
-- سارا می‌رود، نباید نام خانوادگی و مشخصات آرتین را ببرد. توابع این
-- فایل عمداً فقط نام کوچک برمی‌گردانند.
--
-- ── آنچه ساخته نشد ───────────────────────────────────────────
--
-- هیچ امتیاز، درصد، نمودار پیشرفت، یا مقایسه با کودک دیگر. بند ۱۰
-- و پیوست ج سند این‌ها را بسته‌اند و این مهاجرت بازشان نمی‌کند.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. عدسی‌های مشاهده
-- ────────────────────────────────────────────────────────────
/*
 * شش عدسی. بیشتر از این، مربی وقت انتخاب کردن ندارد و همه‌چیز در
 * «سایر» می‌افتد؛ کمتر از این، تفکیک معنا ندارد.
 */
create type app.observation_lens as enum (
  'interest',   -- چه چیزی جذبش کرد
  'challenge',  -- کجا سخت بود
  'social',     -- با چه کسی، چطور
  'skill',      -- چه کاری را تازه توانست
  'moment',     -- لحظه‌ای که ارزش گفتن به خانواده دارد
  'care'        -- خواب، غذا، بهداشت؛ آنچه الگو دارد
);

create table observation (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete cascade,

  date date not null,
  lens app.observation_lens not null,
  /*
   * جمله خودِ مربی. هیچ ساختاری رویش تحمیل نمی‌شود جز طول، چون
   * چیزی که مربی در بیست ثانیه بین دو کار می‌نویسد، فرم پر کردنی
   * نیست.
   */
  body text not null,

  staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint observation_body check (length(btrim(body)) between 3 and 600)
);

create index observation_child_idx on observation (child_id, date desc);
create index observation_month_idx on observation (center_id, date);

/*
 * کودکان دیگری که در این مشاهده نامشان آمده.
 *
 * جدول جدا، نه آرایه: دوستی دوطرفه است و باید بشود از هر دو سر
 * پرسید. به‌علاوه کلید خارجی یعنی کودکی که از مهد می‌رود، از
 * مشاهدات هم پاک می‌شود.
 */
create table observation_peer (
  observation_id uuid not null references observation(id) on delete cascade,
  child_id uuid not null references child(id) on delete cascade,
  primary key (observation_id, child_id)
);

create index observation_peer_child_idx on observation_peer (child_id);

-- ────────────────────────────────────────────────────────────
-- ۲. گزارش ماهانه
-- ────────────────────────────────────────────────────────────
create type app.monthly_report_status as enum ('draft', 'ready', 'shared');

create table monthly_report (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete cascade,

  /* دوره جلالی، مثل '1404-07'. مرجع تقویم در کل محصول جلالی است. */
  period text not null,
  period_from date not null,
  period_to date not null,

  /*
   * جمع‌بندی مربی، به قلم خودش.
   *
   * این تنها متن تحلیلی گزارش است و یک آدم نوشته‌اش. اپ مصالح را
   * کنار هم می‌گذارد؛ نتیجه‌گیری کار کسی است که کودک را دیده.
   */
  teacher_summary text,
  /* آنچه در جلسه با خانواده قرار شد. پس از جلسه پر می‌شود. */
  meeting_notes text,
  meeting_held_on date,

  status app.monthly_report_status not null default 'draft',
  prepared_by uuid references staff(id) on delete set null,
  prepared_at timestamptz,
  shared_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint monthly_report_unique unique (child_id, period),
  constraint monthly_report_range check (period_to >= period_from),
  /*
   * گزارشی که به خانواده می‌رود باید جمع‌بندی مربی داشته باشد.
   * فهرستی از مشاهدات خام، گزارش نیست.
   */
  constraint monthly_report_shared_needs_summary
    check (status <> 'shared' or length(btrim(coalesce(teacher_summary, ''))) > 0)
);

create index monthly_report_child_idx on monthly_report (child_id, period desc);

create trigger monthly_report_touch before update on monthly_report
  for each row execute function app.touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- ۳. مصالح گزارش
-- ────────────────────────────────────────────────────────────
/** مشاهدات ماه، به تفکیک عدسی و به ترتیب تاریخ. */
create function app.month_observations(centre uuid, target uuid, from_date date, to_date date)
returns table (
  id uuid,
  date date,
  lens app.observation_lens,
  body text,
  staff_name text,
  peers text[]
)
language sql stable security definer set search_path = public, app as $$
  select o.id, o.date, o.lens, o.body, s.full_name,
         -- فقط نام کوچک. گزارش سارا نباید مشخصات آرتین را ببرد.
         (select array_agg(c.first_name order by c.first_name)
            from observation_peer p join child c on c.id = p.child_id
           where p.observation_id = o.id)
    from observation o
    left join staff s on s.id = o.staff_id
   where o.center_id = centre and o.child_id = target
     and o.date between from_date and to_date
   order by o.lens, o.date
$$;

/**
 * کودکانی که بیشتر با او بوده‌اند.
 *
 * از مشاهده می‌آید، نه از حدس. هم‌کلاس بودن دوستی نیست و شمردن
 * هم‌حضوری، رابطه‌ای می‌سازد که هیچ‌کس ندیده.
 */
create function app.month_peers(centre uuid, target uuid, from_date date, to_date date)
returns table (first_name text, times integer)
language sql stable security definer set search_path = public, app as $$
  select c.first_name, count(*)::integer
    from observation o
    join observation_peer p on p.observation_id = o.id
    join child c on c.id = p.child_id
   where o.center_id = centre and o.child_id = target
     and o.date between from_date and to_date
   group by c.first_name
   order by 2 desc, 1
$$;

/**
 * واقعیت‌های عددی ماه.
 *
 * هیچ‌کدام نمره نیستند و هیچ‌کدام با میانگین مقایسه نمی‌شوند: شمار
 * روزهای حضور یک واقعیت است، «بالاتر از میانگین کلاس» یک قضاوت.
 */
create function app.month_facts(centre uuid, target uuid, from_date date, to_date date)
returns table (
  present_days integer,
  absent_days integer,
  total_minutes integer,
  lunch_all integer,
  lunch_most integer,
  lunch_little integer,
  lunch_none integer,
  nap_days integer,
  mood_good integer,
  mood_normal integer,
  mood_restless integer,
  mood_sad integer,
  photos integer,
  observations integer
)
language sql stable security definer set search_path = public, app as $$
  with lunches as (
    select m.amount
      from meal_log m
      join daily_report r on r.id = m.daily_report_id
     where r.center_id = centre and r.child_id = target
       and r.date between from_date and to_date
       and m.meal_type = 'lunch'
  )
  select
    (select present_days from app.child_attendance_summary(centre, target, from_date, to_date)),
    (select absent_days from app.child_attendance_summary(centre, target, from_date, to_date)),
    (select total_minutes from app.child_attendance_summary(centre, target, from_date, to_date)),
    /* ناهار در جدول جدا ثبت می‌شود (meal_log)، چون کودک بیش از یک
       وعده دارد و گزارش روزانه یک ردیف بیشتر نیست. */
    (select count(*) filter (where m.amount = 'all')::integer from lunches m),
    (select count(*) filter (where m.amount = 'most')::integer from lunches m),
    (select count(*) filter (where m.amount = 'little')::integer from lunches m),
    (select count(*) filter (where m.amount = 'none')::integer from lunches m),
    count(*) filter (where r.nap_start is not null)::integer,
    /* خلق در سه بازه روز شمرده می‌شود، چون تغییرش بین بازه‌ها همان
       چیزی است که خانواده باید ببیند. */
    (count(*) filter (where r.mood_morning = 'good')
     + count(*) filter (where r.mood_noon = 'good')
     + count(*) filter (where r.mood_afternoon = 'good'))::integer,
    (count(*) filter (where r.mood_morning = 'normal')
     + count(*) filter (where r.mood_noon = 'normal')
     + count(*) filter (where r.mood_afternoon = 'normal'))::integer,
    (count(*) filter (where r.mood_morning = 'restless')
     + count(*) filter (where r.mood_noon = 'restless')
     + count(*) filter (where r.mood_afternoon = 'restless'))::integer,
    (count(*) filter (where r.mood_morning = 'sad')
     + count(*) filter (where r.mood_noon = 'sad')
     + count(*) filter (where r.mood_afternoon = 'sad'))::integer,
    (select count(*)::integer from photo_tag pt
       join photo ph on ph.id = pt.photo_id
      where pt.child_id = target and ph.status = 'published'
        and ph.date between from_date and to_date),
    (select count(*)::integer from observation o
      where o.child_id = target and o.date between from_date and to_date)
  from daily_report r
  where r.center_id = centre and r.child_id = target
    and r.date between from_date and to_date
$$;

/**
 * کدام عدسی‌ها امسال خالی مانده‌اند.
 *
 * تمام نکته «چیزی از قلم نیفتد» همین است: جلسه‌ای که در آن مربی
 * هیچ مشاهده‌ای از ارتباط اجتماعی ندارد، جلسه ناقصی است — و باید
 * *پیش* از جلسه معلوم شود، نه وسطش.
 */
create function app.month_gaps(centre uuid, target uuid, from_date date, to_date date)
returns table (lens app.observation_lens, seen integer)
language sql stable security definer set search_path = public, app as $$
  select l.lens, coalesce(count(o.id), 0)::integer
    from (select unnest(enum_range(null::app.observation_lens)) as lens) l
    left join observation o
      on o.lens = l.lens and o.child_id = target
     and o.center_id = centre and o.date between from_date and to_date
   group by l.lens
   order by 2, 1
$$;

-- ────────────────────────────────────────────────────────────
-- ۴. دسترسی
-- ────────────────────────────────────────────────────────────
alter table observation enable row level security;
alter table observation_peer enable row level security;
alter table monthly_report enable row level security;

/*
 * مشاهده را مربی و مدیر می‌بینند. خانواده مشاهده خام را نمی‌بیند —
 * آنچه به خانواده می‌رسد گزارش ماهانه‌ای است که مربی جمع‌بندی‌اش کرده
 * و به اشتراک گذاشته.
 */
create policy observation_staff on observation
  for all using (center_id = app.current_center_id() and app.can_see_child(child_id) and app.can_write())
  with check (center_id = app.current_center_id() and app.can_see_child(child_id) and app.can_write());

create policy observation_peer_staff on observation_peer
  for all using (
    exists (select 1 from observation o where o.id = observation_id and app.can_see_child(o.child_id))
    and app.can_write()
  )
  with check (
    exists (select 1 from observation o where o.id = observation_id and app.can_see_child(o.child_id))
    and app.can_write()
  );

create policy monthly_report_staff on monthly_report
  for all using (center_id = app.current_center_id() and app.can_see_child(child_id) and app.can_write())
  with check (center_id = app.current_center_id() and app.can_see_child(child_id) and app.can_write());

/* خانواده فقط گزارشِ به‌اشتراک‌گذاشته‌شده کودک خودش را می‌بیند. */
create policy monthly_report_family on monthly_report
  for select using (
    center_id = app.current_center_id()
    and shared_at is not null
    and child_id in (select app.current_child_ids())
  );
