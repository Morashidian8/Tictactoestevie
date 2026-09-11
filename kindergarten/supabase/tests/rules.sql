-- ============================================================
-- تست قواعد سفت سند، مستقیم روی دیتابیس.
--
-- هر قاعده‌ای که سند «قابل رد شدن نیست» می‌نامد باید اینجا یک تست داشته
-- باشد. رابط کاربری دور زدنی است؛ این‌ها نه.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if not ok then raise exception 'رد شد: %', label; end if;
  raise notice '  ✓ %', label;
end $$;

-- تلاشی که باید شکست بخورد. اگر نخورد، قاعده بسته نیست.
create or replace function assert_rejects(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  ✓ % (%)', label, left(sqlerrm, 60);
    return;
  end;
  raise exception 'رد شد: % — عملیات باید رد می‌شد ولی موفق شد', label;
end $$;

-- ── داده پایه ────────────────────────────────────────────────
insert into center (id, name, group_photo_policy)
values ('11111111-1111-1111-1111-111111111111', 'مهد آفتاب', 'with_consent');

insert into center (id, name) values ('22222222-2222-2222-2222-222222222222', 'مهد ستاره');

insert into class (id, center_id, name) values
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'گل‌ها'),
  ('c2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'ستاره‌ها');

insert into staff (id, center_id, full_name, role) values
  ('51111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'زهرا م.', 'teacher');

insert into child (id, center_id, class_id, first_name, last_name) values
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'سارا', 'ا.'),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'امیر', 'ب.');

insert into guardian (id, center_id, full_name) values
  ('91111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'مادر سارا'),
  ('92222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'پدر سارا');

insert into child_guardian (child_id, guardian_id, center_id, is_payer) values
  ('d1111111-1111-1111-1111-111111111111', '91111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', true);

\echo '── بخش ۳.۲: یک شماره، چند حساب ──'
do $$
begin
  insert into user_account (center_id, phone, role, staff_id)
  values ('11111111-1111-1111-1111-111111111111', '09120000001', 'teacher',
          '51111111-1111-1111-1111-111111111111');
  insert into user_account (center_id, phone, role, guardian_id)
  values ('11111111-1111-1111-1111-111111111111', '09120000001', 'guardian',
          '91111111-1111-1111-1111-111111111111');
  perform assert(true, 'یک شماره می‌تواند هم حساب مربی داشته باشد هم سرپرست');
end $$;

do $$
begin
  perform assert_rejects($x$
    insert into user_account (center_id, phone, role, staff_id)
    values ('11111111-1111-1111-1111-111111111111', '09120000001', 'teacher',
            '51111111-1111-1111-1111-111111111111')
  $x$, 'شماره و نقش در یک مرکز تکرار نمی‌شود');
end $$;

do $$
declare other_staff uuid;
begin
  insert into staff (center_id, full_name, role)
  values ('22222222-2222-2222-2222-222222222222', 'زهرا م.', 'teacher') returning id into other_staff;
  insert into user_account (center_id, phone, role, staff_id)
  values ('22222222-2222-2222-2222-222222222222', '09120000001', 'teacher', other_staff);
  perform assert(true, 'همان شماره می‌تواند مربی مهد دوم هم باشد');
end $$;

do $$
begin
  perform assert_rejects($x$
    insert into user_account (center_id, phone, role, staff_id)
    values ('11111111-1111-1111-1111-111111111111', '09120000009', 'manager',
            '51111111-1111-1111-1111-111111111111')
  $x$, 'نقش حساب با نقش ردیف پرسنل باید یکی باشد');
end $$;

\echo ''
\echo '── بخش ۵.۹: قفل گزارش پس از ارسال ──'
do $$
declare rid uuid;
begin
  insert into daily_report (center_id, child_id, date, teacher_note)
  values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
          '2026-01-04', 'یادداشت اول')
  returning id into rid;

  update daily_report set teacher_note = 'ویرایش پیش از ارسال' where id = rid;
  perform assert(true, 'پیش از ارسال، گزارش ویرایش می‌شود');

  update daily_report set sent_at = now(), locked_at = now(), status = 'sent' where id = rid;

  perform assert_rejects(
    format('update daily_report set teacher_note = ''ویرایش ممنوع'' where id = %L', rid),
    'پس از قفل، ویرایش گزارش رد می‌شود');

  insert into daily_report_amendment (center_id, daily_report_id, text)
  values ('11111111-1111-1111-1111-111111111111', rid, 'اصلاحیه');
  perform assert(
    (select status from daily_report where id = rid) = 'amended',
    'اصلاحیه پذیرفته می‌شود و وضعیت را amended می‌کند');
end $$;

\echo ''
\echo '── بخش ۵.۹: «کامل» یعنی غذا و خواب و هر سه بازه خلق ──'
do $$
declare rid uuid;
begin
  insert into daily_report (center_id, child_id, date, nap_start,
                            mood_morning, mood_noon, mood_afternoon)
  values ('11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222',
          '2026-01-04', '13:00', 'good', 'good', 'restless')
  returning id into rid;

  perform assert((select status from daily_report where id = rid) = 'draft',
                 'بدون ثبت ناهار، گزارش ناقص می‌ماند');

  insert into meal_log (center_id, daily_report_id, meal_type, amount)
  values ('11111111-1111-1111-1111-111111111111', rid, 'lunch', 'most');

  perform assert((select status from daily_report where id = rid) = 'complete',
                 'با ثبت ناهار، گزارش کامل می‌شود');
end $$;

\echo ''
\echo '── بخش ۵.۵ و ۶.۶: قواعد انتشار عکس ──'
do $$
declare pid uuid;
begin
  insert into photo (id, center_id, class_id, date, url, is_group)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
          'c1111111-1111-1111-1111-111111111111', '2026-01-04', '/p/1.webp', true)
  returning id into pid;

  perform assert_rejects(
    format('update photo set status = ''published'', published_at = now() where id = %L', pid),
    'عکس بدون تگ منتشر نمی‌شود');

  insert into photo_tag (photo_id, child_id, center_id) values
    (pid, 'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
    (pid, 'd2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');

  perform assert_rejects(
    format('update photo set status = ''published'', published_at = now() where id = %L', pid),
    'عکس گروهی بدون رضایت همه کودکان منتشر نمی‌شود');

  insert into consent (center_id, child_id, type, granted_at) values
    ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'photo_group_publish', now()),
    ('11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222', 'photo_group_publish', now());

  update photo set status = 'published', published_at = now() where id = pid;
  perform assert(true, 'با رضایت همه کودکان تگ‌خورده، عکس گروهی منتشر می‌شود');
