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

insert into staff (id, center_id, first_name, last_name, role) values
  ('51111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'زهرا', 'م.', 'teacher');

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
  insert into staff (center_id, first_name, last_name, role)
  values ('22222222-2222-2222-2222-222222222222', 'زهرا', 'م.', 'teacher') returning id into other_staff;
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

\echo ''
\echo '── بازه روز، دوره حضور، و شیفت مربی ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  golha  uuid := 'c1111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  saturday date;
  n integer;
  fields text[];
begin
  -- شنبه‌ای در آینده، تا روز هفته قابل پیش‌بینی باشد.
  saturday := current_date + ((6 - extract(dow from current_date)::int + 7) % 7);

  perform assert((select count(*) from day_period where center_id = centre) = 2,
                 'دو بازه پیش‌فرض برای مرکز ساخته شد');

  -- مهاجرت: هر کودک یک ثبت‌نام تمام‌روز گرفت.
  perform assert(
    (select attendance_type from app.active_enrollment(sara, saturday)) = 'full_day',
    'مهاجرت به هر کودک ثبت‌نام تمام‌روز داد');

  update child_enrollment set start_date = saturday - 30 where child_id in (sara, amir);

  -- سارا صبحانه‌ای می‌شود، امیر بعدازظهری.
  update child_enrollment set attendance_type = 'morning'   where child_id = sara;
  update child_enrollment set attendance_type = 'afternoon' where child_id = amir;

  select count(*) into n from app.enrollment_periods(sara, saturday);
  perform assert(n = 1, format('کودک صبحانه‌ای فقط یک بازه دارد [n=%s type=%s enr=%s periods=%s]',
    n,
    (app.active_enrollment(sara, saturday)).attendance_type,
    (app.active_enrollment(sara, saturday)).id,
    (select string_agg(key || ':' || included_in::text, ' ') from day_period)));
  perform assert(
    (select key from app.enrollment_periods(sara, saturday)) = 'morning',
    'و آن بازه صبح است');
  perform assert(
    (select key from app.enrollment_periods(amir, saturday)) = 'afternoon',
    'کودک بعدازظهری بازه بعدازظهر می‌گیرد');

  -- فیلدهای قابل اعمال
  fields := app.applicable_fields(sara, saturday);
  perform assert('lunch' = any (fields), 'ناهار برای کودک صبحانه‌ای هم هست');
  perform assert('mood_morning' = any (fields), 'خلق صبح برای او هست');
  perform assert(not ('mood_afternoon' = any (fields)),
                 'ولی خلق عصر برای او اصلاً وجود ندارد');
  perform assert(not ('nap' = any (fields)), 'و خواب هم نه');

  fields := app.applicable_fields(amir, saturday);
  perform assert('lunch' = any (fields), 'ناهار برای کودک بعدازظهری هم هست');
  perform assert(not ('mood_morning' = any (fields)), 'ولی خلق صبح برای او نیست');
  perform assert('nap' = any (fields), 'و خواب برایش هست');

  -- ساعت آغاز و پایانِ خودِ کودک
  perform assert(app.child_day_start(amir, saturday) = time '13:00',
                 'روز کودک بعدازظهری از ۱۳ شروع می‌شود، نه از ساعت کار مهد');
  perform assert(app.child_day_end(sara, saturday) = time '13:00',
                 'و روز کودک صبحانه‌ای ساعت ۱۳ تمام می‌شود');

  -- روزهای هفته
  update child_enrollment set weekdays = array[1, 2, 3]::smallint[] where child_id = sara;
  perform assert(not app.enrolled_today(sara, saturday),
                 'کودک سه‌روزه در روزی که ثبت‌نامش نیست، امروزش نیست');
  update child_enrollment set weekdays = array[0, 1, 2, 3, 4]::smallint[] where child_id = sara;
  perform assert(app.enrolled_today(sara, saturday), 'و با روزهای کامل، هست');

  -- دو ثبت‌نام هم‌زمان ممکن نیست
  perform assert_rejects(format($x$
    insert into child_enrollment (center_id, child_id, class_id, start_date)
    values (%L, %L, %L, %L)
  $x$, centre, sara, golha, saturday), 'دو ثبت‌نام هم‌زمان برای یک کودک رد می‌شود');
end $$;

\echo ''
\echo '── حضور در جلسه، شیفت، و نسبت مربی به کودک ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  golha  uuid := 'c1111111-1111-1111-1111-111111111111';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  saturday date;
  morning timestamptz;
  afternoon timestamptz;
  n integer;
begin
  saturday := current_date + ((6 - extract(dow from current_date)::int + 7) % 7);
  morning   := (saturday + time '09:00') at time zone 'Asia/Tehran';
  afternoon := (saturday + time '15:00') at time zone 'Asia/Tehran';

  -- سارا صبحانه‌ای، امیر بعدازظهری (از بلوک قبل مانده‌اند).
  select count(*) into n from app.children_in_session(golha, morning);
  perform assert(n >= 1, 'صبح، کودکان صبحانه‌ای در جلسه‌اند');
  perform assert(
    exists (select 1 from app.children_in_session(golha, morning) c where c.id = sara),
    'سارا صبح در شبکه هست');
  perform assert(
    not exists (select 1 from app.children_in_session(golha, morning) c
                where c.id = 'd2222222-2222-2222-2222-222222222222'),
    'ولی امیرِ بعدازظهری صبح اصلاً در شبکه نیست');
  perform assert(
    not exists (select 1 from app.children_in_session(golha, afternoon) c where c.id = sara),
    'و عصر، سارا دیگر در شبکه نیست');

  -- شیفت مربی با ساعت تعریف می‌شود، نه با بازه.
  delete from staff_shift where staff_id = zahra;
  insert into staff_shift (center_id, staff_id, class_id, weekday, start_time, end_time)
  values (centre, zahra, golha, ((extract(dow from saturday)::int + 1) % 7)::smallint,
          time '08:00', time '13:00');
  select count(*) into n from app.shift_periods(zahra, saturday);
  perform assert(n = 1, 'مربی ۸ تا ۱۳ فقط یک بازه را می‌پوشاند');

  update staff_shift set end_time = time '16:30' where staff_id = zahra;
  select count(*) into n from app.shift_periods(zahra, saturday);
  perform assert(n = 2, 'همان مربی با شیفت ۸ تا ۱۶:۳۰ هر دو بازه را می‌پوشاند');

  perform assert(
    exists (select 1 from app.staff_on_duty(golha, morning) s where s.id = zahra),
    'مربی در ساعت شیفتش، بر سر کار شمرده می‌شود');

  perform assert(
    (select breached from app.staff_ratio(golha, morning)) = false,
    'با دو کودک و یک مربی، نسبت مجاز است');
  update center set max_children_per_staff = 1 where id = centre;
  perform assert(
    (select children from app.staff_ratio(golha, morning)) >= 1,
    'شمار کودکان در نسبت، از همان کودکان حاضر در بازه می‌آید');
  update center set max_children_per_staff = 15 where id = centre;
end $$;

\echo ''
\echo '── گزارش کامل، وابسته به دوره حضور کودک ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  saturday date;
  rid uuid;
begin
  -- یک هفته جلوتر، تا با ردیف‌های بلوک‌های پیشین برخورد نکند.
  saturday := current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 7;

  insert into daily_report (center_id, child_id, date, mood_morning, mood_noon)
  values (centre, sara, saturday, 'good', 'good')
  returning id into rid;

  insert into meal_log (center_id, daily_report_id, meal_type, amount)
  values (centre, rid, 'lunch', 'most');

  -- سارا صبحانه‌ای است: خلق عصر و خواب برایش وجود ندارند، پس نبودشان
  -- گزارش را ناقص نمی‌کند.
  perform assert((select status from daily_report where id = rid) = 'complete',
                 'گزارش کودک صبحانه‌ای بدون خلق عصر و خواب، کامل است');

  update child_enrollment set attendance_type = 'full_day' where child_id = sara;
  perform app.refresh_report_status(rid);
  perform assert((select status from daily_report where id = rid) = 'draft',
                 'همان گزارش برای کودک تمام‌روز ناقص می‌شود');

  update daily_report set nap_start = time '13:00', mood_afternoon = 'good' where id = rid;
  perform assert((select status from daily_report where id = rid) = 'complete',
                 'و با پر شدن خواب و خلق عصر، کامل می‌شود');
end $$;

\echo ''
\echo '── تأخیر از پایان بازه خودِ کودک ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  saturday date;
  late integer;
begin
  saturday := current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 14;
  update child_enrollment set attendance_type = 'morning' where child_id = sara;

  insert into attendance (center_id, child_id, date, check_in_at)
  values (centre, sara, saturday, (saturday + time '08:00') at time zone 'Asia/Tehran');

  -- کودک صبحانه‌ای که ساعت ۱۳ می‌رود، سر وقت رفته.
  update attendance set check_out_at = (saturday + time '13:00') at time zone 'Asia/Tehran',
                        pickup_method = 'guardian',
                        picked_up_by_guardian_id = '91111111-1111-1111-1111-111111111111'
  where child_id = sara and date = saturday;
  select late_minutes into late from attendance where child_id = sara and date = saturday;
  perform assert(late = 0, 'کودک صبحانه‌ای ساعت ۱۳ تأخیر ندارد');

  update attendance set check_out_at = (saturday + time '13:20') at time zone 'Asia/Tehran'
  where child_id = sara and date = saturday;
  select late_minutes into late from attendance where child_id = sara and date = saturday;
  perform assert(late = 20, format('و بیست دقیقه بعدش، بیست دقیقه تأخیر دارد (%s)', late));
end $$;

\echo ''
\echo '── درخواست دارو از خانواده: تحویل نگرفته، خورانده نمی‌شود ──'
do $$
declare
  centre  uuid := '11111111-1111-1111-1111-111111111111';
  sara    uuid := 'd1111111-1111-1111-1111-111111111111';
  mother  uuid := '91111111-1111-1111-1111-111111111111';
  teacher uuid;
  req     uuid;
  logged  uuid;
  blocked boolean := false;
  today   date := current_date;
begin
  select id into teacher from staff where center_id = centre limit 1;

  insert into medication_request
    (center_id, child_id, name, dose, times, from_date, to_date, announced_by)
  values
    (centre, sara, 'شربت سرماخوردگی', '۵ سی‌سی', array['11:30'::time], today, today, mother)
  returning id into req;
  perform assert(req is not null, 'خانواده از شب قبل درخواست دارو ثبت می‌کند');

  insert into medication_log (center_id, child_id, date, name, dose, request_id)
  values (centre, sara, today, 'شربت سرماخوردگی', '۵ سی‌سی', req)
  returning id into logged;

  /*
   * قاعده ایمنی: والد فرم را پر کرده ولی شیشه دارو هنوز به مهد نرسیده.
   * اگر این نبندد، مربی «داده شد» را می‌زند برای دارویی که وجود ندارد.
   */
  begin
    update medication_log
    set given_at = now(), given_by = teacher
    where id = logged;
  exception when others then
    blocked := true;
  end;
  perform assert(blocked, 'تا تحویل نگرفتن، خوراندن ثبت نمی‌شود');

  -- حلقه دو: مربی شیشه را واقعاً گرفت.
  update medication_request set received_at = now(), received_by = teacher where id = req;

  update medication_log set given_at = now(), given_by = teacher where id = logged;
  perform assert(
    (select given_at is not null from medication_log where id = logged),
    'پس از تحویل گرفتن، خوراندن ثبت می‌شود'
  );

  perform assert(
    (select count(*) from app.medication_requests_on(sara, today)) = 1,
    'درخواست امروز کودک در فهرست می‌آید'
  );

  update medication_request set cancelled_at = now() where id = req;
  perform assert(
    (select count(*) from app.medication_requests_on(sara, today)) = 0,
    'و درخواست لغوشده از فهرست بیرون می‌رود'
  );
end $$;

\echo ''
\echo '── پرونده بازرسی: سه جدول، و آمادگی پیش از بازرسی ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  worker uuid;
  ready  record;
  line   record;
begin
  select id into worker from staff where center_id = centre limit 1;

  -- ۱. آمادگی: هر سه عدد باید وضعیت واقعی را بگویند.
  select * into ready from app.audit_readiness(centre);
  perform assert(
    ready.incomplete_vaccination > 0,
    format('کودکان با واکسیناسیون ناقص شمرده می‌شوند (%s)', ready.incomplete_vaccination)
  );
  perform assert(
    ready.missing_national_id > 0,
    format('کودکان بدون کد ملی شمرده می‌شوند (%s)', ready.missing_national_id)
  );
  perform assert(
    ready.expiring_health_cards > 0,
    'مربی بدون کارت بهداشت هم شمرده می‌شود، نه فقط منقضی'
  );

  -- ۲. با پر شدن داده، عددها پایین می‌آیند.
  update child set national_id = '0012345678' where id = sara;
  insert into medical_profile (child_id, center_id, vaccination_status, vaccination_updated_at)
  values (sara, centre, 'complete', current_date)
  on conflict (child_id) do update
    set vaccination_status = 'complete', vaccination_updated_at = current_date;

  select * into ready from app.audit_readiness(centre);
  perform assert(
    ready.missing_national_id = 1,
    format('و با ثبت کد ملی یکی، عدد یکی کم می‌شود (%s)', ready.missing_national_id)
  );

  -- ۳. کارت بهداشت: سه حالت، و «نزدیک انقضا» جدا از «منقضی».
  update staff set health_card_number = 'HC-1',
                   health_card_issued_at = current_date - 300,
                   health_card_expires_at = current_date + 10
  where id = worker;
  select * into line from app.audit_staff(centre) where card_number = 'HC-1';
  perform assert(line.card_state = 'نزدیک انقضا', format('کارت ده‌روزه «نزدیک انقضا» است (%s)', line.card_state));

  update staff set health_card_expires_at = current_date - 1 where id = worker;
  select * into line from app.audit_staff(centre) where card_number = 'HC-1';
  perform assert(line.card_state = 'منقضی', 'و کارت گذشته «منقضی»');

  update staff set health_card_expires_at = current_date + 200 where id = worker;
  select * into line from app.audit_staff(centre) where card_number = 'HC-1';
  perform assert(line.card_state = 'معتبر', 'و کارت دوروز «معتبر»');

  -- ۴. جدول کودکان: نام سرپرست و شماره‌اش می‌آید، چون بازرس زنگ می‌زند.
  select * into line from app.audit_children(centre) where national_id = '0012345678';
  perform assert(line.full_name is not null, 'دفتر آمار نام کودک را دارد');
  perform assert(line.guardian_name is not null, 'و نام سرپرست را');

  -- ۵. جدول سلامت: آلرژی نداشته «ندارد» است، نه خالی.
  select * into line from app.audit_health(centre) where full_name = line.full_name limit 1;
  perform assert(line.allergies is not null, 'جدول سلامت آلرژی را «ندارد» می‌نویسد، نه خالی');
end $$;

\echo ''
\echo '── درگاه پرداخت: تا تأیید سمت سرور، پرداختی وجود ندارد ──'
do $$
declare
  centre  uuid := '11111111-1111-1111-1111-111111111111';
  sara    uuid := 'd1111111-1111-1111-1111-111111111111';
  bill    uuid;
  pay     uuid;
  again   uuid;
  blocked boolean := false;
begin
  insert into invoice (center_id, child_id, period, amount, due_date)
  values (centre, sara, '1404-12', 5000000, current_date + 7)
  returning id into bill;

  -- ۱. تراکنش باز می‌شود. هنوز پرداختی نیست.
  insert into payment (center_id, invoice_id, amount, payment_method, idempotency_key)
  values (centre, bill, 5000000, 'online', 'idem-a1')
  returning id into pay;
  perform assert(
    (select gateway_state from payment where id = pay) = 'pending',
    'تراکنش آنلاین در حالت انتظار باز می‌شود'
  );
  perform assert(app.invoice_paid(bill) = 0, 'و در مانده صورتحساب هیچ سهمی ندارد');

  -- ۲. دست‌کاری مستقیم به verified بی verified_at رد می‌شود.
  begin
    update payment set gateway_state = 'verified' where id = pay;
  exception when others then
    blocked := true;
  end;
  perform assert(blocked, 'تأییدشده کردنِ دستی، بدون تأیید سمت سرور رد می‌شود');

  -- ۳. مسیر درست: verify واسط.
  pay := app.verify_online_payment('idem-a1', 'ZBL-9001', '770001234');
  perform assert(
    (select verified_at is not null and tracking_code = '770001234' from payment where id = pay),
    'با تأیید واسط، پرداخت ثبت و کد رهگیری صادر می‌شود'
  );
  perform assert(app.invoice_paid(bill) = 5000000, 'و تازه آن‌وقت در مانده می‌نشیند');

  -- ۴. رسیدن دوباره وب‌هوک: همان ردیف، نه پرداخت دوم.
  again := app.verify_online_payment('idem-a1', 'ZBL-9001', '770001234');
  perform assert(again = pay, 'وب‌هوک تکراری همان ردیف را برمی‌گرداند');
  perform assert(
    (select count(*) from payment where invoice_id = bill) = 1,
    'و پرداخت دوم نمی‌سازد'
  );

  -- ۵. تراکنش ناموفق در مانده سهمی ندارد.
  insert into payment (center_id, invoice_id, amount, payment_method, idempotency_key)
  values (centre, bill, 1000000, 'online', 'idem-a2');
  perform app.fail_online_payment('idem-a2');
  perform assert(
    (select gateway_state from payment where idempotency_key = 'idem-a2') = 'failed',
    'تراکنش ناموفق نشانه‌گذاری می‌شود'
  );
  perform assert(app.invoice_paid(bill) = 5000000, 'و مانده را تکان نمی‌دهد');

  -- ۶. ثبت دستی مسیر فرعی می‌ماند و بی‌درنگ می‌نشیند.
  insert into payment (center_id, invoice_id, amount, payment_method, receipt_no)
  values (centre, bill, 500000, 'manual_receipt', 'R-1');
  perform assert(app.invoice_paid(bill) = 5500000, 'ثبت دستی همچنان کار می‌کند');
end $$;

\echo ''
\echo '── پشتیبان پیامک: اپ اول، پیامک پس از شصت ثانیه، دو سطل سهمیه ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  parent uuid;
  t0     timestamptz := timestamptz '2025-11-04 08:00:00+03:30';
  span   text := to_char(t0, 'YYYY-MM');
  seen   uuid;
  quiet  uuid;
  hush   uuid;
begin
  select id into parent from user_account
   where center_id = centre and role = 'guardian' limit 1;

  -- ۱. رخداد ثبت می‌شود و مهلت اپ دقیقاً شصت ثانیه است.
  seen := app.raise_critical_alert(centre, 'pickup_code', parent, 'کد تحویل سارا: ۴۸۲۱', sara, t0);
  perform assert(
    (select sms_due_at - raised_at from critical_alert where id = seen) = interval '60 seconds',
    'رخداد حیاتی شصت ثانیه به اپ فرصت می‌دهد'
  );
  perform assert(
    (select count(*) from notification
      where user_account_id = parent and channel = 'push' and type = 'pickup_code') = 1,
    'و همان لحظه اعلان اپ می‌رود — پیامک مسیر دوم است'
  );

  -- ۲. پیش از مهلت، هیچ پیامکی نمی‌رود.
  perform assert(
    (select count(*) from app.due_critical_alerts(centre, t0 + interval '30 seconds')) = 0,
    'در ثانیه سی‌ام هنوز پیامکی سررسید نشده'
  );
  perform assert(
    app.send_critical_sms(seen, t0 + interval '30 seconds') = 'waiting',
    'و صدا زدن زودهنگام ارسال، پیامکی نمی‌فرستد'
  );

  -- ۳. دیدن در اپ، پیامک را لغو می‌کند و سهمیه‌ای خرج نمی‌شود.
  update critical_alert set acknowledged_at = t0 + interval '20 seconds' where id = seen;
  perform assert(
    app.send_critical_sms(seen, t0 + interval '90 seconds') = 'acknowledged',
    'خانواده‌ای که در اپ دید، پیامک نمی‌گیرد'
  );
  perform assert(
    not exists (select 1 from sms_quota where center_id = centre and period = span),
    'و سهمیه پیامک اصلاً دست نمی‌خورد'
  );

  -- ۴. ندیدن در اپ: پس از مهلت، پیامک می‌رود.
  insert into sms_quota (center_id, period, bucket, allocated)
  values (centre, span, 'critical_fallback', 2), (centre, span, 'notice', 1);

  quiet := app.raise_critical_alert(centre, 'incident_confirmed', parent, 'حادثه سارا', sara, t0);
  perform assert(
    (select count(*) from app.due_critical_alerts(centre, t0 + interval '61 seconds')) = 1,
    'رخدادی که کسی ندید، در ثانیه شصت‌ویکم سررسید می‌شود'
  );
  perform assert(
    app.send_critical_sms(quiet, t0 + interval '61 seconds') = 'sent',
    'و پیامکش می‌رود'
  );
  perform assert(
    (select used from sms_quota
      where center_id = centre and period = span and bucket = 'critical_fallback') = 1,
    'مصرف از سطل «پشتیبان رخداد حیاتی» برداشته می‌شود'
  );
  perform assert(
    (select used from sms_quota
      where center_id = centre and period = span and bucket = 'notice') = 0,
    'و سطل «اطلاع‌رسانی» دست‌نخورده می‌ماند'
  );

  -- ۵. تأیید پس از رفتن پیامک بی‌اثر است: سهمیه خرج شده و آمار نباید دروغ بگوید.
  perform assert(
    app.acknowledge_critical_alert(quiet, t0 + interval '120 seconds') = false,
    'تأیید پس از ارسال پیامک، آمار مصرف را پس نمی‌گیرد'
  );

  -- ۶. سطل اطلاع‌رسانیِ تمام‌شده، جلوی رخداد حیاتی را نمی‌گیرد.
  update sms_quota set used = allocated where center_id = centre and period = span and bucket = 'notice';
  hush := app.raise_critical_alert(centre, 'medication_emergency', parent, 'دارو داده نشد', sara, t0);
  perform assert(
    app.send_critical_sms(hush, t0 + interval '61 seconds') = 'sent',
    'سهمیه اطلاع‌رسانیِ تمام‌شده، هشدار دارویی را متوقف نمی‌کند'
  );

  -- ۷. تمام شدن سطل حیاتی، رخداد را پاک نمی‌کند — دلیلش می‌ماند تا مدیر تلفن بزند.
  perform app.raise_critical_alert(centre, 'pickup_code', parent, 'کد تحویل امیر', sara, t0);
  perform assert(
    app.send_critical_sms(
      (select id from critical_alert where sms_sent_at is null and sms_skipped_reason is null
        order by created_at desc limit 1),
      t0 + interval '61 seconds'
    ) = 'quota_exhausted',
    'با سطل حیاتیِ تمام، پیامک نمی‌رود'
  );
  perform assert(
    (select count(*) from critical_alert where sms_skipped_reason = 'quota_exhausted') = 1,
    'ولی رخداد با دلیلِ نرفتن می‌ماند، نه اینکه بی‌صدا گم شود'
  );

  -- ۸. گزارش سهمیه: هر دو سطل همیشه دیده می‌شوند، حتی سطل خالی.
  perform assert(
    (select count(*) from app.sms_quota_report(centre, span)) = 2,
    'پنل مدیر هر دو سطل را جدا می‌بیند'
  );
  perform assert(
    (select warn from app.sms_quota_report(centre, span) where bucket = 'critical_fallback'),
    'و از آستانه هشتاد درصد هشدار می‌دهد'
  );

  -- ۹. یک رخداد، یک سرنوشت.
  perform assert_rejects($x$
    update critical_alert set sms_skipped_reason = 'acknowledged'
     where sms_sent_at is not null
  $x$, 'یک رخداد نمی‌تواند هم پیامک رفته باشد هم نرفته');
end $$;

\echo ''
\echo '── بایگانی حضور و مدارک مربی ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  mother uuid := '91111111-1111-1111-1111-111111111111';
  d1 date := date '2025-11-03';
  d2 date := date '2025-11-04';
  d3 date := date '2025-11-05';
  line   record;
  total  record;
begin
  -- ۱. سه روز: یکی کامل، یکی بی‌خروج، یکی غیبت اعلام‌شده.
  -- روش تحویل اجباری است: قید attendance_checkout_needs_method نمی‌گذارد
  -- خروجی ثبت شود بی آنکه معلوم باشد کودک را به چه کسی و چطور داده‌اند.
  insert into attendance (center_id, child_id, date, check_in_at, check_out_at,
                          dropped_by_guardian_id, picked_up_by_guardian_id,
                          pickup_method, late_minutes)
  values (centre, sara, d1,
          d1 + time '08:05', d1 + time '13:05', mother, mother, 'guardian', 0);

  insert into attendance (center_id, child_id, date, check_in_at, dropped_by_guardian_id)
  values (centre, sara, d2, d2 + time '08:20', mother);

  insert into absence_notice (center_id, child_id, date, reason)
  values (centre, sara, d3, 'سرماخوردگی');

  perform assert(
    (select count(*) from app.child_attendance_month(centre, sara, d1, d3)) = 3,
    'بایگانی حضور هر سه روز را برمی‌گرداند'
  );

  -- ۲. مدت فقط وقتی هر دو سر ثبت شده‌اند.
  select * into line from app.child_attendance_month(centre, sara, d1, d1);
  perform assert(line.minutes = 300, 'روز کامل، مدت حضور را دقیقه‌ای می‌دهد');

  /*
   * روزی که خروجش ثبت نشده مدت ندارد. صفر گذاشتن یعنی دروغ گفتن
   * درباره ساعتی که کودک واقعاً آنجا بود.
   */
  select * into line from app.child_attendance_month(centre, sara, d2, d2);
  perform assert(line.minutes is null, 'روز بی‌خروج، مدت ندارد — نه اینکه صفر باشد');
  perform assert(line.check_in_at is not null, 'ولی ساعت ورودش سر جایش است');

  -- ۳. غیبت اعلام‌شده از نیامدنِ بی‌خبر جدا می‌ماند.
  select * into line from app.child_attendance_month(centre, sara, d3, d3);
  perform assert(line.absent, 'غیبت اعلام‌شده در بایگانی غایب علامت می‌خورد');
  perform assert(line.absence_reason = 'سرماخوردگی', 'و دلیلش می‌ماند');

  /*
   * روزی که کودک اصلاً برنامه‌اش نبوده، ردیف نمی‌گیرد. تفاوت «نیامد» و
   * «امروز روزش نبود» تمام نکته این نماست.
   */
  perform assert(
    (select count(*) from app.child_attendance_month(centre, sara, d1 - 10, d1 - 1)) = 0,
    'روزهای بی‌سابقه ردیف نمی‌گیرند — غیبت ساختگی تولید نمی‌شود'
  );

  -- ۴. خلاصه ماه.
  select * into total from app.child_attendance_summary(centre, sara, d1, d3);
  perform assert(total.present_days = 2, 'خلاصه ماه دو روز حضور می‌شمارد');
  perform assert(total.absent_days = 1, 'و یک روز غیبت');
  perform assert(total.total_minutes = 300, 'و مجموع دقیقه فقط از روزهای کامل');

  -- ۵. مدارک مربی: وضعیت از تاریخ انقضا می‌آید.
  insert into staff_document (center_id, staff_id, kind, title, file_url, issued_at, expires_at)
  values
    (centre, zahra, 'health_card', 'کارت بهداشت', 'x1', current_date - 300, current_date - 1),
    (centre, zahra, 'training', 'دوره کمک‌های اولیه', 'x2', current_date - 100, current_date + 10),
    (centre, zahra, 'degree', 'کارشناسی روان‌شناسی', 'x3', current_date - 3000, null);

  perform assert(
    (select state from app.staff_documents(centre, zahra) where title = 'کارت بهداشت') = 'expired',
    'مدرکی که تاریخش گذشته، منقضی علامت می‌خورد'
  );
  perform assert(
    (select state from app.staff_documents(centre, zahra) where title = 'دوره کمک‌های اولیه') = 'expiring',
    'مدرکی که کمتر از سی روز مانده، نزدیک انقضا'
  );
  /*
   * مدرک تحصیلی تاریخ انقضا ندارد و نباید در فهرست هشدارها بیفتد.
   * یکی گرفتنشان یعنی مدیر هر روز یک هشدار بی‌معنا می‌بیند و بعد از
   * یک هفته دیگر هیچ هشداری را نمی‌خواند.
   */
  perform assert(
    (select state from app.staff_documents(centre, zahra) where title = 'کارشناسی روان‌شناسی') = 'no_expiry',
    'مدرک بی‌انقضا، حالت خودش را دارد نه «معتبر»'
  );

  -- ۶. شکاف مدارک، برای پرونده بازرسی.
  select * into line from app.staff_document_gaps(centre) where staff_id = zahra;
  perform assert(line.expired = 1, 'شکاف مدارک، منقضی‌ها را می‌شمارد');
  perform assert(line.expiring = 1, 'و نزدیک‌انقضاها را جدا');
  perform assert(line.total = 3, 'و کل مدارک را');

  -- ۷. تاریخ انقضای پیش از صدور، داده خراب است.
  perform assert_rejects($x$
    insert into staff_document (center_id, staff_id, kind, title, file_url, issued_at, expires_at)
    values ('11111111-1111-1111-1111-111111111111',
            '51111111-1111-1111-1111-111111111111',
            'other', 'خراب', 'x9', current_date, current_date - 1)
  $x$, 'انقضای پیش از صدور رد می‌شود');
end $$;

\echo ''
\echo '── پرونده بازرسی: آماده پیش از بازرس، نه روز بازرسی ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  seeded integer;
  line   record;
  score  record;
begin
  -- ۱. چک‌لیست آغازین.
  seeded := app.seed_inspection_checklist(centre);
  perform assert(seeded > 10, 'چک‌لیست آغازین ساخته شد: ' || seeded || ' قلم');

  /*
   * دوباره صدا زدنش قلم تکراری نمی‌سازد. مدیری که دکمه را دو بار زد،
   * نباید سی قلم ببیند.
   */
  perform assert(
    app.seed_inspection_checklist(centre) = 0,
    'و صدا زدن دوباره‌اش قلم تکراری نمی‌سازد'
  );

  -- ۲. قلمی که از داده خودِ اپ درمی‌آید، همیشه تأمین‌شده است.
  select * into line from app.inspection_readiness(centre)
   where title = 'دفتر حضور و غیاب';
  perform assert(line.satisfied, 'دفتر حضور از اپ می‌آید، پس همیشه آماده است');
  perform assert(line.source = 'app_report', 'و منبعش خودِ اپ است، نه کاغذ');

  -- ۳. مدرک مهد که نیست، قلم ناقص است.
  select * into line from app.inspection_readiness(centre)
   where title = 'مجوز فعالیت مهدکودک';
  perform assert(not line.satisfied, 'بی مجوز فعالیت، قلم ناقص می‌ماند');

  insert into center_document (center_id, kind, title, issuer, issued_at, expires_at)
  values (centre, 'operating_licence', 'مجوز فعالیت', 'بهزیستی',
          current_date - 200, current_date + 200);

  select * into line from app.inspection_readiness(centre)
   where title = 'مجوز فعالیت مهدکودک';
  perform assert(line.satisfied, 'با بارگذاری مجوز، قلم تأمین می‌شود');
  perform assert(line.state = 'valid', 'و وضعیتش معتبر است');

  /*
   * مجوزِ منقضی از نبودنش بدتر است، چون مدیر فکر می‌کند دارد. پس
   * منقضی، تأمین‌شده حساب نمی‌شود.
   */
  update center_document set expires_at = current_date - 1
   where center_id = centre and kind = 'operating_licence';
  select * into line from app.inspection_readiness(centre)
   where title = 'مجوز فعالیت مهدکودک';
  perform assert(not line.satisfied, 'مجوز منقضی، تأمین‌شده حساب نمی‌شود');
  perform assert(line.state = 'expired', 'و منقضی علامت می‌خورد');
  update center_document set expires_at = current_date + 200
   where center_id = centre and kind = 'operating_licence';

  /*
   * ۴. یک مربیِ بی‌مدرک، کل قلم را ناقص می‌کند — بازرس هم همین‌طور
   * نگاه می‌کند. «نُه نفر از ده نفر» جواب قابل قبولی نیست.
   */
  insert into staff (id, center_id, first_name, last_name, role)
  values ('52222222-2222-2222-2222-222222222222', centre, 'مربی', 'تازه', 'teacher');

  select * into line from app.inspection_readiness(centre)
   where title = 'کارت بهداشت همه مربیان';
  perform assert(
    not line.satisfied,
    'یک مربی بی‌کارت بهداشت، کل قلم را ناقص می‌کند'
  );

  insert into staff_document (center_id, staff_id, kind, title, file_url, expires_at)
  values (centre, '52222222-2222-2222-2222-222222222222',
          'health_card', 'کارت بهداشت', 'y1', current_date + 100);
  -- زهرا کارت منقضی داشت؛ تازه‌اش را می‌گیرد تا قلم کامل شود.
  insert into staff_document (center_id, staff_id, kind, title, file_url, expires_at)
  values (centre, zahra, 'health_card', 'کارت بهداشت تمدیدشده', 'y2', current_date + 100);

  select * into line from app.inspection_readiness(centre)
   where title = 'کارت بهداشت همه مربیان';
  perform assert(line.satisfied, 'وقتی همه مربیان کارت معتبر دارند، قلم کامل می‌شود');

  -- ۵. دفتر بازدید: کار باز شمرده می‌شود.
  insert into inspection_visit (center_id, visited_on, authority, inspector_name,
                                findings, action_required)
  values (centre, current_date - 30, 'بهزیستی', 'بازرس نمونه',
          'کارت بهداشت یکی از مربیان منقضی بود.', 'تمدید کارت بهداشت');

  select * into score from app.inspection_score(centre);
  perform assert(score.open_actions = 1, 'کار رفع‌نشده بازدید قبلی شمرده می‌شود');
  perform assert(score.total > 10, 'و کل اقلام چک‌لیست: ' || score.total);
  perform assert(score.ready < score.total, 'هنوز همه‌چیز آماده نیست، و صادقانه می‌گوید');

  update inspection_visit set resolved_at = current_date
   where center_id = centre and action_required is not null;
  select * into score from app.inspection_score(centre);
  perform assert(score.open_actions = 0, 'پس از رفع، کار باز صفر می‌شود');

  -- ۶. چک‌لیست داده است نه کد: مهد می‌تواند قلم خودش را اضافه کند.
  insert into inspection_requirement (center_id, title, source, sort_order)
  values (centre, 'دفتر مانور تخلیه', 'manual', 200);
  perform assert(
    (select count(*) from app.inspection_readiness(centre) where title = 'دفتر مانور تخلیه') = 1,
    'مهد می‌تواند قلم تازه به چک‌لیست اضافه کند — فهرست در کد قفل نیست'
  );
end $$;

\echo ''
\echo '── کارنامه مربی: واقعیت، نه نمره ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  d1 date := date '2025-10-06';
  d2 date := date '2025-10-07';
  act    record;
  notes  record;
  card   record;
  cols   integer;
begin
  -- ۱. کارنامه از داده واقعی ساخته می‌شود، نه از تخمین.
  insert into attendance (center_id, child_id, date, check_in_at, checked_in_by_staff_id)
  values (centre, sara, d1, d1 + time '08:00', zahra),
         (centre, amir, d1, d1 + time '08:10', zahra),
         (centre, sara, d2, d2 + time '08:05', zahra);

  select * into act from app.staff_activity(centre, zahra, d1, d2);
  perform assert(act.check_ins = 3, 'ثبت ورودهای مربی شمرده می‌شود');
  perform assert(act.days_active = 2, 'و روزهای فعالش');

  /*
   * «روز فعال» جایگزین حضور و غیاب پرسنل نیست. اپ ورود و خروج کودک را
   * ثبت می‌کند، نه پرسنل را؛ مربی‌ای که تمام روز بوده و چیزی ثبت نکرده
   * اینجا صفر می‌خورد. ساختن عددی از روی داده‌ای که وجود ندارد،
   * بدترین کار ممکن است.
   */
  perform assert(
    (select days_active from app.staff_activity(centre, zahra, d2 + 1, d2 + 30)) = 0,
    'بازه‌ای که ثبتی نداشته صفر می‌خورد، نه اینکه حدس زده شود'
  );

  /*
   * ۲. قاعده ایمنی: رویداد در هیچ جمعی وارد نمی‌شود.
   *
   * اگر مربی بداند حادثه کمتر یعنی نمره بهتر، زمین‌خوردن را ننوشته
   * می‌گذارد. این تست ثابت می‌کند که ستون رویداد جداست و هیچ عدد
   * مرکبی وجود ندارد که بشود درش پنهانش کرد.
   */
  select count(*) into cols
    from information_schema.columns
   where table_schema = 'app'
     and column_name in ('score', 'rating', 'rank', 'performance');
  perform assert(cols = 0, 'هیچ ستون نمره یا رتبه‌ای در کل شِما نیست');

  -- ۳. یادداشت ارزیابی.
  insert into staff_note (center_id, staff_id, kind, body)
  values (centre, zahra, 'commendation', 'در روز شلوغ، آرامش کلاس را حفظ کرد.');
  insert into staff_note (center_id, staff_id, kind, body, period_from, period_to)
  values (centre, zahra, 'review', 'ارزیابی سه‌ماهه.', d1 - 90, d1);

  select * into notes from app.staff_note_summary(centre, zahra);
  perform assert(notes.commendations = 1, 'تقدیر شمرده می‌شود');
  perform assert(notes.reviews = 1, 'و ارزیابی دوره‌ای');
  perform assert(notes.last_review = current_date, 'و تاریخ آخرین ارزیابی می‌ماند');

  /*
   * ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛ پرونده‌سازی است.
   * ستون shared_at مدیر را وادار نمی‌کند، ولی سکوت را ثبت می‌کند.
   */
  perform assert(notes.unshared = 1, 'یادداشت در میان گذاشته‌نشده، خودش هشدار است');

  update staff_note set shared_at = now()
   where staff_id = zahra and kind = 'review';
  select * into notes from app.staff_note_summary(centre, zahra);
  perform assert(notes.unshared = 0, 'پس از در میان گذاشتن، هشدار می‌رود');

  -- ۴. کارتابل مدیر.
  select * into card from app.staff_cartable(centre, d1, d2) where staff_id = zahra;
  perform assert(card.full_name is not null, 'کارتابل مدیر مربی را فهرست می‌کند');
  perform assert(card.check_ins = 3, 'با کارنامه واقعیتش');
  perform assert(card.documents_expired is not null, 'و وضعیت مدارکش');

  /*
   * مرتب‌سازی بر اساس نام است، نه هیچ معیاری. فهرستی که مرتب‌شده
   * باشد خودش یک رتبه‌بندی است، حتی اگر ستون نمره نداشته باشد.
   */
  perform assert(
    (select array_agg(full_name order by ordinality) = array_agg(full_name order by full_name)
       from app.staff_cartable(centre, d1, d2) with ordinality),
    'کارتابل بر اساس نام مرتب است، نه بر اساس عملکرد'
  );
end $$;

\echo ''
\echo '── گزارش ماهانه: مصالحش مشاهده است، جمع‌بندی‌اش کار مربی ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  f date := date '2025-09-23';
  t date := date '2025-10-22';
  obs   uuid;
  line  record;
  facts record;
  gap   record;
  blocked boolean := false;
begin
  -- ۱. مشاهده، با عدسی و تاریخ.
  insert into observation (center_id, child_id, date, lens, body, staff_id)
  values (centre, sara, f + 3, 'interest', 'یک ساعت با خمیر بازی کرد و نمی‌خواست تمام شود.', zahra)
  returning id into obs;

  insert into observation (center_id, child_id, date, lens, body, staff_id)
  values (centre, sara, f + 5, 'challenge', 'موقع نوبت گرفتن سرسره صبر برایش سخت بود.', zahra);

  insert into observation (center_id, child_id, date, lens, body, staff_id)
  values (centre, sara, f + 9, 'social', 'با امیر برج ساخت؛ تا آخر وقت کنار هم بودند.', zahra)
  returning id into obs;
  insert into observation_peer (observation_id, child_id) values (obs, amir);

  perform assert(
    (select count(*) from app.month_observations(centre, sara, f, t)) = 3,
    'مشاهدات ماه جمع می‌شوند'
  );

  /*
   * ۲. کودک دیگر فقط نام کوچک. گزارشی که به خانواده سارا می‌رود
   * نباید مشخصات امیر را ببرد.
   */
  select * into line from app.month_observations(centre, sara, f, t) where lens = 'social';
  perform assert(line.peers = array['امیر'], 'نام کودک دیگر فقط کوچک است، بی نام خانوادگی');

  select * into line from app.month_peers(centre, sara, f, t);
  perform assert(line.first_name = 'امیر' and line.times = 1, 'و در فهرست هم‌بازی‌ها می‌آید');

  /*
   * ۳. هم‌بازی از مشاهده می‌آید، نه از حدس.
   *
   * امیر و سارا هم‌کلاس‌اند و هر روز کنار هم‌اند؛ اگر هم‌حضوری را
   * می‌شمردیم، رابطه‌ای می‌ساختیم که هیچ‌کس ندیده. این تست ثابت
   * می‌کند کودکی که مربی نامش را نبرده، در فهرست نیست.
   */
  perform assert(
    (select count(*) from app.month_peers(centre, amir, f, t)) = 0,
    'کودکی که مشاهده‌ای به نامش ثبت نشده، هم‌بازی ساختگی نمی‌گیرد'
  );

  -- ۴. عدسی خالی، پیش از جلسه معلوم می‌شود.
  select * into gap from app.month_gaps(centre, sara, f, t) where lens = 'skill';
  perform assert(gap.seen = 0, 'عدسی بی‌مشاهده، صفر نشان می‌دهد نه اینکه غایب باشد');
  select * into gap from app.month_gaps(centre, sara, f, t) where lens = 'interest';
  perform assert(gap.seen = 1, 'و عدسی پر، شمارش خودش را');

  -- ۵. واقعیت‌های عددی، بی هیچ مقایسه‌ای.
  select * into facts from app.month_facts(centre, sara, f, t);
  perform assert(facts.observations = 3, 'شمار مشاهدات در واقعیت‌های ماه می‌آید');
  perform assert(facts.present_days is not null, 'و روزهای حضور');

  /*
   * ۶. گزارشی که به خانواده می‌رود باید جمع‌بندی مربی داشته باشد.
   *
   * فهرستی از مشاهدات خام، گزارش نیست. جمع‌بندی را آدمی می‌نویسد که
   * کودک را دیده و مسئولش است — نه یک تابع.
   */
  insert into monthly_report (center_id, child_id, period, period_from, period_to)
  values (centre, sara, '1404-07', f, t);

  begin
    update monthly_report set status = 'shared', shared_at = now()
     where child_id = sara and period = '1404-07';
  exception when others then
    blocked := true;
  end;
  perform assert(blocked, 'گزارش بی‌جمع‌بندی مربی به خانواده نمی‌رود');

  update monthly_report
     set teacher_summary = 'مهر برای سارا ماه خمیر و برج بود.',
         status = 'shared', shared_at = now()
   where child_id = sara and period = '1404-07';
  perform assert(
    (select status from monthly_report where child_id = sara and period = '1404-07') = 'shared',
    'با جمع‌بندی مربی، گزارش قابل ارسال می‌شود'
  );

  -- ۷. یک گزارش برای هر کودک در هر دوره، نه بیشتر.
  perform assert_rejects($x$
    insert into monthly_report (center_id, child_id, period, period_from, period_to)
    values ('11111111-1111-1111-1111-111111111111',
            'd1111111-1111-1111-1111-111111111111',
            '1404-07', date '2025-09-23', date '2025-10-22')
  $x$, 'دو گزارش برای یک کودک در یک ماه ساخته نمی‌شود');

  /*
   * ۸. بند ۱۰ و پیوست ج: هیچ امتیاز، درصد پیشرفت، یا مقایسه‌ای.
   * این تست کل شِمای گزارش را می‌گردد.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_name in ('observation', 'monthly_report')
        and column_name ~ '(score|rating|rank|percentile|average)') = 0,
    'در شِمای گزارش ماهانه هیچ ستون امتیاز یا مقایسه‌ای نیست'
  );
end $$;

\echo ''
\echo '── پیش‌نویس کمکی: مدل فقط جملات مربی را می‌بیند ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  f date := date '2025-09-23';
  t date := date '2025-10-22';
  rep    uuid;
  mine   uuid[];
  other  uuid;
  cols   text;
  line   record;
  blocked boolean := false;
  logged integer;
begin
  select id into rep from monthly_report where child_id = sara and period = '1404-07';
  select array_agg(observation_id) into mine
    from app.report_material(centre, sara, f, t);

  /*
   * ۱. مرز (الف) و (ب) یک تابع است، نه یک جمله در دستورالعمل مدل.
   *
   * تنها ورودی مجاز، متن مشاهدات مربی است. اگر روزی کسی حضور و غیاب
   * یا خلق یا غذا را هم به این تابع اضافه کند، این تست می‌افتد —
   * چون از عدد، نتیجه‌گیری درمی‌آید و از جمله مربی، فقط ویرایش.
   */
  select string_agg(column_name, ',' order by column_name) into cols
    from information_schema.columns
   where table_schema = 'app' and table_name = 'report_material';
  perform assert(
    cols = 'body,date,lens,observation_id',
    'ورودی مجاز مدل فقط متن مشاهده است: ' || coalesce(cols, '—')
  );

  -- ۲. ثبت پیش‌نویس، همراه ردِ مصالحش.
  perform app.record_assisted_draft(rep, 'پیش‌نویس ماشین.', 'test-model', mine);

  perform assert(
    (select draft_source from monthly_report where id = rep) = 'assisted',
    'گزارش، کمکی‌بودن پیش‌نویسش را ثبت می‌کند'
  );
  perform assert(
    (select count(*) from monthly_report_source where report_id = rep) = cardinality(mine),
    'و ردِ همه مشاهده‌هایی که به مدل داده شد'
  );

  /*
   * ۳. بند ۱۰.۲: هر دسترسی به داده کودک ردِ پا می‌خواهد — ماشین هم
   * استثنا نیست.
   */
  select count(*) into logged from audit_log
   where entity = 'monthly_report' and entity_id = rep and action = 'assisted_draft';
  perform assert(logged = 1, 'ساخت پیش‌نویس در لاگ دسترسی می‌نشیند');

  /*
   * ۴. مشاهده کودک دیگر هرگز وارد گزارش نمی‌شود.
   *
   * یک اشتباه در فراخوانی نباید بتواند مشاهده امیر را به گزارش سارا
   * ببرد. بررسی در خودِ تابع است، نه در فراخواننده.
   */
  insert into observation (center_id, child_id, date, lens, body)
  values (centre, amir, f + 2, 'interest', 'مشاهده امیر.')
  returning id into other;

  begin
    perform app.record_assisted_draft(rep, 'پیش‌نویس.', 'test-model', array[other]);
  exception when others then
    blocked := true;
  end;
  perform assert(blocked, 'مشاهده کودک دیگر در مصالح گزارش رد می‌شود');

  /*
   * ۵. پیش‌نویس خام هرگز جای جمع‌بندی مربی را نمی‌گیرد.
   *
   * قید monthly_report_shared_needs_summary از مهاجرت پیشین هنوز
   * برقرار است: گزارشی که مربی جمع‌بندی‌اش نکرده، به خانواده نمی‌رود
   * — حتی اگر پیش‌نویس ماشین پر باشد.
   */
  blocked := false;
  begin
    update monthly_report
       set teacher_summary = null, status = 'shared', shared_at = now()
     where id = rep;
  exception when others then
    blocked := true;
  end;
  perform assert(blocked, 'پیش‌نویس ماشین بی‌جمع‌بندی مربی، قابل ارسال نیست');

  /*
   * ۶. مدیر باید بتواند ببیند مربی پیش‌نویس را دست‌نخورده امضا کرده
   * یا نه. خطا نیست، ولی کل ارزش گزینه (ب) به همین بستگی دارد.
   */
  update monthly_report set teacher_summary = 'پیش‌نویس ماشین.' where id = rep;
  select * into line from app.assisted_report_review(centre, '1404-07') where report_id = rep;
  perform assert(line.untouched, 'امضای دست‌نخورده پیش‌نویس، برای مدیر دیده می‌شود');

  update monthly_report
     set teacher_summary = 'مهر برای سارا ماه خمیر و برج بود؛ صبر کردن هنوز سخت است.'
   where id = rep;
  select * into line from app.assisted_report_review(centre, '1404-07') where report_id = rep;
  perform assert(not line.untouched, 'و وقتی مربی ویرایشش کرد، دیگر دست‌نخورده نیست');
  perform assert(line.sources_used = cardinality(mine), 'شمار مصالح هم دیده می‌شود');

  /*
   * ۷. پیش‌نویس ماشین بی‌ثبت زمان و مدل نمی‌ماند: ادعای بی‌سند همان
   * چیزی است که این مهاجرت برای جلوگیری از آن نوشته شده.
   */
  perform assert_rejects($x$
    update monthly_report set draft_source = 'assisted', assisted_draft = null
     where period = '1404-07'
  $x$, 'کمکی بودن بی پیش‌نویس ثبت‌شده، رد می‌شود');
end $$;

\echo ''
\echo '── شهریه: قلم هزینه، جریمه دیرکرد، یادآوری ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  plan   uuid;
  bill   uuid;
  other  uuid;
  trip   uuid;
  lunch  uuid;
  today  date := date '2025-10-20';
  n      integer;
  fee    bigint;
  row    record;
begin
  insert into fee_plan (center_id, title, amount)
  values (centre, 'شهریه تمام‌روز', 10000000) returning id into plan;
  insert into child_fee (child_id, center_id, fee_plan_id) values (sara, centre, plan);

  insert into invoice (center_id, child_id, period, amount, due_date)
  values (centre, sara, '1404-07', 10000000, today - 20) returning id into bill;
  insert into invoice (center_id, child_id, period, amount, due_date)
  values (centre, amir, '1404-07', 10000000, today - 20) returning id into other;

  /*
   * ۱. جریمه تأخیر در بردن کودک، جریمه دیرکرد پرداخت نیست.
   *
   * اگر روزی کسی این دو را در یک ستون جمع کند، صورتحساب دیگر نمی‌تواند
   * بگوید مبلغ بابت چیست — و خانواده‌ای که دیر رسیده بود، متهم به دیر
   * پرداختن می‌شود.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_name = 'invoice' and column_name in ('late_fee', 'overdue_fee')) = 2,
    'جریمه تأخیر تحویل و جریمه دیرکرد پرداخت، دو ستون جدایند'
  );

  -- ۲. مهد بی‌سیاست، کسی را جریمه نمی‌کند.
  perform assert(app.apply_overdue_fees(centre, today) = 0,
    'مهدی که نرخ جریمه تعریف نکرده، هیچ جریمه‌ای نمی‌زند');

  update center set overdue_fee_percent = 10, overdue_grace_days = 5,
                    overdue_fee_cap = 700000
   where id = centre;

  -- ۳. جریمه روی مبلغِ پرداخت‌نشده، با سقف.
  n := app.apply_overdue_fees(centre, today);
  select overdue_fee into fee from invoice where id = bill;
  perform assert(fee = 700000, 'جریمه به سقف مهد محدود می‌شود: ' || fee);

  /*
   * ۴. اجرای دوباره، جریمه دوم نمی‌سازد.
   *
   * تنها چیزی که جلوی جریمه مرکب سهوی را می‌گیرد همین است: تابع
   * می‌نشاند، جمع نمی‌زند. کار شبانه‌ای که دو بار اجرا شود نباید
   * بدهی خانواده را دو برابر کند.
   */
  perform app.apply_overdue_fees(centre, today);
  perform assert((select overdue_fee from invoice where id = bill) = 700000,
    'اجرای دوباره، جریمه را دو برابر نمی‌کند');

  -- ۵. جریمه روی جریمه نمی‌نشیند: پایه همیشه بی‌جریمهٔ فعلی حساب می‌شود.
  update center set overdue_fee_cap = null where id = centre;
  perform app.apply_overdue_fees(centre, today);
  perform assert((select overdue_fee from invoice where id = bill) = 1000000,
    'پایه جریمه، مبلغ بی‌جریمه است نه صورتحساب جریمه‌خورده');

  /*
   * ۶. خانواده‌ای که نصف را داده، بابت نصفِ داده‌شده جریمه نمی‌شود.
   */
  insert into payment (center_id, invoice_id, amount, payment_method)
  values (centre, bill, 6000000, 'cash');
  perform app.apply_overdue_fees(centre, today);
  perform assert((select overdue_fee from invoice where id = bill) = 400000,
    'جریمه فقط روی مبلغ پرداخت‌نشده است');

  -- ۷. وضعیت صورتحساب از خود پرداخت‌ها درمی‌آید، نه از کد کلاینت.
  perform assert((select status from invoice where id = bill) = 'overdue',
    'صورتحساب سررسیدگذشتهٔ نیمه‌پرداخت، «سررسید گذشته» است');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  bill   uuid;
  trip   uuid;
  lunch  uuid;
  total  bigint;
begin
  select id into bill from invoice where child_id = sara and period = '1404-07';

  insert into fee_item (center_id, title, amount, period, optional, published_at)
  values (centre, 'اردوی باغ پرندگان', 1500000, '1404-07', true, now())
  returning id into trip;
  insert into fee_item (center_id, title, amount, period, optional, published_at)
  values (centre, 'ناهار مهر', 2000000, '1404-07', false, now())
  returning id into lunch;

  insert into fee_item_child (fee_item_id, child_id, center_id) values (trip, sara, centre);
  insert into fee_item_child (fee_item_id, child_id, center_id) values (lunch, sara, centre);

  /*
   * ۸. اردویی که خانواده نپذیرفته، بدهی نیست.
   *
   * این تصمیم محصول است، نه جزئیات فنی: قلم اختیاریِ نپذیرفته اصلاً
   * سطر صورتحساب نمی‌سازد. وگرنه خانواده‌ای که کودکش اردو نمی‌رود،
   * صورتحسابی می‌گیرد که باید تلفنی پسش بگیرد.
   */
  perform assert(app.issue_fee_item(trip) = 0,
    'قلم اختیاریِ نپذیرفته، سطر صورتحساب نمی‌سازد');
  perform assert(app.issue_fee_item(lunch) = 1,
    'قلم اجباری روی صورتحساب همان دوره می‌نشیند');

  update fee_item_child set accepted_at = now() where fee_item_id = trip and child_id = sara;
  perform assert(app.issue_fee_item(trip) = 1, 'با پذیرفتن خانواده، اردو سطر می‌شود');
  perform assert(app.issue_fee_item(trip) = 0, 'و دوباره صادر نمی‌شود');

  -- ۹. عدد و فهرست پشتش نمی‌توانند فرق کنند.
  perform assert((select extra_charges from invoice where id = bill) = 3500000,
    'ستون اقلام، مجموع سطرهاست');

  update invoice set extra_charges = 99 where id = bill;
  perform assert((select extra_charges from invoice where id = bill) = 3500000,
    'نوشتن دستی روی ستون اقلام بی‌اثر است');

  delete from invoice_line where invoice_id = bill and fee_item_id = lunch;
  perform assert((select extra_charges from invoice where id = bill) = 1500000,
    'با حذف سطر، عدد هم پایین می‌آید');

  -- ۱۰. قلم منتشرنشده اصلاً صادر نمی‌شود.
  update fee_item set published_at = null where id = lunch;
  perform assert_rejects(
    format('select app.issue_fee_item(%L)', lunch),
    'قلم منتشرنشده روی صورتحساب نمی‌نشیند');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  bill   uuid;
  today  date := date '2025-10-20';
  kinds  text;
  n      integer;
begin
  select id into bill from invoice where child_id = sara and period = '1404-07';
  update invoice set due_date = today, overdue_fee = 0 where id = bill;
  update center set due_soon_days = 3, overdue_grace_days = 5, overdue_reminder_max = 3
   where id = centre;

  -- ۱۱. روز سررسید، یادآوری «امروز» است.
  select string_agg(kind::text, ',') into kinds
    from app.payment_reminders_due(centre, today) where invoice_id = bill;
  perform assert(kinds = 'due_today', 'روز سررسید، یادآوری سررسید می‌رود: ' || coalesce(kinds, '—'));

  -- ۱۲. سه روز مانده هم یک بار خبر می‌رود.
  select string_agg(kind::text, ',') into kinds
    from app.payment_reminders_due(centre, today - 3) where invoice_id = bill;
  perform assert(kinds = 'due_soon', 'سه روز پیش از سررسید، خبر می‌رود');

  /*
   * ۱۳. یک بار در روز، از هر کانال.
   *
   * کار شبانه‌ای که دو بار اجرا شود نباید دو پیامک بفرستد. خانواده
   * پیامک تکراری را هرزنامه می‌خواند و دفعه بعد نمی‌خواند.
   */
  perform assert(app.record_payment_reminder(bill, 'due_today', 'sms', today),
    'یادآوری اول ثبت می‌شود');
  perform assert(not app.record_payment_reminder(bill, 'due_today', 'sms', today),
    'یادآوری دوم همان روز، ثبت نمی‌شود');
  perform assert(
    (select count(*) from app.payment_reminders_due(centre, today) where invoice_id = bill) = 0,
    'و دیگر در صف امروز نمی‌آید'
  );
  perform assert(app.record_payment_reminder(bill, 'due_today', 'app', today),
    'نوتیف اپ کانال جداست و جداگانه ثبت می‌شود');

  -- ۱۴. پس از سررسید، هر پنج روز یک بار — نه هر روز.
  perform assert(
    (select count(*) from app.payment_reminders_due(centre, today + 5) where invoice_id = bill) = 1,
    'پنج روز پس از سررسید، یادآوری دیرکرد می‌رود');
  perform assert(
    (select count(*) from app.payment_reminders_due(centre, today + 6) where invoice_id = bill) = 0,
    'ولی روز ششم نه');

  /*
   * ۱۵. یادآوری سقف دارد.
   *
   * خانواده‌ای که پول ندارد با پیامک هر پنج روز پولدار نمی‌شود. پس از
   * سقف، کار مدیر است: یک تماس، نه پیامک سیزدهم.
   */
  perform app.record_payment_reminder(bill, 'overdue', 'sms', today + 5);
  perform app.record_payment_reminder(bill, 'overdue', 'sms', today + 10);
  perform app.record_payment_reminder(bill, 'overdue', 'sms', today + 15);
  perform assert(
    (select count(*) from app.payment_reminders_due(centre, today + 20) where invoice_id = bill) = 0,
    'پس از سقف، یادآوری دیرکرد متوقف می‌شود');

  -- ۱۶. صورتحساب تسویه‌شده هیچ یادآوری‌ای نمی‌گیرد.
  insert into payment (center_id, invoice_id, amount, payment_method)
  values (centre, bill, app.invoice_due(bill), 'cash');
  perform assert((select status from invoice where id = bill) = 'paid',
    'با پرداخت کامل، صورتحساب خودش تسویه می‌شود');
  perform assert(
    (select count(*) from app.payment_reminders_due(centre, today + 25) where invoice_id = bill) = 0,
    'به صورتحساب تسویه‌شده یادآوری نمی‌رود');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  rows   integer;
  mehr   record;
  aban   record;
begin
  -- ۱۷. برنامه سال، دوازده ماه است — چه صورتحساب داشته باشند چه نه.
  select count(*) into rows from app.child_fee_year(centre, sara, '1404');
  perform assert(rows = 12, 'برنامه شهریه، هر دوازده ماه سال را می‌آورد');

  select * into mehr from app.child_fee_year(centre, sara, '1404') where period = '1404-07';
  select * into aban from app.child_fee_year(centre, sara, '1404') where period = '1404-08';

  perform assert(mehr.issued, 'ماهی که صورتحساب دارد، صادرشده است');

  /*
   * ۱۸. ماهی که هنوز صورتحساب ندارد، بدهی نیست.
   *
   * اگر این را بدهی نشان می‌دادیم، خانواده در مهر یک رقم دوازده‌ماهه
   * می‌دید و می‌ترسید. مبلغش برآورد است و وضعیتش «صادر نشده».
   */
  perform assert(not aban.issued, 'ماه صادرنشده، صادرنشده علامت می‌خورد');
  perform assert(aban.status = 'not_issued', 'و وضعیتش هیچ‌کدام از وضعیت‌های صورتحساب نیست');
  perform assert(aban.paid = 0 and aban.due_date is null,
    'ماه صادرنشده نه پرداختی دارد نه سررسید');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  bill   uuid;
  claim  uuid;
  pay    uuid;
begin
  insert into invoice (center_id, child_id, period, amount, due_date)
  values (centre, sara, '1404-09', 10000000, date '2025-11-20') returning id into bill;

  insert into payment_claim (center_id, invoice_id, amount, receipt_url)
  values (centre, bill, 10000000, 'blob:receipt-1') returning id into claim;

  insert into payment (center_id, invoice_id, amount, payment_method)
  values (centre, bill, 10000000, 'manual_receipt') returning id into pay;

  update payment_claim
     set status = 'approved', reviewed_at = now(), payment_id = pay
   where id = claim;

  /*
   * ۱۹. سند پرداخت گم نمی‌شود.
   *
   * خواسته مالک محصول: «گذشته به همراه مستندات ثبت شده باشه که هروقت
   * لازم داشت چک کنه». تا اینجا تصویر رسید روی اعلام خانواده می‌ماند و
   * پرداختِ ساخته‌شده بی‌سند بود — یعنی بازرس ردیف می‌دید، سند نه.
   */
  perform assert((select receipt_url from payment where id = pay) = 'blob:receipt-1',
    'با تأیید اعلام، تصویر رسید روی خودِ پرداخت می‌نشیند');
end $$;

\echo ''
\echo '── ویرایش پرونده کودک به دست خانواده ──'

/*
 * این بلوک، برخلاف بقیه این فایل، با هویت واقعی اجرا می‌شود.
 *
 * `request_profile_change` عمداً `app.can_see_child` را صدا می‌زند —
 * خانواده‌ای نباید بتواند پرونده کودک دیگری را ویرایش کند. آزمودن آن
 * قاعده بدون هویت ممکن نیست، و ضعیف کردن تابع برای راحتی تست، همان
 * چیزی است که بعداً به یک رخنه تبدیل می‌شود.
 */
insert into auth.users (id, phone)
values ('aa000000-0000-0000-0000-0000000000f1', '09120000001')
on conflict (id) do nothing;

insert into active_account (auth_user_id, user_account_id)
select 'aa000000-0000-0000-0000-0000000000f1', id
  from user_account
 where phone = '09120000001' and role = 'guardian'
   and center_id = '11111111-1111-1111-1111-111111111111'
on conflict (auth_user_id) do update set user_account_id = excluded.user_account_id;

-- و یک مدیر، چون تأیید تغییر فقط کار اوست.
insert into staff (id, center_id, first_name, last_name, role)
values ('55555555-5555-5555-5555-555555555555',
        '11111111-1111-1111-1111-111111111111', 'مریم', 'ر.', 'manager')
on conflict (id) do nothing;

insert into user_account (id, center_id, phone, role, staff_id)
values ('66666666-6666-6666-6666-666666666666',
        '11111111-1111-1111-1111-111111111111', '09120000077', 'manager',
        '55555555-5555-5555-5555-555555555555')
on conflict (id) do nothing;

insert into auth.users (id, phone)
values ('aa000000-0000-0000-0000-0000000000f2', '09120000077')
on conflict (id) do nothing;

/** جابه‌جایی بین هویت‌ها، مثل همان کاری که rls.sql می‌کند. */
create or replace function login_as(auth_id uuid, phone text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', auth_id::text, false);
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_id, 'phone', phone)::text, false);
end $$;

