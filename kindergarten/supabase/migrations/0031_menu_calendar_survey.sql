-- ============================================================
-- منوی غذایی، تقویم و نظرسنجی — ماژول M14
-- ============================================================
--
-- ── چهار تصمیمی که این مهاجرت می‌گیرد و باید صریح بماند ────────
--
-- الف) **منو به روز بسته می‌شود، نه به هفته.** مهد ایرانی تعطیلی
--      بی‌برنامه دارد (آلودگی هوا، برف) و منوی هفتگی که یک روزش
--      تعطیل شود، باید کل هفته را جابه‌جا کند. روزْ ردیف خودش است.
--
-- ب) **منو با آلرژی تقاطع می‌خورد.** این تنها دلیلِ واقعیِ بودنِ این
--      ماژول است: خانواده‌ای که کودکش به تخم‌مرغ حساس است باید پیش از
--      روزِ املت بداند. بی این تقاطع، منو یک تابلوی تزئینی است.
--
-- ج) **نظرسنجی نتیجه را به خانواده نشان نمی‌دهد مگر مدیر بخواهد.**
--      «۸۰٪ مخالف اردو» یعنی ۲۰٪ موافق، و آن ۲۰٪ خودشان را در
--      اقلیت می‌بینند. انتشار نتیجه یک تصمیم است، نه پیش‌فرض.
--
-- د) **رویداد تقویم، اطلاعیه نیست.** اطلاعیه خوانده می‌شود و می‌رود؛
--      رویداد تاریخ دارد و باید در «فردا» و «این هفته» بیاید.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. منوی غذایی
-- ────────────────────────────────────────────────────────────
create type app.meal_slot as enum ('snack_morning', 'lunch', 'snack_afternoon');

create table menu_day (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  date date not null,
  slot app.meal_slot not null,
  title text not null,
  /*
   * مواد اولیه، برای تقاطع با آلرژی.
   *
   * متن آزاد و نه فهرست بسته: آشپز مهد «خورش قیمه» می‌نویسد و باید
   * بتواند «گوشت، لپه، گوجه» را هم بنویسد. فهرست بسته یعنی موادی که
   * در آن نیست، اصلاً نوشته نمی‌شود.
   */
  ingredients text[] not null default '{}',
  note text,

  created_at timestamptz not null default now(),
  created_by uuid references user_account(id) on delete set null,

  constraint menu_day_title check (length(btrim(title)) between 1 and 120),
  constraint menu_day_once unique (center_id, date, slot)
);

create index menu_day_center_idx on menu_day (center_id, date);

/**
 * منوی یک بازه، با هشدار آلرژی برای یک کودک.
 *
 * تقاطع اینجاست نه در کلاینت: خانواده‌ای که فهرست آلرژی کودکش را دارد
 * و منو را هم می‌بیند، نباید خودش تطبیق بدهد. همان کاری که اپ برای آن
 * ساخته شده.
 */
