-- ============================================================
-- تست ماتریس دسترسی بخش ۳.۳ سند، از راه سیاست‌های سطر-محور.
--
-- سه قاعده سفت بخش ۳.۳ که باید اینجا ثابت شوند:
--   ۱. مربی هیچ‌گاه به داده مالی دسترسی ندارد.
--   ۲. رویداد متوسط یا بالا بدون تأیید مدیر به سرپرست نمی‌رسد.
--   ۳. سرپرست فقط کودک خودش را می‌بیند.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- نقش authenticated همان چیزی است که Supabase به کاربر واردشده می‌دهد.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public, app to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
grant select on auth.users to authenticated;

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if not ok then raise exception 'رد شد: %', label; end if;
  raise notice '  ✓ %', label;
end $$;

-- ── داده پایه: دو کلاس، سه کودک، یک مربی، یک مدیر، دو سرپرست ──
insert into center (id, name) values ('a0000000-0000-0000-0000-000000000001', 'مهد آفتاب');

insert into class (id, center_id, name) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', 'گل‌ها'),
  ('a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000001', 'ستاره‌ها');

insert into staff (id, center_id, first_name, last_name, role) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 'زهرا', '', 'teacher'),
  ('a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-000000000001', 'مدیر', '', 'manager');

insert into staff_class (staff_id, class_id) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000c1');

