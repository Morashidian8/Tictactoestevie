-- ============================================================
-- سمتِ کارکنان، و خروج از مهد — ماژول ۰۰۳۸
--
-- خواسته مالک محصول: «مدیر قابلیت اضافه کردن مربی با حذف مربی هم داشته
-- باشه و سمت هرکس بتونه درج کنه. مثلا کمک مربی سرمربی سرپرست یا
-- سوپروایزر».
--
-- ── چرا ستون تازه و نه گسترشِ app.staff_role ────────────────────
--
-- `staff.role` **دسترسی** است، نه سمت. تریگر `0002_core.sql` مجبورش
-- می‌کند با `user_account.role` یکی باشد، و تمام سیاست‌های سطر-محور
-- روی همان سه مقدار بنا شده‌اند. اگر «سوپروایزر» به آن enum اضافه شود،
-- باید برای هر سیاست تصمیم گرفت که سوپروایزر چه می‌بیند — و آن تصمیمی
-- است که هیچ‌کس نگرفته.
--
-- سمت چیز دیگری است: آنچه روی چارت مهد نوشته می‌شود و بازرس می‌پرسد.
-- سرمربی و کمک‌مربی هر دو دسترسیِ `teacher` دارند و همین درست است.
-- ============================================================

create type app.staff_title as enum (
  'head',            -- سرپرست
  'supervisor',      -- سوپروایزر
  'lead_teacher',    -- سرمربی
  'teacher',         -- مربی
  'assistant',       -- کمک‌مربی
  'other'            -- هر سمت دیگری که مهد دارد
);

alter table staff add column title app.staff_title;

/*
 * سمتِ پیش‌فرض از دسترسی حدس زده می‌شود، فقط برای ردیف‌هایی که همین
 * حالا هستند. از این به بعد مدیر خودش انتخاب می‌کند و حدسی در کار
 * نیست — حدسی که ادامه پیدا کند، تبدیل به داده غلط می‌شود.
 */
update staff set title = case role
  when 'manager' then 'head'::app.staff_title
  when 'assistant' then 'assistant'::app.staff_title
  else 'teacher'::app.staff_title
end;

-- ------------------------------------------------------------
-- افزودن مربی، حالا با سمت
--
-- امضای ۰۰۳۳ با یک پارامتر پیش‌فرض‌دار گسترش می‌یابد، پس فراخوان‌های
-- قدیمی نمی‌شکنند.
-- ------------------------------------------------------------
/*
 * امضای قدیمی صریحاً برداشته می‌شود.
 *
 * `create or replace` با امضای متفاوت، تابع را **جایگزین نمی‌کند**؛
 * سربارگذاری می‌سازد. آن وقت فراخوانِ چهارآرگومانی مبهم می‌شود و
 * پایگاه داده می‌گوید «is not unique» — همان چیزی که تست‌ها گرفتند.
 */
drop function if exists app.add_staff(text, text, app.staff_role, text);

create or replace function app.add_staff(
  first_name text,
  last_name text,
  staff_role app.staff_role,
  phone text default null,
  staff_title app.staff_title default null
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

  insert into staff (center_id, first_name, last_name, role, phone, title)
  values (centre, btrim(first_name), btrim(coalesce(last_name, '')), staff_role,
          nullif(btrim(coalesce(phone, '')), ''),
          coalesce(staff_title, case staff_role
            when 'manager' then 'head'::app.staff_title
            when 'assistant' then 'assistant'::app.staff_title
            else 'teacher'::app.staff_title
          end))
  returning id into made;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(), 'staff_added', 'staff', made,
          jsonb_build_object('role', staff_role, 'title', staff_title));

  return made;
end;
$$;

-- ------------------------------------------------------------
-- تغییر سمت
-- ------------------------------------------------------------
/*
 * پارامتر `target` نام دارد، نه `staff`.
 *
 * `staff` هم نام جدول است؛ آن وقت `where id = staff` مبهم می‌شود و
 * پایگاه داده می‌گوید «column reference is ambiguous» — همان دامی که
 * `to_date` در مهاجرت ۰۰۳۴ هم در آن افتاد.
 */
create or replace function app.set_staff_title(
  target uuid,
  staff_title app.staff_title
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid := app.current_center_id();
begin
  if not app.is_manager() then
    raise exception 'تغییر سمت فقط با مدیر است.';
  end if;
  if not exists (select 1 from staff where id = target and center_id = centre) then
    raise exception 'این کارمند در این مرکز نیست.';
  end if;

  update staff set title = staff_title, updated_at = now() where id = target;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(), 'staff_title_set', 'staff', target,
          jsonb_build_object('title', staff_title));
end;
$$;

-- ------------------------------------------------------------
-- خروج از مهد
--
-- ── چرا حذف نمی‌شود ────────────────────────────────────────────
--
-- ردیفِ کارمند به ثبت ورودِ کودکان، گزارش روز و رویدادها گره خورده.
-- حذف واقعی یعنی گزارشِ پارسال می‌گوید «ثبت‌کننده: —»، و پرونده‌ای که
-- بازرس می‌خواهد ناقص می‌شود. پس خروج ثبت می‌شود، نه حذف:
--   · `left_at` پر می‌شود و `active` خاموش — قید `staff_left_implies_inactive`.
--   · حسابِ کاربری‌اش هم همان لحظه غیرفعال می‌شود؛ بخش ۷.۴ می‌گوید
--     «قطع فوری دسترسی با یک اقدام»، و اگر این دو با هم نباشند، مربیِ
--     رفته تا وقتی کسی یادش بیفتد هنوز وارد می‌شود.
--   · تخصیص کلاس‌هایش برداشته می‌شود، وگرنه در فهرست شیفت می‌ماند.
-- ------------------------------------------------------------
create or replace function app.remove_staff(
  target uuid,
  on_day date default current_date
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid := app.current_center_id();
  me     uuid := app.current_account_id();
begin
  if not app.is_manager() then
    raise exception 'ثبت خروج کارمند فقط با مدیر است.';
  end if;
  if not exists (select 1 from staff where id = target and center_id = centre) then
    raise exception 'این کارمند در این مرکز نیست.';
  end if;

  -- مدیر نمی‌تواند خودش را بیرون بگذارد: مرکزی بی مدیر می‌ماند و هیچ
  -- حسابی نمی‌تواند برش گرداند.
  if exists (
    select 1 from user_account where id = me and staff_id = target
  ) then
    raise exception 'نمی‌توانید خروج خودتان را ثبت کنید.';
  end if;

  update staff
     set left_at = on_day, active = false, updated_at = now()
   where id = target;

  delete from staff_class where staff_id = target;

  update user_account set active = false where staff_id = target;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, me, 'staff_removed', 'staff', target,
          jsonb_build_object('left_at', on_day));
end;
$$;

-- ------------------------------------------------------------
-- فهرست کارکنان، با سمت
-- ------------------------------------------------------------
create or replace function app.staff_titles()
returns table (value text, label text)
language sql
stable
as $$
  select * from (values
    ('head',         'سرپرست'),
    ('supervisor',   'سوپروایزر'),
    ('lead_teacher', 'سرمربی'),
    ('teacher',      'مربی'),
    ('assistant',    'کمک‌مربی'),
    ('other',        'سایر')
  ) as t(value, label)
$$;
