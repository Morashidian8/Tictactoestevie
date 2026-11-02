-- ============================================================
-- قابلیت‌های هر مهد: «این مهد X را نمی‌خواهد» یک سطر است، نه یک شاخه
--
-- خواسته مالک محصول: «اگر کسی نیاز به تغییر داشت، اپِ اون مهد تغییر
-- ایجاد بشه.»
--
-- راهِ بدیهی و غلط، یک نسخهٔ جدا از کد برای هر مهد است. با چهل مهد
-- یعنی چهل شاخه‌ای که باید جداگانه وصله شوند، و اولین رخنهٔ امنیتی
-- باید چهل بار بسته شود. یک ماه بعد، هیچ‌کس نمی‌داند کدام مهد کدام
-- نسخه را دارد.
--
-- اینجا کد یکی می‌ماند و تفاوت، داده است.
--
-- ── سه قاعده که این مهاجرت نمی‌شکند ─────────────────────────────
--
-- ۱. **قابلیت، مقصد را پنهان می‌کند؛ داده را نه.**
--    مهدی که «رزرو غذا» را خاموش می‌کند، سفارش‌های پرداخت‌شدهٔ پارسالش
--    را از دست نمی‌دهد. سیاستِ سطر-محور به این پرچم‌ها کاری ندارد و
--    عمداً ندارد: پنهان کردنِ پولِ پرداخت‌شده پشت یک پرچمِ فروش، از
--    هر قابلیتی که کم بشود بدتر است. آنچه بسته می‌شود، **ساختنِ
--    تازه** است — با تریگر، نه با سیاست.
--
-- ۲. **ایمنی کودک پرچم ندارد.**
--    حضور، آلرژی، دارو، رخداد و اطلاع‌رسانی فوری در این فهرست
--    نیستند و نباید بیایند. قابلیتی که بشود خاموشش کرد، روزی خاموش
--    می‌شود — و بخش ۱۳.۳ چیزی نیست که سرِ قیمت چانه بخورد.
--
-- ۳. **روشن‌کردن کارِ اپراتور است، نه مدیرِ مهد.**
--    مدیر می‌بیند چه چیزی روشن است و چه چیزی نه، ولی خودش چیزی را
--    که نخریده روشن نمی‌کند. این همان مرزی است که مهاجرت ۰۰۴۱ برای
--    `active_until` گذاشت.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. فهرست بسته — چه چیزهایی اصلاً پرچم دارند
-- ────────────────────────────────────────────────────────────
/*
 * enum است و نه متنِ آزاد، دقیقاً به خاطر قاعدهٔ ۲.
 *
 * با متنِ آزاد، کسی روزی سطرِ `('...','attendance',false)` را درج
 * می‌کند و هیچ‌چیز جلویش را نمی‌گیرد. با enum، خودِ پایگاه داده
 * می‌گوید «چنین پرچمی وجود ندارد».
 */
create type app.center_feature as enum (
  'meals',           -- رزرو غذا: مهدی که آشپزخانه ندارد
  'loans',           -- دفتر امانت
  'free_play',       -- بازی آزاد و نقشهٔ علاقه
  'monthly_report',  -- گزارش ماهانه به خانواده
  'inspection',      -- پروندهٔ بازرسی
  'survey',          -- نظرسنجی خانواده‌ها
  'expenses',        -- هزینه و درآمد در برابر هزینه
  'online_payment'   -- درگاه پرداخت — مهدی که قرارداد PSP ندارد
);

create table center_feature (
  center_id uuid not null references center(id) on delete restrict,
  feature app.center_feature not null,
  enabled boolean not null default true,
  /* چه کسی و کِی — تا «این از کِی خاموش شد؟» جواب داشته باشد. */
  changed_at timestamptz not null default now(),
  primary key (center_id, feature)
);

comment on table center_feature is
  'کدام ماژول برای کدام مهد روشن است. نبودِ سطر یعنی روشن.';

