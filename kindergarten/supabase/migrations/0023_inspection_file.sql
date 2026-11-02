-- ============================================================
-- پرونده بازرسی کامل — «روز بازرسی فقط خروجی بگیر»
--
-- ارتقای ۲ سه جدول ساخت: آمار کودکان، سلامت، کارت بهداشت پرسنل.
-- مهاجرت ۰۰۲۲ مدارک پرسنل و بایگانی حضور را افزود. آنچه هنوز نبود:
--
--   ۱. مدارک خودِ مهد — مجوز فعالیت، بیمه مسئولیت، تأییدیه ایمنی.
--      این‌ها هم تاریخ انقضا دارند و منقضی‌شان مهد را تعطیل می‌کند.
--   ۲. دفتر بازدید — بازرس قبلی چه گفت و آیا رفع شد.
--   ۳. یک فهرست «چه چیزهایی لازم است» که بتوان به آن اضافه کرد.
--
-- ── قاعده مرکزی این مهاجرت ───────────────────────────────────
--
-- چک‌لیست الزامات **داده است، نه کد**.
--
-- مقررات بهزیستی و شبکه بهداشت عوض می‌شود، از استانی به استان دیگر
-- فرق دارد، و بازرسِ امسال چیزی می‌خواهد که پارسال نمی‌خواست. اگر
-- فهرست را در کد بنویسیم، هر تغییر یک نسخه تازه از اپ می‌خواهد و مهدی
-- که چیزی کم دارد، نمی‌تواند اضافه‌اش کند.
--
-- پس مهد فهرست خودش را دارد و ردیف اضافه می‌کند. آنچه اپ می‌دهد
-- سازوکار است: هر قلم تاریخ انقضا دارد، وضعیتش یک جا حساب می‌شود، و
-- ناقص‌ها پیش از بازرسی دیده می‌شوند.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. مدارک خودِ مهد
-- ────────────────────────────────────────────────────────────
create type app.center_document_kind as enum (
  'operating_licence',  -- مجوز فعالیت
  'liability_insurance',-- بیمه مسئولیت
  'fire_safety',        -- تأییدیه ایمنی و اطفاء حریق
  'building_safety',    -- تأییدیه ایمنی ساختمان
  'health_permit',      -- تأییدیه بهداشت محیط
  'lease',              -- سند یا اجاره‌نامه
  'other'
);

create table center_document (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,

  kind app.center_document_kind not null,
  title text not null,
  file_url text,
  issuer text,
  reference_no text,

  issued_at date,
  /*
   * تاریخ انقضا. مجوز فعالیتِ منقضی یعنی مهد حق کار ندارد — یعنی
   * مهم‌ترین ستون کل این جدول.
   */
  expires_at date,

  note text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references user_account(id) on delete set null,

  constraint center_document_dates
    check (expires_at is null or issued_at is null or expires_at >= issued_at),
  constraint center_document_title check (length(btrim(title)) between 1 and 160)
);

create index center_document_expiry_idx on center_document (center_id, expires_at)
  where expires_at is not null;

-- ────────────────────────────────────────────────────────────
-- ۲. چک‌لیست الزامات — داده، نه کد
-- ────────────────────────────────────────────────────────────
/*
 * هر ردیف یک چیزی است که بازرس می‌خواهد. مهد می‌تواند اضافه کند،
 * غیرفعال کند، یا متنش را عوض کند.
 *
 * `source` می‌گوید این قلم را از کجا باید ثابت کرد: یک نوع مدرکِ مهد،
 * یک نوع مدرکِ پرسنل، یا داده‌ای که اپ از قبل دارد (مثل دفتر حضور).
 * سومی مهم است: بخشی از چیزی که بازرس می‌خواهد کاغذ نیست، خروجی است.
 */
create type app.requirement_source as enum (
  'center_document',
  'staff_document',
  'app_report',   -- از داده خودِ اپ درمی‌آید، کاغذ ندارد
  'manual'        -- مهد خودش نگه می‌دارد؛ اپ فقط یادآوری می‌کند
);

