-- ============================================================
-- مشخصات مربی — نام، سن، تماس، سکونت، رزومه
-- ============================================================
--
-- تا اینجا از یک مربی فقط سه چیز می‌دانستیم: یک نام کامل، یک شماره
-- تلفن، و نقشش. پرونده پرسنلیِ مهدکودک این نیست. بازرس بهزیستی رزومه
-- و مدرک و کد ملی می‌خواهد؛ مدیری که شب باید به مربی زنگ بزند نشانی و
-- شماره می‌خواهد.
--
-- ── سه تصمیم ────────────────────────────────────────────────
--
-- الف) **نام دو تکه می‌شود.** `full_name` می‌ماند، ولی دیگر نوشتنی
--      نیست: ستون تولیدشده از نام و نام خانوادگی است. جدول `child` از
--      روز اول دو تکه بود و هیچ‌وقت مشکلِ «سعید رضایی» در برابر «سعید
--      رضایی » را نداشت. اگر هر دو را نوشتنی می‌گذاشتیم، دو جا یک
--      حقیقت می‌شد — همان خطایی که این هفته در جمع صورتحساب گرفتیم.
--
-- ب) **سن ذخیره نمی‌شود، تاریخ تولد می‌شود.** سنِ ذخیره‌شده هر سال
--      یک بار بی‌صدا غلط می‌شود.
--
-- ج) **رزومه متن آزاد است، نه سیاهه امتیاز.** خط قرمز ۱۰: هیچ نمره،
--      رتبه یا مقایسه‌ای بین مربیان. اینجا هم «سابقه»ی عددی نمی‌سازیم
--      که فردا مرتب‌سازی‌پذیر شود.
-- ============================================================

/*
 * `birth_date`، `national_id`، `education`، `photo_url` و شماره
 * اضطراری از مهاجرت ۰۰۲۲ هستند. هیچ‌کدام تا امروز راهی برای پر شدن
 * نداشتند — ستون بی‌فرم، ستون خالی است.
 */
alter table staff
  add column first_name text,
  add column last_name  text,
  add column address    text,
  add column resume     text;

/*
 * تکه کردن نام‌های موجود: تا اولین فاصله نام، بقیه نام خانوادگی.
 * نامی که فاصله ندارد، همه‌اش نام است و نام خانوادگی خالی می‌ماند —
 * که بهتر از حدس زدن است.
 */
update staff
   set first_name = case
         when position(' ' in btrim(full_name)) > 0
           then substr(btrim(full_name), 1, position(' ' in btrim(full_name)) - 1)
         else btrim(full_name)
       end,
       last_name = case
         when position(' ' in btrim(full_name)) > 0
           then btrim(substr(btrim(full_name), position(' ' in btrim(full_name)) + 1))
         else ''
       end;

alter table staff
  alter column first_name set not null,
  alter column last_name  set not null;

alter table staff drop column full_name;

alter table staff
  add column full_name text
  generated always as (btrim(first_name || ' ' || last_name)) stored;

alter table staff
  add constraint staff_first_name_len check (length(btrim(first_name)) between 1 and 60),
  add constraint staff_last_name_len  check (length(last_name) <= 60),
  add constraint staff_national_id_shape
    check (national_id is null or national_id ~ '^[0-9]{10}$'),
  add constraint staff_education_len check (education is null or length(education) <= 200),
  /*
   * مربیِ سه ساله یا صدوبیست ساله یعنی تاریخ اشتباه تایپ شده. قید
   * اجازه ثبتش را نمی‌دهد تا سالِ بعد کسی به عددِ سن تکیه نکند.
   */
  add constraint staff_birth_sane
    check (birth_date is null or birth_date between current_date - interval '90 years'
                                              and current_date - interval '15 years'),
  add constraint staff_address_len check (address is null or length(address) <= 400),
  add constraint staff_resume_len  check (resume  is null or length(resume)  <= 4000);

-- ------------------------------------------------------------
-- فهرست بسته میدان‌های پرونده مربی
--
-- همان الگوی `profile_field` کودک: فهرست **داده** است نه کد، تا فرم
-- از روی همین ساخته شود و تابع اعمال هیچ‌وقت نام ستون را از ورودی
-- کاربر نسازد.
--
-- `role` و `active` و کلاس عمداً نیستند: نقش و دسترسی جای دیگری
-- تصمیم خودشان را دارند (بخش ۷.۴) و از راه یک فرم مشخصات عوض نمی‌شوند.
-- ------------------------------------------------------------
create table staff_field (
  key text primary key,
  label text not null,
  /* چطور در فرم گرفته می‌شود: خط، متن بلند، تاریخ، شماره. */
  input text not null,
  sort_order integer not null default 0,

  constraint staff_field_input_known check (input in ('line', 'text', 'date', 'digits'))
);