insert into active_account (auth_user_id, user_account_id)
values ('aa000000-0000-0000-0000-0000000000f2', '66666666-6666-6666-6666-666666666666')
on conflict (auth_user_id) do update set user_account_id = excluded.user_account_id;

/*
 * همان شماره، با حساب مربی — بخش ۳.۲.
 *
 * یک نفر می‌تواند هم مربی باشد هم سرپرست، و آن دو دو حساب جدا و دو
 * صندوق جدا دارند. تست گفتگو به هر دو نیاز دارد.
 */
insert into auth.users (id, phone)
values ('aa000000-0000-0000-0000-0000000000f3', '09120000001')
on conflict (id) do nothing;

insert into active_account (auth_user_id, user_account_id)
select 'aa000000-0000-0000-0000-0000000000f3', id
  from user_account
 where phone = '09120000001' and role = 'teacher'
   and center_id = '11111111-1111-1111-1111-111111111111'
on conflict (auth_user_id) do update set user_account_id = excluded.user_account_id;

select login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  req    uuid;
  line   record;
  before text;
begin
  insert into medical_profile (child_id, center_id, allergies_json)
  values (sara, centre, '["بادام‌زمینی"]'::jsonb)
  on conflict (child_id) do update set allergies_json = '["بادام‌زمینی"]'::jsonb;

  /*
   * ۱. مقدار پیش از تغییر از پایگاه داده خوانده می‌شود، نه از کلاینت.
   *
   * اگر کلاینت old_value را می‌فرستاد، می‌شد مدیر را وادار کرد تغییری
   * را تأیید کند که هرگز آن نبوده.
   */
  perform assert(app.profile_value(sara, 'allergies') = 'بادام‌زمینی',
    'مقدار فعلی میدان از خود پایگاه داده خوانده می‌شود');

  req := app.request_profile_change(sara, 'allergies', 'بادام‌زمینی، تخم‌مرغ');

  /*
   * ۲. مهم‌ترین قاعده این مهاجرت: تا تأیید مدیر، هیچ ستونی عوض نمی‌شود.
   *
   * اگر مقدار تازه را می‌نوشتیم و «تأییدنشده» علامتش می‌زدیم، اولین
   * کوئری‌ای که این علامت را فراموش می‌کرد، داده تأییدنشده را به مربی
   * نشان می‌داد.
   */
  perform assert(app.profile_value(sara, 'allergies') = 'بادام‌زمینی',
    'تا تأیید مدیر، پرونده کودک دست‌نخورده می‌ماند');

  -- ۳. میدان ایمنی بالای صف مدیر می‌نشیند.
  select * into line from app.pending_profile_changes(centre) limit 1;
  perform assert(line.safety_critical, 'درخواست میدان ایمنی اول صف مدیر است');
  perform assert(line.old_value = 'بادام‌زمینی' and line.new_value = 'بادام‌زمینی، تخم‌مرغ',
    'مدیر می‌بیند چه چیزی جای چه چیزی می‌نشیند');

  -- ۴. با تأیید مدیر، مقدار واقعاً می‌نشیند — و آرایه می‌شود، نه رشته.
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  perform app.decide_profile_change(req, true);
  perform assert(
    (select allergies_json from medical_profile where child_id = sara)
      = '["بادام‌زمینی", "تخم‌مرغ"]'::jsonb,
    'با تأیید، آلرژی‌ها به آرایه تبدیل و ثبت می‌شوند'
  );
  perform assert(
    (select count(*) from app.pending_profile_changes(centre)) = 0,
    'و درخواست از صف مدیر بیرون می‌رود'
  );
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  req    uuid;
begin
  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');
  /*
   * ۵. فهرست میدان‌های قابل ویرایش در پایگاه داده است، نه در کلاینت.
   *
   * خانواده نباید بتواند کلاس کودک یا مرکزش را عوض کند — نه با رابط و
   * نه با یک درخواست دستی. فهرست سمت کلاینت دور زدنی است.
   */
  perform assert_rejects(
    format('select app.request_profile_change(%L, %L, %L)', sara, 'class_id', 'x'),
    'میدانی که در فهرست نیست، اصلاً درخواست نمی‌شود');
  perform assert_rejects(
    format('select app.request_profile_change(%L, %L, %L)', sara, 'center_id', 'x'),
    'مرکز کودک از این راه عوض نمی‌شود');

  -- ۶. تغییرِ بی‌تغییر، درخواست نیست.
  perform assert_rejects(
    format('select app.request_profile_change(%L, %L, %L)', sara, 'first_name', 'سارا'),
    'مقدار تکراری، درخواست تازه نمی‌سازد');

  -- ۷. یک درخواست باز برای هر میدان: دومی جای اولی را می‌گیرد.
  perform app.request_profile_change(sara, 'doctor_name', 'دکتر الف');
  perform app.request_profile_change(sara, 'doctor_name', 'دکتر ب');
  perform assert(
    (select count(*) from profile_change_request
      where child_id = sara and field = 'doctor_name' and state = 'pending') = 1,
    'برای هر میدان فقط یک درخواست باز می‌ماند'
  );
  perform assert(
    (select new_value from profile_change_request
      where child_id = sara and field = 'doctor_name' and state = 'pending') = 'دکتر ب',
    'و تازه‌ترین است که می‌ماند'
  );

  /*
   * ۸. رد بدون دلیل، خانواده را سردرگم می‌گذارد — همان قاعده اعلام
   * پرداخت.
   */
  select id into req from profile_change_request
   where child_id = sara and field = 'doctor_name' and state = 'pending';

  -- خانواده تصمیم نمی‌گیرد؛ تأیید و رد فقط کار مدیر است.
  perform assert_rejects(
    format('select app.decide_profile_change(%L, true)', req),
    'خانواده نمی‌تواند درخواست خودش را تأیید کند');

  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  perform assert_rejects(
    format('select app.decide_profile_change(%L, false, null)', req),
    'رد درخواست بدون دلیل ممکن نیست');

  perform app.decide_profile_change(req, false, 'نام پزشک با نسخه نمی‌خواند.');
  perform assert(
    (select state from profile_change_request where id = req) = 'rejected',
    'رد با دلیل ثبت می‌شود'
  );
  perform assert(
    app.profile_value(sara, 'doctor_name') is null,
    'و مقدار رد‌شده هرگز روی پرونده نمی‌نشیند'
  );
