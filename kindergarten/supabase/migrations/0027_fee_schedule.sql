-- ============================================================
-- برنامه شهریه سال، اقلام هزینه، جریمه دیرکرد و یادآوری پرداخت
-- ============================================================
--
-- خواسته مالک محصول، چهار تکه:
--
--   ۱. خانواده «تمام شهریه ماه‌های سال» را با مبلغ و وضعیت ببیند.
--   ۲. مدیر بتواند قلم هزینه تعریف کند (ناهار، اردو، کاردستی) و
--      بفرستد؛ خانواده در همان صورتحساب ببیندش.
--   ۳. سررسید که نزدیک شد نوتیف و پیامک برود، و اگر پرداخت نشد تا
--      پنج روز دوباره.
--   ۴. پس از مهلت، جریمه درنظر گرفته شود.
--
-- ── چهار تصمیمی که این مهاجرت می‌گیرد و باید صریح بماند ───────
--
-- الف) «جریمه دیرکرد پرداخت» با «جریمه تأخیر در بردن کودک» دو چیزند.
--      ستون invoice.late_fee از بخش ۵.۸ است و دقیقه‌های تأخیر ولی را
--      می‌شمارد. اگر جریمه پرداخت را هم در همان ستون بریزیم، صورتحساب
--      دیگر نمی‌تواند بگوید این مبلغ بابت چیست — و خانواده‌ای که دیر
--      رسیده بود، متهم به دیر پرداختن می‌شود. ستون جدا شد.
--
-- ب) قلم اختیاری تا وقتی خانواده نپذیرفته، بدهی نیست. اردویی که کودک
--      نمی‌رود نباید در مانده بیاید. پس fee_item.optional و
--      fee_item_child.accepted_at، و قید اینکه قلم اختیاریِ نپذیرفته
--      اصلاً سطر صورتحساب نمی‌سازد.
--
-- ج) عدد extra_charges نباید بتواند با فهرست پشتش فرق کند. تریگر
--      مجموع سطرها را در همان ستون می‌نشاند؛ نوشتن دستی‌اش بی‌اثر است.
--      وگرنه روزی صورتحساب می‌گوید «۲٬۰۰۰٬۰۰۰ ریال اقلام» و فهرست
--      زیرش سه قلم هشتصدهزاری نشان می‌دهد.
--
-- د) یادآوری شمارش‌پذیر است، نه بی‌پایان. خانواده‌ای که پول ندارد با
--      پیامک هر پنج روز پولدار نمی‌شود؛ فقط خجالت می‌کشد. پس سقف
--      center.overdue_reminder_max، و بعد از آن کار مدیر است: یک
--      تماس، نه پیامک سیزدهم.
-- ============================================================

-- ------------------------------------------------------------
-- سیاست دیرکرد، روی مرکز
--
-- روی مرکز است نه در کد، چون نرخ و مهلت را بهزیستی و قرارداد مهد
-- تعیین می‌کند، نه ما. پیش‌فرض صفر است: مهدی که چیزی تنظیم نکرده،
-- هیچ‌کس را جریمه نمی‌کند.
-- ------------------------------------------------------------
alter table center
  add column overdue_grace_days integer not null default 5,
  add column overdue_fee_percent numeric(5, 2) not null default 0,
  -- سقف جریمه به ریال. خالی یعنی بی‌سقف — که مهد باید آگاهانه بخواهدش.
  add column overdue_fee_cap bigint,
  add column overdue_reminder_max integer not null default 3,
  -- چند روز پیش از سررسید، یادآوری اول برود.
  add column due_soon_days integer not null default 3,
  add constraint center_overdue_grace_non_negative check (overdue_grace_days >= 0),
  add constraint center_overdue_percent_range check (overdue_fee_percent between 0 and 100),
  add constraint center_overdue_cap_positive check (overdue_fee_cap is null or overdue_fee_cap > 0),
  add constraint center_reminder_max_non_negative check (overdue_reminder_max >= 0),
  add constraint center_due_soon_non_negative check (due_soon_days >= 0);

comment on column center.overdue_fee_percent is
  'درصد جریمه روی مبلغ پرداخت‌نشده، پس از overdue_grace_days از سررسید.';

-- ------------------------------------------------------------
-- جریمه دیرکرد پرداخت — ستون خودش
-- ------------------------------------------------------------
alter table invoice
  add column overdue_fee bigint not null default 0,
  add constraint invoice_overdue_fee_non_negative check (overdue_fee >= 0);