create table inspection_requirement (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,

  title text not null,
  source app.requirement_source not null,
  /* وقتی source مدرک است، کدام نوع. متن است نه کلید خارجی، چون هر دو
     فهرست نوع را می‌پوشاند و فهرست خودش قابل گسترش است. */
  source_key text,
  note text,

  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint inspection_requirement_title check (length(btrim(title)) between 1 and 160)
);

create index inspection_requirement_center_idx
  on inspection_requirement (center_id, sort_order) where active;

-- ────────────────────────────────────────────────────────────
-- ۳. دفتر بازدید
-- ────────────────────────────────────────────────────────────
/*
 * بازرسِ بعدی اول می‌پرسد بازرسِ قبلی چه گفت. مهدی که جوابش را ندارد،
 * از همان اول عقب است.
 */
create table inspection_visit (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,

  visited_on date not null,
  authority text not null,        -- بهزیستی، شبکه بهداشت، آتش‌نشانی…
  inspector_name text,
  findings text,
  /* آنچه باید رفع شود، و اینکه شد یا نه. */
  action_required text,
  resolved_at date,

  created_at timestamptz not null default now(),
  created_by uuid references user_account(id) on delete set null,

  constraint inspection_visit_authority check (length(btrim(authority)) between 1 and 80)
);

create index inspection_visit_center_idx on inspection_visit (center_id, visited_on desc);
create index inspection_visit_open_idx on inspection_visit (center_id)
  where action_required is not null and resolved_at is null;

-- ────────────────────────────────────────────────────────────
-- ۴. آمادگی: یک نما، همه الزامات
-- ────────────────────────────────────────────────────────────
/*
 * برای هر قلمِ چک‌لیست می‌گوید تأمین شده یا نه، و اگر مدرک است،
 * نزدیک‌ترین تاریخ انقضایش کِی است.
 *
 * `app_report` همیشه تأمین‌شده است: داده‌اش در اپ هست و خروجی‌اش
 * ساختنی. این عمدی است — قلمی که اپ خودش تولیدش می‌کند نباید مدیر را
 * نگران کند.
 */
create function app.inspection_readiness(centre uuid, at date default current_date)
returns table (
  requirement_id uuid,
  title text,
  source app.requirement_source,
  satisfied boolean,
  expires_at date,
  state text,
  note text
)
language sql stable security definer set search_path = public, app as $$
  select
    r.id,
    r.title,
    r.source,
    case r.source
      when 'app_report' then true
      when 'center_document' then exists (
        select 1 from center_document d
         where d.center_id = centre and d.kind::text = r.source_key
           and (d.expires_at is null or d.expires_at >= at)
      )
      when 'staff_document' then not exists (
        -- تأمین‌شده یعنی هیچ مربی فعالی این مدرک را کم نداشته باشد.
        -- یک مربیِ بی‌مدرک، کل قلم را ناقص می‌کند؛ بازرس هم همین‌طور
        -- نگاه می‌کند.
        select 1 from staff s
         where s.center_id = centre and s.active
           and not exists (
             select 1 from staff_document sd
              where sd.staff_id = s.id and sd.kind::text = r.source_key
                and (sd.expires_at is null or sd.expires_at >= at)
           )
      )
      else false
    end,
    case r.source
      when 'center_document' then (
        select min(d.expires_at) from center_document d
         where d.center_id = centre and d.kind::text = r.source_key
           and d.expires_at is not null
      )
      when 'staff_document' then (
        select min(sd.expires_at) from staff_document sd
          join staff s on s.id = sd.staff_id and s.center_id = centre and s.active
         where sd.kind::text = r.source_key and sd.expires_at is not null
      )
    end,
    app.document_state(
      case r.source
        when 'center_document' then (
          select min(d.expires_at) from center_document d
           where d.center_id = centre and d.kind::text = r.source_key
             and d.expires_at is not null
        )
        when 'staff_document' then (
          select min(sd.expires_at) from staff_document sd
            join staff s on s.id = sd.staff_id and s.center_id = centre and s.active
           where sd.kind::text = r.source_key and sd.expires_at is not null
        )
      end, at),
    r.note
  from inspection_requirement r
  where r.center_id = centre and r.active
  order by r.sort_order, r.title