insert into child (id, center_id, class_id, first_name, last_name) values
  ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'سارا', 'ا.'),
  ('a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'امیر', 'ب.'),
  -- کودک کلاس دیگر. مربی گل‌ها نباید ببیندش (بخش ۵.۱۰).
  ('a0000000-0000-0000-0000-0000000000d3', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c2', 'نگین', 'پ.');

insert into guardian (id, center_id, full_name) values
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'مادر سارا'),
  -- سرپرست دوم سارا، بدون is_payer. بخش ۶.۵: بخش مالی را اصلاً نمی‌بیند.
  ('a0000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-000000000001', 'پدر سارا');

insert into child_guardian (child_id, guardian_id, center_id, is_payer) values
  ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-000000000001', false);

insert into auth.users (id, phone) values
  ('a0000000-0000-0000-0000-00000000ee01', '09120000001'),
  ('a0000000-0000-0000-0000-00000000ee02', '09120000002'),
  ('a0000000-0000-0000-0000-00000000ee03', '09120000003'),
  ('a0000000-0000-0000-0000-00000000ee04', '09120000004');

insert into user_account (id, center_id, phone, role, staff_id, guardian_id) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', '09120000001', 'teacher',  'a0000000-0000-0000-0000-0000000000f1', null),
  ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000001', '09120000002', 'manager',  'a0000000-0000-0000-0000-0000000000f2', null),
  ('a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000001', '09120000003', 'guardian', null, 'a0000000-0000-0000-0000-0000000000b1'),
  ('a0000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-000000000001', '09120000004', 'guardian', null, 'a0000000-0000-0000-0000-0000000000b2');

insert into active_account (auth_user_id, user_account_id) values
  ('a0000000-0000-0000-0000-00000000ee01', 'a0000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-00000000ee02', 'a0000000-0000-0000-0000-0000000000a2'),
  ('a0000000-0000-0000-0000-00000000ee03', 'a0000000-0000-0000-0000-0000000000a3'),
  ('a0000000-0000-0000-0000-00000000ee04', 'a0000000-0000-0000-0000-0000000000a4');

insert into fee_plan (id, center_id, title, amount) values
  ('a0000000-0000-0000-0000-00000000fe01', 'a0000000-0000-0000-0000-000000000001', 'شهریه ماهانه', 5000000);

insert into invoice (center_id, child_id, period, amount, due_date) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000d1', '1404-10', 5000000, '2026-01-20');

-- رویداد جدی، هنوز تأیید نشده. سرپرست نباید ببیندش.
insert into incident (id, center_id, child_id, occurred_at, type, severity, location, description) values
  ('a0000000-0000-0000-0000-00000000cc01', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-0000000000d1', now(), 'fever', 'medical_attention', 'classroom', 'تب بالا');
-- رویداد جزئی. مستقیم به سرپرست می‌رسد.
insert into incident (id, center_id, child_id, occurred_at, type, severity, location, minor_category) values
  ('a0000000-0000-0000-0000-00000000cc02', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-0000000000d1', now(), 'fall', 'minor', 'yard', 'fall_no_injury');

-- ورود به نقش کاربر واردشده
create or replace function login_as(auth_id uuid, phone text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', auth_id::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', auth_id, 'phone', phone)::text, false);
end $$;

\echo ''
\echo '── قاعده سفت ۱: مربی هیچ‌گاه به داده مالی دسترسی ندارد ──'
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee01', '09120000001');
do $$
begin
  perform assert((select count(*) from invoice) = 0,  'مربی هیچ صورتحسابی نمی‌بیند');
  perform assert((select count(*) from payment) = 0,  'مربی هیچ پرداختی نمی‌بیند');
  perform assert((select count(*) from fee_plan) = 0, 'مربی شهریه‌ها را نمی‌بیند');
end $$;

\echo ''
\echo '── بخش ۵.۱۰: مربی پرونده کودکان سایر کلاس‌ها را نمی‌بیند ──'
do $$
begin
  perform assert((select count(*) from child) = 2, 'مربی فقط دو کودک کلاس خودش را می‌بیند');
  perform assert(
    not exists (select 1 from child where id = 'a0000000-0000-0000-0000-0000000000d3'),
    'کودک کلاس دیگر برای مربی نامرئی است');
  perform assert((select count(*) from staff) = 0, 'مربی فهرست پرسنل را نمی‌بیند');
end $$;

\echo ''
\echo '── بخش ۶.۵: سرپرست غیرپرداخت‌کننده بخش مالی را نمی‌بیند ──'
reset role;
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee04', '09120000004');
do $$
begin
  perform assert((select count(*) from child) = 1, 'سرپرست دوم فقط کودک خودش را می‌بیند');
  perform assert((select count(*) from invoice) = 0, 'سرپرست بدون is_payer هیچ صورتحسابی نمی‌بیند');
end $$;

reset role;
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee03', '09120000003');
do $$
begin
  perform assert((select count(*) from invoice) = 1, 'سرپرست پرداخت‌کننده صورتحساب کودکش را می‌بیند');
end $$;

\echo ''
\echo '── قاعده سفت ۲: رویداد جدی بدون تأیید مدیر به سرپرست نمی‌رسد ──'
do $$
begin
  perform assert((select count(*) from incident) = 1, 'سرپرست فقط رویداد جزئی را می‌بیند');
  perform assert(
    not exists (select 1 from incident where id = 'a0000000-0000-0000-0000-00000000cc01'),
    'رویداد جدی تأییدنشده برای سرپرست نامرئی است');
end $$;

reset role;
update incident set manager_decision = 'send', approved_by = 'a0000000-0000-0000-0000-0000000000a2',
       approved_at = now(), parent_notified_at = now()
where id = 'a0000000-0000-0000-0000-00000000cc01';

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee03', '09120000003');
do $$
begin
  perform assert((select count(*) from incident) = 2, 'پس از تأیید مدیر، رویداد جدی به سرپرست می‌رسد');
end $$;

\echo ''
\echo '── بخش ۳.۲: دسترسی‌ها ترکیب نمی‌شوند ──'
reset role;
-- همان شماره مربی، این بار حساب سرپرست هم برایش ساخته می‌شود.
insert into guardian (id, center_id, full_name)
values ('a0000000-0000-0000-0000-0000000000b9', 'a0000000-0000-0000-0000-000000000001', 'زهرا، به‌عنوان مادر');
insert into child_guardian (child_id, guardian_id, center_id, is_payer)
values ('a0000000-0000-0000-0000-0000000000d3', 'a0000000-0000-0000-0000-0000000000b9', 'a0000000-0000-0000-0000-000000000001', true);
insert into user_account (id, center_id, phone, role, guardian_id)
values ('a0000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-000000000001', '09120000001', 'guardian', 'a0000000-0000-0000-0000-0000000000b9');

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee01', '09120000001');
do $$
begin
  -- حساب فعال هنوز حساب مربی است.
  perform assert((select count(*) from invoice) = 0,
    'با حساب مربی، داده مالیِ حسابِ سرپرستِ همان شماره دیده نمی‌شود');
  perform assert((select count(*) from user_account) = 2,
    'کاربر هر دو حساب شماره خودش را در صفحه انتخاب حساب می‌بیند');
end $$;

reset role;
update active_account set user_account_id = 'a0000000-0000-0000-0000-0000000000a9'
where auth_user_id = 'a0000000-0000-0000-0000-00000000ee01';

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee01', '09120000001');
do $$
begin
  perform assert((select count(*) from child) = 1,
    'پس از جابه‌جایی به حساب سرپرست، فقط کودک خودش دیده می‌شود');
  perform assert((select count(*) from invoice) = 0,
    'و کودک کلاس مربی‌گری‌اش دیگر دیده نمی‌شود');
end $$;

\echo ''
\echo '── جعل حساب فعال ──'
reset role;
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee01', '09120000001');
do $$
declare ok boolean := false;
begin
  begin
    -- تلاش برای نشاندن حساب مدیر، که شماره‌اش با توکن یکی نیست.
    update active_account set user_account_id = 'a0000000-0000-0000-0000-0000000000a2'
    where auth_user_id = 'a0000000-0000-0000-0000-00000000ee01';
    ok := not exists (
      select 1 from active_account
      where auth_user_id = 'a0000000-0000-0000-0000-00000000ee01'
        and user_account_id = 'a0000000-0000-0000-0000-0000000000a2');
  exception when others then
    ok := true;
  end;
  perform assert(ok, 'کاربر نمی‌تواند حسابی را که شماره‌اش نیست فعال کند');
end $$;

\echo ''
\echo '── بخش ۶.۶: پیامِ در صف، فقط برای فرستنده‌اش ──'
reset role;
/*
 * صف یک زمانِ تحویل است، نه برچسب.
 *
 * زیر کادرِ نوشتن به خانواده وعده داده می‌شود که پیامِ بیرون از ساعت
 * «صبح تحویل می‌شود». تا ارتقای ۰۰۴۰، سیاست سطر-محور فقط عضویت در
 * گفتگو را می‌سنجید — یعنی گیرنده همان لحظه می‌خواندش.
 *
 * اینجا با نقش authenticated سنجیده می‌شود، نه در rules.sql: ابرکاربر
 * از هر سیاستی رد می‌شود و آنجا این گزاره همیشه سبز می‌ماند.
 */
insert into conversation (id, center_id)
values ('a0000000-0000-0000-0000-00000000aa01', 'a0000000-0000-0000-0000-000000000001');
insert into conversation_member (conversation_id, center_id, user_account_id) values
  ('a0000000-0000-0000-0000-00000000aa01', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-0000000000a3'),
  ('a0000000-0000-0000-0000-00000000aa01', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-0000000000a1');

-- پیامی از خانواده که هنوز وقتِ تحویلش نرسیده.
insert into message (id, center_id, conversation_id, sender_id, body, sent_at, queued_until)
values ('a0000000-0000-0000-0000-00000000ab01', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-00000000aa01', 'a0000000-0000-0000-0000-0000000000a3',
        'سارا امشب تب داشت.', null, now() + interval '8 hours');

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee03', '09120000003');
do $$
begin
  perform assert(
    (select count(*) from message
      where id = 'a0000000-0000-0000-0000-00000000ab01') = 1,
    'فرستنده پیامِ در صفِ خودش را می‌بیند');
end $$;

reset role;
/*
 * حساب فعالِ ۰۹۱۲۰۰۰۰۰۰۱ در بخش ۳.۲ به حساب سرپرست جابه‌جا شد. برای
 * این بخش باید دوباره مربی باشد، وگرنه «گیرنده» اصلاً عضو گفتگو نیست
 * و گزاره به دلیل اشتباه سبز می‌شود.
 */
update active_account set user_account_id = 'a0000000-0000-0000-0000-0000000000a1'
where auth_user_id = 'a0000000-0000-0000-0000-00000000ee01';

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee01', '09120000001');
do $$
begin
  perform assert(
    (select count(*) from message
      where id = 'a0000000-0000-0000-0000-00000000ab01') = 0,
    'گیرنده پیامِ نرسیده را نمی‌بیند');
end $$;

reset role;
update message set queued_until = now() - interval '1 minute'
where id = 'a0000000-0000-0000-0000-00000000ab01';

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee01', '09120000001');
-- حساب فعالِ این شماره در بخش پیشین به سرپرست جابه‌جا شده بود.
do $$
begin
  perform assert(
    (select count(*) from message
      where id = 'a0000000-0000-0000-0000-00000000ab01') = 1,
    'و وقتِ تحویل که گذشت، می‌بیندش — بی آنکه کسی ستونی را عوض کند');
end $$;

\echo ''
\echo '── جداسازی دو مهد: هیچ سطری از مرز مرکز رد نمی‌شود ──'
reset role;

/*
 * بزرگ‌ترین وعدهٔ یک محصول چندمستأجری، و تا امروز آزموده‌نشده.
 *
 * این فایل تا اینجا فقط **یک** مرکز داشت. یعنی همهٔ گزاره‌های بالا
 * ثابت می‌کردند که مربی دادهٔ کلاس دیگر را نمی‌بیند و خانواده دادهٔ
 * کودک دیگر را — ولی هیچ‌کدام ثابت نمی‌کرد که مهد الف دادهٔ مهد ب را
 * نمی‌بیند. سیاست‌ها درست نوشته شده بودند؛ «درست نوشته شده» با «ثابت
 * شده» یکی نیست.
 *
 * نشت داده بین دو مهدکودک چیزی نیست که با عذرخواهی جمع شود.
 *
 * ── چرا جاروی خودکار، نه فهرست دستی ────────────────────────────
 *
 * شصت‌وشش جدول به `center_id` بسته‌اند و فردا شصت‌وهفتمی اضافه می‌شود.
 * فهرستِ دستی همان روز کهنه می‌شود و کسی خبردار نمی‌شود. این تست به‌جای
 * فهرست، `information_schema` را می‌خواند: هر جدولی که ستون `center_id`
 * داشته باشد خودبه‌خود آزموده می‌شود، حتی اگر فردا ساخته شود و کسی
 * یادش برود برایش سیاست بنویسد.
 */

-- ── مهد دوم، با پرونده‌های واقعی ──────────────────────────────
insert into center (id, name) values ('b0000000-0000-0000-0000-000000000001', 'مهد ستاره');

insert into class (id, center_id, name) values
  ('b0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-000000000001', 'شکوفه‌ها');

insert into staff (id, center_id, first_name, last_name, role) values
  ('b0000000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-000000000001', 'مربیِ', 'ستاره', 'teacher'),
  ('b0000000-0000-0000-0000-0000000000f2', 'b0000000-0000-0000-0000-000000000001', 'مدیرِ', 'ستاره', 'manager');

insert into staff_class (staff_id, class_id) values
  ('b0000000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-0000000000c1');

insert into child (id, center_id, class_id, first_name, last_name) values
  ('b0000000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-0000000000c1', 'کودکِ', 'ستاره');

insert into guardian (id, center_id, full_name) values
  ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001', 'مادرِ ستاره');

insert into child_guardian (child_id, guardian_id, center_id, is_payer) values
  ('b0000000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-0000000000b1',
   'b0000000-0000-0000-0000-000000000001', true);

insert into auth.users (id, phone) values
  ('b0000000-0000-0000-0000-00000000ee01', '09990000001'),
  ('b0000000-0000-0000-0000-00000000ee02', '09990000002');

insert into user_account (id, center_id, phone, role, staff_id) values
  ('b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001',
   '09990000001', 'teacher', 'b0000000-0000-0000-0000-0000000000f1'),
  ('b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-000000000001',
   '09990000002', 'manager', 'b0000000-0000-0000-0000-0000000000f2');

insert into active_account (auth_user_id, user_account_id) values
  ('b0000000-0000-0000-0000-00000000ee01', 'b0000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000ee02', 'b0000000-0000-0000-0000-0000000000a2');

-- جواهرات تاج: حضور، سلامت، پول، رخداد، گزارش، مدرک.
insert into attendance (center_id, child_id, date, check_in_at)
values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000d1',
        current_date, now());

insert into medical_profile (center_id, child_id, blood_type)
values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000d1', 'A+');

insert into invoice (center_id, child_id, period, amount, due_date)
values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000d1',
        '1404-10', 9999999, current_date + 10);

insert into incident (center_id, child_id, occurred_at, type, severity, location,
                      minor_category, description)
values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000d1',
        now(), 'fall', 'minor', 'yard', 'fall_no_injury', 'رازِ مهد ستاره');

insert into daily_report (center_id, child_id, date, teacher_note)
values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000d1',
        current_date, 'یادداشتِ مهد ستاره');

