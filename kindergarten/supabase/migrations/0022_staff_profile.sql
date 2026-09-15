-- ============================================================
-- پروفایل مربی و مدارکش
--
-- تا اینجا جدول staff فقط نام و نقش و شماره داشت، به‌علاوه سه ستون
-- کارت بهداشت که ارتقای ۲ برای بازرسی افزود. سه مسئله باز مانده بود:
--
--   ۱. مربی جایی نداشت که مشخصات خودش را ببیند یا اصلاح کند.
--   ۲. مدارک (کارت بهداشت، مدرک تحصیلی، گواهی دوره) روی کاغذ در
--      کشوی مدیر بود. روز بازرسی یعنی گشتن در کشو.
--   ۳. پرونده بازرسی فقط شماره کارت بهداشت را داشت، نه خودِ تصویرش.
--
-- قاعده‌ای که این مهاجرت بر آن سوار است: **مدرک تاریخ انقضا دارد.**
-- کارت بهداشتِ منقضی از نبودنش بدتر است، چون مهد فکر می‌کند دارد.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. مشخصات مربی
-- ────────────────────────────────────────────────────────────
alter table staff add column photo_url text;
alter table staff add column national_id text;
alter table staff add column birth_date date;
alter table staff add column education text;
-- شماره تماس اضطراری، جدا از شماره خودش: اگر مربی وسط شیفت حالش بد
-- شود، مهد باید بداند به چه کسی زنگ بزند.
alter table staff add column emergency_name text;
alter table staff add column emergency_phone text;

comment on column staff.national_id is
  'برای پرونده بازرسی. مثل کد ملی کودک، داده حساس است و فقط مدیر می‌بیند.';

-- ────────────────────────────────────────────────────────────
-- ۲. مدارک
-- ────────────────────────────────────────────────────────────
create type app.staff_document_kind as enum (
  'health_card',      -- کارت بهداشت
  'degree',           -- مدرک تحصیلی
  'training',         -- گواهی دوره آموزشی
  'national_id',      -- کارت ملی
  'criminal_record',  -- گواهی عدم سوءپیشینه
  'contract',         -- قرارداد
  'other'
);

create table staff_document (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  staff_id uuid not null references staff(id) on delete cascade,

  kind app.staff_document_kind not null,
  title text not null,
  file_url text not null,

  issued_at date,
  /*
   * تاریخ انقضا. برای مدرک تحصیلی خالی است و برای کارت بهداشت نه.
   * کل ارزش این جدول در همین ستون است: مدرکی که تاریخ انقضا دارد و
   * کسی نگاهش نمی‌کند، روز بازرسی تبدیل به تخلف می‌شود.
   */
  expires_at date,

  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references user_account(id) on delete set null,

  constraint staff_document_dates check (expires_at is null or issued_at is null or expires_at >= issued_at),
  constraint staff_document_title check (length(btrim(title)) between 1 and 120)
);

create index staff_document_staff_idx on staff_document (staff_id, kind);
create index staff_document_expiry_idx on staff_document (center_id, expires_at)
  where expires_at is not null;

comment on table staff_document is
  'مدارک مربی. تصویر در استوریج می‌ماند و اینجا فقط نشانی و تاریخ‌هاست.';

-- ────────────────────────────────────────────────────────────
-- ۳. وضعیت مدرک، یک جا حساب می‌شود
-- ────────────────────────────────────────────────────────────
/*
 * همان سه حالتی که ارتقای ۲ برای کارت بهداشت تعریف کرد، حالا برای هر
 * مدرکی. یک جا تعریف می‌شود تا رابط و پرونده بازرسی یک جواب بدهند.
 */
create function app.document_state(expires date, at date default current_date)
returns text
language sql immutable as $$
  select case
    when expires is null then 'no_expiry'
    when expires < at then 'expired'
    when expires < at + 30 then 'expiring'
    else 'valid'
  end
$$;

/** مدارک یک مربی، با وضعیت هرکدام. */
create function app.staff_documents(centre uuid, target uuid)
returns table (
  id uuid,
  kind app.staff_document_kind,
  title text,
  file_url text,
  issued_at date,
  expires_at date,
  state text,
  uploaded_at timestamptz
)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.kind, d.title, d.file_url, d.issued_at, d.expires_at,
         app.document_state(d.expires_at), d.uploaded_at
    from staff_document d
   where d.staff_id = target
     and d.center_id = centre
   order by d.kind, d.expires_at nulls last
$$;

-- ────────────────────────────────────────────────────────────
-- ۴. پرونده بازرسی: مدارک هم شمرده می‌شوند
-- ────────────────────────────────────────────────────────────
/*
 * app.audit_staff از ارتقای ۲ فقط کارت بهداشت را می‌دید. حالا شمار
 * مدارک منقضی و نزدیک‌انقضا هم می‌آید، چون بازرس همه‌شان را می‌خواهد
 * نه فقط یکی.
 */