end $$;

\echo ''
\echo '── گفتگوی نفر به نفر بین سه نقش ──'
do $$
declare
  centre  uuid := '11111111-1111-1111-1111-111111111111';
  golha   uuid := 'c1111111-1111-1111-1111-111111111111';
  stars   uuid := 'c2222222-2222-2222-2222-222222222222';
  sara    uuid := 'd1111111-1111-1111-1111-111111111111';
  zahra   uuid := '51111111-1111-1111-1111-111111111111';
  other_t uuid;
  acc_parent  uuid;
  acc_teacher uuid;
  acc_manager uuid := '66666666-6666-6666-6666-666666666666';
  acc_other   uuid;
begin
  -- زهرا مربی کلاس گل‌هاست؛ کودک سارا هم در همان کلاس.
  insert into staff_class (staff_id, class_id) values (zahra, golha)
  on conflict do nothing;

  -- و یک مربی دیگر، در کلاسی که سارا در آن نیست.
  insert into staff (id, center_id, first_name, last_name, role)
  values ('57777777-7777-7777-7777-777777777777', centre, 'نگار', 'پ.', 'teacher')
  on conflict (id) do nothing
  returning id into other_t;
  other_t := '57777777-7777-7777-7777-777777777777';
  insert into staff_class (staff_id, class_id) values (other_t, stars)
  on conflict do nothing;

  insert into user_account (id, center_id, phone, role, staff_id)
  values ('77777777-7777-7777-7777-777777777777', centre, '09120000088', 'teacher', other_t)
  on conflict (id) do nothing;
  acc_other := '77777777-7777-7777-7777-777777777777';

  select id into acc_parent from user_account
   where center_id = centre and role = 'guardian' and phone = '09120000001';
  select id into acc_teacher from user_account
   where center_id = centre and role = 'teacher' and phone = '09120000001';

  /*
   * ۱. سرپرست فقط به مربیِ کلاسِ کودک خودش.
   *
   * این فهرست در پایگاه داده است نه در کلاینت: فهرست سمت کلاینت فقط
   * رابط را می‌سازد و اگر تنها مرجع باشد، یک درخواست دستی از آن رد
   * می‌شود.
   */
  perform assert(app.may_message(acc_parent, acc_teacher),
    'سرپرست به مربی کلاسِ کودکش پیام می‌دهد');
  perform assert(not app.may_message(acc_parent, acc_other),
    'ولی به مربی کلاسی که کودکش در آن نیست، نه');

  -- ۲. مدیر با همه، و همه با مدیر.
  perform assert(app.may_message(acc_manager, acc_other),
    'مدیر به هر مربی‌ای پیام می‌دهد');
  perform assert(app.may_message(acc_manager, acc_parent),
    'و به هر سرپرستی');
  perform assert(app.may_message(acc_parent, acc_manager),
    'و سرپرست هم می‌تواند به مدیر بنویسد');

  -- ۳. مربی به سرپرستِ کودکِ کلاس خودش.
  perform assert(app.may_message(acc_teacher, acc_parent),
    'مربی به سرپرستِ کودکِ کلاسش پیام می‌دهد');
  perform assert(not app.may_message(acc_other, acc_parent),
    'مربی کلاس دیگر، به این سرپرست پیام نمی‌دهد');

  -- ۴. هیچ‌کس به خودش.
  perform assert(not app.may_message(acc_parent, acc_parent),
    'کسی به خودش گفتگو باز نمی‌کند');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  acc_parent  uuid;
  acc_teacher uuid;
  first_id  uuid;
  second_id uuid;
  about_id  uuid;
  msg    uuid;
  line   record;
