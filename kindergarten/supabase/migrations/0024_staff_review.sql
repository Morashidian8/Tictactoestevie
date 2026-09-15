-- ============================================================
-- کارنامه مربی در کارتابل مدیر
--
-- مدیر حق دارد بداند هر مربی چه وضعی دارد. خط قرمزهای بند ۱۰ درباره
-- کودک است، نه پرسنل، و ارزیابی کارکنان کار عادی هر مدیری است.
--
-- ولی *چطور* ساختنش، خودش یک تصمیم ایمنی است:
--
-- ── قاعده یک: هیچ عدد مرکبی ساخته نمی‌شود ─────────────────────
--
-- «نمره ۷۸ از ۱۰۰» یک عدد است که هیچ‌کس نمی‌داند از کجا آمده، و اولین
-- کاری که می‌کند این است که مربی‌ها را با هم مقایسه می‌کند. مدیر
-- واقعیت را می‌بیند و قضاوت را خودش می‌نویسد؛ اپ قضاوت نمی‌کند.
--
-- ── قاعده دو: رویداد هرگز معیار منفی نیست ────────────────────
--
-- این مهم‌ترین جمله کل این مهاجرت است.
--
-- اگر مربی بداند «حادثه کمتر یعنی نمره بهتر»، زمین‌خوردن را ننوشته
-- می‌گذارد. آن‌وقت اپ عددی نشان می‌دهد که بهتر شده و مهدی که در آن
-- بچه‌ها بیشتر آسیب می‌بینند. شمار رویداد اینجا هست، چون مدیر باید
-- بداند، ولی صریحاً به‌عنوان «فعالیت» برچسب می‌خورد نه «خطا» — و در
-- هیچ جمعی وارد نمی‌شود.
--
-- ── آنچه عمداً ساخته نشد ─────────────────────────────────────
--
-- حضور و غیاب خودِ مربی. اپ ورود و خروج کودک را ثبت می‌کند، نه
-- پرسنل را. اگر مدیر بخواهد وقت‌شناسی را بسنجد، این داده وجود ندارد
-- و ساختن عددی از روی داده‌ای که نیست، بدترین کار ممکن است.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. کارنامه واقعیت
-- ────────────────────────────────────────────────────────────
/*
 * هر ستون یک چیزِ قابل اثبات است که در پایگاه داده رد دارد. هیچ‌کدام
 * وزن ندارند و با هم جمع نمی‌شوند.
 */
create function app.staff_activity(
  centre uuid,
  target uuid,
  from_date date,
  to_date date
)
returns table (
  days_active integer,
  check_ins integer,
  check_outs integer,
  reports_written integer,
  reports_sent integer,
  medications_received integer,
  -- فعالیت، نه خطا. توضیحش در سرِ همین فایل است.
  incidents_logged integer,
  pickup_codes_used integer
)
language sql stable security definer set search_path = public, app as $$
  with mine as (
    select a.date, a.checked_in_by_staff_id as in_by, a.checked_out_by_staff_id as out_by
      from attendance a
     where a.center_id = centre and a.date between from_date and to_date
  ),
  acct as (
    select id from user_account where staff_id = target and center_id = centre
  )
  select
    /*
     * «روز فعال» یعنی روزی که این مربی دست‌کم یک ثبت کرده. جایگزین
     * حضور و غیاب پرسنل نیست و نباید باشد: مربی‌ای که تمام روز بوده و
     * چیزی ثبت نکرده، اینجا صفر می‌خورد.
     */
    (select count(distinct date)::integer from mine
      where in_by = target or out_by = target),
    (select count(*)::integer from mine where in_by = target),
    (select count(*)::integer from mine where out_by = target),
    (select count(*)::integer from daily_report r
      where r.center_id = centre and r.date between from_date and to_date
        and r.created_by in (select id from acct)),
    (select count(*)::integer from daily_report r
      where r.center_id = centre and r.date between from_date and to_date
        and r.created_by in (select id from acct) and r.sent_at is not null),
    (select count(*)::integer from medication_request m
      where m.center_id = centre and m.received_by = target
        and m.received_at::date between from_date and to_date),
    (select count(*)::integer from incident i
      where i.center_id = centre and i.staff_id = target
        and i.occurred_at::date between from_date and to_date),
    (select count(*)::integer from pickup_code p
      where p.center_id = centre and p.used_by_staff_id = target
        and p.date between from_date and to_date)
