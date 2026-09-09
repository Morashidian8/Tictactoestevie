-- ============================================================
-- M1 — پرونده کودک و خانواده. بخش ۱۱.۲ سند
--
-- center_id روی همه این جدول‌ها تکرار شده. سند فقط class_id داشت، ولی
-- بند ۱۱.۱۰ می‌گوید هیچ پرس‌وجویی بدون قید center_id مجاز نیست. رسیدن
-- به مرکز از راه child → class → center یعنی هر سیاست دسترسی سه پیوند
-- می‌خورد، و برای guardian اصلاً مسیر مطمئنی وجود ندارد.
-- ============================================================

create table child (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  -- کودکِ در حال جابه‌جایی بین کلاس‌ها می‌تواند موقتاً کلاس نداشته باشد.
  class_id uuid references class(id) on delete set null,
  first_name text not null,
  last_name text not null,
  birth_date date,
  gender text,
  photo_url text,
  enrolled_at date not null default current_date,
  -- بخش ۱۹.۱: «کودک فعال» یعنی در آن ماه حداقل یک روز حضور داشته.
  -- بدون تاریخ خروج، شمارش ماه‌های گذشته ممکن نیست.
  left_at date,
  status app.child_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- بند ۱۱ سرصفحه: حذف واقعی برای داده کودک ممنوع است، فقط حذف نرم.
  deleted_at timestamptz,

  constraint child_left_has_date check (status <> 'left' or left_at is not null)
);
create index child_center_idx on child (center_id) where deleted_at is null;
create index child_class_idx on child (class_id) where deleted_at is null and status = 'active';

create table guardian (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  full_name text not null,
  -- فقط برای تماس. مرجع احراز هویت user_account.phone است.
  phone text,
  national_id text,
  relation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index guardian_center_idx on guardian (center_id) where deleted_at is null;

alter table user_account
  add constraint user_account_guardian_fk
  foreign key (guardian_id) references guardian(id) on delete restrict;

create table child_guardian (
  child_id uuid not null references child(id) on delete restrict,
  guardian_id uuid not null references guardian(id) on delete restrict,
  center_id uuid not null references center(id) on delete restrict,
  -- بخش ۶.۵: فقط is_payer بخش مالی را می‌بیند و فقط او می‌تواند سرپرست
  -- یا تحویل‌گیرنده جدید اضافه کند.
  is_payer boolean not null default false,
  can_pickup boolean not null default true,
  access_level text not null default 'full',
  -- بخش ۶.۵: حکم منع ملاقات. این پرچم فقط در اختیار مدیر است، نه مربی.
  restricted boolean not null default false,
  restricted_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (child_id, guardian_id),

  -- فرد محدودشده هرگز نباید در فهرست تحویل‌گیرنده قابل انتخاب باشد.
  -- بخش ۶.۵ می‌گوید این یک هشدار قابل رد شدن نیست، پس در دیتابیس بسته شد.
  constraint child_guardian_restricted_cannot_pickup
    check (restricted = false or can_pickup = false)
);
create index child_guardian_by_guardian_idx on child_guardian (guardian_id);
create index child_guardian_center_idx on child_guardian (center_id);

create table authorized_pickup (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  full_name text not null,
  relation text,
  phone text,
  -- بخش ۵.۸: مربی چهره را با عکس تطبیق می‌دهد، پس عکس اختیاری نیست از
  -- نظر عملیاتی، هرچند سامانه اجبارش نمی‌کند.
  photo_url text,
  added_by uuid references user_account(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index authorized_pickup_child_idx on authorized_pickup (child_id) where active;

create table medical_profile (
  child_id uuid primary key references child(id) on delete restrict,
  center_id uuid not null references center(id) on delete restrict,
  blood_type text,
  allergies_json jsonb not null default '[]'::jsonb,
  chronic_conditions text,
  daily_medication text,
  doctor_name text,
  doctor_phone text,
  insurance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table consent (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  type app.consent_type not null,
  granted_by uuid references guardian(id) on delete set null,
  granted_at timestamptz,
  document_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- یک رضایت‌نامه فعال از هر نوع برای هر کودک.
  constraint consent_child_type_unique unique (child_id, type)
);
create index consent_child_idx on consent (child_id);

create trigger child_touch before update on child
  for each row execute function app.touch_updated_at();
create trigger guardian_touch before update on guardian
  for each row execute function app.touch_updated_at();
create trigger child_guardian_touch before update on child_guardian
  for each row execute function app.touch_updated_at();
create trigger authorized_pickup_touch before update on authorized_pickup
  for each row execute function app.touch_updated_at();
create trigger medical_profile_touch before update on medical_profile
  for each row execute function app.touch_updated_at();
create trigger consent_touch before update on consent
  for each row execute function app.touch_updated_at();