comment on column invoice.late_fee is
  'جریمه تأخیر در تحویل گرفتن کودک — بخش ۵.۸. ربطی به دیر پرداختن ندارد.';
comment on column invoice.overdue_fee is
  'جریمه دیرکرد پرداخت. app.apply_overdue_fees می‌نشاندش، نه دست.';

-- ------------------------------------------------------------
-- ردِ پا، با عددهایش
--
-- جریمه باید برای خانواده قابل توضیح بماند حتی اگر مهد فردا نرخش را
-- عوض کند. ردیف لاگ بی عدد، فقط می‌گوید «چیزی شد»؛ با عدد می‌گوید
-- «۱۰ درصدِ چهار میلیونِ پرداخت‌نشده».
-- ------------------------------------------------------------
alter table audit_log add column meta_json jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- مستند پرداخت
--
-- خواسته: «گذشته به همراه مستندات ثبت شده باشه که هروقت لازم داشت
-- چک کنه». پرداخت آنلاین سندش کد رهگیری است؛ کارت‌به‌کارت و نقدی و
-- چک، تصویر رسید. تا اینجا تصویر فقط روی اعلامِ خانواده می‌نشست و با
-- تأیید مدیر گم می‌شد.
-- ------------------------------------------------------------
alter table payment add column receipt_url text;

comment on column payment.receipt_url is
  'سند پرداخت غیرآنلاین. پرداخت آنلاین به‌جایش tracking_code دارد.';

-- ------------------------------------------------------------
-- قلم هزینه — تعریف مدیر
-- ------------------------------------------------------------
create table fee_item (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  title text not null,
  description text,
  amount bigint not null,
  -- دوره جلالی که این قلم به صورتحساب‌ش می‌چسبد، مثل «۱۴۰۴-۰۸».
  period text not null,
  /*
   * اختیاری یعنی خانواده باید بپذیرد. اردو اختیاری است؛ ناهارِ
   * کودکِ تمام‌روز نه.
   */
  optional boolean not null default false,
  /** تا وقتی منتشر نشده، خانواده نمی‌بیندش و سطر صورتحساب نمی‌سازد. */
  published_at timestamptz,
  created_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fee_item_amount_positive check (amount > 0),
  constraint fee_item_period_shape check (period ~ '^[0-9]{4}-[0-9]{2}$')
);
create index fee_item_center_period_idx on fee_item (center_id, period);

create trigger fee_item_touch before update on fee_item
  for each row execute function app.touch_updated_at();

-- کدام کودک‌ها. مدیر یا کلاس را انتخاب می‌کند یا تک‌تک؛ نتیجه‌اش
-- همین ردیف‌هاست، پس بعداً معلوم است دقیقاً برای که صادر شده.
create table fee_item_child (
  fee_item_id uuid not null references fee_item(id) on delete cascade,
  child_id uuid not null references child(id) on delete cascade,
  center_id uuid not null references center(id) on delete restrict,
  /** فقط برای قلم اختیاری معنا دارد. */
  accepted_at timestamptz,
  accepted_by uuid references user_account(id) on delete set null,
  declined_at timestamptz,
  created_at timestamptz not null default now(),

  primary key (fee_item_id, child_id),
  constraint fee_item_child_one_answer
    check (accepted_at is null or declined_at is null)
);
create index fee_item_child_idx on fee_item_child (child_id);

-- ------------------------------------------------------------
-- سطر صورتحساب
--
-- فقط اقلام. شهریه پایه و تخفیف ستون‌های خودشان را دارند و اینجا
-- تکرار نمی‌شوند، وگرنه دو جا می‌شد جمع زد و دو عدد درمی‌آمد.
-- ------------------------------------------------------------
create table invoice_line (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  invoice_id uuid not null references invoice(id) on delete cascade,
  fee_item_id uuid references fee_item(id) on delete restrict,
  title text not null,
  amount bigint not null,
  created_at timestamptz not null default now(),

  constraint invoice_line_amount_positive check (amount > 0),
  constraint invoice_line_item_once unique (invoice_id, fee_item_id)
);
create index invoice_line_invoice_idx on invoice_line (invoice_id);

/*
 * عدد و فهرست یکی می‌مانند.
 *
 * هر تغییری در سطرها، ستون extra_charges را دوباره می‌نشاند. نوشتن
 * مستقیم روی extra_charges هم با تریگر بعدی بی‌اثر می‌شود، پس هیچ
 * مسیری نمی‌ماند که این دو را از هم جدا کند.
 */
