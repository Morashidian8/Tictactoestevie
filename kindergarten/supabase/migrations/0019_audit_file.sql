-- ============================================================
-- پرونده بازرسی — ارتقای ۲ سند بررسی طراحی
--
-- بازرس بهزیستی یا شبکه بهداشت که سر می‌زند، سه دفتر می‌خواهد. مهد
-- امروز آن‌ها را دستی و روی کاغذ نگه می‌دارد و روز بازرسی هول می‌شود.
-- داده‌اش تماماً در سامانه هست؛ فقط خروجی ندارد.
--
-- دو چیز کم بود: وضعیت واکسیناسیون کودک، و کارت بهداشت مربی. هر دو
-- اینجا اضافه می‌شوند.
-- ============================================================

-- ------------------------------------------------------------
-- کد ملی کودک.
--
-- تا اینجا فقط سرپرست کد ملی داشت. دفتر آمار بازرسی کد ملی خودِ کودک
-- را می‌خواهد، پس ستونش اینجا اضافه می‌شود — نه در پرونده پزشکی، چون
-- داده هویتی است نه سلامتی.
-- ------------------------------------------------------------
alter table child add column national_id text;

create type app.vaccination_status as enum ('complete', 'incomplete', 'unrecorded');

alter table medical_profile
  add column vaccination_status app.vaccination_status not null default 'unrecorded',
  add column vaccination_updated_at date;

comment on column medical_profile.vaccination_status is
  'وضعیت کارت واکسیناسیون. بازرس همین ستون را می‌خواهد.';

-- ------------------------------------------------------------
-- کارت بهداشت مربیان.
--
-- تاریخ انقضا مهم‌ترین ستون است: مهدی که مربی‌اش کارت منقضی دارد، در
-- بازرسی جریمه می‌شود. پس سامانه باید پیش از بازرسی هشدار بدهد، نه
-- اینکه فقط در خروجی نشانش دهد.
-- ------------------------------------------------------------
alter table staff
  add column health_card_number text,
  add column health_card_issued_at date,
  add column health_card_expires_at date;

create index staff_health_card_expiry_idx
  on staff (center_id, health_card_expires_at)
  where left_at is null;

-- ------------------------------------------------------------
-- سه عددی که مدیر باید پیش از بازرسی ببیند، نه بعدش.
-- ------------------------------------------------------------
create or replace function app.audit_readiness(centre uuid)
returns table (
  incomplete_vaccination integer,
  missing_national_id integer,
  expiring_health_cards integer
)
language sql
stable
as $$
  select
    (select count(*)::integer
       from child c
       left join medical_profile m on m.child_id = c.id
      where c.center_id = centre
        and c.deleted_at is null
        and coalesce(m.vaccination_status, 'unrecorded') <> 'complete'),
    (select count(*)::integer
       from child c
      where c.center_id = centre
        and c.deleted_at is null
        and (c.national_id is null or c.national_id = '')),
    -- منقضی یا کمتر از سی روز مانده. هر دو یک کار لازم دارند.
    (select count(*)::integer
       from staff s
      where s.center_id = centre
        and s.left_at is null
        and (s.health_card_expires_at is null
             or s.health_card_expires_at < current_date + 30));
$$;

-- ------------------------------------------------------------
-- سه جدول خروجی.
--
-- توابع جدا، نه یک view بزرگ: هر کدام ستون‌های خودش را دارد و بازرس
-- هر سه را جدا می‌خواهد.
-- ------------------------------------------------------------
create or replace function app.audit_children(centre uuid)
returns table (
  full_name text,
  national_id text,
  birth_date date,
  class_name text,
  attendance_type app.attendance_type,
  guardian_name text,
  guardian_phone text,
  enrolled_since date
)
language sql
stable
as $$
  select
    c.first_name || ' ' || c.last_name,
    c.national_id,
    c.birth_date,
    cl.name,
    e.attendance_type,
    g.full_name,
    g.phone,
    e.start_date
  from child c
  left join class cl on cl.id = c.class_id
  left join child_enrollment e
    on e.child_id = c.id and e.end_date is null
  -- سرپرست پرداخت‌کننده همان کسی است که بازرس شماره‌اش را می‌خواهد؛
  -- اگر نبود، هر سرپرستی که بشود به او زنگ زد.
  left join lateral (
    select g.full_name, g.phone
    from child_guardian cg
    join guardian g on g.id = cg.guardian_id
    where cg.child_id = c.id and g.deleted_at is null
    order by cg.is_payer desc, cg.created_at
    limit 1
  ) g on true
  where c.center_id = centre and c.deleted_at is null
  order by cl.name, c.first_name;
$$;

create or replace function app.audit_health(centre uuid)
returns table (
  class_name text,
  full_name text,
  allergies text,
  conditions text,
  vaccination_status app.vaccination_status,
  updated_at date
)
language sql
stable
as $$
  select
    cl.name,
    c.first_name || ' ' || c.last_name,
    -- allergies_json آرایه است؛ برای چاپ به یک سطر تبدیل می‌شود.
    coalesce(
      nullif(
        (select string_agg(value #>> '{}', '، ')
           from jsonb_array_elements(coalesce(m.allergies_json, '[]'::jsonb))),
        ''
      ),
      'ندارد'
    ),
    coalesce(nullif(m.chronic_conditions, ''), 'ندارد'),
    coalesce(m.vaccination_status, 'unrecorded'),
    m.vaccination_updated_at
  from child c
  left join class cl on cl.id = c.class_id
  left join medical_profile m on m.child_id = c.id
  where c.center_id = centre and c.deleted_at is null
  order by cl.name, c.first_name;
$$;

create or replace function app.audit_staff(centre uuid)
returns table (
  full_name text,
  role app.staff_role,
  card_number text,
  issued_at date,
  expires_at date,
  card_state text
)
language sql
stable
as $$
  select
    s.full_name,
    s.role,
    s.health_card_number,
    s.health_card_issued_at,
    s.health_card_expires_at,
    case
      when s.health_card_expires_at is null then 'ثبت نشده'
      when s.health_card_expires_at < current_date then 'منقضی'
      when s.health_card_expires_at < current_date + 30 then 'نزدیک انقضا'
      else 'معتبر'
    end
  from staff s
  where s.center_id = centre and s.left_at is null
  order by s.health_card_expires_at nulls first;
$$;

-- ------------------------------------------------------------
-- ساختن پرونده، ردِ پا می‌گذارد — بخش ۱۰.۲
--
-- این فایل حساس‌ترین خروجی کل سامانه است: کد ملی، شماره تماس و وضعیت
-- سلامت کودکان در یک جا. سند دسترسی نقش‌محور و لاگ دسترسی را برای همه
-- داده کودک الزامی کرده، پس ساختنش هم مثل خواندن پرونده پزشکی ثبت
-- می‌شود.
-- ------------------------------------------------------------
create or replace function app.record_audit_export()
returns bigint
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid := app.current_center_id();
  entry bigint;
begin
  if app.current_role() <> 'manager' then
    raise exception 'فقط مدیر می‌تواند پرونده بازرسی بسازد.';
  end if;

  insert into audit_log (center_id, actor_id, action, entity, entity_id)
  values (centre, (app.current_account()).id, 'export', 'audit_file', centre)
  returning id into entry;

  return entry;
end;
$$;