begin
  select id into acc_parent from user_account
   where center_id = centre and role = 'guardian' and phone = '09120000001';
  select id into acc_teacher from user_account
   where center_id = centre and role = 'teacher' and phone = '09120000001';

  /*
   * پنجره پیام باز، برای همین بلوک.
   *
   * بی این، تست به ساعتِ اجرا وابسته بود: پیامی که بعد از ۱۶:۳۰ فرستاده
   * شود در صف ساعت کاری می‌نشیند و `sent_at` ندارد، پس «نخوانده» شمرده
   * نمی‌شود — و همان گزاره صبح سبز بود و عصر قرمز. صفِ ساعت کاری خودش
   * در بلوک بعدی جداگانه آزموده می‌شود.
   */
  update center set parent_message_start = '00:00', parent_message_end = '23:59'
   where id = centre;

  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');

  /*
   * ۵. باز کردن گفتگو دوباره‌اجراپذیر است.
   *
   * بی این، هر بار که کسی «پیام تازه» می‌زد گفتگوی دومی ساخته می‌شد و
   * تاریخچه دو تکه می‌شد — و هیچ‌کدام کامل نبود.
   */
  first_id := app.open_conversation(acc_teacher);
  second_id := app.open_conversation(acc_teacher);
  perform assert(first_id = second_id, 'باز کردن دوباره، گفتگوی دوم نمی‌سازد');

  /*
   * ۶. کودک، زمینه است نه طرف گفتگو.
   *
   * همان دو نفر درباره دو کودک، دو گفتگوی جدا دارند — وگرنه پیام درباره
   * سارا و پیام درباره هستی در یک اتاق قاطی می‌شوند.
   */
  about_id := app.open_conversation(acc_teacher, sara);
  perform assert(about_id <> first_id, 'گفتگو درباره یک کودک، از گفتگوی بی‌زمینه جداست');

  -- ۷. عضویت لازم است؛ صرفِ داشتن شناسه کافی نیست.
  msg := app.send_message(first_id, 'سلام، سارا امروز کمی سرما خورده.');
  perform assert(msg is not null, 'عضو گفتگو می‌تواند پیام بفرستد');
  perform assert_rejects(
    format('select app.send_message(%L, %L)', first_id, '   '),
    'پیام خالی فرستاده نمی‌شود');

  -- ۸. صندوق، طرف مقابل و نخوانده‌ها را با هم می‌دهد.
  perform login_as('aa000000-0000-0000-0000-0000000000f3', '09120000001');
  select * into line from app.my_conversations() where conversation_id = first_id;
  perform assert(line.other_account_id = acc_parent,
    'مربی در صندوقش، سرپرست را طرف مقابل می‌بیند');
  perform assert(line.unread = 1, 'و پیام نخوانده شمرده می‌شود');

  perform app.mark_conversation_read(first_id);
  select * into line from app.my_conversations() where conversation_id = first_id;
  perform assert(line.unread = 0, 'پس از خواندن، شمار نخوانده صفر می‌شود');

  /*
   * ۹. گفتگوی دیگران خصوصی است — مدیر هم استثنا نیست.
   *
   * مدیر می‌تواند با هر کسی گفتگو باز کند، ولی حق مدیریت، حق خواندنِ
   * مکالمه مربی و خانواده نیست.
   */
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  perform assert(
    (select count(*) from app.my_conversations() where conversation_id = first_id) = 0,
    'مدیر گفتگوی مربی و سرپرست را در صندوقش نمی‌بیند'
  );
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  acc_parent  uuid;
  acc_teacher uuid;
  acc_manager uuid := '66666666-6666-6666-6666-666666666666';
  chat   uuid;
  queued timestamptz;
