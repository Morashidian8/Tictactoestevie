-- ============================================================
-- لایه پشتیبان پیامک برای رخدادهای حیاتی — ارتقای ۴ سند بررسی طراحی
--
-- چرا اصلاً لازم است: اپ روی iOS وب‌اپ است و اعلان وب‌اپ در iOS مشروط
-- به «افزودن به صفحه خانه» و اجازه دادن کاربر است. یعنی برای بخشی از
-- خانواده‌ها، اعلانِ ما هرگز نمی‌رسد — و ما نمی‌دانیم کدام بخش.
--
-- بخش ۱۵.۲ سند از قبل گفته بود: «در شرایط اضطراری پیامک مسیر اصلی است
-- و اپ مسیر پشتیبان». این مهاجرت آن جمله را از سیاست به سازوکار
-- تبدیل می‌کند، با سه قاعده:
--
--   ۱. سه رخداد حیاتی‌اند و بس: کد تحویل، حادثه تأییدشده، هشدار دارویی
--      اضطراری. سهمیه پیامک محدود است؛ هر چیزی که «مهم» باشد حیاتی
--      نیست.
--   ۲. پیامک بی‌درنگ نمی‌رود. شصت ثانیه به اپ فرصت داده می‌شود. اگر
--      خانواده در اپ دید — یعنی گیرنده «رسید» زد — پیامک لغو می‌شود و
--      سهمیه‌ای خرج نمی‌شود.
--   ۳. سهمیه دو سطل جداست: «اطلاع‌رسانی» و «پشتیبان رخداد حیاتی». تمام
--      شدن سطل اول هرگز سطل دوم را خالی نمی‌کند. مدیری که برای اطلاعیه
--      تعطیلی سهمیه‌اش را سوزانده، نباید فردا نتواند حادثه را خبر دهد.
--
-- شصت ثانیه از سند نمی‌آید. کوتاه‌ترین فاصله‌ای است که هم به اعلان اپ
-- فرصت رسیدن می‌دهد و هم در یک حادثه، تأخیرِ بی‌معنا نیست.
-- ============================================================

create type app.critical_event as enum (
  -- کد تحویل یکبارمصرف: بدون کد، کودک به کسی تحویل داده نمی‌شود.
  'pickup_code',
  -- حادثه با شدت متوسط یا بالا، پس از تأیید مدیر (بخش ۵.۶).
  'incident_confirmed',
  -- هشدار دارویی اضطراری: دارویی که نرسیده یا مصرفش از ساعت گذشته.
  'medication_emergency'
);

-- سطل‌های سهمیه. هر سطل شمارش خودش را دارد.
create type app.sms_bucket as enum ('notice', 'critical_fallback');

-- ────────────────────────────────────────────────────────────
-- ۱. سهمیه: دو سطل به‌جای یک عدد
-- ────────────────────────────────────────────────────────────
alter table sms_quota add column bucket app.sms_bucket not null default 'notice';
alter table sms_quota drop constraint sms_quota_pkey;
alter table sms_quota add primary key (center_id, period, bucket);

comment on column sms_quota.bucket is
  'سطل اطلاع‌رسانی از سطل پشتیبان رخداد حیاتی جداست؛ اولی دومی را خالی نمی‌کند.';

-- ────────────────────────────────────────────────────────────
-- ۲. رخداد حیاتی و سرنوشتش
-- ────────────────────────────────────────────────────────────
create table critical_alert (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  event app.critical_event not null,
  child_id uuid references child(id) on delete cascade,

  -- گیرنده. حساب برای اعلان اپ، شماره برای پیامک. شماره در همین ردیف
  -- ثبت می‌شود نه با join در لحظه ارسال: اگر خانواده شماره‌اش را فردا
  -- عوض کند، سابقه باید بگوید پیامک به کجا رفته.
  user_account_id uuid not null references user_account(id) on delete cascade,
  phone text not null,

  -- متن آماده پیامک. کوتاه، بی‌لینک، بی‌جزئیات پزشکی.
  body text not null,

  raised_at timestamptz not null default now(),
  -- مهلت اپ. تا این لحظه پیامکی نمی‌رود.
  sms_due_at timestamptz not null,

  -- گیرنده در اپ دید و تأیید کرد. از اینجا به بعد پیامکی نمی‌رود.
  acknowledged_at timestamptz,

  sms_sent_at timestamptz,
  -- چرا پیامک نرفت، وقتی نرفت: 'acknowledged' یا 'quota_exhausted'.
  sms_skipped_reason text,

  created_at timestamptz not null default now(),

  constraint critical_alert_due_after_raise check (sms_due_at >= raised_at),
  constraint critical_alert_body_short check (length(body) between 1 and 300),
  -- پیامک و «نرفت» با هم معنا ندارند.
  constraint critical_alert_one_outcome
    check (sms_sent_at is null or sms_skipped_reason is null)
);