create or replace function app.sync_invoice_extras()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update invoice
     set extra_charges = coalesce(
           (select sum(amount) from invoice_line where invoice_id = target), 0)
   where id = target;
  return null;
end;
$$;

create trigger invoice_line_sync
  after insert or update or delete on invoice_line
  for each row execute function app.sync_invoice_extras();

create or replace function app.guard_invoice_extras()
returns trigger
language plpgsql
as $$
begin
  new.extra_charges := coalesce(
    (select sum(amount) from invoice_line where invoice_id = new.id), 0);
  return new;
end;
$$;

create trigger invoice_extras_guard
  before update on invoice
  for each row execute function app.guard_invoice_extras();

-- ------------------------------------------------------------
-- صدور قلم هزینه روی صورتحساب‌ها
--
-- قلم اختیاریِ نپذیرفته سطر نمی‌سازد. اگر بعداً خانواده پذیرفت،
-- همین تابع دوباره اجرا می‌شود و سطرش را اضافه می‌کند — بی اینکه
-- سطرهای قبلی دو بار بیایند (قید invoice_line_item_once).
-- ------------------------------------------------------------
create or replace function app.issue_fee_item(item uuid)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  def   fee_item;
  made  integer := 0;
begin
  select * into def from fee_item where id = item;
  if def.id is null then
    raise exception 'قلم هزینه پیدا نشد.';
  end if;
  if def.published_at is null then
    raise exception 'قلم منتشرنشده روی صورتحساب نمی‌نشیند.';
  end if;

  insert into invoice_line (center_id, invoice_id, fee_item_id, title, amount)
  select def.center_id, i.id, def.id, def.title, def.amount
    from fee_item_child fc
    join invoice i
      on i.child_id = fc.child_id
     and i.period = def.period
     and i.status <> 'cancelled'
   where fc.fee_item_id = def.id
     and (not def.optional or fc.accepted_at is not null)
  on conflict (invoice_id, fee_item_id) do nothing;

  get diagnostics made = row_count;
  return made;
end;
$$;

-- ------------------------------------------------------------
-- مانده و وضعیت — یک تعریف، نه پنج‌تا
--
-- پیش از این هر فراخواننده خودش جمع می‌زد و بعضی‌ها extra_charges را
-- جا می‌انداختند. حالا یک تابع است و ستون status هم خودش از همین
-- درمی‌آید، نه از کد کلاینت.
-- ------------------------------------------------------------
create or replace function app.invoice_total(target uuid)
returns bigint
language sql
stable
as $$
  select (amount - discount + late_fee + extra_charges + overdue_fee)::bigint
    from invoice where id = target
$$;

create or replace function app.invoice_due(target uuid)
returns bigint
language sql
stable
as $$
  select greatest(coalesce(app.invoice_total(target), 0) - app.invoice_paid(target), 0)
$$;

create or replace function app.invoice_status_now(target uuid, today date)
returns app.invoice_status
language sql
stable
as $$
  select case
    when (select status from invoice where id = target) = 'cancelled' then 'cancelled'
    when app.invoice_due(target) <= 0 then 'paid'
    when (select due_date from invoice where id = target) < today then 'overdue'
    when app.invoice_paid(target) > 0 then 'partially_paid'
    else 'issued'
  end::app.invoice_status
$$;

/*
 * وضعیت با هر پرداخت خودش را درست می‌کند.
 *
 * تا اینجا ستون status را فقط کد کلاینت می‌نوشت؛ یعنی یک پرداخت که
 * از مسیر دیگری ثبت می‌شد، صورتحساب را «پرداخت نشده» رها می‌کرد و
 * یادآوری برای خانواده‌ای می‌رفت که پولش را داده بود.
 */
create or replace function app.touch_invoice_status()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update invoice
     set status = app.invoice_status_now(target, current_date)
   where id = target and status <> 'cancelled';
  return null;
end;
$$;

create trigger payment_touch_invoice
  after insert or update or delete on payment
  for each row execute function app.touch_invoice_status();

/** گذر زمان هم وضعیت را عوض می‌کند. کار شبانه این را صدا می‌زند. */
create or replace function app.refresh_invoice_status(centre uuid, today date)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  n integer;
begin
  update invoice
     set status = app.invoice_status_now(id, today)
   where center_id = centre
     and status <> 'cancelled'
     and status is distinct from app.invoice_status_now(id, today);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ------------------------------------------------------------