insert into staff_document (center_id, staff_id, kind, title, file_url, review)
values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000f1',
        'health_card', 'کارت بهداشتِ ستاره', 'x', 'approved');

/*
 * ۱. اول ثابت کنیم داده واقعاً هست.
 *
 * بی این، جاروی بعدی می‌تواند به دلیل غلط سبز شود: جدولی که اصلاً
 * سطری ندارد، «نشت نمی‌کند» چون چیزی برای نشت ندارد.
 */
set role authenticated;
select login_as('b0000000-0000-0000-0000-00000000ee02', '09990000002');
do $$
begin
  perform assert((select count(*) from child) = 1, 'مدیر مهد دوم، کودک خودش را می‌بیند');
  perform assert((select count(*) from invoice) = 1, 'و صورتحساب خودش را');
  perform assert((select count(*) from incident) = 1, 'و رخداد خودش را');
  perform assert((select count(*) from daily_report) = 1, 'و گزارش خودش را');
  perform assert((select count(*) from staff_document) = 1, 'و مدرک مربی خودش را');
  perform assert(
    app.current_center_id() = 'b0000000-0000-0000-0000-000000000001',
    'و مرکز فعالش، مهد خودش است');
end $$;

/*
 * ۲. جاروی خودکار: مدیرِ مهد اول، هیچ سطری از مهد دوم نمی‌بیند.
 *
 * مدیر پردسترس‌ترین نقش است؛ اگر او نبیند، هیچ‌کس نمی‌بیند.
 */