end $$;

\echo ''
\echo '── بخش ۵.۸: خروج فقط با فرد مجاز ──'
do $$
begin
  perform assert_rejects($x$
    insert into attendance (center_id, child_id, date, check_in_at, check_out_at,
                            pickup_method, picked_up_by_guardian_id)
    values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
            '2026-01-05', now(), now(), 'guardian', '92222222-2222-2222-2222-222222222222')
  $x$, 'سرپرستی که در فهرست کودک نیست نمی‌تواند تحویل بگیرد');

  perform assert_rejects($x$
    insert into attendance (center_id, child_id, date, check_in_at, check_out_at)
    values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
            '2026-01-06', now(), now())
  $x$, 'خروج بدون روش تحویل ثبت نمی‌شود');

  insert into attendance (center_id, child_id, date, check_in_at, check_out_at,
                          pickup_method, picked_up_by_guardian_id)
  values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
          '2026-01-07', now(), now(), 'guardian', '91111111-1111-1111-1111-111111111111');
  perform assert(true, 'سرپرست مجاز می‌تواند تحویل بگیرد');
end $$;

do $$
begin
  perform assert_rejects($x$
    insert into child_guardian (child_id, guardian_id, center_id, restricted, can_pickup)
    values ('d2222222-2222-2222-2222-222222222222', '92222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', true, true)
  $x$, 'سرپرست محدودشده هرگز can_pickup نمی‌گیرد (بخش ۶.۵)');
end $$;

\echo ''
\echo '── بخش ۵.۶: رویداد ──'
do $$
begin
  perform assert_rejects($x$
    insert into incident (center_id, child_id, occurred_at, type, severity, location, minor_category)
    values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
            now(), 'conflict', 'minor', 'yard', 'verbal_dispute')
  $x$, 'درگیری هرگز جزئی نیست، حتی کلامی');