-- جریمه دیرکرد
--
-- می‌نشاند، جمع نمی‌زند. اجرای دوباره در همان روز هیچ ریالی اضافه
-- نمی‌کند — این تنها چیزی است که جلوی جریمه‌ی مرکب سهوی را می‌گیرد.
--
-- پایه جریمه، مبلغِ پرداخت‌نشده است نه کل صورتحساب: خانواده‌ای که
-- نصف را داده، نباید بابت نصفِ داده‌شده جریمه شود.
-- ------------------------------------------------------------
create or replace function app.apply_overdue_fees(centre uuid, today date)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  policy_percent numeric(5, 2);
  grace          integer;
  cap            bigint;
  bill           record;
  base           bigint;
  fee            bigint;
  n              integer := 0;
begin
  select overdue_fee_percent, overdue_grace_days, overdue_fee_cap
    into policy_percent, grace, cap
    from center where id = centre;

  if coalesce(policy_percent, 0) = 0 then
    return 0;
  end if;

  for bill in
    select id, due_date, overdue_fee
      from invoice
     where center_id = centre
       and status not in ('paid', 'cancelled')
       and due_date + grace < today
  loop
    -- پایه بی جریمه فعلی، وگرنه جریمه روی جریمه می‌نشیند.
    base := greatest(
      (select amount - discount + late_fee + extra_charges from invoice where id = bill.id)
        - app.invoice_paid(bill.id), 0);
    if base <= 0 then
      continue;
    end if;

    fee := floor(base * policy_percent / 100)::bigint;
    if cap is not null then
      fee := least(fee, cap);
    end if;

    if fee is distinct from bill.overdue_fee then
      update invoice set overdue_fee = fee where id = bill.id;
      insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
      values (centre, null, 'overdue_fee', 'invoice', bill.id,
              jsonb_build_object('base', base, 'percent', policy_percent, 'fee', fee));
      n := n + 1;
    end if;
  end loop;

  perform app.refresh_invoice_status(centre, today);
  return n;
end;
$$;

-- ------------------------------------------------------------
-- یادآوری پرداخت
-- ------------------------------------------------------------
create type app.reminder_kind as enum ('due_soon', 'due_today', 'overdue');
create type app.reminder_channel as enum ('app', 'sms');

create table payment_reminder (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  invoice_id uuid not null references invoice(id) on delete cascade,
  kind app.reminder_kind not null,
  channel app.reminder_channel not null,
  sent_at timestamptz not null default now(),
  sent_on date not null default current_date,

  -- یک بار در روز، از هر جنس و هر کانال. اجرای دوباره کار شبانه،
  -- پیامک دوم نمی‌فرستد.
  constraint payment_reminder_once_a_day unique (invoice_id, kind, channel, sent_on)
);
create index payment_reminder_invoice_idx on payment_reminder (invoice_id, sent_at desc);

/*
 * چه کسی امروز یادآوری می‌خواهد.
 *
 * تصمیم اینجاست، نه در کد کلاینت، چون همین تابع هم برای نوتیف اپ و
 * هم برای پیامک صدا زده می‌شود و دو جواب متفاوت فاجعه است.
 *
 * ترتیب: یک بار due_soon_days پیش از سررسید، یک بار روز سررسید، و
 * بعد هر overdue_grace_days یک بار تا سقف overdue_reminder_max.
 */
create or replace function app.payment_reminders_due(centre uuid, today date)
returns table (
  invoice_id uuid,
  child_id uuid,
  period text,
  due_date date,
  amount_due bigint,
  kind app.reminder_kind,
  sent_before integer
)
language sql
stable
as $$
  with policy as (
    select due_soon_days, overdue_grace_days, overdue_reminder_max
      from center where id = centre
  ),
  live as (
    select i.id, i.child_id, i.period, i.due_date, app.invoice_due(i.id) as due
      from invoice i
     where i.center_id = centre
       and i.status not in ('paid', 'cancelled')
  ),
  judged as (
    select l.*,
           case
             when l.due_date = today + (select due_soon_days from policy) then 'due_soon'
             when l.due_date = today then 'due_today'
             when l.due_date < today
              and (select overdue_grace_days from policy) > 0
              and (today - l.due_date) % (select overdue_grace_days from policy) = 0
               then 'overdue'
           end::app.reminder_kind as kind
      from live l
     where l.due > 0
  )
  select j.id, j.child_id, j.period, j.due_date, j.due, j.kind,
         (select count(*)::integer from payment_reminder r
           where r.invoice_id = j.id and r.kind = 'overdue')
    from judged j
   where j.kind is not null
     -- سقف فقط روی یادآوری دیرکرد است. خبرِ سررسید، سرزنش نیست.
     and (j.kind <> 'overdue'
          or (select count(*) from payment_reminder r
               where r.invoice_id = j.id and r.kind = 'overdue')
             < (select overdue_reminder_max from policy))
     and not exists (
       select 1 from payment_reminder r
        where r.invoice_id = j.id and r.kind = j.kind and r.sent_on = today
     )