create index critical_alert_due_idx
  on critical_alert (center_id, sms_due_at)
  where acknowledged_at is null and sms_sent_at is null and sms_skipped_reason is null;

create index critical_alert_child_idx on critical_alert (child_id, raised_at desc);

comment on table critical_alert is
  'ارتقای ۴: اپ مسیر اول، پیامک پشتیبانِ شصت‌ثانیه‌ای. فقط سه رخداد.';

-- مهلت اپ. یک جا تعریف می‌شود تا SQL و TypeScript یک عدد داشته باشند.
create function app.critical_grace() returns interval
language sql immutable as $$ select interval '60 seconds' $$;

-- ────────────────────────────────────────────────────────────
-- ۳. ثبت رخداد
-- ────────────────────────────────────────────────────────────
create function app.raise_critical_alert(
  centre  uuid,
  kind    app.critical_event,
  account uuid,
  message text,
  kid     uuid default null,
  at      timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  target text;
  fresh  uuid;
begin
  select u.phone into target from user_account u where u.id = account;
  -- بخش ۱۵.۳: نبودِ شماره ارسال را متوقف نمی‌کند، ولی سکوت هم نمی‌ماند.
  -- ردیف با شماره خالی ساخته نمی‌شود؛ به‌جایش صدا درمی‌آید تا مدیر
  -- بداند باید تلفنی خبر دهد.
  if target is null or btrim(target) = '' then
    raise exception 'گیرنده شماره ندارد؛ رخداد حیاتی باید تلفنی خبر داده شود';
  end if;

  insert into critical_alert
    (center_id, event, child_id, user_account_id, phone, body, raised_at, sms_due_at)
  values
    (centre, kind, kid, account, target, message, at, at + app.critical_grace())
  returning id into fresh;

  -- مسیر اول همچنان اپ است. پیامک تا شصت ثانیه دیگر تصمیمش گرفته می‌شود.
  insert into notification (center_id, user_account_id, channel, type, payload_json, sent_at)
  values (centre, account, 'push', kind::text,
          jsonb_build_object('alert_id', fresh, 'body', message), at);

  return fresh;
end $$;

-- ────────────────────────────────────────────────────────────
-- ۴. «دیدم» — تنها چیزی که جلوی پیامک را می‌گیرد
-- ────────────────────────────────────────────────────────────
create function app.acknowledge_critical_alert(alert uuid, at timestamptz default now())
returns boolean
language plpgsql security definer set search_path = public, app as $$
declare
  hit boolean;
begin
  update critical_alert
     set acknowledged_at = at
   where id = alert
     and user_account_id = app.current_account_id()
     and acknowledged_at is null
     and sms_sent_at is null;
  get diagnostics hit = row_count;
  -- تأیید پس از رفتن پیامک بی‌اثر است و باید بی‌اثر بماند: پیامک رفته
  -- و سهمیه خرج شده؛ وانمود کردن به عکسش، آمار را دروغ می‌کند.
  return hit;
end $$;

-- ────────────────────────────────────────────────────────────
-- ۵. تصمیم پیامک
-- ────────────────────────────────────────────────────────────
-- در سامانه واقعی، کارگر زمان‌بندی‌شده این را هر چند ثانیه صدا می‌زند.
create function app.due_critical_alerts(centre uuid, at timestamptz default now())
returns table (id uuid, event app.critical_event, phone text, body text)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.event, a.phone, a.body
    from critical_alert a
   where a.center_id = centre
     and a.acknowledged_at is null
     and a.sms_sent_at is null
     and a.sms_skipped_reason is null
     and a.sms_due_at <= at
   order by a.sms_due_at
$$;

/*
 * مصرف یک پیامک از سطل رخداد حیاتی.
 *
 * سطل «اطلاع‌رسانی» اینجا اصلاً خوانده نمی‌شود. این کل نکته جداسازی
 * است: مدیری که برای اطلاعیه‌های ماه سهمیه‌اش را سوزانده، همچنان
 * می‌تواند حادثه را خبر دهد.
 *
 * اگر سطل حیاتی هم تمام شده باشد، پیامک نمی‌رود ولی رخداد پاک نمی‌شود:
 * دلیلش ثبت می‌شود تا در پنل مدیر دیده شود و تلفن جایش را بگیرد.
 */
create function app.send_critical_sms(alert uuid, at timestamptz default now())
returns text
language plpgsql security definer set search_path = public, app as $$
declare
  row_alert critical_alert%rowtype;
  span      text;
  room      integer;
begin
  select * into row_alert from critical_alert where id = alert for update;
  if not found then
    raise exception 'رخداد حیاتی پیدا نشد';
  end if;

  if row_alert.acknowledged_at is not null then
    update critical_alert set sms_skipped_reason = 'acknowledged' where id = alert;
    return 'acknowledged';
  end if;
  if row_alert.sms_sent_at is not null then
    return 'sent';
  end if;
  if at < row_alert.sms_due_at then
    return 'waiting';
  end if;

  span := to_char(at, 'YYYY-MM');

  insert into sms_quota (center_id, period, bucket, allocated)
  values (row_alert.center_id, span, 'critical_fallback', 0)
  on conflict (center_id, period, bucket) do nothing;

  select q.allocated + q.extra_purchased - q.used into room
    from sms_quota q
   where q.center_id = row_alert.center_id
     and q.period = span
     and q.bucket = 'critical_fallback'
   for update;

  if room <= 0 then
    update critical_alert set sms_skipped_reason = 'quota_exhausted' where id = alert;
    return 'quota_exhausted';
  end if;

  update sms_quota set used = used + 1
   where center_id = row_alert.center_id and period = span and bucket = 'critical_fallback';
  update critical_alert set sms_sent_at = at where id = alert;
  insert into notification (center_id, user_account_id, channel, type, payload_json, sent_at)
  values (row_alert.center_id, row_alert.user_account_id, 'sms',
          row_alert.event::text, jsonb_build_object('alert_id', alert), at);

  return 'sent';
end $$;

-- ────────────────────────────────────────────────────────────
-- ۶. گزارش سهمیه برای پنل مدیر — بخش ۱۵.۴
-- ────────────────────────────────────────────────────────────
create function app.sms_quota_report(centre uuid, span text default to_char(now(), 'YYYY-MM'))
returns table (
  bucket    app.sms_bucket,
  allocated integer,
  used      integer,
  remaining integer,
  -- بخش ۱۵.۴: «در آستانه ۸۰٪ هشدار داده شود».
  warn      boolean
)
language sql stable security definer set search_path = public, app as $$
  select b.bucket,
         coalesce(q.allocated, 0) + coalesce(q.extra_purchased, 0),
         coalesce(q.used, 0),
         coalesce(q.allocated, 0) + coalesce(q.extra_purchased, 0) - coalesce(q.used, 0),
         coalesce(q.allocated, 0) + coalesce(q.extra_purchased, 0) > 0
           and coalesce(q.used, 0)::numeric
               / (coalesce(q.allocated, 0) + coalesce(q.extra_purchased, 0)) >= 0.8
    from (select unnest(enum_range(null::app.sms_bucket)) as bucket) b
    left join sms_quota q
      on q.center_id = centre and q.period = span and q.bucket = b.bucket
   order by b.bucket
$$;

-- ────────────────────────────────────────────────────────────
-- ۷. دسترسی
-- ────────────────────────────────────────────────────────────
alter table critical_alert enable row level security;

-- گیرنده فقط رخداد خودش را می‌بیند. مدیر همه رخدادهای مهد را، چون
-- باید بداند به چه کسی تلفن بزند.
create policy critical_alert_self on critical_alert
  for select using (
    user_account_id = app.current_account_id()
    or (center_id = app.current_center_id() and app.is_manager())
  );