end $$;

do $$
declare iid uuid;
begin
  insert into incident (center_id, child_id, occurred_at, type, severity, location,
                        minor_category, photo_url, description)
  values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
          '2026-01-04 10:00+00', 'fall', 'minor', 'yard', 'surface_scratch',
          '/p/x.webp', 'متن مربی')
  returning id into iid;

  perform assert((select severity from incident where id = iid) = 'notify_parent'
             and (select escalation_reason from incident where id = iid) = 'photo_attached',
    'عکس ضمیمه، شدت را خودکار بالا می‌برد');

  perform assert((select original_description from incident where id = iid) = 'متن مربی',
    'متن اولیه مربی ثبت می‌شود');

  update incident set description = 'ویرایش مدیر' where id = iid;
  perform assert((select original_description from incident where id = iid) = 'متن مربی',
    'ویرایش مدیر متن اولیه مربی را عوض نمی‌کند');
end $$;

do $$
declare n integer;
begin
  insert into incident (center_id, child_id, occurred_at, type, severity, location, minor_category)
  values
    ('11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222', '2026-01-01 09:00+00', 'fall', 'minor', 'yard', 'fall_no_injury'),
    ('11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222', '2026-01-02 09:00+00', 'fall', 'minor', 'yard', 'fall_no_injury'),
    ('11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222', '2026-01-03 09:00+00', 'other', 'minor', 'classroom', 'food_spill');

  insert into incident (center_id, child_id, occurred_at, type, severity, location, minor_category)
  values ('11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222',
          '2026-01-04 09:00+00', 'fall', 'minor', 'yard', 'fall_no_injury');

  perform assert(
    (select severity from incident
     where child_id = 'd2222222-2222-2222-2222-222222222222'
       and occurred_at = '2026-01-04 09:00+00') = 'notify_parent',
    'بیش از دو رویداد جزئی در ۷ روز، شدت را بالا می‌برد');
end $$;

do $$
begin
  perform assert_rejects($x$
    insert into incident (center_id, child_id, occurred_at, type, severity, location,
                          parent_notified_at)
    values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
            now(), 'fever', 'medical_attention', 'classroom', now())
  $x$, 'رویداد جدی بدون تأیید مدیر به سرپرست اطلاع داده نمی‌شود');
end $$;

\echo ''
\echo '── بخش ۱۵.۳: تعطیلی ──'
do $$
begin
  perform assert_rejects($x$
    insert into closure (center_id, date, type, reason, message_text)
    values ('11111111-1111-1111-1111-111111111111', '2026-01-10', 'delayed_opening', 'weather', 'متن')
  $x$, 'تأخیر در بازگشایی بدون ساعت بازگشایی ثبت نمی‌شود');

  insert into closure (center_id, date, type, reason, message_text, reopen_at)
  values ('11111111-1111-1111-1111-111111111111', '2026-01-10', 'delayed_opening', 'weather', 'متن', '10:00');
  perform assert(true, 'تأخیر با ساعت بازگشایی ثبت می‌شود');
end $$;

\echo ''
\echo 'همه قواعد سفت پاس شدند.'

\echo ''
\echo '── بخش ۵.۹: ارسال خودکار ──'
do $$
declare
  rid uuid;
  sent integer;
begin
  update center set auto_send_report_at = '17:30'
  where id = '11111111-1111-1111-1111-111111111111';

  insert into daily_report (center_id, child_id, date, teacher_note)
  values ('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
          (now() at time zone 'Asia/Tehran')::date, 'گزارش ناقص امروز')
  returning id into rid;

  -- پیش از ساعت مقرر، چیزی فرستاده نمی‌شود.
  select coalesce(sum(s.sent), 0) into sent
  from app.auto_send_due_reports(
    ((now() at time zone 'Asia/Tehran')::date + time '09:00') at time zone 'Asia/Tehran'
  ) s;
  perform assert(sent = 0, 'پیش از ساعت تنظیم‌شده، ارسال خودکار کاری نمی‌کند');

  -- پس از ساعت مقرر، ناقص هم فرستاده می‌شود.
  select coalesce(sum(s.sent), 0) into sent
  from app.auto_send_due_reports(
    ((now() at time zone 'Asia/Tehran')::date + time '17:35') at time zone 'Asia/Tehran'
  ) s;
  perform assert(sent >= 1, 'پس از ساعت تنظیم‌شده، گزارش ناقص هم فرستاده می‌شود');

  perform assert((select locked_at from daily_report where id = rid) is not null,
                 'ارسال خودکار گزارش را قفل هم می‌کند');

  perform assert_rejects(
    format('update daily_report set teacher_note = ''ویرایش'' where id = %L', rid),
    'گزارشِ خودکار فرستاده‌شده هم فقط اصلاحیه می‌پذیرد');
