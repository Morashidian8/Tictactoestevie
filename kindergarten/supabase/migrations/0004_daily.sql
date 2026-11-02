-- ============================================================
-- M2 حضور و تحویل، M3 گزارش روزانه — بخش ۱۱.۳ سند
-- ============================================================

create table attendance (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  date date not null,

  check_in_at timestamptz,
  -- آورنده: یا سرپرست است یا تحویل‌گیرنده مجاز. هر دو ستون خالی یعنی
  -- ثبت سریع با سرپرست پیش‌فرض که هنوز تفکیک نشده.
  dropped_by_guardian_id uuid references guardian(id) on delete set null,
  arrival_condition app.arrival_condition not null default 'normal',
  -- بخش ۵.۳: عکس اختیاری همراه وضعیت جسمی ورود.
  -- در صورت ادعای بعدی خانواده درباره آسیب‌دیدگی، سند دفاعی مهد است.
  arrival_photo_url text,

  check_out_at timestamptz,
  picked_up_by_guardian_id uuid references guardian(id) on delete set null,
  picked_up_by_authorized_id uuid references authorized_pickup(id) on delete set null,
  pickup_method app.pickup_method,
  -- بخش ۵.۸: پس از ساعت پایان مهد، دقایق تأخیر خودکار ثبت می‌شود.
  late_minutes integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_child_date_unique unique (child_id, date),
  constraint attendance_late_non_negative check (late_minutes >= 0),
  constraint attendance_out_after_in
    check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at),
  -- خروج بدون روش تحویل ثبت نمی‌شود. بخش ۵.۸ می‌گوید این یک هشدار قابل
  -- رد شدن نیست.
  constraint attendance_checkout_needs_method
    check (check_out_at is null or pickup_method is not null),
  constraint attendance_pickup_source_matches_method check (
    pickup_method is null
    or (pickup_method = 'guardian'   and picked_up_by_guardian_id is not null)
    or (pickup_method = 'authorized' and picked_up_by_authorized_id is not null)
    or (pickup_method = 'code')
  )
);
create index attendance_center_date_idx on attendance (center_id, date);
create index attendance_child_date_idx on attendance (child_id, date desc);

-- بخش ۵.۸: کد یکبارمصرف و محدود به همان روز.
create table pickup_code (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  date date not null,
  code text not null,
  bearer_name text not null,
  created_by uuid references user_account(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint pickup_code_unique_per_day unique (center_id, date, code)
);
create index pickup_code_lookup_idx on pickup_code (center_id, date, code) where used_at is null;

create table absence_notice (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  date date not null,
  reason text,
  declared_by uuid references user_account(id) on delete set null,
  declared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint absence_notice_child_date_unique unique (child_id, date)
);
create index absence_notice_center_date_idx on absence_notice (center_id, date);

-- ------------------------------------------------------------
-- گزارش روزانه — بخش ۵.۹ و ۱۱.۳
--
-- locked_at یعنی گزارش پس از ارسال قابل ویرایش نیست و فقط اصلاحیه
-- می‌پذیرد. این قاعده با تریگر پایین در دیتابیس بسته شده، نه در رابط.
-- ------------------------------------------------------------
create table daily_report (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  date date not null,

  nap_start time,
  nap_end time,
  mood_morning   app.mood,
  mood_noon      app.mood,
  mood_afternoon app.mood,
  teacher_note text,
  needs_from_home_json jsonb not null default '[]'::jsonb,

  status app.report_status not null default 'draft',
  created_by uuid references user_account(id) on delete set null,
  sent_at timestamptz,
  locked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint daily_report_child_date_unique unique (child_id, date),
  constraint daily_report_nap_ordered check (nap_end is null or nap_start is null or nap_end > nap_start),
  constraint daily_report_sent_is_locked
    check ((sent_at is null) = (locked_at is null))
);
create index daily_report_center_date_idx on daily_report (center_id, date);

create table daily_report_amendment (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  daily_report_id uuid not null references daily_report(id) on delete restrict,
  text text not null,
  created_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now()
);
create index daily_report_amendment_report_idx on daily_report_amendment (daily_report_id);

create table meal_log (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  daily_report_id uuid not null references daily_report(id) on delete restrict,
  meal_type app.meal_type not null,
  amount app.meal_amount not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meal_log_one_per_meal unique (daily_report_id, meal_type)
);

-- ------------------------------------------------------------
-- دارو — بخش ۵.۳
--
-- سند جدولی برایش نداشت. medical_profile.daily_medication ثابت است و
-- ثبت روزانه را نگه نمی‌دارد.
-- ------------------------------------------------------------
create table medication_log (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  date date not null,
  name text not null,
  dose text,
  scheduled_time time,
  -- سرپرستی که دارو را صبح تحویل داده
  handed_by uuid references guardian(id) on delete set null,
  -- کارکنی که خوراند. تا وقتی given_at پر نشده، در صفحه «امروز» مربی
  -- یادآور دیده می‌شود.
  given_at timestamptz,
  given_by uuid references staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medication_log_given_has_staff
    check (given_at is null or given_by is not null)
);
create index medication_log_pending_idx
  on medication_log (center_id, date) where given_at is null;
create index medication_log_child_date_idx on medication_log (child_id, date desc);

-- ------------------------------------------------------------
-- عکس — بخش ۵.۵، ۶.۶ و ۱۴.۳
--
-- عکس دیگر child_id ندارد. یک عکس گروهی چند کودک را تگ می‌کند، پس رابطه
-- چند به چند است و در photo_tag می‌نشیند.
-- ------------------------------------------------------------
create table photo (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  class_id uuid references class(id) on delete set null,
  date date not null,
  url text not null,
  thumb_url text,
  taken_by uuid references user_account(id) on delete set null,
  is_group boolean not null default false,
  status app.photo_status not null default 'draft',
  published_at timestamptz,
  -- بخش ۱۴.۴: مدت نگهداری بر اساس پلن اشتراک.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint photo_published_has_time check ((status = 'published') = (published_at is not null))
);
create index photo_center_date_idx on photo (center_id, date desc);
-- بخش ۱۴.۴: عکس بدون تگ پس از ۷ روز حذف می‌شود. این نمایه کار پاک‌سازی
-- شبانه را ارزان می‌کند.
create index photo_draft_idx on photo (center_id, created_at) where status = 'draft';

create table photo_tag (
  photo_id uuid not null references photo(id) on delete cascade,
  child_id uuid not null references child(id) on delete restrict,
  center_id uuid not null references center(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (photo_id, child_id)
);
create index photo_tag_child_idx on photo_tag (child_id);

create trigger attendance_touch before update on attendance
  for each row execute function app.touch_updated_at();
create trigger daily_report_touch before update on daily_report
  for each row execute function app.touch_updated_at();
create trigger meal_log_touch before update on meal_log
  for each row execute function app.touch_updated_at();
create trigger medication_log_touch before update on medication_log
  for each row execute function app.touch_updated_at();
create trigger photo_touch before update on photo
  for each row execute function app.touch_updated_at();
