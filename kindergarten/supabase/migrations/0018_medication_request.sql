-- ============================================================
-- درخواست مصرف دارو از سمت خانواده — ارتقای ۳ سند بررسی طراحی
--
-- تا اینجا دارو فقط از شیت ورود مربی ثبت می‌شد، یعنی صبح شلوغ و در سه
-- ثانیه. نتیجه: نام دارو ناقص، ساعت جا افتاده، و مسئولیت روی حافظه
-- شفاهی.
--
-- حالا خانواده از شب قبل می‌نویسد. ولی یک قاعده ایمنی هست که کل این
-- ماژول بر آن سوار است:
--
--   درخواست والد به‌تنهایی مجوز دادن دارو نیست.
--
-- والد می‌تواند فرم را پر کند و بعد شیشه دارو را در خانه جا بگذارد.
-- اگر سامانه این دو را یکی بگیرد، کارتی می‌سازد که مربی «داده شد» را
-- رویش می‌زند برای دارویی که اصلاً در مهد نبوده.
--
-- پس زنجیره سه حلقه دارد و هر حلقه ردِ خودش را می‌گذارد:
--   ۱. خانواده اعلام کرد        → announced_at
--   ۲. مربی تحویل گرفت          → received_at + received_by
--   ۳. مربی خوراند              → medication_log.given_at
-- ============================================================

create table medication_request (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete cascade,

  name text not null,
  dose text not null,
  -- می‌تواند بیش از یکی باشد: «۸، ۱۲، ۱۶».
  times time[] not null,
  -- بازه روزهای مصرف. یک‌روزه یعنی from = to.
  from_date date not null,
  to_date date not null,
  note text,

  -- حلقه یک: خانواده اعلام کرد.
  announced_at timestamptz not null default now(),
  announced_by uuid not null references guardian(id) on delete restrict,

  -- حلقه دو: مربی شیشه دارو را واقعاً گرفت. تا اینجا پر نشده،
  -- هیچ خوراندنی ثبت‌شدنی نیست.
  received_at timestamptz,
  received_by uuid references staff(id) on delete set null,

  -- خانواده می‌تواند پیش از تحویل لغوش کند.
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medication_request_range check (to_date >= from_date),
  constraint medication_request_times check (cardinality(times) between 1 and 6),
  constraint medication_request_received_has_staff
    check (received_at is null or received_by is not null)
);

create index medication_request_open_idx
  on medication_request (center_id, from_date, to_date)
  where cancelled_at is null;
create index medication_request_child_idx on medication_request (child_id, from_date desc);

create trigger medication_request_touch before update on medication_request
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------
-- حلقه سه به حلقه دو وصل است.
--
-- ردیف medication_log که از یک درخواست ساخته می‌شود، تا تحویل نگرفتن
-- اصلاً ساخته نمی‌شود. این ستون پیوند را نگه می‌دارد تا بشود نشان داد
-- «این دارو را خانواده اعلام کرده بود».
-- ------------------------------------------------------------
alter table medication_log
  add column request_id uuid references medication_request(id) on delete set null;

-- ------------------------------------------------------------
-- قاعده سفت: دارویی که تحویل گرفته نشده، خورانده نمی‌شود.
--
-- مثل بقیه قواعد «قابل رد شدن نیست»، اینجا بسته می‌شود نه در رابط.
-- ------------------------------------------------------------
create or replace function app.guard_medication_received()
returns trigger
language plpgsql
as $$
declare
  taken timestamptz;
begin
  if new.given_at is null or new.request_id is null then
    return new;
  end if;

  select received_at into taken from medication_request where id = new.request_id;
  if taken is null then
    raise exception
      'این دارو هنوز از خانواده تحویل گرفته نشده. اول «تحویل گرفتم» را بزنید.';
  end if;

  return new;
end;
$$;

create trigger medication_log_received_guard
  before insert or update on medication_log
  for each row execute function app.guard_medication_received();

-- ------------------------------------------------------------
-- درخواست‌های امروزِ یک کودک که هنوز لغو نشده‌اند.
-- ------------------------------------------------------------
create or replace function app.medication_requests_on(child uuid, on_date date)
returns setof medication_request
language sql
stable
as $$
  select *
  from medication_request
  where child_id = child
    and cancelled_at is null
    and on_date between from_date and to_date
  order by announced_at;
$$;

alter table medication_request enable row level security;

-- سرپرست فقط کودک خودش؛ مربی فقط کلاس خودش؛ مدیر همه مرکز.
create policy medication_request_read on medication_request
  for select using (app.can_see_child(child_id));

create policy medication_request_guardian_write on medication_request
  for insert with check (
    app.current_role() = 'guardian' and app.can_see_child(child_id)
  );

create policy medication_request_staff_update on medication_request
  for update using (
    app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  );

-- خانواده فقط تا پیش از تحویل می‌تواند لغو کند.
create policy medication_request_guardian_cancel on medication_request
  for update using (
    app.current_role() = 'guardian' and app.can_see_child(child_id)
  );

-- ============================================================
-- مربیِ حساب فعال، و پر شدن خودکار ستون‌های «چه کسی»
--
-- تا اینجا ستون‌های checked_in_by_staff_id و checked_out_by_staff_id در
-- مهاجرت ۰۰۱۷ ساخته شده بودند ولی هیچ‌جا پر نمی‌شدند: کلاینت آن‌ها را
-- نمی‌فرستاد و تریگری هم نبود. یعنی سرپرست هرگز نام مربی را نمی‌دید.
--
-- درست‌ترین جا برای پر کردنشان همین‌جاست، نه کلاینت: کلاینت می‌تواند
-- دروغ بگوید، و یک رفت‌وبرگشت اضافه هم لازم دارد.
-- ============================================================
create or replace function app.current_staff()
returns uuid
language sql
stable
as $$ select (app.current_account()).staff_id $$;

create or replace function app.stamp_attendance_staff()
returns trigger
language plpgsql
as $$
begin
  if new.check_in_at is not null and new.checked_in_by_staff_id is null then
    new.checked_in_by_staff_id := app.current_staff();
  end if;
  if new.check_out_at is not null and new.checked_out_by_staff_id is null then
    new.checked_out_by_staff_id := app.current_staff();
  end if;
  return new;
end;
$$;

create trigger attendance_stamp_staff
  before insert or update on attendance
  for each row execute function app.stamp_attendance_staff();

-- همین برای تحویل گرفتن دارو: مربی‌ای که دکمه را زد، خودش ثبت می‌شود.
create or replace function app.stamp_medication_receiver()
returns trigger
language plpgsql
as $$
begin
  if new.received_at is not null and new.received_by is null then
    new.received_by := app.current_staff();
  end if;
  return new;
end;
$$;

create trigger medication_request_stamp_receiver
  before insert or update on medication_request
  for each row execute function app.stamp_medication_receiver();