reset role;
update active_account set user_account_id = 'a0000000-0000-0000-0000-0000000000a2'
where auth_user_id = 'a0000000-0000-0000-0000-00000000ee02';

set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee02', '09120000002');
do $$
declare
  t record;
  leaked integer;
  seen  integer := 0;
  bad   text := '';
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables x
        on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'center_id'
       and x.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    execute format(
      'select count(*) from public.%I where center_id = %L',
      t.table_name, 'b0000000-0000-0000-0000-000000000001'
    ) into leaked;
    seen := seen + 1;
    if leaked > 0 then
      bad := bad || t.table_name || '(' || leaked || ') ';
    end if;
  end loop;

  perform assert(seen >= 60, format('جارو روی %s جدولِ مرکزدار اجرا شد', seen));
  perform assert(bad = '', format('هیچ سطری از مهد دوم دیده نمی‌شود — نشتی: %s', bad));
end $$;

/*
 * ۳. و برعکس: مدیر مهد دوم هم چیزی از مهد اول نمی‌بیند.
 *
 * یک‌طرفه آزمودن یعنی نصف مرز آزموده نشده.
 */
reset role;
set role authenticated;
select login_as('b0000000-0000-0000-0000-00000000ee02', '09990000002');
do $$
declare
  t record;
  leaked integer;
  bad text := '';
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables x
        on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'center_id'
       and x.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    execute format(
      'select count(*) from public.%I where center_id = %L',
      t.table_name, 'a0000000-0000-0000-0000-000000000001'
    ) into leaked;
    if leaked > 0 then bad := bad || t.table_name || '(' || leaked || ') '; end if;
  end loop;

  perform assert(bad = '', format('و مهد دوم هم چیزی از مهد اول نمی‌بیند — نشتی: %s', bad));
