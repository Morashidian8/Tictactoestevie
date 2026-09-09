-- ============================================================
-- قواعدی که سند «قابل رد شدن نیست» می‌نامد، در دیتابیس بسته می‌شوند
-- نه در رابط کاربری. رابط می‌تواند دور زده شود؛ این‌ها نه.
-- ============================================================

-- ------------------------------------------------------------
-- بخش ۵.۹: گزارش پس از قفل شدن فقط اصلاحیه می‌پذیرد.
-- بخش ۱۴.۲: تعارض «آخرین نوشته برنده است»، مگر daily_report پس از قفل.
-- ------------------------------------------------------------
create or replace function app.guard_locked_daily_report()
returns trigger
language plpgsql
as $$
begin
  if old.locked_at is null then
    return new;
  end if;

  -- پس از قفل فقط وضعیت می‌تواند به amended برود (وقتی اصلاحیه ثبت شود).
  if (new.nap_start, new.nap_end, new.mood_morning, new.mood_noon,
      new.mood_afternoon, new.teacher_note, new.needs_from_home_json)
     is distinct from
     (old.nap_start, old.nap_end, old.mood_morning, old.mood_noon,
      old.mood_afternoon, old.teacher_note, old.needs_from_home_json)
  then
    raise exception 'گزارش % قفل شده است. تغییر فقط به شکل اصلاحیه ثبت می‌شود.', old.id;
  end if;

  return new;
end;
$$;

create trigger daily_report_locked_guard
  before update on daily_report
  for each row execute function app.guard_locked_daily_report();

-- اصلاحیه فقط روی گزارش قفل‌شده معنا دارد، و ثبتش وضعیت را amended می‌کند.
create or replace function app.apply_amendment()
returns trigger
language plpgsql
as $$
declare
  report_locked timestamptz;
begin
  select locked_at into report_locked from daily_report where id = new.daily_report_id;

  if report_locked is null then
    raise exception 'گزارش هنوز ارسال نشده. تا پیش از ارسال، خودِ گزارش ویرایش می‌شود.';
  end if;

  update daily_report set status = 'amended' where id = new.daily_report_id;
  return new;
end;
$$;

create trigger daily_report_amendment_applies
  after insert on daily_report_amendment
  for each row execute function app.apply_amendment();

-- ------------------------------------------------------------
-- بخش ۵.۵ و ۶.۶: عکس بدون تگ منتشر نمی‌شود، و عکس گروهی فقط وقتی منتشر
-- می‌شود که همه کودکان تگ‌خورده رضایت photo_group_publish داشته باشند و
-- سیاست مهد اجازه بدهد.
-- ------------------------------------------------------------
create or replace function app.guard_photo_publish()
returns trigger
language plpgsql
as $$
declare
  tag_count integer;
  policy app.group_photo_policy;
  missing_consent integer;
begin
  if new.status <> 'published' then
    return new;
  end if;

  select count(*) into tag_count from photo_tag where photo_id = new.id;
  if tag_count = 0 then
    raise exception 'عکس بدون تگ منتشر نمی‌شود.';
  end if;

  if new.is_group then
    select group_photo_policy into policy from center where id = new.center_id;
    if policy = 'never' then
      raise exception 'سیاست این مهد انتشار عکس گروهی را اجازه نمی‌دهد.';
    end if;

    select count(*) into missing_consent
    from photo_tag t
    left join consent c
      on c.child_id = t.child_id
     and c.type = 'photo_group_publish'
     and c.granted_at is not null
    where t.photo_id = new.id and c.id is null;

    if missing_consent > 0 then
      raise exception
        'عکس گروهی منتشر نمی‌شود: % کودک رضایت انتشار گروهی ندارند.', missing_consent;
    end if;
  end if;

  return new;
end;
$$;

create trigger photo_publish_guard
  before update on photo
  for each row execute function app.guard_photo_publish();

-- ------------------------------------------------------------
-- بخش ۵.۸: اگر فرد در فهرست مجاز نباشد و کد هم نداشته باشد، سامانه اجازه
-- ثبت خروج نمی‌دهد. سرپرست محدودشده هرگز تحویل‌گیرنده نمی‌شود.
-- ------------------------------------------------------------
create or replace function app.guard_checkout()
returns trigger
language plpgsql
as $$
declare
  allowed boolean;
begin
  if new.check_out_at is null then
    return new;
  end if;

  if new.pickup_method = 'guardian' then
    select cg.can_pickup and not cg.restricted into allowed
    from child_guardian cg
    where cg.child_id = new.child_id
      and cg.guardian_id = new.picked_up_by_guardian_id;

    if allowed is not true then
      raise exception 'این سرپرست اجازه تحویل گرفتن ندارد. به مدیر ارجاع دهید.';
    end if;

  elsif new.pickup_method = 'authorized' then
    select ap.active into allowed
    from authorized_pickup ap
    where ap.id = new.picked_up_by_authorized_id
      and ap.child_id = new.child_id;

    if allowed is not true then
      raise exception 'این فرد در فهرست مجاز این کودک نیست. به مدیر ارجاع دهید.';
    end if;
  end if;

  return new;
end;
$$;

create trigger attendance_checkout_guard
  before insert or update on attendance
  for each row execute function app.guard_checkout();

-- ------------------------------------------------------------
-- بخش ۵.۹: «کامل» یعنی غذا و خواب و هر سه بازه خلق پر شده باشند.
-- صفحه بستن روز تعداد کامل و ناقص را از همین وضعیت می‌شمارد.
-- ------------------------------------------------------------
create or replace function app.refresh_report_status(report_id uuid)
returns void
language plpgsql
as $$
declare
  r daily_report;
  has_lunch boolean;
begin
  select * into r from daily_report where id = report_id;
  if r.id is null or r.locked_at is not null then
    return;
  end if;

  select exists (
    select 1 from meal_log where daily_report_id = report_id and meal_type = 'lunch'
  ) into has_lunch;

  update daily_report
  set status = case
    when has_lunch
     and r.nap_start is not null
     and r.mood_morning is not null
     and r.mood_noon is not null
     and r.mood_afternoon is not null
    then 'complete'::app.report_status
    else 'draft'::app.report_status
  end
  where id = report_id;
end;
$$;

create or replace function app.refresh_report_status_from_report()
returns trigger
language plpgsql
as $$
begin
  perform app.refresh_report_status(new.id);
  return null;
end;
$$;

create or replace function app.refresh_report_status_from_meal()
returns trigger
language plpgsql
as $$
begin
  perform app.refresh_report_status(coalesce(new.daily_report_id, old.daily_report_id));
  return null;
end;
$$;

create trigger daily_report_status_refresh
  after insert or update of nap_start, mood_morning, mood_noon, mood_afternoon
  on daily_report
  for each row execute function app.refresh_report_status_from_report();

create trigger meal_log_status_refresh
  after insert or update or delete on meal_log
  for each row execute function app.refresh_report_status_from_meal();
