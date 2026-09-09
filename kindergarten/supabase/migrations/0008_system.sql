-- ============================================================
-- جدول‌های سیستمی — بخش ۱۱.۹ سند
--
-- monthly_report ساخته نمی‌شود. گزارش ماهانه فاز ۲ است و بخش ۱۶.۴
-- می‌گوید عمداً بیرون از MVP نگه داشته شده.
-- ============================================================

-- بند ۱۰.۲: لاگ دسترسی برای همه داده‌های کودک الزامی است.
create table audit_log (
  id bigserial primary key,
  center_id uuid not null references center(id) on delete restrict,
  actor_id uuid references user_account(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now(),
  ip inet
);
create index audit_log_center_time_idx on audit_log (center_id, at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id, at desc);

create table notification (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  user_account_id uuid not null references user_account(id) on delete cascade,
  channel app.notification_channel not null,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_user_idx on notification (user_account_id, created_at desc);

-- بخش ۱۵.۴: هرگز سهمیه نامحدود ارائه نشود.
create table sms_quota (
  center_id uuid not null references center(id) on delete restrict,
  period text not null,
  allocated integer not null,
  used integer not null default 0,
  extra_purchased integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (center_id, period),
  constraint sms_quota_non_negative
    check (allocated >= 0 and used >= 0 and extra_purchased >= 0)
);

create trigger sms_quota_touch before update on sms_quota
  for each row execute function app.touch_updated_at();
