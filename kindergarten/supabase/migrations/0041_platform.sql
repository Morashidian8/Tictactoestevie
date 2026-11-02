-- ============================================================
-- سکوی چندمهدی: سوپرادمین، ساخت مهد، و قفل اشتراک
--
-- تا امروز سامانه یک مهد را می‌گرداند و فرض می‌کرد آن مهد از پیش در
-- پایگاه داده هست. برای فروش به چهل مهد، سه چیز کم بود:
--
--   ۱. کسی که **بالای** مرکزها بایستد و مهد تازه بسازد.
--   ۲. راهی برای ساختن مهد — در کل مخزن هیچ `insert into center` جز
--      داده آزمون نبود.
--   ۳. قفلی که مهدِ تسویه‌نکرده را ببندد. ستون‌های `plan` و
--      `active_until` از مهاجرت ۰۰۰۲ بودند و هیچ‌کس نمی‌خواندشان.
--
-- ── خط قرمزی که این مهاجرت نمی‌شکند ─────────────────────────────
--
-- **سوپرادمین دادهٔ مهدها را نمی‌بیند.**
--
-- او مالکِ سکوست، نه مالکِ پرونده‌ها. کودک، گزارش، پیام، پروندهٔ
-- پزشکی و صورتحساب — هیچ‌کدام. آنچه می‌بیند خودِ مرکز است و **شمار**
-- آن‌ها، نه سطرهایشان.
--
-- این سلیقه نیست. تست جداسازی دو مهد همین حالا ثابت می‌کند هیچ سطری
-- از مرز مرکز رد نمی‌شود؛ سوپرادمینی که بتواند پروندهٔ کودکی را در
-- مهدِ مشتری بخواند، همان مرز را از سمت دیگر می‌شکند. پشتیبانی‌ای که
-- به دادهٔ واقعی نیاز دارد، باید با اجازهٔ همان مهد و از راهی که ثبت
-- می‌شود انجامش بدهد — نه به‌صورت پیش‌فرض.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. سوپرادمین، بیرون از مدل مستأجر
-- ────────────────────────────────────────────────────────────
/*
 * چرا جدول جدا و نه یک ردیف در `user_account`.
 *
 * `user_account.center_id` تهی‌ناپذیر است و قید یکتایی‌اش روی
 * (شماره، نقش، مرکز) بسته شده. یعنی هر حسابی **مالِ یک مرکز** است.
 * کسی که چهل مرکز را می‌گرداند، مالِ هیچ‌کدام نیست.
 *
 * خم کردن آن جدول یعنی شکستن قیدی که همهٔ ایزولاسیون روی آن سوار است.
 * اپراتور بیرون از مدل می‌نشیند، همان‌جا که جایش است.
 */
create table platform_admin (
  auth_user_id uuid primary key,
  full_name text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint platform_admin_name check (length(btrim(full_name)) between 1 and 120)
);

comment on table platform_admin is
  'تیم پشتیبانی محصول. بیرون از مدل مستأجر، و بدون دسترسی به دادهٔ مهدها.';

create function app.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from platform_admin
     where auth_user_id = auth.uid() and active
  )
$$;

-- ────────────────────────────────────────────────────────────
-- ۲. قفل اشتراک، در یک نقطه
-- ────────────────────────────────────────────────────────────
/*
 * مرکزِ حسابِ فعال، **بی توجه به اشتراک**.
 *
 * این همان چیزی است که `current_center_id` تا امروز برمی‌گرداند. جدا
 * شد تا سیاستِ خودِ جدول `center` به آن تکیه کند: مهدی که اشتراکش تمام
 * شده باید بتواند ردیف خودش را بخواند، وگرنه اپ حتی نمی‌تواند بگوید
 * چرا خالی است.
 */
create or replace function app.account_center_id()
returns uuid
language sql stable
as $$ select (app.current_account()).center_id $$;

/**
 * آیا اشتراک این مرکز برقرار است.
 *
 * `active_until` تهی یعنی بی‌پایان — مهدهای خودِ ما و پایلوت‌ها. قفل
 * فقط وقتی می‌افتد که تاریخی گذاشته شده و گذشته باشد.
 *
 * مقایسه با `>=` است نه `>`: مهدی که امروز آخرین روز اشتراکش است،
 * امروز را کامل کار می‌کند. قطع کردن وسط روزِ کاری، کاری با ما نمی‌کند
 * و با آن مهد همه‌کار.
 */
create function app.center_licence_active(centre uuid, at date default current_date)
returns boolean
language sql stable security definer set search_path = public, app
as $$
  select coalesce(
    (select c.active_until is null or c.active_until >= at
       from center c where c.id = centre),
    false
  )
$$;

/*
 * و حالا نقطهٔ قفل.
 *
 * هر سیاستِ سطر-محورِ این پایگاه داده `center_id = app.current_center_id()`
 * را می‌سنجد. تهی شدن این یک تابع، یعنی مهدِ تسویه‌نکرده هیچ سطری
 * نمی‌بیند و هیچ سطری نمی‌نویسد — بی آنکه شصت‌وپنج سیاست دست بخورند.
 *
 * همان قاعدهٔ بند ۱۱.۱۰، از سمت دیگر: قید مرکز یک جا بسته می‌شود.
 */
create or replace function app.current_center_id()
returns uuid
language sql stable
as $$
  select case
    when app.center_licence_active((app.current_account()).center_id)
    then (app.current_account()).center_id
  end
$$;

