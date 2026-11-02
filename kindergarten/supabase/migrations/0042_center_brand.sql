-- ============================================================
-- هویت هر مهد: نام و نشان، در رابطِ همان مهد
--
-- مهاجرت ۰۰۴۱ کاری کرد که چهل مهد در یک پایگاه داده بنشینند و هیچ
-- سطری از مرزشان رد نشود. ولی هر چهل تا هنوز **یک اپ** دیده می‌شدند:
-- ستون‌های `name` و `logo_url` از مهاجرت ۰۰۰۲ بودند و در کل `src/`
-- حتی یک بار خوانده نمی‌شدند.
--
-- خانواده‌ای که اپ را باز می‌کند باید نشانِ مهدِ خودش را ببیند، نه
-- نشانِ سازندهٔ نرم‌افزار را.
--
-- ── چه چیزی مالِ مهد می‌شود و چه چیزی نمی‌شود ───────────────────
--
-- **می‌شود:** نام و نشان (لوگو).
--
-- **نمی‌شود:** رنگِ آسمانِ سرصفحه.
--
-- این دومی سلیقه نیست. در `tokens.css` نوشته شده چرا سه گرادیانِ
-- سبز/مرجانی/بنفش وجود دارد: مربی و مدیر گاهی یک نفرند و با یک شماره
-- وارد می‌شوند، و رنگِ آسمان تنها چیزی است که در یک نگاه می‌گوید
-- «الان در کدام حساب هستی». اگر هر مهد رنگِ خودش را بگذارد، آن نشانه
-- می‌میرد — و هر شش‌رقمی که از لوگوی یک مهد بیرون بیاید، کنتراست
-- ۴٫۵ متن سفید روی آسمان را هم می‌شکند (بخش ۱۲.۲).
--
-- نشانِ مهد جای شخصیتِ سرصفحه می‌نشیند، که تزئین است؛ رنگِ نقش سرِ
-- جایش می‌ماند.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ۱. مهدِ من — یک خواندن، برای همهٔ نقش‌ها
-- ────────────────────────────────────────────────────────────
/*
 * جانشینِ `my_centre_licence` از مهاجرت ۰۰۴۱.
 *
 * آن تابع فقط وضعیت اشتراک را می‌گفت و هنوز هیچ‌جای اپ صدا زده
 * نمی‌شد. حالا که سرصفحه هم نام و نشان می‌خواهد، دو رفت‌وبرگشت به
 * همان یک سطر بی‌معنی است — یکی می‌شود.
 *
 * `security definer` لازم است: مهدِ منقضی `current_center_id`
 * تهی دارد و بی این، خودش را هم نمی‌خواند و اپ به‌جای «اشتراک تمام
 * شده» یک صفحهٔ خالیِ بی‌توضیح نشان می‌داد.
 */
drop function if exists app.my_centre_licence();

create function app.my_centre()
returns table (
  center_id uuid,
  name text,
  logo_url text,
  phone text,
  address text,
  plan text,
  active_until date,
  licence_active boolean
)
language sql stable security definer set search_path = public, app
as $$
  select c.id, c.name, c.logo_url, c.phone, c.address, c.plan, c.active_until,
         app.center_licence_active(c.id)
    from center c
   where c.id = app.account_center_id()
$$;

comment on function app.my_centre() is
  'هویت و وضعیت اشتراکِ مهدِ حسابِ جاری. مهدِ منقضی هم خودش را می‌خواند.';

-- ────────────────────────────────────────────────────────────
-- ۲. تغییر هویت — به دست مدیرِ همان مهد
-- ────────────────────────────────────────────────────────────
/*
 * چرا تابع و نه سیاستِ `update` روی `center`.
 *
 * جدول `center` هفده ستون دارد که منطقِ سامانه رویشان سوار است:
 * ساعت کاری، جریمهٔ تأخیر، پنجرهٔ پیام، نسبت مربی به کودک، و
 * `active_until` که خودِ قفلِ اشتراک است. یک سیاستِ `update` روی
 * ردیف، هر هفده تا را باز می‌کند — از جمله تمدیدِ اشتراکِ خود مهد.
 *
 * تابع دو ستون را باز می‌کند و بس.
 */
create function app.set_center_brand(new_name text, new_logo_url text default null)
returns void
language plpgsql security definer set search_path = public, app as $$
declare
  centre uuid := app.current_center_id();
  clean text := btrim(coalesce(new_name, ''));
begin
  if not app.is_manager() then
    raise exception 'فقط مدیر نام و نشان مهد را عوض می‌کند';
  end if;

  /*
   * مهدِ منقضی هویتش را هم عوض نمی‌کند.
   *
   * `current_center_id` برای اشتراکِ تمام‌شده تهی است؛ این شرط همان
   * قفل را اینجا هم نگه می‌دارد، بی آنکه تابع خودش چیزی از اشتراک
   * بداند.
   */
  if centre is null then
    raise exception 'اشتراک این مهد فعال نیست';
  end if;

  if length(clean) < 2 or length(clean) > 80 then
    raise exception 'نام مهد بین ۲ تا ۸۰ نویسه باشد';
  end if;

  update center
     set name = clean,
         /*
          * تهی یعنی «دست نزن»، نه «پاک کن».
          *
          * مدیری که فقط نام را اصلاح می‌کند نباید لوگویش را از دست
          * بدهد. برداشتنِ لوگو کارِ `clear_center_logo` است، که
          * خواستنش صریح است.
          */
         logo_url = coalesce(new_logo_url, logo_url)
   where id = centre;

  /*
   * هویتِ مهد چیزی است که خانواده هر روز می‌بیند؛ عوض شدنش باید رد
   * داشته باشد. تریگرِ عمومیِ `write_audit` اینجا کار نمی‌کند —
   * روی `center_id` سطر می‌گردد و `center` چنین ستونی ندارد.
   */
  insert into audit_log (center_id, actor_id, action, entity, entity_id)
  values (centre, app.current_account_id(), 'update', 'center_brand', centre);
end;
$$;

create function app.clear_center_logo()
returns void
language plpgsql security definer set search_path = public, app as $$
declare
  centre uuid := app.current_center_id();
begin
  if not app.is_manager() then
    raise exception 'فقط مدیر نشان مهد را برمی‌دارد';
  end if;
  if centre is null then
    raise exception 'اشتراک این مهد فعال نیست';
  end if;

  update center set logo_url = null where id = centre;

  insert into audit_log (center_id, actor_id, action, entity, entity_id)
  values (centre, app.current_account_id(), 'update', 'center_brand', centre);
end;
$$;