-- ────────────────────────────────────────────────────────────
-- ۲. پیش‌فرض: همه‌چیز روشن
-- ────────────────────────────────────────────────────────────
/*
 * چرا «همه روشن» و نه «همه خاموش».
 *
 * پیش‌فرضِ خاموش یعنی مهدِ تازه یک اپِ نصفه تحویل می‌گیرد و کسی باید
 * یادش بماند روشنش کند. پیش‌فرضِ روشن یعنی بدترین حالت این است که
 * مهدی قابلیتی ببیند که لازمش ندارد — که خودش خاموشش می‌کند.
 *
 * و مهم‌تر: قابلیتی که مهاجرتِ بعدی اضافه کند، برای چهل مهدِ موجود
 * سطر ندارد. `center_feature_on` نبودِ سطر را «روشن» می‌خواند، پس
 * هیچ مهدی با یک مهاجرت، قابلیتی را از دست نمی‌دهد.
 */
create function app.seed_center_features(centre uuid)
returns void
language sql security definer set search_path = public, app as $$
  insert into center_feature (center_id, feature)
  select centre, f
    from unnest(enum_range(null::app.center_feature)) as f
  on conflict do nothing
$$;

create function app.seed_center_features_on_center()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.seed_center_features(new.id);
  return new;
end
$$;

create trigger center_features_seed
  after insert on center
  for each row execute function app.seed_center_features_on_center();

-- مهدهایی که پیش از این مهاجرت ساخته شده‌اند.
do $$
declare c uuid;
begin
  for c in select id from center loop
    perform app.seed_center_features(c);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- ۳. مرز مرکز، روی خودِ همین جدول
-- ────────────────────────────────────────────────────────────
/*
 * جدولِ تازه‌ای که `center_id` دارد، باید از همان جاروی جداسازیِ دو
 * مهد رد شود — و اولین اجرا نشد: تستِ ایزولاسیون با «نشتی:
 * center_feature(8)» قرمز شد، چون سیاستی نداشت.
 *
 * `force` عمداً نیست، به همان دلیلِ `audit_log` در مهاجرت ۰۰۱۱:
 * تابع‌های `security definer` این بالا با مالکِ جدول می‌نویسند و
 * سیاستِ درجی در کار نیست. بی `force`، مالک عبور می‌کند و نقش‌های
 * کلاینت پشتِ همین دو سیاستِ خواندن می‌مانند. نوشتن از راه اپ برای
 * هیچ نقشی باز نیست.
 */
alter table center_feature enable row level security;

/* `account_center_id` و نه `current_center_id`: مهدِ منقضی هم باید
   بداند چه خریده — همان قاعدهٔ `center_own` در مهاجرت ۰۰۴۱. */
create policy center_feature_own on center_feature
  for select using (center_id = app.account_center_id());

create policy center_feature_platform_admin on center_feature
  for select using (app.is_platform_admin());

-- ────────────────────────────────────────────────────────────
-- ۴. خواندن
-- ────────────────────────────────────────────────────────────
/*
 * `security definer` و پاسخِ «روشن» برای سطرِ نبوده.
 *
 * این تابع در تریگرهای پایین هم صدا زده می‌شود، جایی که جلسه‌ای در
 * کار نیست — کارِ سرویس، مهاجرت، و seed. آنجا نباید چیزی رد شود.
 */
create function app.center_feature_on(centre uuid, which app.center_feature)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select f.enabled from center_feature f
      where f.center_id = centre and f.feature = which),
    true)
$$;

create function app.my_features()
returns table (feature text, enabled boolean)
language sql stable security definer set search_path = public, app as $$
  select f::text, app.center_feature_on(app.account_center_id(), f)
    from unnest(enum_range(null::app.center_feature)) as f
   where app.account_center_id() is not null
   order by f
$$;

comment on function app.my_features() is
  'پرچم‌های مهدِ حسابِ جاری. هر سه نقش می‌خوانندش؛ رابط مقصدها را از همین می‌چیند.';

