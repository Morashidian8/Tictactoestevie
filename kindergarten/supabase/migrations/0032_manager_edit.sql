-- ============================================================
-- ویرایش مستقیم پرونده، به دست مدیر
-- ============================================================
--
-- مهاجرت ۰۰۲۸ راه خانواده را ساخت: درخواست، و تأیید مدیر. آنچه جا
-- مانده بود این بود که **خودِ مدیر** چطور مقداری را وارد یا عوض کند.
--
-- نتیجه‌اش در عمل دیده شد: پرونده بازرسی می‌گفت «۳ کودک کد ملی
-- ثبت‌نشده دارند» و هیچ جای اپ نمی‌شد کد ملی را وارد کرد.
--
-- ── دو تصمیم ─────────────────────────────────────────────────
--
-- الف) **بی صف تأیید.** مدیر خودش تأییدکننده است؛ گذاشتنِ درخواستِ او
--      در صفِ خودش یک حلقه بی‌معنی است.
--
-- ب) **همان فهرست بسته.** مدیر هم از `profile_field` می‌گذرد. کلاس و
--      مرکز و طرح شهریه از این راه عوض نمی‌شوند — نه برای خانواده و
--      نه برای مدیر؛ آن‌ها جای دیگری تصمیم خودشان را دارند.
-- ============================================================

create or replace function app.edit_profile_field(
  target uuid,
  field_key text,
  value text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre  uuid;
  before  text;
begin
  if not app.is_manager() then
    raise exception 'ویرایش مستقیم پرونده فقط با مدیر است.';
  end if;
  if not exists (select 1 from profile_field where key = field_key) then
    raise exception 'میدان «%» قابل ویرایش نیست.', field_key;
  end if;

  select center_id into centre from child where id = target;
  if centre is null or centre <> app.current_center_id() then
    raise exception 'کودک پیدا نشد.';
  end if;

  before := app.profile_value(target, field_key);

  -- پرونده پزشکی ممکن است هنوز ساخته نشده باشد.
  insert into medical_profile (child_id, center_id)
  values (target, centre)
  on conflict (child_id) do nothing;

  /*
   * همان `case` صریحِ مهاجرت ۰۰۲۸، نه SQL پویا.
   * نام ستون هرگز از داده کاربر ساخته نمی‌شود.
   */
  case field_key
    when 'first_name' then update child set first_name = value where id = target;
    when 'last_name' then update child set last_name = value where id = target;
    when 'birth_date' then
      update child set birth_date = nullif(btrim(value), '')::date where id = target;
    when 'national_id' then
      update child set national_id = nullif(btrim(value), '') where id = target;

    when 'blood_type' then
      update medical_profile set blood_type = nullif(btrim(value), '') where child_id = target;
    when 'allergies' then
      update medical_profile
         set allergies_json = coalesce((
           select jsonb_agg(btrim(part))
             from unnest(string_to_array(coalesce(value, ''), '،')) part
            where btrim(part) <> ''
         ), '[]'::jsonb)
       where child_id = target;
    when 'chronic_conditions' then
      update medical_profile set chronic_conditions = nullif(btrim(value), '') where child_id = target;
    when 'daily_medication' then
      update medical_profile set daily_medication = nullif(btrim(value), '') where child_id = target;
    when 'doctor_name' then
      update medical_profile set doctor_name = nullif(btrim(value), '') where child_id = target;
    when 'doctor_phone' then
      update medical_profile set doctor_phone = nullif(btrim(value), '') where child_id = target;
    when 'insurance' then
      update medical_profile set insurance = nullif(btrim(value), '') where child_id = target;

    else raise exception 'میدان «%» قابل اعمال نیست.', field_key;
  end case;

  /*
   * درخواست بازِ خانواده برای همین میدان بسته می‌شود.
   *
   * وگرنه مدیر مقدار را دستی درست می‌کند، درخواست در صف می‌ماند، و
   * تأییدِ بعدی‌اش مقدارِ درست را با مقدارِ قدیمی عوض می‌کند.
   */
  update profile_change_request
     set state = 'approved', reviewed_by = app.current_account_id(), reviewed_at = now()
   where child_id = target and field = field_key and state = 'pending';

  -- بند ۱۰.۲: هر تغییر داده کودک ردِ پا می‌خواهد.
  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(), 'profile_edited', 'child', target,
          jsonb_build_object('field', field_key, 'from', before, 'to', value));
end;
$$;