begin
  select id into acc_parent from user_account
   where center_id = centre and role = 'guardian' and phone = '09120000001';
  select id into acc_teacher from user_account
   where center_id = centre and role = 'teacher' and phone = '09120000001';

  update center set parent_message_start = '08:00', parent_message_end = '16:30'
   where id = centre;

  /*
   * ۱۰. ساعت کاری فقط وقتی یک سرِ گفتگو خانواده باشد — بخش ۶.۶.
   *
   * قاعده ساعت کاری برای محافظت از خانواده است، نه یک قاعده عمومی.
   * مدیری که شب یازده به مربی می‌نویسد، پیامش نباید تا صبح در صف بماند.
   */
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  chat := app.open_conversation(acc_teacher);
  perform app.send_message(chat, 'فردا جلسه ساعت ۸.');
  select queued_until into queued from message
   where conversation_id = chat order by created_at desc limit 1;
  perform assert(queued is null, 'پیام مدیر به مربی در صف ساعت کاری نمی‌نشیند');

  /*
   * ۱۱. و نوشتن هرگز بسته نمی‌شود.
   *
   * جلوگیری از نوشتن یعنی والدی که نصفه‌شب نگران است هیچ راهی ندارد.
   * آنچه صبر می‌کند رسیدن است، نه نوشتن.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_name = 'message' and column_name = 'queued_until') = 1,
    'پیامِ بیرون از ساعت، نوشته می‌شود و رسیدنش صبر می‌کند'
  );
end $$;

\echo ''
\echo '── بازی آزاد و نقشه علایق ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  blocks uuid;
  books  uuid;
  f date := date '2025-09-23';
  t date := date '2025-10-22';
  line   record;
  n      integer;
begin
  select id into blocks from activity_corner
   where center_id = centre and title = 'بلوک و ساخت‌وساز';
  select id into books from activity_corner
   where center_id = centre and title = 'کتاب و قصه';

  -- ۱. هر مرکز گوشه‌های پیش‌فرض را می‌گیرد — پیوست الف.
  perform assert(
    (select count(*) from activity_corner where center_id = centre) = 8,
    'مرکز هشت گوشه فعالیت پیش‌فرض دارد'
  );

  insert into free_choice_log (center_id, child_id, corner_id, date, session)
  values (centre, sara, blocks, f + 1, 'morning');

  /*
   * ۲. یک انتخاب برای هر کودک در هر نوبت.
   *
   * مربی‌ای که دوباره می‌کشد نظرش را عوض کرده، نه اینکه انتخاب دوم
   * کرده باشد. بی این قید، کودکی که سه بار جابه‌جا شده در نقشه سه
   * انتخاب دارد و نقشه غلط می‌شود.
   */
  perform assert_rejects(format($x$
    insert into free_choice_log (center_id, child_id, corner_id, date, session)
    values (%L, %L, %L, %L, 'morning')
  $x$, centre, sara, books, f + 1), 'دو انتخاب در یک نوبت ثبت نمی‌شود');

  -- ۳. ولی صبح و بعدازظهر دو انتخاب جدایند.
  insert into free_choice_log (center_id, child_id, corner_id, date, session)
  values (centre, sara, books, f + 1, 'afternoon');
  perform assert(
    (select count(*) from free_choice_log where child_id = sara and date = f + 1) = 2,
    'صبح و بعدازظهر دو انتخاب جدا هستند'
  );

  /*
   * ۴. مدت زمان ثبت نمی‌شود — بخش ۵.۴.
   *
   * پرسیدنِ مدت، ثبت را از بیست ثانیه به دو دقیقه می‌برد و این ماژول
   * رها می‌شود. فراوانی انتخاب برای نقشه علایق کافی است.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_name = 'free_choice_log'
        and column_name ~ '(minute|duration|seconds|length)') = 0,
    'جدول بازی آزاد هیچ ستون مدت زمانی ندارد'
  );

  -- ۵. نقشه، همه گوشه‌ها را می‌آورد — از جمله انتخاب‌نشده‌ها.
  select count(*) into n from app.interest_map(centre, sara, f, t);
  perform assert(n = 8, 'نقشه علایق هر هشت گوشه را می‌آورد، حتی صفرها');

  select * into line from app.interest_map(centre, sara, f, t) limit 1;
  perform assert(line.times = 1, 'و پرتکرارترین گوشه اول می‌آید');

  /*
   * ۶. گوشه‌ای که انتخاب نشده، صفر می‌گیرد نه غیبت.
   *
   * «گوشه‌های انتخاب‌نشده» خودش یک خط گزارش است (بخش ۹): جایی که
   * کودک هنوز نرفته، به‌اندازه جایی که رفته معنا دارد.
   */
  perform assert(
    (select times from app.interest_map(centre, sara, f, t)
      where title = 'موسیقی') = 0,
    'گوشه انتخاب‌نشده با صفر می‌آید، نه اینکه از فهرست بیفتد'
  );
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  blocks uuid;
  f date := date '2025-09-23';
  t date := date '2025-10-22';
  line   record;
