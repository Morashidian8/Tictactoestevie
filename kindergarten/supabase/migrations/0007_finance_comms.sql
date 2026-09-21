-- ============================================================
-- M5 مالی، M6 ارتباطات، M7 تعطیلی — بخش ۱۱.۷ و ۱۱.۸ سند
-- ============================================================

create type app.invoice_status as enum ('issued', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type app.fee_period as enum ('monthly', 'termly', 'yearly');
create type app.announcement_audience as enum ('center', 'class');

create table fee_plan (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  title text not null,
  amount bigint not null,
  period app.fee_period not null default 'monthly',
  includes_json jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_plan_amount_positive check (amount > 0)
);

create table child_fee (
  child_id uuid primary key references child(id) on delete restrict,
  center_id uuid not null references center(id) on delete restrict,
  fee_plan_id uuid not null references fee_plan(id) on delete restrict,
  -- بخش ۷.۳: تخفیف خواهر و برادر.
  discount_percent numeric(5, 2) not null default 0,
  discount_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_fee_discount_range check (discount_percent between 0 and 100)
);

create table invoice (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  -- دوره جلالی، مثل «۱۴۰۴-۱۰». محاسبه ماه از تقویم جلالی می‌آید.
  period text not null,
  amount bigint not null,
  discount bigint not null default 0,
  -- جریمه تأخیر از late_minutes و center.late_fee_per_minute ساخته می‌شود.
  late_fee bigint not null default 0,
  extra_charges bigint not null default 0,
  due_date date not null,
  status app.invoice_status not null default 'issued',
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoice_child_period_unique unique (child_id, period),
  constraint invoice_amounts_non_negative
    check (amount >= 0 and discount >= 0 and late_fee >= 0 and extra_charges >= 0)
);
create index invoice_center_status_idx on invoice (center_id, status, due_date);

create table payment (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  invoice_id uuid not null references invoice(id) on delete restrict,
  amount bigint not null,
  paid_at timestamptz not null default now(),
  method text,
  receipt_no text,
  recorded_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payment_amount_positive check (amount > 0)
);
create index payment_invoice_idx on payment (invoice_id);

-- ------------------------------------------------------------
-- M6 ارتباطات
-- ------------------------------------------------------------
create table announcement (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  class_id uuid references class(id) on delete cascade,
  title text not null,
  body text not null,
  audience app.announcement_audience not null default 'center',
  published_at timestamptz,
  published_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint announcement_class_audience_has_class
    check ((audience = 'class') = (class_id is not null))
);
create index announcement_center_idx on announcement (center_id, published_at desc);

create table announcement_read (
  announcement_id uuid not null references announcement(id) on delete cascade,
  user_account_id uuid not null references user_account(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_account_id)
);

create table message_thread (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint message_thread_child_unique unique (child_id)
);

create table message (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  thread_id uuid not null references message_thread(id) on delete restrict,
  sender_id uuid references user_account(id) on delete set null,
  body text not null,
  sent_at timestamptz,
  -- بخش ۶.۶: خارج از ساعت کاری، پیام تا صبح در صف می‌ماند.
  -- «پیام شما فردا ساعت ۸ ارسال می‌شود.»
  queued_until timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index message_thread_idx on message (thread_id, created_at desc);
create index message_queued_idx on message (queued_until) where sent_at is null;

-- ------------------------------------------------------------
-- M7 تعطیلی و شرایط اضطراری — بخش ۱۵.۳
-- ------------------------------------------------------------
create table closure (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  class_id uuid references class(id) on delete cascade,
  date date not null,
  type app.closure_type not null,
  reason app.closure_reason not null,
  message_text text not null,
  -- ساعت بازگشایی، فقط در حالت تأخیر. بخش ۱۵.۳ می‌گوید این حالت احتمالاً
  -- پرکاربردتر از تعطیلی کامل است.
  reopen_at time,
  sms_sent_count integer not null default 0,
  delivered_count integer not null default 0,
  created_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint closure_delayed_has_reopen
    check ((type = 'delayed_opening') = (reopen_at is not null))
);
create index closure_center_date_idx on closure (center_id, date desc);

create trigger fee_plan_touch before update on fee_plan
  for each row execute function app.touch_updated_at();
create trigger child_fee_touch before update on child_fee
  for each row execute function app.touch_updated_at();
create trigger invoice_touch before update on invoice
  for each row execute function app.touch_updated_at();
create trigger announcement_touch before update on announcement
  for each row execute function app.touch_updated_at();
