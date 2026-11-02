-- ============================================================
-- ویرایش پرونده کودک به دست خانواده، با تأیید مدیر
-- ============================================================
--
-- خواسته مالک محصول: «والدین بتونن پروفایل کودک و اطلاعاتش وارد کنند و
-- بتوانند ویرایش کنند … ولی تایید نهایی برای تغییر نیازمند تایید مدیر
-- باشه».
--
-- ── چهار تصمیمی که این مهاجرت می‌گیرد و باید صریح بماند ───────
--
-- الف) **تا تأیید مدیر، هیچ ستونی عوض نمی‌شود.** درخواست در جدول خودش
--      می‌نشیند و پرونده کودک دست‌نخورده می‌ماند. اگر مقدار تازه را
--      می‌نوشتیم و «تأییدنشده» علامتش می‌زدیم، اولین کوئری‌ای که این
--      علامت را فراموش می‌کرد، داده تأییدنشده را به مربی نشان می‌داد.
--
-- ب) **فهرست میدان‌های قابل ویرایش در پایگاه داده است، نه در کلاینت.**
--      فهرست سمت کلاینت دور زدنی است. خانواده نباید بتواند کلاس کودک،
--      مرکز، طرح شهریه یا پرچم پرداخت‌کننده را عوض کند — نه با رابط و
--      نه با یک درخواست دستی.
--
-- ج) **اعمال، با `case` صریح انجام می‌شود نه SQL پویا.** نام ستون از
--      داده‌ای که کاربر فرستاده ساخته نمی‌شود؛ تابع فقط ستون‌هایی را
--      می‌شناسد که خودش نامشان را نوشته.
--
-- د) **میدان‌های ایمنی، فوری علامت می‌خورند.** این مهم‌ترین نکته است:
--      وقتی خانواده آلرژی تازه‌ای ثبت می‌کند، تا تأیید مدیر، مربی
--      همچنان فهرست قدیمی را می‌بیند. این فاصله خطر دارد. پس چنین
--      درخواستی `urgent` است، بالای صف مدیر می‌نشیند، و رابط خانواده
--      صریح می‌گوید که هنوز اعمال نشده.
-- ============================================================

create type app.change_state as enum ('pending', 'approved', 'rejected');

/*
 * میدان‌های قابل ویرایش — داده، نه کد.
 *
 * مهد یا نسخه بعدی می‌تواند میدانی اضافه کند بی آنکه تابعی عوض شود؛
 * ولی چیزی که اینجا نیست، از هیچ راهی قابل ویرایش نیست.
 */
create table profile_field (
  key text primary key,
  label text not null,
  /* روی کدام جدول می‌نشیند. تابع اعمال فقط همین دو را می‌شناسد. */
  target text not null,
  /*
   * میدان ایمنی: تا تأیید نشود، مربی مقدار قدیمی را می‌بیند و این
   * فاصله می‌تواند به کودک آسیب بزند.
   */
  safety_critical boolean not null default false,
  sort_order integer not null default 0,

  constraint profile_field_target_known check (target in ('child', 'medical_profile'))
);

insert into profile_field (key, label, target, safety_critical, sort_order) values
  ('first_name',          'نام',                  'child',           false, 1),
  ('last_name',           'نام خانوادگی',         'child',           false, 2),
  ('birth_date',          'تاریخ تولد',           'child',           false, 3),
  ('national_id',         'کد ملی',               'child',           false, 4),
  ('blood_type',          'گروه خونی',            'medical_profile', true,  5),
  ('allergies',           'آلرژی‌ها',              'medical_profile', true,  6),
  ('chronic_conditions',  'بیماری زمینه‌ای',       'medical_profile', true,  7),
  ('daily_medication',    'داروی روزانه',         'medical_profile', true,  8),
  ('doctor_name',         'نام پزشک',             'medical_profile', false, 9),
  ('doctor_phone',        'تلفن پزشک',            'medical_profile', false, 10),
  ('insurance',           'بیمه',                 'medical_profile', false, 11);