begin
  select id into blocks from activity_corner
   where center_id = centre and title = 'بلوک و ساخت‌وساز';

  /*
   * ۷. آستانه انتشار — بخش ۹.
   *
   * کمتر از هشت ثبت در ماه یعنی نمودار نشان داده نمی‌شود. نمودارِ
   * سه‌نقطه‌ای الگو نیست؛ نویز است — و خانواده آن را الگو می‌خواند.
   */
  perform assert(app.interest_sample(centre, sara, f, t) < 8,
    'با دو ثبت، نمونه زیر آستانه هشت است');

  for i in 2..10 loop
    insert into free_choice_log (center_id, child_id, corner_id, date, session)
    values (centre, sara, blocks, f + i, 'morning');
  end loop;
  perform assert(app.interest_sample(centre, sara, f, t) >= 8,
    'و با ثبت بیشتر، از آستانه رد می‌شود');

  /*
   * ۸. هم‌بازی از ثبت جفتی می‌آید، نه از هم‌گوشه بودن.
   *
   * سارا و امیر هر دو بارها گوشه بلوک بوده‌اند؛ تا وقتی مربی جفتشان
   * را ثبت نکرده، هم‌بازی نیستند. دو کودک در یک گوشه لزوماً با هم
   * نبوده‌اند، و شمردن هم‌حضوری رابطه‌ای می‌سازد که هیچ‌کس ندیده.
   */
  insert into free_choice_log (center_id, child_id, corner_id, date, session)
  values (centre, amir, blocks, f + 2, 'morning')
  on conflict do nothing;

  perform assert(
    (select count(*) from app.play_partners(centre, sara, f, t)) = 0,
    'هم‌گوشه بودن، هم‌بازی نمی‌سازد'
  );

  insert into play_pair (center_id, date, child_a, child_b)
  values (centre, f + 2, least(sara, amir), greatest(sara, amir));

  select * into line from app.play_partners(centre, sara, f, t) limit 1;
  perform assert(line.child_id = amir, 'ولی ثبت جفتی، هم‌بازی می‌سازد');

  -- ۹. جفت مرتب‌شده: «الف با ب» و «ب با الف» یکی‌اند.
  perform assert_rejects(format($x$
    insert into play_pair (center_id, date, child_a, child_b)
    values (%L, %L, %L, %L)
  $x$, centre, f + 2, greatest(sara, amir), least(sara, amir)),
    'جفت برعکس، ردیف دوم نمی‌سازد');

  /*
   * ۱۰. کودکی که جفتی برایش ثبت نشده، «منزوی» نامیده نمی‌شود.
   *
   * نبودِ ثبت یعنی کسی ننوشته، نه اینکه کودک تنها بوده. اپ نباید از
   * سکوتِ داده، نتیجه‌ای درباره کودک بگیرد — بند ۱۰.
   */
  perform assert(
    (select count(*) from information_schema.routines
      where routine_schema = 'app' and routine_name ~ '(isolated|lonely|منزوی)') = 0,
    'هیچ تابعی کودک را «منزوی» نمی‌نامد'
  );
  /*
   * کودک سوم، عمداً بی هیچ ثبت جفتی.
   *
   * سارا و امیر حالا جفت دارند؛ بی یک کودک سوم، این فهرست خالی است و
   * تست چیزی را نمی‌سنجد.
   */
  insert into child (id, center_id, class_id, first_name, last_name)
  values ('d3333333-3333-3333-3333-333333333333', centre,
          'c1111111-1111-1111-1111-111111111111', 'هستی', 'ج.')
  on conflict (id) do nothing;

  perform assert(
    (select count(*) from app.unpaired_children(centre, f, t)
      where child_id = 'd3333333-3333-3333-3333-333333333333') = 1,
    'ولی فهرست «جفتی ثبت نشده» برای مربی هست'
  );
  perform assert(
    (select count(*) from app.unpaired_children(centre, f, t)
      where child_id = sara) = 0,
    'و کودکی که جفت دارد، در آن فهرست نیست'
  );
end $$;

\echo ''
\echo '── منو، تقویم، نظرسنجی و هزینه ──'
do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  d date := date '2025-10-05';
  line record;
