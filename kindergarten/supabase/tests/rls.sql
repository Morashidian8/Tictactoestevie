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

insert into staff (id, center_id, full_name, role) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 'زهرا', 'teacher'),
  ('a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-000000000001', 'مدیر', 'manager');

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

reset role;
\echo ''
\echo 'ماتریس دسترسی پاس شد.'