insert into staff_field (key, label, input, sort_order) values
  ('first_name',      'نام',                'line',   1),
  ('last_name',       'نام خانوادگی',       'line',   2),
  ('birth_date',      'تاریخ تولد',         'date',   3),
  ('national_id',     'کد ملی',             'digits', 4),
  ('phone',           'شماره تماس',         'digits', 5),
  ('address',         'آدرس سکونت',         'text',   6),
  ('education',       'تحصیلات',            'line',   7),
  ('resume',          'سوابق کاری',         'text',   8),
  ('emergency_name',  'تماس اضطراری — نام', 'line',   9),
  ('emergency_phone', 'تماس اضطراری — شماره', 'digits', 10);

-- ------------------------------------------------------------
-- خواندن یک میدان
-- ------------------------------------------------------------
create or replace function app.staff_value(target uuid, field_key text)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  out_value text;
begin
  select case field_key
           when 'first_name'      then s.first_name
           when 'last_name'       then s.last_name
           when 'birth_date'      then s.birth_date::text
           when 'national_id'     then s.national_id
           when 'phone'           then s.phone
           when 'address'         then s.address
           when 'education'       then s.education
           when 'resume'          then s.resume
           when 'emergency_name'  then s.emergency_name
           when 'emergency_phone' then s.emergency_phone
         end
    into out_value
    from staff s
   where s.id = target and s.center_id = app.current_center_id();

  return out_value;
end;
$$;

-- ------------------------------------------------------------
-- ویرایش، فقط با مدیر
--
-- صف تأیید ندارد — مانند ۰۰۳۲، مدیر خودش تأییدکننده است. ولی ردِ پا
-- دارد: پرونده پرسنلی چیزی است که در دعوای کاری به آن استناد می‌شود.
-- ------------------------------------------------------------
create or replace function app.edit_staff_field(
  target uuid,
  field_key text,
  value text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid;
  before text;
  clean  text;
begin
  if not app.is_manager() then
    raise exception 'ویرایش پرونده مربی فقط با مدیر است.';
  end if;
  if not exists (select 1 from staff_field where key = field_key) then
    raise exception 'میدان «%» قابل ویرایش نیست.', field_key;
  end if;

  select center_id into centre from staff where id = target;
  if centre is null or centre <> app.current_center_id() then
    raise exception 'مربی پیدا نشد.';
  end if;

  before := app.staff_value(target, field_key);
  clean  := nullif(btrim(coalesce(value, '')), '');

  /* `case` صریح، نه SQL پویا. نام ستون از داده کاربر ساخته نمی‌شود. */
  case field_key
    when 'first_name' then
      if clean is null then raise exception 'نام مربی خالی نمی‌ماند.'; end if;
      update staff set first_name = clean, updated_at = now() where id = target;
    when 'last_name' then
      update staff set last_name = coalesce(clean, ''), updated_at = now() where id = target;
    when 'birth_date' then
      update staff set birth_date = clean::date, updated_at = now() where id = target;
    when 'national_id' then
      update staff set national_id = clean, updated_at = now() where id = target;
    when 'phone' then
      update staff set phone = clean, updated_at = now() where id = target;
    when 'address' then
      update staff set address = clean, updated_at = now() where id = target;
    when 'education' then
      update staff set education = clean, updated_at = now() where id = target;
    when 'resume' then
      update staff set resume = clean, updated_at = now() where id = target;
    when 'emergency_name' then
      update staff set emergency_name = clean, updated_at = now() where id = target;
    when 'emergency_phone' then
      update staff set emergency_phone = clean, updated_at = now() where id = target;
    else raise exception 'میدان «%» قابل اعمال نیست.', field_key;
  end case;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(), 'staff_edited', 'staff', target,
          jsonb_build_object('field', field_key, 'from', before, 'to', clean));
end;
$$;

-- ------------------------------------------------------------
-- افزودن یک مربی تازه
--
-- تا امروز هیچ راهی در اپ نبود: ردیف `staff` فقط با دست در پایگاه
-- داده ساخته می‌شد. مدیری که مربی تازه استخدام کرده، همان روز اول
-- به آن نیاز دارد.
-- ------------------------------------------------------------
create or replace function app.add_staff(
  first_name text,
  last_name text,
  staff_role app.staff_role,
  phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid := app.current_center_id();
  made   uuid;
begin
  if not app.is_manager() then
    raise exception 'افزودن مربی فقط با مدیر است.';
  end if;
  if nullif(btrim(coalesce(first_name, '')), '') is null then
    raise exception 'نام مربی لازم است.';
  end if;

  insert into staff (center_id, first_name, last_name, role, phone)
  values (centre, btrim(first_name), btrim(coalesce(last_name, '')), staff_role,
          nullif(btrim(coalesce(phone, '')), ''))
  returning id into made;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(), 'staff_added', 'staff', made,
          jsonb_build_object('role', staff_role));

  return made;
end;
$$;

-- ------------------------------------------------------------
-- دسترسی
--
-- `staff_field` فهرست برچسب‌هاست و رازی در آن نیست؛ هر کاربر واردشده
-- می‌خواندش تا فرم ساخته شود. نوشتن در آن با هیچ نقشی نیست.
-- ------------------------------------------------------------
alter table staff_field enable row level security;

create policy staff_field_read on staff_field
  for select using (app.current_account_id() is not null);