end $$;

/*
 * ۴. نوشتن هم از مرز رد نمی‌شود.
 *
 * ندیدن کافی نیست: مدیری که بتواند کودکی در مهد دیگری بنویسد، همان‌قدر
 * خطرناک است — حتی اگر بعدش نتواند بخواندش.
 */
reset role;
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee02', '09120000002');
do $$
declare ok boolean := false;
begin
  begin
    insert into child (center_id, class_id, first_name, last_name)
    values ('b0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-0000000000c1', 'کودکِ', 'قاچاقی');
    -- اگر درج رد نشد، شاید سیاست نوشتن ندارد. خودِ نبودِ سطر هم جواب است.
    ok := not exists (
      select 1 from child
       where center_id = 'b0000000-0000-0000-0000-000000000001'
         and last_name = 'قاچاقی');
  exception when others then
    ok := true;
  end;
  perform assert(ok, 'مدیر مهد اول نمی‌تواند در مهد دوم کودک ثبت کند');
end $$;

reset role;
do $$
begin
  -- و اگر از راهِ ابرکاربر نگاه کنیم، واقعاً چیزی ننشسته.
  perform assert(
    (select count(*) from child
      where center_id = 'b0000000-0000-0000-0000-000000000001') = 1,
    'و مهد دوم همان یک کودک خودش را دارد، نه بیشتر');