create function app.staff_document_gaps(centre uuid, at date default current_date)
returns table (staff_id uuid, full_name text, expired integer, expiring integer, total integer)
language sql stable security definer set search_path = public, app as $$
  select s.id, s.full_name,
         count(*) filter (where app.document_state(d.expires_at, at) = 'expired')::integer,
         count(*) filter (where app.document_state(d.expires_at, at) = 'expiring')::integer,
         count(d.id)::integer
    from staff s
    left join staff_document d on d.staff_id = s.id
   where s.center_id = centre and s.active
   group by s.id, s.full_name
   order by 3 desc, 4 desc, s.full_name
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. دسترسی
-- ────────────────────────────────────────────────────────────
alter table staff_document enable row level security;

/*
 * مربی مدارک خودش را می‌بیند و می‌تواند اضافه کند — مدرکی که فقط مدیر
 * بتواند بارگذاری کند، هرگز بارگذاری نمی‌شود.
 *
 * حذف کردن نه: مدرک منقضی سابقه است و پاک کردنش یعنی مهد نمی‌تواند
 * ثابت کند که آن تاریخ معتبر بوده.
 */
create policy staff_document_own on staff_document
  for select using (
    center_id = app.current_center_id()
    and (app.is_manager() or staff_id = (select staff_id from user_account where id = app.current_account_id()))
  );

create policy staff_document_insert on staff_document
  for insert with check (
    center_id = app.current_center_id()
    and (app.is_manager() or staff_id = (select staff_id from user_account where id = app.current_account_id()))
  );

-- ============================================================
-- بایگانی حضور کودک، ماه به ماه
--
-- داده‌اش از اول بود: جدول attendance هر روز ساعت ورود و خروج هر کودک
-- را ثبت می‌کند و هیچ‌وقت پاک نمی‌شود. آنچه نبود، راهی برای خواندنش
-- بود — پروفایل کودک فقط «امروز» را نشان می‌داد.
--
-- خروجی یک ردیف برای هر روزِ ثبت‌شده است، نه برای هر روزِ تقویم:
-- روزی که کودک اصلاً برنامه‌اش نبوده، غیبت نیست و نباید در فهرست
-- بیاید. تفاوت «نیامد» و «امروز روزش نبود» تمام نکته این نماست.
-- ============================================================
create function app.child_attendance_month(centre uuid, target uuid, from_date date, to_date date)
returns table (
  date date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  minutes integer,
  late_minutes integer,
  absent boolean,
  absence_reason text,
  dropped_by text,
  picked_up_by text
)
language sql stable security definer set search_path = public, app as $$
  select
    d.date,
    a.check_in_at,
    a.check_out_at,
    -- مدت حضور، فقط وقتی هر دو سر ثبت شده‌اند. روزی که خروجش ثبت نشده
    -- مدت ندارد؛ صفر گذاشتن یعنی دروغ گفتن درباره ساعتی که کودک آنجا بود.
    case
      when a.check_in_at is not null and a.check_out_at is not null
      then (extract(epoch from (a.check_out_at - a.check_in_at)) / 60)::integer
    end,
    coalesce(a.late_minutes, 0),
    n.child_id is not null,
    n.reason,
    g.full_name,
    -- تحویل‌گیرنده یا سرپرست است یا فرد مجاز. روش code نام را در خودِ
    -- کد ثبت می‌کند و اینجا خالی می‌ماند.
    coalesce(p.full_name, z.full_name)
  from (
    select distinct coalesce(at.date, an.date) as date
      from (select date, child_id from attendance where child_id = target) at
      full join (select date, child_id from absence_notice where child_id = target) an
        on at.date = an.date
     where coalesce(at.date, an.date) between from_date and to_date
  ) d
  left join attendance a on a.child_id = target and a.date = d.date
  left join absence_notice n on n.child_id = target and n.date = d.date
  left join guardian g on g.id = a.dropped_by_guardian_id
  left join guardian p on p.id = a.picked_up_by_guardian_id
  left join authorized_pickup z on z.id = a.picked_up_by_authorized_id
  -- دامنه مرکز پارامتر است، نه فرض: لایه دسترسی به داده آن را از
  -- scope می‌بندد و هیچ فراخوانی‌ای نمی‌تواند از مرزش رد شود (بند ۱۱.۱۰).
  where exists (
    select 1 from child c where c.id = target and c.center_id = centre
  )
  order by d.date
$$;

/** خلاصه ماه: چند روز حاضر، چند روز غایب، مجموع ساعت. */
create function app.child_attendance_summary(centre uuid, target uuid, from_date date, to_date date)
returns table (present_days integer, absent_days integer, total_minutes integer, late_days integer)
language sql stable security definer set search_path = public, app as $$
  select
    count(*) filter (where not absent and check_in_at is not null)::integer,
    count(*) filter (where absent)::integer,
    coalesce(sum(minutes), 0)::integer,
    count(*) filter (where late_minutes > 0)::integer
  from app.child_attendance_month(centre, target, from_date, to_date)
$$;
