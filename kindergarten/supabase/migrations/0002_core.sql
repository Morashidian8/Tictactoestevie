-- ============================================================
-- هسته سازمانی — بخش ۱۱.۱ سند
-- ============================================================

create table center (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  logo_url text,
  plan text,
  active_until date,

  -- ساعت کاری مهد. پایه محاسبه تأخیر و پنجره پیام سرپرستان.
  work_start time not null default '07:30',
  work_end   time not null default '16:30',

  -- این پنج ستون از settings_json بیرون کشیده شده‌اند چون منطق سیستم
  -- مستقیماً به آن‌ها وابسته است و نباید در JSON پنهان بمانند.
  auto_send_report_at   time    not null default '17:30',  -- بخش ۵.۹
  late_fee_per_minute   integer not null default 0,        -- بخش ۵.۸، ریال
  parent_message_start  time    not null default '08:00',  -- بخش ۶.۶
  parent_message_end    time    not null default '16:30',
  group_photo_policy    app.group_photo_policy not null default 'never', -- بخش ۶.۶
  max_children_per_staff integer not null default 15,      -- بخش ۷.۲، هشدار نسبت

  settings_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint center_work_hours_ordered check (work_start < work_end),
  constraint center_message_hours_ordered check (parent_message_start < parent_message_end),
  constraint center_late_fee_non_negative check (late_fee_per_minute >= 0),
  constraint center_ratio_positive check (max_children_per_staff > 0)
);

create table class (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  name text not null,
  age_min_month integer,
  age_max_month integer,
  capacity integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint class_age_range_ordered
    check (age_min_month is null or age_max_month is null or age_min_month <= age_max_month)
);
create index class_center_idx on class (center_id) where active;

create table staff (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  full_name text not null,
  -- فقط برای تماس. ورود با این شماره انجام نمی‌شود؛ مرجع احراز هویت
  -- user_account.phone است.
  phone text,
  role app.staff_role not null,
  active boolean not null default true,
  joined_at date not null default current_date,
  -- بخش ۷.۴: قطع فوری دسترسی مربی خارج‌شده با یک اقدام.
  left_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_left_implies_inactive check (left_at is null or active = false)
);
create index staff_center_idx on staff (center_id) where active;

create table staff_class (
  staff_id uuid not null references staff(id) on delete cascade,
  class_id uuid not null references class(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, class_id)
);
create index staff_class_by_class_idx on staff_class (class_id);

-- ------------------------------------------------------------
-- حساب کاربری — بخش ۳.۲ سند
--
-- شماره تلفن شناسه یکتای کاربر نیست. یک شماره می‌تواند چند حساب داشته
-- باشد و کلید یکتا (phone, role, center_id) است، چون یک نفر می‌تواند
-- مربی دو مهد باشد.
--
-- staff.role مرجع نقش است و user_account.role نسخه بدل با قید
-- یکسان‌بودن (تریگر پایین). برای حساب سرپرست که ردیف staff ندارد،
-- user_account.role تنها منبع است.
-- ------------------------------------------------------------
create table user_account (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  phone text not null,
  role app.account_role not null,
  staff_id uuid references staff(id) on delete restrict,
  guardian_id uuid,  -- کلید خارجی پس از ساخت guardian افزوده می‌شود
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_account_phone_role_center_unique unique (phone, role, center_id),

  -- هر حساب دقیقاً به یک هویت وصل است: یا پرسنل، یا سرپرست، یا هیچ‌کدام
  -- (پشتیبانی محصول).
  constraint user_account_single_identity check (
    (staff_id is not null and guardian_id is null and role in ('manager', 'teacher', 'assistant'))
    or (guardian_id is not null and staff_id is null and role = 'guardian')
    or (staff_id is null and guardian_id is null and role = 'platform_admin')
  )
);
create index user_account_phone_idx on user_account (phone) where active;
create index user_account_center_idx on user_account (center_id);

-- ------------------------------------------------------------
-- حساب فعال نشست — بخش ۳.۲
--
-- در Supabase یک شماره تلفن یک ردیف auth.users دارد، ولی می‌تواند چند
-- user_account داشته باشد. این جدول می‌گوید کاربر همین حالا با کدام حساب
-- کار می‌کند، تا «جابه‌جایی بدون خروج و ورود مجدد» ممکن شود.
--
-- قاعده سفت بخش ۳.۲: دسترسی‌ها هرگز ترکیب نمی‌شوند. نشست فعال دقیقاً یک
-- حساب است و لایه دسترسی فقط از همین ردیف می‌خواند.
-- ------------------------------------------------------------
create table active_account (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  user_account_id uuid not null references user_account(id) on delete cascade,
  switched_at timestamptz not null default now()
);

create trigger center_touch before update on center
  for each row execute function app.touch_updated_at();
create trigger class_touch before update on class
  for each row execute function app.touch_updated_at();
create trigger staff_touch before update on staff
  for each row execute function app.touch_updated_at();
create trigger user_account_touch before update on user_account
  for each row execute function app.touch_updated_at();

-- نقش حساب پرسنلی باید با نقش ردیف staff یکی بماند.
create or replace function app.assert_account_role_matches_staff()
returns trigger
language plpgsql
as $$
declare
  staff_role app.staff_role;
  staff_center uuid;
begin
  if new.staff_id is null then
    return new;
  end if;

  select role, center_id into staff_role, staff_center from staff where id = new.staff_id;

  if staff_role::text is distinct from new.role::text then
    raise exception 'نقش حساب (%) با نقش پرسنل (%) یکی نیست', new.role, staff_role;
  end if;

  if staff_center is distinct from new.center_id then
    raise exception 'مرکز حساب با مرکز پرسنل یکی نیست';
  end if;

  return new;
end;
$$;

create trigger user_account_role_matches_staff
  before insert or update on user_account
  for each row execute function app.assert_account_role_matches_staff();