end $$;

\echo ''
\echo '── سکوی چندمهدی: سوپرادمین و قفل اشتراک ──'
reset role;

/*
 * اپراتور سکو. بیرون از مدل مستأجر — نه `user_account` دارد نه
 * `active_account`.
 */
insert into auth.users (id, phone) values
  ('c0000000-0000-0000-0000-00000000ee01', '09350000001');
insert into platform_admin (auth_user_id, full_name, phone) values
  ('c0000000-0000-0000-0000-00000000ee01', 'پشتیبانی محصول', '09350000001');

set role authenticated;
select login_as('c0000000-0000-0000-0000-00000000ee01', '09350000001');
do $$
declare
  t record;
  leaked integer;
  bad text := '';
begin
  perform assert(app.is_platform_admin(), 'اپراتور شناخته می‌شود');

  -- هر دو مرکز را می‌بیند. این کارِ اوست.
  perform assert((select count(*) from center) = 2, 'و هر دو مهد را در فهرستش دارد');

  /*
   * و اینجا خط قرمز.
   *
   * سوپرادمین مالکِ سکوست، نه مالکِ پرونده‌ها. همان جاروی تست جداسازی،
   * این بار از سمت اپراتور: هیچ جدولِ مرکزداری نباید حتی یک سطر بدهد.
   *
   * جدول `center` خودش کنار گذاشته می‌شود — دیدنش دقیقاً کارِ اوست.
   */
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables x
        on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'center_id'
       and x.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    execute format('select count(*) from public.%I', t.table_name) into leaked;
    if leaked > 0 then bad := bad || t.table_name || '(' || leaked || ') '; end if;
  end loop;

  perform assert(bad = '', format('سوپرادمین هیچ سطری از دادهٔ مهدها نمی‌بیند — نشتی: %s', bad));

  -- ولی شمارها را می‌بیند، که برای گرداندن سکو لازم است.
  perform assert(
    (select children from app.platform_overview()
      where center_id = 'b0000000-0000-0000-0000-000000000001') = 1,
    'شمارِ کودکانِ هر مهد را می‌بیند، نه خودِ کودکان را');
end $$;

/*
 * ساختن مهد تازه — کاری که تا امروز هیچ راهی نداشت.
 */
do $$
declare made record;
begin
  select * into made from app.create_center('مهد بهار', 'نگار احمدی', '09360000001', 'ماهانه', null);
  perform assert(made.center_id is not null, 'اپراتور مهد تازه می‌سازد');
  perform assert(made.manager_account_id is not null, 'و مدیر اولش با همان تراکنش ساخته می‌شود');
  perform assert(
    (select count(*) from center) = 3, 'و مهد تازه در فهرست می‌نشیند');
end $$;

