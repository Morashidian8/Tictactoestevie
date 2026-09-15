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