begin
  update medical_profile set allergies_json = '["تخم‌مرغ", "بادام‌زمینی"]'::jsonb
   where child_id = sara;
  insert into medical_profile (child_id, center_id, allergies_json)
  values (amir, centre, '[]'::jsonb)
  on conflict (child_id) do update set allergies_json = '[]'::jsonb;

  insert into menu_day (center_id, date, slot, title, ingredients)
  values (centre, d, 'lunch', 'کوکوی سبزی',
          array['تخم‌مرغ آب‌پز', 'سبزی', 'آرد']);

  /*
   * ۱. تقاطع منو با آلرژی — تنها دلیلِ واقعیِ بودنِ این ماژول.
   *
   * خانواده‌ای که کودکش به تخم‌مرغ حساس است باید پیش از روزِ کوکو
   * بداند. بی این تقاطع، منو یک تابلوی تزئینی است.
   */
  select * into line from app.menu_for_child(centre, sara, d, d);
  perform assert(array_length(line.allergy_hits, 1) = 1,
    'منو با آلرژی کودک تقاطع می‌خورد');
  perform assert(line.allergy_hits[1] = 'تخم‌مرغ آب‌پز',
    'و ماده‌ای که می‌خواند نام برده می‌شود');

  /*
   * ۲. تطبیق دوطرفه.
   *
   * «تخم‌مرغ» در «تخم‌مرغ آب‌پز» پیدا می‌شود. یک‌طرفه بودنش یعنی نصف
   * هشدارها اصلاً نمی‌آیند — و آن نصف، همان‌هایی‌اند که خطر دارند.
   */
  select * into line from app.menu_for_child(centre, amir, d, d);
  perform assert(coalesce(array_length(line.allergy_hits, 1), 0) = 0,
    'کودک بی‌آلرژی هیچ هشداری نمی‌گیرد');

  -- ۳. منو به روز بسته است، نه به هفته.
  perform assert_rejects(format($x$
    insert into menu_day (center_id, date, slot, title)
    values (%L, %L, 'lunch', 'چیز دیگری')
  $x$, centre, d), 'یک روز و یک وعده، دو منو نمی‌گیرد');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  poll   uuid;
  acc    uuid := '66666666-6666-6666-6666-666666666666';
  n      integer;
  line   record;
begin
  insert into survey (center_id, question, options)
  values (centre, 'اردوی باغ پرندگان برگزار شود؟', array['بله', 'خیر', 'فرقی ندارد'])
  returning id into poll;

  /*
   * ۴. نتیجه، پیش‌فرض به خانواده نشان داده نمی‌شود.
   *
   * «۸۰٪ مخالف اردو» یعنی ۲۰٪ موافق، و آن ۲۰٪ خودشان را در اقلیت
   * می‌بینند. انتشار نتیجه یک تصمیم است، نه پیش‌فرض.
   */
  perform assert(
    (select not show_results from survey where id = poll),
    'نظرسنجی تازه، نتیجه‌اش را به خانواده نشان نمی‌دهد'
  );

  -- ۵. نظرسنجی دست‌کم دو گزینه دارد.
  perform assert_rejects(format($x$
    insert into survey (center_id, question, options)
    values (%L, 'فقط یک گزینه؟', array['بله'])
  $x$, centre), 'نظرسنجی تک‌گزینه‌ای ساخته نمی‌شود');

  insert into survey_response (survey_id, user_account_id, center_id, choice)
  values (poll, acc, centre, 0);

  -- ۶. یک رأی برای هر حساب؛ نظر عوض کردن رأی دوم نمی‌سازد.
  perform assert_rejects(format($x$
    insert into survey_response (survey_id, user_account_id, center_id, choice)
    values (%L, %L, %L, 1)
  $x$, poll, acc, centre), 'یک حساب دو بار رأی نمی‌دهد');

  /*
   * ۷. نتیجه فقط شمار است، هرگز نام.
   *
   * خانواده‌ای که بداند رأیش دیده می‌شود، رأی واقعی نمی‌دهد — و
   * نظرسنجی‌ای که رأی واقعی نگیرد، بدتر از نبودنش است.
   */
  perform assert(
    (select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
      where table_schema = 'app' and table_name = 'survey_tally')
      = 'choice,label,votes',
    'خروجی نتیجه فقط گزینه و شمار است، بی هیچ نامی'
  );

  select * into line from app.survey_tally(centre, poll) where choice = 0;
  perform assert(line.votes = 1, 'و رأی داده‌شده شمرده می‌شود');
  perform assert(line.label = 'بله', 'با متن خودِ گزینه');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  line   record;
begin
  /*
   * ۸. «درآمد» یعنی پولی که واقعاً وصول شده، نه مبلغ صادرشده.
   *
   * صورتحسابِ صادرشده هنوز پول نیست، و مهدی که آن را درآمد بخواند،
   * ماه بعد حقوق پرداخت نمی‌کند.
   */
  insert into expense (center_id, date, amount, category, note)
  values (centre, date '2025-10-05', 5000000, 'food', 'خرید هفتگی');

  select * into line from app.income_vs_expense(centre, '1404-07');
  perform assert(line.spent = 5000000, 'هزینه ماه جمع می‌شود');
  perform assert(
    line.collected <= (select coalesce(sum(amount - discount), 0) from invoice
                        where center_id = centre and period = '1404-07'),
    'و درآمد هرگز از مبلغ صادرشده بیشتر نیست'
  );

  -- ۹. دسته‌بندی هزینه، همان شش دسته پیوست الف است.
  perform assert(
    (select count(*) from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'expense_category') = 6,
    'شش دسته هزینه، همان فهرست پیوست الف'
  );

  /*
   * ۱۰. آنچه ساخته نمی‌شود — بخش ۸.۴.
   *
   * انبارداری، سفارش خرید، تأمین‌کننده، حسابداری. اگر روزی جدولی با
   * این نام‌ها اضافه شود، این تست می‌افتد و کسی باید توضیح بدهد چرا.
   */
  perform assert(
    (select count(*) from information_schema.tables
      where table_schema = 'public'
        and table_name ~ '(inventory|purchase_order|supplier|ledger|contractor)') = 0,
    'انبارداری و سفارش خرید و تأمین‌کننده ساخته نشده‌اند'
  );
end $$;

-- ============================================================
-- مشخصات مربی — مهاجرت ۰۰۳۳
-- ============================================================

select login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');  -- مدیر

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  made   uuid;
  bad    boolean;
begin
  /*
   * ۱. نام کامل نوشتنی نیست؛ از دو تکه ساخته می‌شود.
   *
   * این تست بیش از یک جزئیات نحوی است: تا دیروز نام کامل و نام و نام
   * خانوادگی می‌توانستند سه چیز متفاوت بگویند.
   */
  perform assert(
    (select full_name from staff where id = zahra) = 'زهرا م.',
    'نام کامل از نام و نام خانوادگی ساخته می‌شود'
  );

  begin
    update staff set full_name = 'کس دیگر' where id = zahra;
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'و نوشتن مستقیم در نام کامل ممکن نیست');

  -- ۲. ویرایش میدان، از همان فهرست بسته.
  perform app.edit_staff_field(zahra, 'last_name', 'مرادی');
  perform assert(
    (select full_name from staff where id = zahra) = 'زهرا مرادی',
    'تغییر نام خانوادگی، نام کامل را هم عوض می‌کند'
  );

  perform app.edit_staff_field(zahra, 'address', 'تهران، خیابان شریعتی، پلاک ۱۲');
  perform app.edit_staff_field(zahra, 'resume', 'کارشناسی آموزش ابتدایی، شش سال کار در مهد.');
  perform assert(app.staff_value(zahra, 'address') like 'تهران%', 'آدرس ذخیره می‌شود');
  perform assert(app.staff_value(zahra, 'resume') like 'کارشناسی%', 'رزومه ذخیره می‌شود');

  -- ۳. میدانی بیرون فهرست، رد می‌شود. نام ستون هرگز از ورودی نمی‌آید.
  begin
    perform app.edit_staff_field(zahra, 'role', 'manager');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'نقش از راه فرم مشخصات عوض نمی‌شود');

  begin
    perform app.edit_staff_field(zahra, 'active', 'false');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'و دسترسی هم نه');

  -- ۴. نام خالی نمی‌ماند.
  begin
    perform app.edit_staff_field(zahra, 'first_name', '   ');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'نام مربی خالی نمی‌شود');

  /*
   * ۵. سن ذخیره نمی‌شود، تاریخ تولد می‌شود — و تاریخ محال رد می‌شود.
   *
   * مربیِ شش ساله یعنی سال را اشتباه تایپ کرده‌اند. اگر می‌نشست،
   * سالِ بعد کسی به عددِ سن تکیه می‌کرد.
   */
  perform app.edit_staff_field(zahra, 'birth_date', '1990-03-21');
  perform assert(app.staff_value(zahra, 'birth_date') = '1990-03-21', 'تاریخ تولد ذخیره می‌شود');

  begin
    perform app.edit_staff_field(zahra, 'birth_date', (current_date - 2000)::text);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'مربیِ شش ساله ثبت نمی‌شود');

  perform assert(
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'staff' and column_name = 'age') = 0,
    'ستون سن وجود ندارد — سن هر سال بی‌صدا غلط می‌شود'
  );

  -- ۶. کد ملی، ده رقم.
  begin
    perform app.edit_staff_field(zahra, 'national_id', '12345');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'کد ملی کوتاه رد می‌شود');
  perform app.edit_staff_field(zahra, 'national_id', '0012345678');
  perform assert(app.staff_value(zahra, 'national_id') = '0012345678', 'و کد ده‌رقمی می‌نشیند');

  -- ۷. هر ویرایش ردِ پا دارد. پرونده پرسنلی در دعوای کاری استناد می‌شود.
  perform assert(
    (select count(*) from audit_log
      where action = 'staff_edited' and entity_id = zahra) = 5,
    'هر ویرایش پرونده مربی در دفتر رویداد ثبت می‌شود'
  );
  perform assert(
    (select meta_json->>'from' from audit_log
      where action = 'staff_edited' and entity_id = zahra
        and meta_json->>'field' = 'last_name' limit 1) = 'م.',
    'و مقدار پیش از تغییر هم ثبت می‌شود'
  );

  -- ۸. افزودن مربی تازه.
  made := app.add_staff('نگار', 'صادقی', 'teacher', '09121110000');
  perform assert(
    (select full_name from staff where id = made) = 'نگار صادقی',
    'مربی تازه با نام کامل ساخته می‌شود'
  );
  perform assert(
    (select count(*) from audit_log where action = 'staff_added' and entity_id = made) = 1,
    'و افزودنش ثبت می‌شود'
  );
end $$;

do $$
declare
  zahra uuid := '51111111-1111-1111-1111-111111111111';
  bad   boolean;
begin
  -- ۹. سرپرست پرونده پرسنلی را ویرایش نمی‌کند.
  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');
  begin
    perform app.edit_staff_field(zahra, 'address', 'هرجا');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'سرپرست پرونده مربی را ویرایش نمی‌کند');

  begin
    perform app.add_staff('کس', 'دیگر', 'teacher', null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'و مربی هم اضافه نمی‌کند');
end $$;

select login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');

-- ============================================================
-- درخواست مرخصی مربی — مهاجرت ۰۰۳۴
-- ============================================================

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  zahra  uuid := '51111111-1111-1111-1111-111111111111';
  req    uuid;
  line   record;
  bad    boolean;