$$;

/** یک عدد برای داشبورد: چند قلم از چند قلم آماده است. */
create function app.inspection_score(centre uuid, at date default current_date)
returns table (ready integer, total integer, expiring integer, open_actions integer)
language sql stable security definer set search_path = public, app as $$
  select
    (select count(*) filter (where satisfied)::integer from app.inspection_readiness(centre, at)),
    (select count(*)::integer from app.inspection_readiness(centre, at)),
    (select count(*) filter (where state in ('expiring', 'expired'))::integer
       from app.inspection_readiness(centre, at)),
    (select count(*)::integer from inspection_visit v
      where v.center_id = centre and v.action_required is not null and v.resolved_at is null)
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. چک‌لیست آغازین
-- ────────────────────────────────────────────────────────────
/*
 * نقطه شروع، نه فهرست قانونی.
 *
 * این سیاهه از اقلامی ساخته شده که مهدها معمولاً نگه می‌دارند و اپ
 * از قبل داده‌شان را دارد. **مرجع قانونی نیست** و باید با الزامات
 * بهزیستی و شبکه بهداشتِ همان استان تطبیق داده شود — به همین دلیل
 * قابل ویرایش و افزودن است.
 */
create function app.seed_inspection_checklist(centre uuid)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  added integer := 0;
begin
  insert into inspection_requirement (center_id, title, source, source_key, sort_order, note)
  select centre, x.title, x.source::app.requirement_source, x.key, x.ord, x.note
    from (values
      ('مجوز فعالیت مهدکودک',        'center_document', 'operating_licence',   10, 'با تاریخ انقضا'),
      ('بیمه مسئولیت مدنی',          'center_document', 'liability_insurance', 20, null),
      ('تأییدیه ایمنی و اطفاء حریق', 'center_document', 'fire_safety',         30, null),
      ('تأییدیه بهداشت محیط',        'center_document', 'health_permit',       40, null),
      ('سند یا اجاره‌نامه محل',       'center_document', 'lease',               50, null),
      ('کارت بهداشت همه مربیان',     'staff_document',  'health_card',         60, 'برای هر مربی فعال'),
      ('گواهی عدم سوءپیشینه',        'staff_document',  'criminal_record',     70, 'برای هر مربی فعال'),
      ('مدرک تحصیلی مربیان',         'staff_document',  'degree',              80, null),
      ('دفتر آمار کودکان',           'app_report',      null,                  90, 'خروجی مستقیم از اپ'),
      ('پرونده سلامت و واکسیناسیون', 'app_report',      null,                 100, 'خروجی مستقیم از اپ'),
      ('دفتر حضور و غیاب',           'app_report',      null,                 110, 'خروجی مستقیم از اپ'),
      ('دفتر حوادث',                 'app_report',      null,                 120, 'خروجی مستقیم از اپ'),
      ('دفتر دارو',                  'app_report',      null,                 130, 'خروجی مستقیم از اپ'),
      ('رضایت‌نامه‌های والدین',       'app_report',      null,                 140, 'خروجی مستقیم از اپ'),
      ('نسبت مربی به کودک',          'app_report',      null,                 150, 'خروجی مستقیم از اپ')
    ) as x(title, source, key, ord, note)
   where not exists (
     select 1 from inspection_requirement r
      where r.center_id = centre and r.title = x.title
   );
  get diagnostics added = row_count;
  return added;
end $$;

-- ────────────────────────────────────────────────────────────
-- ۶. دسترسی — همه‌اش فقط مدیر
-- ────────────────────────────────────────────────────────────
alter table center_document enable row level security;
alter table inspection_requirement enable row level security;
alter table inspection_visit enable row level security;

create policy center_document_manager on center_document
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy inspection_requirement_manager on inspection_requirement
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy inspection_visit_manager on inspection_visit
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());