$$;

-- ────────────────────────────────────────────────────────────
-- ۲. یادداشت ارزیابی مدیر
-- ────────────────────────────────────────────────────────────
create type app.staff_note_kind as enum (
  'commendation', -- تقدیر
  'concern',      -- نگرانی
  'review',       -- ارزیابی دوره‌ای
  'training'      -- دوره یا آموزش لازم
);

create table staff_note (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  staff_id uuid not null references staff(id) on delete cascade,

  kind app.staff_note_kind not null,
  body text not null,
  /* بازه‌ای که این ارزیابی به آن مربوط است. برای تقدیر خالی است. */
  period_from date,
  period_to date,

  written_at timestamptz not null default now(),
  written_by uuid references user_account(id) on delete set null,

  /*
   * آیا با خودِ مربی در میان گذاشته شده.
   *
   * ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛ پرونده‌سازی است.
   * این ستون مدیر را وادار نمی‌کند، ولی سکوت را هم ثبت می‌کند.
   */
  shared_at timestamptz,

  constraint staff_note_body check (length(btrim(body)) between 1 and 2000),
  constraint staff_note_period check (period_to is null or period_from is null or period_to >= period_from)
);

create index staff_note_staff_idx on staff_note (staff_id, written_at desc);

/** خلاصه یادداشت‌ها برای کارتابل. */
create function app.staff_note_summary(centre uuid, target uuid)
returns table (
  commendations integer,
  concerns integer,
  reviews integer,
  last_review date,
  unshared integer
)
language sql stable security definer set search_path = public, app as $$
  select
    count(*) filter (where kind = 'commendation')::integer,
    count(*) filter (where kind = 'concern')::integer,
    count(*) filter (where kind = 'review')::integer,
    max(written_at::date) filter (where kind = 'review'),
    -- یادداشتی که با مربی در میان گذاشته نشده، خودش یک هشدار است.
    count(*) filter (where shared_at is null and kind in ('concern', 'review'))::integer
  from staff_note
  where center_id = centre and staff_id = target
$$;

-- ────────────────────────────────────────────────────────────
-- ۳. کارتابل: فهرست مربیان، با آنچه واقعاً می‌دانیم
-- ────────────────────────────────────────────────────────────
/*
 * عمداً عددِ «عملکرد» ندارد. آنچه دارد سه چیز است که مدیر باید بداند:
 * چقدر فعال بوده، مدارکش چه وضعی دارد، و آخرین بار کِی ارزیابی شده.
 *
 * مرتب‌سازی بر اساس نام است، نه هیچ معیاری: فهرستی که مرتب‌شده باشد،
 * خودش یک رتبه‌بندی است حتی اگر ستون نمره نداشته باشد.
 */
create function app.staff_cartable(centre uuid, from_date date, to_date date)
returns table (
  staff_id uuid,
  full_name text,
  role app.staff_role,
  photo_url text,
  days_active integer,
  check_ins integer,
  documents_expired integer,
  documents_expiring integer,
  last_review date,
  open_concerns integer
)
language sql stable security definer set search_path = public, app as $$
  select
    s.id, s.full_name, s.role, s.photo_url,
    act.days_active, act.check_ins,
    gaps.expired, gaps.expiring,
    notes.last_review, notes.concerns
  from staff s
  cross join lateral app.staff_activity(centre, s.id, from_date, to_date) act
  left join lateral (
    select g.expired, g.expiring from app.staff_document_gaps(centre) g
     where g.staff_id = s.id
  ) gaps on true
  cross join lateral app.staff_note_summary(centre, s.id) notes
  where s.center_id = centre and s.active
  order by s.full_name
$$;

-- ────────────────────────────────────────────────────────────
-- ۴. دسترسی
-- ────────────────────────────────────────────────────────────
alter table staff_note enable row level security;

/*
 * مدیر می‌نویسد و می‌خواند. مربی فقط یادداشت‌هایی را می‌بیند که با او
 * در میان گذاشته شده — و همین است که ارزیابی را از پرونده‌سازی جدا
 * می‌کند.
 */
create policy staff_note_manager on staff_note
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy staff_note_own_shared on staff_note
  for select using (
    center_id = app.current_center_id()
    and shared_at is not null
    and staff_id = (select staff_id from user_account where id = app.current_account_id())
  );