$$;

/** ثبت اینکه یادآوری رفت. تکرارِ همان روز، ردیف دوم نمی‌سازد. */
create or replace function app.record_payment_reminder(
  target uuid,
  which app.reminder_kind,
  via app.reminder_channel,
  today date
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid;
begin
  select center_id into centre from invoice where id = target;
  if centre is null then
    raise exception 'صورتحساب پیدا نشد.';
  end if;

  insert into payment_reminder (center_id, invoice_id, kind, channel, sent_on)
  values (centre, target, which, via, today)
  on conflict (invoice_id, kind, channel, sent_on) do nothing;

  return found;
end;
$$;

-- ------------------------------------------------------------
-- برنامه شهریه سال، از دید خانواده
--
-- دوازده ماه جلالی، چه صورتحساب داشته باشند چه نه.
--
-- ماهی که هنوز صورتحساب ندارد، بدهی نیست — issued=false و مبلغش
-- «برآورد» است، از روی طرح شهریه ثبت‌نام فعال. اگر این را بدهی نشان
-- می‌دادیم، خانواده در مهر یک رقم دوازده‌ماهه می‌دید و می‌ترسید.
--
-- محدودیت آگاهانه: نگاشت ماه جلالی به بازه میلادی در پایگاه داده
-- نیست، پس برآورد فقط وقتی می‌آید که ثبت‌نام امروز فعال باشد. برآوردِ
-- ماه‌هایی که کودک هنوز ثبت‌نام نکرده، حدس است نه داده.
-- ------------------------------------------------------------
create or replace function app.child_fee_year(centre uuid, target uuid, year text)
returns table (
  period text,
  issued boolean,
  amount bigint,
  discount bigint,
  extras bigint,
  late_fee bigint,
  overdue_fee bigint,
  paid bigint,
  due_date date,
  status text
)
language sql
stable
as $$
  with months as (
    select year || '-' || lpad(m::text, 2, '0') as period
      from generate_series(1, 12) m
  ),
  plan as (
    select coalesce(
      (select round(f.amount * (100 - e.discount_percent) / 100)::bigint
         from child_enrollment e
         join fee_plan f on f.id = coalesce(e.fee_plan_id, (
           select fee_plan_id from child_fee where child_id = target))
        where e.child_id = target
          and current_date >= e.start_date
          and (e.end_date is null or current_date <= e.end_date)
        limit 1), 0) as estimate
  )
  select
    m.period,
    i.id is not null,
    coalesce(i.amount, (select estimate from plan)),
    coalesce(i.discount, 0),
    coalesce(i.extra_charges, 0),
    coalesce(i.late_fee, 0),
    coalesce(i.overdue_fee, 0),
    coalesce(app.invoice_paid(i.id), 0),
    i.due_date,
    coalesce(i.status::text, 'not_issued')
  from months m
  left join invoice i
    on i.child_id = target and i.center_id = centre and i.period = m.period
  order by m.period
$$;

-- ------------------------------------------------------------
-- تأیید اعلام پرداخت، سند رسید را نگه می‌دارد
--
-- تا اینجا تصویر رسید روی payment_claim می‌ماند و پرداختِ ساخته‌شده
-- بی‌سند بود. بازرس و خانواده هر دو سند می‌خواهند، نه ردیف.
-- ------------------------------------------------------------
create or replace function app.carry_claim_receipt()
returns trigger
language plpgsql
as $$
begin
  if new.payment_id is not null
     and new.payment_id is distinct from old.payment_id
     and new.receipt_url is not null then
    update payment set receipt_url = new.receipt_url
     where id = new.payment_id and receipt_url is null;
  end if;
  return new;
end;
$$;

create trigger payment_claim_carry_receipt
  after update on payment_claim
  for each row execute function app.carry_claim_receipt();

-- ------------------------------------------------------------
-- سیاست سطر-محور
-- ------------------------------------------------------------
alter table fee_item enable row level security;
alter table fee_item force row level security;
alter table fee_item_child enable row level security;
alter table fee_item_child force row level security;
alter table invoice_line enable row level security;
alter table invoice_line force row level security;
alter table payment_reminder enable row level security;
alter table payment_reminder force row level security;

-- مدیر همه اقلام مرکز خودش را می‌بیند؛ خانواده فقط قلمِ منتشرشده‌ای
-- که به کودک خودش خورده.
create policy fee_item_visible on fee_item
  for select using (
    center_id = app.current_center_id()
    and (
      app.is_manager()
      or (published_at is not null and exists (
        select 1 from fee_item_child fc
        where fc.fee_item_id = fee_item.id
          and fc.child_id in (select app.current_child_ids())
      ))
    )
  );

create policy fee_item_manager_write on fee_item
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy fee_item_child_visible on fee_item_child
  for select using (
    center_id = app.current_center_id()
    and (app.is_manager() or child_id in (select app.current_child_ids()))
  );

create policy fee_item_child_manager_write on fee_item_child
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

/*
 * خانواده پذیرفتن یا نپذیرفتن اردو را خودش می‌نویسد — و فقط همان دو
 * ستون را. مبلغ و اینکه قلم به کدام کودک خورده، دست مدیر است.
 */
create policy fee_item_child_answer on fee_item_child
  for update using (
    center_id = app.current_center_id()
    and app.current_role() = 'guardian'
    and app.is_payer_for(child_id)
  )
  with check (
    center_id = app.current_center_id()
    and app.is_payer_for(child_id)
  );

create policy invoice_line_visible on invoice_line
  for select using (
    center_id = app.current_center_id()
    and (
      app.is_manager()
      or exists (
        select 1 from invoice i
        where i.id = invoice_id and app.is_payer_for(i.child_id)
      )
    )
  );

create policy invoice_line_manager_write on invoice_line
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

-- خانواده باید ببیند چند بار و کِی یادآوری گرفته. ادعای «پیامک نیامد»
-- بی این ستون، قابل بررسی نیست.
create policy payment_reminder_visible on payment_reminder
  for select using (
    center_id = app.current_center_id()
    and (
      app.is_manager()
      or exists (
        select 1 from invoice i
        where i.id = invoice_id and app.is_payer_for(i.child_id)
      )
    )
  );

create policy payment_reminder_manager_write on payment_reminder
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

-- ------------------------------------------------------------
-- درگاه، جریمه دیرکرد را هم می‌بیند
--
-- تابع ۰۰۲۰ جمعش را دستی می‌زد و ستون تازه overdue_fee را نمی‌شناخت.
-- نتیجه‌اش این می‌شد: خانواده از درگاه پرداخت می‌کرد، مبلغ کمتر از
-- بدهی بود، صورتحساب «بخشی پرداخت شده» می‌ماند و یادآوری بعدی برایش
-- می‌رفت — بدون اینکه بداند چه چیزی کم مانده. حالا هر دو از یک تابع
-- می‌خوانند.
-- ------------------------------------------------------------
create or replace function app.start_online_payment(invoice uuid)
returns table (
  payment_id uuid,
  idempotency_key text,
  redirect_url text,
  amount bigint,
  psp text
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  bill   invoice;
  due    bigint;
  key    text;
  made   uuid;
  chosen text := 'zibal';
begin
  select * into bill from invoice where id = invoice;
  if bill.id is null then
    raise exception 'صورتحساب پیدا نشد.';
  end if;
  if not app.can_see_child(bill.child_id) then
    raise exception 'این صورتحساب به شما مربوط نیست.';
  end if;

  due := app.invoice_due(bill.id);
  if due <= 0 then
    raise exception 'این صورتحساب تسویه شده است.';
  end if;

  key := 'idem-' || encode(gen_random_bytes(9), 'hex');

  insert into payment (center_id, invoice_id, amount, payment_method, psp, idempotency_key)
  values (bill.center_id, bill.id, due, 'online', chosen, key)
  returning id into made;

  return query select made, key, '/pay/' || key, due, chosen;
end;
$$;