begin
  -- مربی درخواست می‌دهد.
  perform login_as('aa000000-0000-0000-0000-0000000000f3', '09120000001');
  req := app.request_leave('personal', date '2026-04-20', date '2026-04-22', 'سفر خانوادگی');
  /* نام پارامترها starts/ends است — `to_date` هم ستون است هم تابع درونی. */

  /*
   * ۱. بازه یک ردیف است، نه سه.
   *
   * سه ردیف یعنی مدیر سه بار تصمیم می‌گیرد و می‌تواند دوتایش را تأیید
   * و یکی را رد کند — حالتی که هیچ معنای واقعی ندارد.
   */
  select * into line from app.my_leave() where id = req;
  perform assert(line.days = 3, 'مرخصی سه‌روزه یک ردیف با سه روز است');
  perform assert(line.state = 'pending', 'و تا تصمیم مدیر، در انتظار می‌ماند');

  -- ۲. درخواست بازِ هم‌پوشان، دوباره ساخته نمی‌شود.
  begin
    perform app.request_leave('personal', date '2026-04-21', date '2026-04-25', null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'درخواست بازِ هم‌پوشان دو بار ثبت نمی‌شود');

  -- ۳. بازه وارونه رد می‌شود.
  begin
    perform app.request_leave('sick', date '2026-06-10', date '2026-06-01', null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'روز پایانِ پیش از روز شروع ثبت نمی‌شود');

  -- ۴. مربی خودش تصمیم نمی‌گیرد.
  begin
    perform app.decide_leave(req, true, null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'مربی درخواست خودش را تأیید نمی‌کند');

  -- ۵. تا تأیید نشده، مرخصی نیست.
  perform assert(
    (select count(*) from app.staff_on_leave(centre, date '2026-04-21')) = 0,
    'درخواست در انتظار، مرخصی حساب نمی‌شود'
  );

  -- ۶. مدیر می‌بیند و تأیید می‌کند.
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  select * into line from app.pending_leave(centre) where id = req;
  perform assert(line.full_name is not null, 'درخواست با نام مربی در صف مدیر می‌آید');
  perform assert(line.reason = 'سفر خانوادگی', 'و دلیلی که مربی نوشته');

  -- ۷. رد بی دلیل ممکن نیست.
  begin
    perform app.decide_leave(req, false, '   ');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'رد درخواست بی دلیل ثبت نمی‌شود');

  perform app.decide_leave(req, true, null);
  perform assert(
    (select state from leave_request where id = req) = 'approved',
    'مدیر تأیید کرد'
  );

  /*
   * ۸. مرخصیِ تأییدشده در برنامه همان روز دیده می‌شود.
   *
   * وگرنه تأیید فقط یک ردیف در پایگاه داده است و مدیری که صبح شیفت را
   * می‌چیند هنوز نمی‌داند چه کسی نیست.
   */
  select * into line from app.staff_on_leave(centre, date '2026-04-21');
  perform assert(line.staff_id = zahra, 'روزِ میانِ بازه هم مرخصی است');
  perform assert(
    (select count(*) from app.staff_on_leave(centre, date '2026-04-23')) = 0,
    'و روز پس از بازه، نه'
  );

  -- ۹. تصمیم دوباره روی همان درخواست، ممکن نیست.
  begin
    perform app.decide_leave(req, false, 'نظرم عوض شد');
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'درخواستِ تصمیم‌گرفته‌شده دوباره تصمیم نمی‌گیرد');

  -- ۱۰. هر تصمیم ردِ پا دارد.
  perform assert(
    (select count(*) from audit_log
      where action = 'leave_approved' and entity_id = req) = 1,
    'تأیید مرخصی در دفتر رویداد ثبت می‌شود'
  );

  /*
   * ۱۱. آنچه ساخته نمی‌شود — پیوست ج و خط قرمز ۱۰.
   *
   * نه سهمیه مرخصی، نه مانده، نه حقوق. اگر روزی ستونی با این نام‌ها
   * اضافه شود، این تست می‌افتد و کسی باید توضیح بدهد چرا.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'leave_request'
        and column_name ~ '(balance|quota|remaining|entitlement|salary|score)') = 0,
    'سهمیه و مانده مرخصی ساخته نشده‌اند'
  );
end $$;

do $$
declare
  bad boolean;
begin
  -- ۱۲. سرپرست نه درخواست می‌دهد، نه صف را می‌بیند.
  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');
  begin
    perform app.request_leave('personal', date '2026-05-01', date '2026-05-02', null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'سرپرست درخواست مرخصی نمی‌دهد');

  perform assert(
    (select count(*) from app.pending_leave('11111111-1111-1111-1111-111111111111')) = 0,
    'و صف مرخصی کارکنان را نمی‌بیند'
  );
end $$;

select login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');

-- ============================================================
-- دفتر امانت — مهاجرت ۰۰۳۵
-- ============================================================

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  book   uuid;
  toy    uuid;
  line   record;
  bad    boolean;
begin
  perform login_as('aa000000-0000-0000-0000-0000000000f3', '09120000001');  -- مربی

  /*
   * ۱. ثبت کار مربی است، نه فقط مدیر.
   *
   * لحظه‌ای که کودک کتاب را برمی‌دارد، مربی کنارش ایستاده. اگر فقط
   * مدیر می‌توانست ثبت کند، هیچ‌وقت ثبت نمی‌شد.
   */
  book := app.lend_item(sara, 'book', 'قصه‌های خوب برای بچه‌های خوب',
                        current_date + 7, 'جلد دوم');
  select * into line from app.child_loans(sara) where id = book;
  perform assert(line.title = 'قصه‌های خوب برای بچه‌های خوب', 'نامِ خودِ وسیله ثبت می‌شود');
  perform assert(line.lent_on = current_date, 'با روزی که برده');
  perform assert(line.returned_on is null, 'و باز می‌ماند تا برگردد');
  perform assert(not line.overdue, 'قرارِ هفته دیگر، هنوز گذشته نیست');

  -- ۲. نام خالی، ثبت نمی‌شود. «کتاب» به کسی نمی‌گوید کدام کتاب.
  begin
    perform app.lend_item(sara, 'book', '   ', null, null, null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'امانت بی نام وسیله ثبت نمی‌شود');

  -- ۳. آنچه هنوز برنگشته، با نام کودک — سؤال واقعی «دست کیست؟» است.
  -- کتابی که ده روز پیش رفته و قرارش سه روز پیش گذشته.
  toy := app.lend_item(amir, 'toy', 'پازل چوبی', current_date - 3, null, current_date - 10);
  select * into line from app.open_loans(centre) where id = toy;
  perform assert(line.child_name like 'امیر%', 'فهرست باز، نام کودک را می‌گوید');
  perform assert(line.overdue, 'و قرارِ گذشته را علامت می‌زند');
  perform assert(line.days_out = 10, 'و می‌گوید چند روز است بیرون مانده');
  perform assert(
    (select count(*) from app.open_loans(centre)) = 2,
    'هر دو امانت باز شمرده می‌شوند'
  );

  /*
   * ۴. بازگشت، تاریخ است نه تیک.
   *
   * «برگشت؟ بله» به سؤالِ «کِی پس داد؟» جواب نمی‌دهد — همان قاعده‌ای که
   * برای «اقدام لازم» بازرسی هم گرفتیم.
   */
  perform app.return_item(book);
  select * into line from app.child_loans(sara) where id = book;
  perform assert(line.returned_on = current_date, 'بازگشت با تاریخش ثبت می‌شود');
  perform assert(
    (select count(*) from app.open_loans(centre)) = 1,
    'و از فهرست باز بیرون می‌رود'
  );

  -- ۵. بازگشت دوباره، ممکن نیست.
  begin
    perform app.return_item(book);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'وسیله‌ای که برگشته، دوباره برنمی‌گردد');

  -- ۶. روز بازگشتِ پیش از روز امانت، محال است.
  begin
    perform app.return_item(toy, current_date - 30);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'روز بازگشت پیش از روز امانت ثبت نمی‌شود');

  /*
   * ۷. تاریخچه می‌ماند، ولی باز اول می‌آید.
   *
   * آنچه هنوز دست کودک است کارِ امروز است؛ بقیه تاریخچه‌اند.
   */
  perform app.lend_item(sara, 'toy', 'ماشین قرمز', null, null, null);
  select * into line from app.child_loans(sara) limit 1;
  perform assert(line.returned_on is null, 'امانتِ باز، بالای فهرست کودک می‌آید');

  /*
   * ۸. آنچه ساخته نمی‌شود — پیوست ج و خط قرمز ۱۰.
   *
   * نه موجودی، نه ارزش ریالی، نه جریمه، نه امتیاز. اگر روزی ستونی با
   * این نام‌ها اضافه شود، این تست می‌افتد و کسی باید توضیح بدهد چرا.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'loan'
        and column_name ~ '(price|amount|fee|fine|stock|quantity|score|rank)') = 0,
    'امانت نه قیمت دارد نه جریمه نه امتیاز'
  );
end $$;

do $$
declare
  sara uuid := 'd1111111-1111-1111-1111-111111111111';
  amir uuid := 'd2222222-2222-2222-2222-222222222222';
  bad  boolean;
begin
  -- ۹. خانواده امانت‌های کودک خودش را می‌بیند…
  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');
  perform assert(
    (select count(*) from app.child_loans(sara)) >= 2,
    'خانواده امانت‌های کودک خودش را می‌بیند'
  );

  -- …ولی نه کودک دیگری را، و نه چیزی ثبت می‌کند.
  perform assert(
    (select count(*) from app.child_loans(amir)) = 0,
    'و امانت کودک دیگری را نمی‌بیند'
  );
  begin
    perform app.lend_item(sara, 'book', 'هرچه', null, null, null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'خانواده امانت ثبت نمی‌کند');
end $$;

select login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');

-- ============================================================
-- رزرو غذا — مهاجرت ۰۰۳۶
-- ============================================================

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  sara   uuid := 'd1111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  soon   date := current_date + 3;
  late   date := current_date;
  d_soon uuid;
  d_late uuid;
  d_free uuid;
  pay    uuid;
  line   record;
  bad    boolean;
begin
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');  -- مدیر

  insert into medical_profile (child_id, center_id, allergies_json)
  values (sara, centre, '["تخم‌مرغ"]'::jsonb)
  on conflict (child_id) do update set allergies_json = '["تخم‌مرغ"]'::jsonb;

  insert into menu_day (center_id, date, slot, title, ingredients, price, capacity)
  values (centre, soon, 'lunch', 'کوکو سبزی', array['سبزی','تخم‌مرغ','آرد'], 850000, 2)
  returning id into d_soon;

  /* روزی که مهلتش امروز تمام شده — آشپزخانه صبح خرید کرده. */
  insert into menu_day (center_id, date, slot, title, ingredients, price, order_by)
  values (centre, late, 'lunch', 'قرمه‌سبزی', array['لوبیا','گوشت'], 900000, current_date - 1)
  returning id into d_late;

  /* وعده‌ای بی قیمت: داخل شهریه است و اصلاً رزروی نیست. */
  insert into menu_day (center_id, date, slot, title, ingredients)
  values (centre, soon, 'snack_morning', 'شیر و بیسکویت', array['شیر'])
  returning id into d_free;

  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');  -- خانواده

  /*
   * ۱. منو با هشدار آلرژیِ همین کودک می‌آید.
   *
   * تنها دلیلِ واقعیِ وجود منو در سامانه همین است؛ بی آن، یک تصویر
   * تزئینی است و خانواده باید خودش مواد را با آلرژی بچه‌اش مقابله کند.
   */
  select * into line from app.meal_menu(sara, current_date, current_date + 7)
   where menu_day_id = d_soon;
  perform assert(line.allergy_hits @> array['تخم‌مرغ'], 'هشدار آلرژی با نامِ خودِ ماده می‌آید');
  perform assert(line.orderable, 'وعده قیمت‌دارِ در مهلت، رزروشدنی است');
  perform assert(line.order_state is null, 'و هنوز رزرو نشده');

  -- ۲. وعده بی قیمت رزروی نیست.
  select * into line from app.meal_menu(sara, current_date, current_date + 7)
   where menu_day_id = d_free;
  perform assert(not line.orderable, 'وعده بی قیمت رزروی نیست — داخل شهریه است');

  -- ۳. مهلت گذشته، رزرو نمی‌شود.
  begin
    perform app.reserve_meal(sara, d_late);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'رزرو پس از مهلت ثبت نمی‌شود — آشپزخانه صبح خرید کرده');

  -- ۴. رزرو، و دو بار زدن دکمه دو بشقاب نمی‌سازد.
  perform app.reserve_meal(sara, d_soon);
  begin
    perform app.reserve_meal(sara, d_soon);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'دو بار زدن دکمه، دو رزرو نمی‌سازد');

  /*
   * ۵. رزروِ پرداخت‌نشده، غذا نیست.
   *
   * همان قاعده سفتِ درگاه: تا پول ننشسته، هیچ‌جا به عنوان غذای کودک
   * دیده نمی‌شود — نه در پنل خانواده، نه در فهرست آشپزخانه.
   */
  perform assert(
    (select count(*) from app.meals_for_day(centre, soon)) = 0,
    'رزروِ پرداخت‌نشده در فهرست آشپزخانه نمی‌آید'
  );

  -- ۶. سبد، همان چیزی است که رزرو شده.
  select * into line from app.meal_basket(sara);
  perform assert(line.price = 850000, 'سبد قیمتِ لحظه رزرو را دارد');

  -- ۷. پرداخت آنلاین، همان‌جا نهایی می‌کند.
  pay := app.pay_meal_basket(sara, 'online', null);
  select * into line from app.meal_menu(sara, current_date, current_date + 7)
   where menu_day_id = d_soon;
  perform assert(line.order_state = 'confirmed', 'پس از پرداخت، رزرو نهایی می‌شود');
  perform assert(
    (select count(*) from app.meal_basket(sara)) = 0,
    'و سبد خالی می‌شود'
  );
  perform assert(
    (select tracking_code from meal_payment where id = pay) is not null,
    'پرداخت آنلاین کد رهگیری می‌گیرد'
  );

  -- ۸. سبد خالی پرداخت نمی‌شود.
  begin
    perform app.pay_meal_basket(sara, 'online', null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'سبد خالی پرداخت نمی‌شود');

  -- ۹. رزروِ پرداخت‌شده با یک دکمه لغو نمی‌شود.
  begin
    perform app.cancel_meal_order(
      (select id from meal_order where child_id = sara and menu_day_id = d_soon));
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'رزروِ پرداخت‌شده از پنل خانواده لغو نمی‌شود — پول جابه‌جا شده');

  /*
   * ۱۰. قیمت در لحظه رزرو قفل است.
   *
   * مهد قیمت را بالا می‌برد؛ رزروِ پرداخت‌شده گران نمی‌شود.
   */
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  update menu_day set price = 1200000 where id = d_soon;
  perform assert(
    (select price from meal_order where child_id = sara and menu_day_id = d_soon) = 850000,
    'گران شدن منو، رزروِ قبلی را گران نمی‌کند'
  );

  -- ۱۱. فهرست آشپزخانه، با هشدار آلرژی کنار نام کودک.
  select * into line from app.meals_for_day(centre, soon);
  perform assert(line.child_name like 'سارا%', 'فهرست آشپزخانه نام کودک را می‌گوید');
  perform assert(line.allergy_hits @> array['تخم‌مرغ'], 'و هشدار آلرژی همان‌جا هست');
end $$;

do $$
declare
  centre uuid := '11111111-1111-1111-1111-111111111111';
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  soon   date := current_date + 3;
  d_soon uuid;
  pay    uuid;
  bad    boolean;
begin
  select id into d_soon from menu_day where date = soon and slot = 'lunch';

  -- ۱۲. ظرفیت: دومی می‌نشیند، سومی نه.
  perform login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
  perform app.reserve_meal(amir, d_soon);
  perform assert(
    (select count(*) from meal_order where menu_day_id = d_soon and state <> 'cancelled') = 2,
    'ظرفیت دو نفره، دو رزرو را می‌پذیرد'
  );
  begin
    perform app.reserve_meal('d3333333-3333-3333-3333-333333333333', d_soon);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'و سومی را رد می‌کند');

  /*
   * ۱۳. کارت‌به‌کارت بی رسید ثبت نمی‌شود، و تا تأیید مدیر نهایی نیست.
   */
  begin
    perform app.pay_meal_basket(amir, 'manual_receipt', null);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'کارت‌به‌کارت بی رسید ثبت نمی‌شود');

  pay := app.pay_meal_basket(amir, 'manual_receipt', 'blob:receipt');
  perform assert(
    (select state from meal_order where child_id = amir and menu_day_id = d_soon) = 'pending',
    'کارت‌به‌کارت تا تأیید مدیر، رزرو را نهایی نمی‌کند'
  );
  perform assert(
    (select count(*) from app.pending_meal_payments(centre) where id = pay) = 1,
    'و در صف مدیر می‌نشیند'
  );

  perform app.approve_meal_payment(pay);
  perform assert(
    (select state from meal_order where child_id = amir and menu_day_id = d_soon) = 'confirmed',
    'با تأیید مدیر، نهایی می‌شود'
  );

  -- ۱۴. تأیید دوباره ممکن نیست.
  begin
    perform app.approve_meal_payment(pay);
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'پرداختِ تأییدشده دوباره تأیید نمی‌شود');

  /*
   * ۱۵. آنچه ساخته نمی‌شود — پیوست ج.
   *
   * رزروِ غذا به صورتحساب شهریه وصل نیست و نمی‌شود. اگر روزی ستونی
   * به `invoice` وصل شود، این تست می‌افتد و کسی باید توضیح بدهد چرا:
   * خانواده‌ای که شهریه عقب دارد، نباید ناهارش قطع شود.
   */
  perform assert(
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name in ('meal_order', 'meal_payment')
        and column_name like '%invoice%') = 0,
    'رزرو غذا به صورتحساب شهریه گره نمی‌خورد'
  );
end $$;

do $$
declare
  amir   uuid := 'd2222222-2222-2222-2222-222222222222';
  bad    boolean;
begin
  -- ۱۶. خانواده برای کودک دیگری رزرو نمی‌کند.
  perform login_as('aa000000-0000-0000-0000-0000000000f1', '09120000001');
  perform assert(
    (select count(*) from app.meal_menu(amir, current_date, current_date + 7)) = 0,
    'خانواده منوی کودک دیگری را نمی‌بیند'
  );
  begin
    perform app.reserve_meal(amir, (select id from menu_day limit 1));
    bad := true;
  exception when others then
    bad := false;
  end;
  perform assert(not bad, 'و برایش رزرو نمی‌کند');
end $$;

select login_as('aa000000-0000-0000-0000-0000000000f2', '09120000077');