create or replace function app.menu_for_child(
  centre uuid,
  target uuid,
  from_date date,
  to_date date
)
returns table (
  date date,
  slot app.meal_slot,
  title text,
  ingredients text[],
  note text,
  /* موادی که با آلرژی این کودک می‌خوانند. خالی یعنی مشکلی نیست. */
  allergy_hits text[]
)
language sql
stable
security definer
set search_path = public, app
as $$
  with mine as (
    select coalesce(
      (select array_agg(lower(btrim(value #>> '{}')))
         from medical_profile m, jsonb_array_elements(m.allergies_json) value
        where m.child_id = target), '{}'::text[]) as allergies
  )
  select m.date, m.slot, m.title, m.ingredients, m.note,
         coalesce((
           select array_agg(distinct i)
             from unnest(m.ingredients) i, mine
            where exists (
              select 1 from unnest(mine.allergies) a
               /*
                * تطبیق دوطرفه: «تخم‌مرغ» در «تخم‌مرغ آب‌پز» پیدا شود،
                * و «شیر» در آلرژیِ «شیر گاو» هم. یک‌طرفه بودنش یعنی
                * نصف هشدارها نمی‌آیند.
                */
               where lower(i) like '%' || a || '%' or a like '%' || lower(i) || '%'
            )
         ), '{}'::text[])
    from menu_day m
   where m.center_id = centre and m.date between from_date and to_date
   order by m.date, m.slot
$$;

-- ────────────────────────────────────────────────────────────
-- ۲. تقویم
-- ────────────────────────────────────────────────────────────
create type app.calendar_kind as enum (
  'holiday',    -- تعطیلی
  'trip',       -- اردو
  'ceremony',   -- جشن
  'meeting',    -- جلسه با خانواده
  'photo_day',  -- روز عکاسی
  'other'
);

create table calendar_event (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  class_id uuid references class(id) on delete cascade,

  date date not null,
  end_date date,
  kind app.calendar_kind not null default 'other',
  title text not null,
  note text,

  /*
   * آیا خانواده‌ها می‌بینند.
   *
   * مدیر جلسه داخلی هم در تقویم می‌گذارد و آن یکی به خانواده مربوط
   * نیست. پیش‌فرض دیده‌شدن است، چون تقویمِ نامرئی هیچ فایده‌ای ندارد.
   */
  visible_to_family boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid references user_account(id) on delete set null,

  constraint calendar_event_title check (length(btrim(title)) between 1 and 120),
  constraint calendar_event_dates check (end_date is null or end_date >= date)
);

create index calendar_event_center_idx on calendar_event (center_id, date);

-- ────────────────────────────────────────────────────────────
-- ۳. نظرسنجی
-- ────────────────────────────────────────────────────────────
create table survey (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  class_id uuid references class(id) on delete cascade,

  question text not null,
  /* گزینه‌ها به ترتیب. تک‌انتخابی؛ چندانتخابی فاز بعد است. */
  options text[] not null,

  opens_at timestamptz not null default now(),
  closes_at timestamptz,

  /*
   * آیا نتیجه به خانواده نشان داده شود.
   *
   * پیش‌فرض **نه**، و عمدی: «۸۰٪ مخالف اردو» یعنی ۲۰٪ موافق، و آن
   * ۲۰٪ خودشان را در اقلیت می‌بینند. انتشار نتیجه یک تصمیم است.
   */
  show_results boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references user_account(id) on delete set null,

  constraint survey_question check (length(btrim(question)) between 1 and 300),
  constraint survey_options check (array_length(options, 1) between 2 and 8),
  constraint survey_window check (closes_at is null or closes_at > opens_at)
);

create index survey_center_idx on survey (center_id, opens_at desc);

create table survey_response (
  survey_id uuid not null references survey(id) on delete cascade,
  user_account_id uuid not null references user_account(id) on delete cascade,
  center_id uuid not null references center(id) on delete restrict,
  /* اندیس گزینه، از صفر. */
  choice integer not null,
  answered_at timestamptz not null default now(),

  /* یک رأی برای هر حساب. نظر عوض کردن، رأی دوم نمی‌سازد. */
  primary key (survey_id, user_account_id),
  constraint survey_response_choice check (choice >= 0)
);

/**
 * نتیجه نظرسنجی.
 *
 * فقط شمار، هرگز نام. خانواده‌ای که بداند رأیش دیده می‌شود، رأی واقعی
 * نمی‌دهد — و نظرسنجی‌ای که رأی واقعی نگیرد، بدتر از نبودنش است.
 */
create or replace function app.survey_tally(centre uuid, target uuid)
returns table (choice integer, label text, votes integer)
language sql
stable
security definer
set search_path = public, app
as $$
  select g.i, s.options[g.i + 1],
         (select count(*)::integer from survey_response r
           where r.survey_id = target and r.choice = g.i)
    from survey s
   cross join lateral generate_series(0, array_length(s.options, 1) - 1) as g(i)
   where s.id = target and s.center_id = centre
   order by g.i
$$;

-- ────────────────────────────────────────────────────────────
-- ۴. هزینه‌ها — ماژول M16، بخش ۸.۳
-- ────────────────────────────────────────────────────────────
/*
 * «ساده‌ترین حالت ممکن: تاریخ، مبلغ، دسته، توضیح، عکس فاکتور.»
 *
 * و بخش ۸.۴ می‌گوید چه چیزی ساخته نمی‌شود: انبارداری، سفارش خرید،
 * تأمین‌کننده، حسابداری، قرارداد پیمانکار. این جدول عمداً همان پنج
 * ستون است و نه بیشتر.
 */
create type app.expense_category as enum (
  'repair',     -- تعمیرات
  'equipment',  -- تجهیزات
  'food',       -- مواد غذایی
  'utilities',  -- شارژ و قبوض
  'supplies',   -- ملزومات
  'other'
);

create table expense (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,

  date date not null,
  amount bigint not null,
  category app.expense_category not null,
  note text,
  /* عکس فاکتور. تا وصل شدن استوریج، نشانی محلی مرورگر است. */
  receipt_url text,

  created_at timestamptz not null default now(),
  created_by uuid references user_account(id) on delete set null,

  constraint expense_amount_positive check (amount > 0)
);

create index expense_center_idx on expense (center_id, date desc);

/**
 * درآمد در برابر هزینه، برای یک دوره.
 *
 * «درآمد» یعنی پولی که **واقعاً وصول شده**، نه مبلغ صادرشده. صورتحسابِ
 * صادرشده هنوز پول نیست، و مهدی که آن را درآمد بخواند، ماه بعد حقوق
 * پرداخت نمی‌کند.
 */
create or replace function app.income_vs_expense(centre uuid, span text)
returns table (
  collected bigint,
  spent bigint,
  by_category jsonb
)
language sql
stable
security definer
set search_path = public, app
as $$
  with bounds as (
    select min(i.due_date) as from_date, max(i.due_date) as to_date
      from invoice i where i.center_id = centre and i.period = span
  ),
  money_in as (
    select coalesce(sum(p.amount), 0)::bigint as total
      from payment p
      join invoice i on i.id = p.invoice_id
     where i.center_id = centre and i.period = span
       and (p.payment_method <> 'online' or p.verified_at is not null)
  ),
  money_out as (
    select coalesce(sum(e.amount), 0)::bigint as total
      from expense e, bounds b
     where e.center_id = centre
       and b.from_date is not null
       and e.date between (b.from_date - interval '1 month')::date and b.to_date
  )
  select
    (select total from money_in),
    (select total from money_out),
    coalesce((
      select jsonb_object_agg(c.category, c.total)
        from (
          select e.category::text as category, sum(e.amount)::bigint as total
            from expense e, bounds b
           where e.center_id = centre
             and b.from_date is not null
             and e.date between (b.from_date - interval '1 month')::date and b.to_date
           group by e.category
        ) c
    ), '{}'::jsonb)
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. دسترسی
-- ────────────────────────────────────────────────────────────
alter table menu_day enable row level security;
alter table menu_day force row level security;
alter table calendar_event enable row level security;
alter table calendar_event force row level security;
alter table survey enable row level security;
alter table survey force row level security;
alter table survey_response enable row level security;
alter table survey_response force row level security;
alter table expense enable row level security;
alter table expense force row level security;

-- منو را همه می‌بینند؛ نوشتنش کار مدیر است.
create policy menu_day_visible on menu_day
  for select using (center_id = app.current_center_id());
create policy menu_day_manager on menu_day
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

/*
 * رویداد نامرئی، فقط برای کارکنان.
 *
 * مدیر جلسه داخلی هم در تقویم می‌گذارد و آن یکی به خانواده مربوط نیست.
 */
create policy calendar_event_visible on calendar_event
  for select using (
    center_id = app.current_center_id()
    and (visible_to_family or app.current_role() in ('manager', 'teacher', 'assistant'))
  );
create policy calendar_event_manager on calendar_event
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy survey_visible on survey
  for select using (center_id = app.current_center_id());
create policy survey_manager on survey
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

/*
 * رأی خودش را می‌بیند و می‌نویسد. رأی دیگران را هیچ‌کس نمی‌بیند —
 * مدیر هم نه.
 *
 * شمارش از app.survey_tally می‌آید که security definer است و فقط عدد
 * برمی‌گرداند. اگر مدیر بتواند سطرها را بخواند، «چه کسی چه رأی داد»
 * قابل ساختن است و خانواده دیگر رأی واقعی نمی‌دهد.
 */
create policy survey_response_own on survey_response
  for all using (
    center_id = app.current_center_id()
    and user_account_id = app.current_account_id()
  )
  with check (
    center_id = app.current_center_id()
    and user_account_id = app.current_account_id()
  );

-- هزینه فقط مدیر — بخش ۳: مربی هیچ‌گاه به داده مالی دسترسی ندارد.
create policy expense_manager on expense
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());
