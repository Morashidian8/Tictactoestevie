-- ============================================================
-- نگهبان درج عکس، و رد پای دسترسی — بند ۱۰.۲ و ۱۱.۹ سند
-- ============================================================

-- ── ۱. عکس فقط به حالت draft درج می‌شود ────────────────────────
--
-- تریگر انتشار در 0005 فقط before update است، پس درج مستقیم سطری با
-- status='published' از نگهبان تگ و رضایت رد می‌شد. حالا درج با هر
-- حالتی جز draft رد می‌شود و انتشار منحصراً مسیر update است، یعنی
-- همان مسیری که نگهبان رویش نشسته.
--
-- CHECK ساده کافی نبود: همان ستون باید در UPDATE بتواند published شود.

create or replace function app.guard_photo_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'draft' then
    raise exception
      'عکس فقط به حالت draft درج می‌شود؛ انتشار از راه به‌روزرسانی انجام می‌شود.';
  end if;
  return new;
end;
$$;

create trigger photo_insert_guard
  before insert on photo
  for each row execute function app.guard_photo_insert();


-- ── ۲. رد پای نوشتن ────────────────────────────────────────────
--
-- بند ۱۱.۹: هر دست بردن در داده کودک باید رد داشته باشد. رد پا در
-- پایگاه داده نوشته می‌شود، نه در کد اپ: کد اپ را می‌شود دور زد، تریگر
-- را نه. هر مسیری که به جدول برسد — اپ، کنسول، اسکریپت — رد می‌گذارد.

create or replace function app.current_account_id()
returns uuid
language sql
stable
as $$ select (app.current_account()).id $$;

-- audit_log از force row level security بیرون می‌آید.
--
-- چرا: تریگر با security definer می‌نویسد. با force، سیاست درج روی
-- مالک جدول هم اعمال می‌شود و شرطش center_id = app.current_center_id()
-- است؛ در کار سرویس و مهاجرت که جلسه‌ای نیست، این شرط null می‌شود و
-- درج رد می‌شود — یعنی شکست رد پا، خودِ نوشتن داده کودک را می‌شکست.
-- بدون force، سیاست برای نقش‌های کلاینت سر جایش می‌ماند و فقط تریگر
-- عبور می‌کند. خواندن هم‌چنان برای هیچ نقشی باز نیست.
alter table audit_log no force row level security;

create or replace function app.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  row_data jsonb;
begin
  row_data := to_jsonb(case when tg_op = 'DELETE' then old else new end);

  insert into audit_log (center_id, actor_id, action, entity, entity_id)
  values (
    (row_data ->> 'center_id')::uuid,
    app.current_account_id(),
    lower(tg_op),
    tg_table_name,
    -- photo_tag کلید مرکب دارد و ستون id ندارد؛ آن‌جا null می‌ماند و
    -- خود ردیف از entity و زمان قابل ردیابی است.
    (row_data ->> 'id')::uuid
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'child', 'guardian', 'child_guardian', 'authorized_pickup',
    'medical_profile', 'attendance', 'daily_report', 'photo',
    'photo_tag', 'incident', 'medication_log', 'consent'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function app.write_audit()',
      'audit_' || t, t
    );
  end loop;
end $$;