reset role;
do $$
declare centre uuid;
begin
  select id into centre from center where name = 'مهد بهار';
  /*
   * مهدِ تازه از همان لحظه پیش‌فرض‌هایش را دارد: تریگرهای موجود روی
   * `insert into center` می‌نشینند.
   */
  perform assert(
    (select count(*) from activity_corner where center_id = centre) = 8,
    'مهد تازه هشت گوشهٔ فعالیت پیش‌فرض دارد');
  perform assert(
    (select count(*) from staff_document_requirement where center_id = centre) = 4,
    'و فهرست مدارک لازمش را');
  perform assert(
    (select count(*) from staff where center_id = centre and role = 'manager') = 1,
    'و یک مدیر');
end $$;

/*
 * کسی جز اپراتور نمی‌تواند مهد بسازد یا اشتراک را دست بزند.
 */
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee02', '09120000002');
do $$
declare ok boolean := false;
begin
  begin
    perform app.create_center('مهد قاچاقی', 'کسی', '09370000001', null, null);
  exception when others then ok := true;
  end;
  perform assert(ok, 'مدیر مهد نمی‌تواند مهد تازه بسازد');

  ok := false;
  begin
    perform app.set_center_licence('a0000000-0000-0000-0000-000000000001', 'رایگان', null);
  exception when others then ok := true;
  end;
  perform assert(ok, 'و اشتراک خودش را هم تمدید نمی‌کند');
end $$;

/*
 * ── قفل اشتراک ────────────────────────────────────────────────
 *
 * مهدی که تسویه نکرده، هیچ سطری نمی‌بیند — ولی باید بتواند بفهمد چرا.
 */
reset role;
set role authenticated;
select login_as('c0000000-0000-0000-0000-00000000ee01', '09350000001');
do $$
begin
  perform app.set_center_licence(
    'a0000000-0000-0000-0000-000000000001', 'ماهانه', current_date - 1);
end $$;

reset role;
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee02', '09120000002');
do $$
declare line record;
begin
  perform assert((select count(*) from child) = 0, 'مهدِ منقضی هیچ کودکی نمی‌بیند');
  perform assert((select count(*) from invoice) = 0, 'و هیچ صورتحسابی');
  perform assert(app.current_center_id() is null, 'و مرکز جاری‌اش تهی می‌شود');

  /*
   * ولی ردیف خودش را می‌بیند و می‌داند چرا.
   *
   * بی این، اپ صفحهٔ خالیِ بی‌توضیح نشان می‌داد و مدیر فکر می‌کرد
   * داده‌هایش پاک شده.
   */
  select * into line from app.my_centre_licence();
  perform assert(line.licence_active = false, 'ولی می‌داند اشتراکش تمام شده');
  perform assert(line.name = 'مهد آفتاب', 'و نام مهد خودش را می‌خواند');
end $$;

-- و با تمدید، همه‌چیز برمی‌گردد.
reset role;
set role authenticated;
select login_as('c0000000-0000-0000-0000-00000000ee01', '09350000001');
do $$
begin
  perform app.set_center_licence('a0000000-0000-0000-0000-000000000001', 'ماهانه', null);
end $$;

reset role;
set role authenticated;
select login_as('a0000000-0000-0000-0000-00000000ee02', '09120000002');
do $$
begin
  perform assert((select count(*) from child) = 3, 'با تمدید، داده برمی‌گردد — پاک نشده بود');
end $$;

/*
 * آخرین روزِ اشتراک، روزِ کاملی است.
 *
 * قطع کردن وسط روز با ما کاری نمی‌کند و با آن مهد همه‌کار.
 */
reset role;
do $$
begin
  perform assert(
    app.center_licence_active('a0000000-0000-0000-0000-000000000001', current_date),
    'اشتراک بی‌تاریخ، همیشه برقرار است');
  update center set active_until = current_date
   where id = 'a0000000-0000-0000-0000-000000000001';
  perform assert(
    app.center_licence_active('a0000000-0000-0000-0000-000000000001', current_date),
    'و آخرین روزِ اشتراک، روزِ کاملی است');
  update center set active_until = null
   where id = 'a0000000-0000-0000-0000-000000000001';
end $$;

reset role;
\echo ''
\echo 'ماتریس دسترسی پاس شد.'