/** وضعیت اشتراکِ مهدِ حسابِ فعال — تا اپ بتواند دلیلش را بگوید. */
create function app.my_centre_licence()
returns table (center_id uuid, name text, plan text, active_until date, licence_active boolean)
language sql stable security definer set search_path = public, app
as $$
  select c.id, c.name, c.plan, c.active_until,
         app.center_licence_active(c.id)
    from center c
   where c.id = app.account_center_id()
$$;

-- ────────────────────────────────────────────────────────────
-- ۳. دسترسی سوپرادمین: خودِ مرکزها، و بس
-- ────────────────────────────────────────────────────────────
/*
 * سیاست `center_own` از `current_center_id` به `account_center_id`
 * می‌رود. بدون این، مهدِ منقضی ردیف خودش را هم نمی‌دید و اپ به‌جای
 * «اشتراک تمام شده»، یک صفحهٔ خالیِ بی‌توضیح نشان می‌داد.
 */
drop policy if exists center_own on center;
create policy center_own on center
  for select using (id = app.account_center_id());

/* سوپرادمین همهٔ مرکزها را می‌بیند — فقط همین جدول. */
create policy center_platform_admin on center
  for select using (app.is_platform_admin());

create policy center_platform_admin_write on center
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());

alter table platform_admin enable row level security;
alter table platform_admin force row level security;

/*
 * اپراتور فقط ردیف خودش را می‌بیند، و هیچ‌کس از راه اپ اپراتور اضافه
 * نمی‌کند. افزودن، کارِ دستِ کسی است که به خودِ پایگاه داده دسترسی
 * دارد — یعنی همان یک نفر.
 */
create policy platform_admin_self on platform_admin
  for select using (auth_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- ۴. ساختن مهد تازه
-- ────────────────────────────────────────────────────────────
/**
 * یک مهد، با مدیر اولش.
 *
 * مهدِ بی‌مدیر بی‌فایده است: کسی نیست که کلاس بسازد و مربی اضافه کند.
 * پس هر دو با هم ساخته می‌شوند یا هیچ‌کدام — تابع، تراکنش است.
 *
 * تریگرهای موجود (گوشه‌های بازی، چک‌لیست بازرسی، فهرست مدارک لازم)
 * خودشان روی `insert into center` می‌نشینند، پس مهد تازه از همان
 * لحظه پیش‌فرض‌هایش را دارد.
 */
create function app.create_center(
  centre_name text,
  manager_name text,
  manager_phone text,
  centre_plan text default null,
  until date default null
)
returns table (center_id uuid, manager_account_id uuid)
language plpgsql security definer set search_path = public, app
as $$
declare
  made_centre uuid;
  made_staff uuid;
  made_account uuid;
  first_name text;
  last_name text;
begin
  if not app.is_platform_admin() then
    raise exception 'فقط پشتیبانی محصول می‌تواند مهد بسازد';
  end if;
  if length(btrim(centre_name)) = 0 then
    raise exception 'نام مهد لازم است';
  end if;
  if length(btrim(manager_name)) = 0 then
    raise exception 'نام مدیر لازم است';
  end if;

  insert into center (name, plan, active_until)
  values (btrim(centre_name), centre_plan, until)
  returning id into made_centre;

  /* نام کوچک و خانوادگی از یک رشته. تک‌کلمه‌ای هم مجاز است. */
  first_name := split_part(btrim(manager_name), ' ', 1);
  last_name := btrim(substr(btrim(manager_name), length(first_name) + 1));

  insert into staff (center_id, first_name, last_name, role, phone)
  values (made_centre, first_name, nullif(last_name, ''), 'manager', btrim(manager_phone))
  returning id into made_staff;

  insert into user_account (center_id, phone, role, staff_id)
  values (made_centre, btrim(manager_phone), 'manager', made_staff)
  returning id into made_account;

  return query select made_centre, made_account;
end
$$;

/** تمدید، تغییر طرح، یا بستن یک مهد. */
create function app.set_center_licence(centre uuid, centre_plan text, until date)
returns void
language plpgsql security definer set search_path = public, app
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'فقط پشتیبانی محصول اشتراک را تغییر می‌دهد';
  end if;

  update center set plan = centre_plan, active_until = until where id = centre;
  if not found then
    raise exception 'مهد پیدا نشد';
  end if;
end
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. نمای سوپرادمین: شمار، نه سطر
-- ────────────────────────────────────────────────────────────
/**
 * فهرست مهدها برای اپراتور.
 *
 * هر چیزی که اینجا می‌آید **عدد** است: چند کودک، چند مربی، چند
 * خانواده، آخرین روزی که ثبتی داشته. نه نامی، نه پرونده‌ای.
 *
 * اگر روزی کسی خواست ستونی به این تابع اضافه کند که نامِ کودکی را
 * بیاورد، همان‌جا بایستد: خط قرمز بالای همین فایل است.
 */
create function app.platform_overview()
returns table (
  center_id uuid,
  name text,
  plan text,
  active_until date,
  licence_active boolean,
  children integer,
  staff integer,
  families integer,
  last_activity date
)
language sql stable security definer set search_path = public, app
as $$
  select
    c.id,
    c.name,
    c.plan,
    c.active_until,
    app.center_licence_active(c.id),
    (select count(*)::integer from child ch
      where ch.center_id = c.id and ch.status = 'active'),
    (select count(*)::integer from staff s
      where s.center_id = c.id and s.active),
    (select count(distinct cg.guardian_id)::integer from child_guardian cg
      where cg.center_id = c.id),
    (select max(a.date) from attendance a where a.center_id = c.id)
  from center c
  where app.is_platform_admin()
  order by c.name
$$;

comment on function app.platform_overview() is
  'نمای اپراتور. فقط شمار و وضعیت اشتراک — هیچ سطری از دادهٔ مهدها.';