end $$;

\echo ''
\echo '── بند ۱۰.۲: عکس منتشرشده از راه درج مستقیم ──'
do $$
declare
  pid uuid;
begin
  perform assert_rejects($x$
    insert into photo (center_id, date, url, status, published_at)
    values ('11111111-1111-1111-1111-111111111111', current_date,
            'https://x/1.jpg', 'published', now())
  $x$, 'درج مستقیم عکس published رد می‌شود');

  -- مسیر درست: درج draft، تگ، سپس انتشار.
  insert into photo (center_id, date, url)
  values ('11111111-1111-1111-1111-111111111111', current_date, 'https://x/2.jpg')
  returning id into pid;
  perform assert((select status from photo where id = pid) = 'draft',
                 'درج عکس در حالت draft می‌نشیند');

  perform assert_rejects(
    format('update photo set status = ''published'', published_at = now() where id = %L', pid),
    'همان عکس بدون تگ منتشر نمی‌شود');

  insert into photo_tag (photo_id, child_id, center_id)
  values (pid, 'd1111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111');
  update photo set status = 'published', published_at = now() where id = pid;
  perform assert((select status from photo where id = pid) = 'published',
                 'با تگ، انتشار از راه به‌روزرسانی انجام می‌شود');
end $$;

\echo ''
\echo '── بند ۱۱.۹: رد پای نوشتن روی داده کودک ──'
do $$
declare
  before_count bigint;
  cid uuid;
  rows_now bigint;
  missing text;
begin
  select count(*) into before_count from audit_log;

  insert into child (center_id, class_id, first_name, last_name)
  values ('11111111-1111-1111-1111-111111111111',
          'c1111111-1111-1111-1111-111111111111', 'ردپا', 'ت.')
  returning id into cid;

  select count(*) into rows_now
  from audit_log where entity = 'child' and entity_id = cid and action = 'insert';
  perform assert(rows_now = 1, 'درج کودک رد پا می‌گذارد');

  update child set first_name = 'ردپای دو' where id = cid;
  select count(*) into rows_now
  from audit_log where entity = 'child' and entity_id = cid and action = 'update';
  perform assert(rows_now = 1, 'ویرایش کودک رد پا می‌گذارد');

  perform assert(
    (select count(*) from audit_log
      where entity = 'child' and entity_id = cid and center_id is null) = 0,
    'هر ردیف رد پا center_id پر دارد');

  delete from child where id = cid;
  select count(*) into rows_now
  from audit_log where entity = 'child' and entity_id = cid and action = 'delete';
  perform assert(rows_now = 1, 'حذف کودک رد پا می‌گذارد');

  perform assert((select count(*) from audit_log) > before_count,
                 'رد پا فقط افزوده می‌شود');

  -- هر دوازده جدول حساس باید تریگر داشته باشند، وگرنه یکی جا افتاده.
  select string_agg(t, '، ') into missing
  from unnest(array[
    'child', 'guardian', 'child_guardian', 'authorized_pickup',
    'medical_profile', 'attendance', 'daily_report', 'photo',
    'photo_tag', 'incident', 'medication_log', 'consent'
  ]) t
  where not exists (
    select 1 from pg_trigger g
    join pg_class c on c.oid = g.tgrelid
    where c.relname = t and g.tgname = 'audit_' || t and not g.tgisinternal
  );
  perform assert(missing is null,
                 coalesce('جدول بدون رد پا: ' || missing, 'هر دوازده جدول حساس تریگر رد پا دارند'));
end $$;