create table profile_change_request (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete cascade,
  field text not null references profile_field(key) on delete restrict,

  /* مقدار پیش از تغییر، تا مدیر بداند چه چیزی جای چه چیزی می‌نشیند. */
  old_value text,
  new_value text,

  state app.change_state not null default 'pending',
  requested_by uuid references user_account(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references user_account(id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,

  created_at timestamptz not null default now(),

  constraint profile_change_reviewed_has_reviewer
    check ((state = 'pending') = (reviewed_at is null)),
  -- رد بدون دلیل، خانواده را سردرگم می‌گذارد. همان قاعده اعلام پرداخت.
  constraint profile_change_rejected_has_reason
    check (state <> 'rejected' or reject_reason is not null),
  /*
   * تغییر بی‌تغییر، درخواست نیست.
   *
   * بی این، خانواده‌ای که فرم را باز و بی دست زدن ذخیره می‌کرد، یازده
   * درخواست بی‌معنی در صف مدیر می‌گذاشت و صف واقعی گم می‌شد.
   */
  constraint profile_change_actually_changes
    check (new_value is distinct from old_value)
);

create index profile_change_pending_idx
  on profile_change_request (center_id, requested_at) where state = 'pending';
create index profile_change_child_idx on profile_change_request (child_id, requested_at desc);

/*
 * یک درخواست باز برای هر میدان.
 *
 * وگرنه خانواده‌ای که سه بار نظرش عوض می‌شود، سه درخواست متناقض در صف
 * می‌گذارد و مدیر نمی‌داند کدام تازه‌تر است.
 */
create unique index profile_change_one_open_per_field
  on profile_change_request (child_id, field) where state = 'pending';

-- ------------------------------------------------------------
-- مقدار فعلی یک میدان
--
-- هم برای پر کردن فرم خانواده، هم برای ثبت old_value — تا مقدار پیش
-- از تغییر از کلاینت نیاید. کلاینت می‌تواند دروغ بگوید.
-- ------------------------------------------------------------
create or replace function app.profile_value(target uuid, field_key text)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  out_value text;
begin
  case field_key
    when 'first_name'  then select first_name  into out_value from child where id = target;
    when 'last_name'   then select last_name   into out_value from child where id = target;
    when 'birth_date'  then select birth_date::text into out_value from child where id = target;
    when 'national_id' then select national_id into out_value from child where id = target;

    when 'blood_type' then
      select blood_type into out_value from medical_profile where child_id = target;
    /*
     * آلرژی در پایگاه داده آرایه است و در رابط یک رشته با «،».
     * تبدیل اینجاست نه در کلاینت، تا هر دو سمت یک متن ببینند.
     */
    when 'allergies' then
      select coalesce(
        (select string_agg(value #>> '{}', '، ')
           from medical_profile m, jsonb_array_elements(m.allergies_json) value
          where m.child_id = target), '')
        into out_value;
    when 'chronic_conditions' then
      select chronic_conditions into out_value from medical_profile where child_id = target;
    when 'daily_medication' then
      select daily_medication into out_value from medical_profile where child_id = target;
    when 'doctor_name' then
      select doctor_name into out_value from medical_profile where child_id = target;
    when 'doctor_phone' then
      select doctor_phone into out_value from medical_profile where child_id = target;
    when 'insurance' then
      select insurance into out_value from medical_profile where child_id = target;

    else raise exception 'میدان «%» قابل ویرایش نیست.', field_key;
  end case;

  return out_value;
end;
$$;

-- ------------------------------------------------------------
-- ثبت درخواست تغییر، از سمت خانواده
--
-- old_value را خودِ تابع می‌خواند. هیچ ستونی اینجا عوض نمی‌شود.
-- ------------------------------------------------------------
create or replace function app.request_profile_change(
  target uuid,
  field_key text,
  value text
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre  uuid;
  current text;
  made    uuid;
begin
  if not exists (select 1 from profile_field where key = field_key) then
    raise exception 'میدان «%» قابل ویرایش نیست.', field_key;
  end if;

  select center_id into centre from child where id = target;
  if centre is null then
    raise exception 'کودک پیدا نشد.';
  end if;
  if not app.can_see_child(target) then
    raise exception 'این پرونده به شما مربوط نیست.';
  end if;

  current := app.profile_value(target, field_key);
  -- رشته خالی و خالی‌بودن یکی‌اند؛ وگرنه پاک کردن یک میدان، «تغییر
  -- بی‌تغییر» به حساب می‌آید و قید پایین ردش می‌کند.
  if nullif(btrim(coalesce(value, '')), '') is not distinct from nullif(btrim(coalesce(current, '')), '') then
    raise exception 'مقدار تازه با مقدار فعلی فرقی ندارد.';
  end if;

  -- درخواست باز قبلی برای همین میدان، جایش را به تازه می‌دهد.
  delete from profile_change_request
   where child_id = target and field = field_key and state = 'pending';

  insert into profile_change_request (
    center_id, child_id, field, old_value, new_value, requested_by
  )
  values (
    centre, target, field_key,
    nullif(btrim(coalesce(current, '')), ''),
    nullif(btrim(coalesce(value, '')), ''),
    app.current_account_id()
  )
  returning id into made;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(), 'profile_change_requested', 'child', target,
          jsonb_build_object('field', field_key));

  return made;
end;
$$;

-- ------------------------------------------------------------
-- تصمیم مدیر
--
-- تأیید، مقدار را می‌نویسد — با `case` صریح، نه SQL پویا: نام ستون
-- هرگز از داده کاربر ساخته نمی‌شود.
-- ------------------------------------------------------------
create or replace function app.decide_profile_change(
  request uuid,
  approve boolean,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  req profile_change_request;
begin
  select * into req from profile_change_request where id = request;
  if req.id is null then
    raise exception 'درخواست پیدا نشد.';
  end if;
  if req.state <> 'pending' then
    raise exception 'این درخواست قبلاً بررسی شده.';
  end if;
  if not app.is_manager() then
    raise exception 'تأیید تغییر پرونده فقط با مدیر است.';
  end if;

  if not approve then
    if nullif(btrim(coalesce(reason, '')), '') is null then
      raise exception 'رد درخواست بدون دلیل ممکن نیست.';
    end if;
    update profile_change_request
       set state = 'rejected', reviewed_by = app.current_account_id(),
           reviewed_at = now(), reject_reason = reason
     where id = request;
    return;
  end if;

  -- پرونده پزشکی ممکن است هنوز ساخته نشده باشد.
  insert into medical_profile (child_id, center_id)
  values (req.child_id, req.center_id)
  on conflict (child_id) do nothing;

  case req.field
    when 'first_name' then
      update child set first_name = req.new_value where id = req.child_id;
    when 'last_name' then
      update child set last_name = req.new_value where id = req.child_id;
    when 'birth_date' then
      update child set birth_date = req.new_value::date where id = req.child_id;
    when 'national_id' then
      update child set national_id = req.new_value where id = req.child_id;

    when 'blood_type' then
      update medical_profile set blood_type = req.new_value where child_id = req.child_id;
    when 'allergies' then
      update medical_profile
         set allergies_json = coalesce((
           select jsonb_agg(btrim(part))
             from unnest(string_to_array(coalesce(req.new_value, ''), '،')) part
            where btrim(part) <> ''
         ), '[]'::jsonb)
       where child_id = req.child_id;
    when 'chronic_conditions' then
      update medical_profile set chronic_conditions = req.new_value where child_id = req.child_id;
    when 'daily_medication' then
      update medical_profile set daily_medication = req.new_value where child_id = req.child_id;
    when 'doctor_name' then
      update medical_profile set doctor_name = req.new_value where child_id = req.child_id;
    when 'doctor_phone' then
      update medical_profile set doctor_phone = req.new_value where child_id = req.child_id;
    when 'insurance' then
      update medical_profile set insurance = req.new_value where child_id = req.child_id;

    else raise exception 'میدان «%» قابل اعمال نیست.', req.field;
  end case;

  update profile_change_request
     set state = 'approved', reviewed_by = app.current_account_id(), reviewed_at = now()
   where id = request;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (req.center_id, app.current_account_id(), 'profile_change_approved', 'child', req.child_id,
          jsonb_build_object('field', req.field));
end;
$$;

-- ------------------------------------------------------------
-- صف مدیر
--
-- میدان‌های ایمنی اول. تا تأیید نشوند، مربی مقدار قدیمی را می‌بیند و
-- آن فاصله همان چیزی است که باید کوتاه بماند.
-- ------------------------------------------------------------
create or replace function app.pending_profile_changes(centre uuid)
returns table (
  request_id uuid,
  child_id uuid,
  child_name text,
  field text,
  label text,
  old_value text,
  new_value text,
  safety_critical boolean,
  requested_at timestamptz
)
language sql
stable
as $$
  select r.id, r.child_id,
         (c.first_name || ' ' || c.last_name),
         r.field, f.label, r.old_value, r.new_value, f.safety_critical, r.requested_at
    from profile_change_request r
    join child c on c.id = r.child_id
    join profile_field f on f.key = r.field
   where r.center_id = centre and r.state = 'pending'
   order by f.safety_critical desc, r.requested_at
$$;

-- ------------------------------------------------------------
-- سیاست سطر-محور
-- ------------------------------------------------------------
alter table profile_field enable row level security;
alter table profile_field force row level security;
alter table profile_change_request enable row level security;
alter table profile_change_request force row level security;

-- فهرست میدان‌ها برای همه حساب‌های واردشده خواندنی است؛ نوشتنش نه.
create policy profile_field_read on profile_field for select using (true);

create policy profile_change_visible on profile_change_request
  for select using (
    center_id = app.current_center_id()
    and (app.is_manager() or child_id in (select app.current_child_ids()))
  );

/*
 * خانواده از راه تابع درخواست می‌دهد، نه با insert مستقیم.
 *
 * تابع است که old_value را از خود پایگاه داده می‌خواند؛ insert مستقیم
 * یعنی خانواده می‌تواند مقدار «قبلی» را هم خودش بنویسد و مدیر تغییری
 * را تأیید کند که هرگز آن نبوده.
 */
create policy profile_change_manager_write on profile_change_request
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());
