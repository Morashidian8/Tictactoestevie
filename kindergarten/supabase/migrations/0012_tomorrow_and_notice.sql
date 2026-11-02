-- ============================================================
-- برنامه فردا، و اطلاع‌رسانی مهد — بخش ۵.۸، ۶.۴ و ۱۵.۳ سند
-- ============================================================

-- ── ۱. عکس آورنده کد ───────────────────────────────────────────
--
-- بخش ۵.۸: «سامانه نام و عکس فرد را نشان می‌دهد ← مربی چهره را تطبیق
-- می‌دهد». ستون نام بود، ستون عکس نبود. شماره هم اضافه می‌شود تا اگر
-- کد کار نکرد مربی راه تماس داشته باشد.
alter table pickup_code add column bearer_photo_url text;
alter table pickup_code add column bearer_phone text;

-- ── ۲. برنامه فردا ─────────────────────────────────────────────
--
-- بخش ۶.۴ «ساخت کد تحویل» را در پنل سرپرست گذاشته و بخش ۵.۸ مسیر
-- تأییدش را. آنچه هیچ‌کدام نگفته‌اند این است: وقتی فردا کسِ دیگری
-- می‌آورد یا می‌برد و آن کس **در فهرست مجاز هست**، کد لازم نیست و یک
-- اعلام کافی است. این جدول همان اعلام است.
--
-- دو جهت دارد چون «چه کسی می‌آورد» و «چه کسی می‌برد» دو تصمیم جدایند و
-- ممکن است در یک روز هر دو فرق کنند.
create type app.plan_direction as enum ('drop_off', 'pickup');

create table pickup_plan (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  date date not null,
  direction app.plan_direction not null,

  -- یکی از این دو پر است: فرد مجاز، یا کدی که برای فرد ناشناس ساخته شده.
  guardian_id uuid references guardian(id) on delete restrict,
  authorized_id uuid references authorized_pickup(id) on delete restrict,
  pickup_code_id uuid references pickup_code(id) on delete cascade,

  note text,
  created_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- یک اعلام برای هر کودک، هر روز، هر جهت. اعلام تازه جای قبلی را
  -- می‌گیرد و تاریخچه لازم نیست؛ رد پا در audit_log می‌ماند.
  constraint pickup_plan_one_per_direction unique (child_id, date, direction),

  constraint pickup_plan_exactly_one_person check (
    (guardian_id is not null)::int
    + (authorized_id is not null)::int
    + (pickup_code_id is not null)::int = 1
  )
);
create index pickup_plan_center_date_idx on pickup_plan (center_id, date);

create trigger pickup_plan_touch before update on pickup_plan
  for each row execute function app.touch_updated_at();

-- ── ۳. اطلاعیه: نوع، پیامک، و گزارش تحویل ──────────────────────
--
-- جدول announcement متن و مخاطب داشت ولی نمی‌گفت آیا پیامک هم رفته.
-- بخش ۱۵.۲: «در شرایط اضطراری پیامک مسیر اصلی است و اپ مسیر پشتیبان».
-- پس فرستادن یا نفرستادن پیامک تصمیم مدیر است و باید ثبت شود.
alter table announcement add column send_sms boolean not null default false;
alter table announcement add column sms_sent_count integer not null default 0;
alter table announcement add column delivered_count integer not null default 0;

-- ── ۴. سیاست سطر-محور برای جدول تازه ───────────────────────────
alter table pickup_plan enable row level security;
alter table pickup_plan force row level security;

-- سرپرست فقط برای کودک خودش اعلام می‌کند و فقط اعلام خودش را می‌بیند.
-- مربی اعلام کودکان کلاس‌های خودش را می‌بیند ولی نمی‌سازد: تصمیم فردا
-- تصمیم خانواده است.
-- can_see_child خودش نقش را تفکیک می‌کند: مدیر کل مرکز، مربی کلاس
-- خودش، سرپرست کودک خودش.
create policy pickup_plan_visible on pickup_plan
  for select using (
    center_id = app.current_center_id() and app.can_see_child(child_id)
  );

create policy pickup_plan_guardian_write on pickup_plan
  for all using (
    center_id = app.current_center_id()
    and app.current_role() = 'guardian'
    and app.can_see_child(child_id)
  )
  with check (
    center_id = app.current_center_id()
    and app.current_role() = 'guardian'
    and app.can_see_child(child_id)
  );

create policy pickup_plan_manager_write on pickup_plan
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

-- ── ۵. رد پا ───────────────────────────────────────────────────
-- برنامه فردا تصمیم درباره کودک است، پس مثل بقیه رد پا می‌گذارد.
create trigger audit_pickup_plan
  after insert or update or delete on pickup_plan
  for each row execute function app.write_audit();