/*
 * اپراتور، برای یک مهدِ مشخص.
 *
 * همان خطِ مهاجرت ۰۰۴۱: اپراتور دربارهٔ مهد تصمیم می‌گیرد، ولی
 * هیچ سطری از دادهٔ کودکانش را نمی‌بیند. اینجا هم چیزی جز نام پرچم
 * و روشن/خاموش برنمی‌گردد.
 */
create function app.center_features(centre uuid)
returns table (feature text, enabled boolean)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_platform_admin() then
    raise exception 'فقط پشتیبانی سکو قابلیت‌های مهدها را می‌بیند';
  end if;
  return query
    select f::text, app.center_feature_on(centre, f)
      from unnest(enum_range(null::app.center_feature)) as f
     order by f;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- ۵. نوشتن — فقط اپراتور
-- ────────────────────────────────────────────────────────────
create function app.set_center_feature(
  centre uuid,
  which app.center_feature,
  turn_on boolean
)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_platform_admin() then
    raise exception 'فقط پشتیبانی سکو قابلیت‌ها را عوض می‌کند';
  end if;
  if not exists (select 1 from center where id = centre) then
    raise exception 'چنین مهدی وجود ندارد';
  end if;

  insert into center_feature (center_id, feature, enabled, changed_at)
  values (centre, which, turn_on, now())
  on conflict (center_id, feature)
  do update set enabled = excluded.enabled, changed_at = now();

  /*
   * رد پا در دفترِ خودِ مهد می‌نشیند، نه دفترِ سکو.
   *
   * مدیری که فردا می‌پرسد «رزرو غذای ما کجا رفت؟»، جوابش باید در
   * همان مهد پیدا شود. `actor_id` تهی می‌ماند چون اپراتور حسابِ
   * مهد نیست — و همین خودش می‌گوید کار از بیرون بوده.
   */
  insert into audit_log (center_id, actor_id, action, entity, entity_id)
  values (centre, null, case when turn_on then 'enable' else 'disable' end,
          'center_feature:' || which::text, centre);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- ۶. مرزِ واقعی: ساختنِ تازه بسته می‌شود، نه دیدنِ گذشته
-- ────────────────────────────────────────────────────────────
/*
 * چرا تریگر و نه سیاستِ سطر-محور.
 *
 * سیاست، **خواندن** را هم می‌بندد؛ و آن یعنی مهدی که پرچمی را خاموش
 * می‌کند، تاریخچه‌اش را هم از دست می‌دهد (قاعدهٔ ۱ بالا). تریگرِ درج
 * دقیقاً همان چیزی را می‌بندد که باید: سطرِ تازه برای قابلیتی که این
 * مهد ندارد.
 *
 * و چرا اصلاً بسته می‌شود، وقتی رابط دکمه‌اش را نشان نمی‌دهد: چون
 * «رابط نشان نمی‌دهد» یک قاعده نیست، یک عادت است. قاعده در پایگاه
 * داده می‌نشیند.
 */
create function app.guard_center_feature()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.center_feature_on(new.center_id, tg_argv[0]::app.center_feature) then
    raise exception 'این قابلیت برای این مهد فعال نیست: %', tg_argv[0];
  end if;
  return new;
end;
$$;

do $$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    array['meal_order', 'meals'],
    array['menu_day', 'meals'],
    array['meal_payment', 'meals'],
    array['loan', 'loans'],
    array['free_choice_log', 'free_play'],
    array['play_pair', 'free_play'],
    array['monthly_report', 'monthly_report'],
    array['inspection_visit', 'inspection'],
    array['survey', 'survey'],
    array['expense', 'expenses']
  ]
  loop
    execute format(
      'create trigger %I_feature_guard before insert on %I
         for each row execute function app.guard_center_feature(%L)',
      pair[1], pair[1], pair[2]);
  end loop;
end $$;
