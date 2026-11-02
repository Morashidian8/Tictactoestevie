-- ============================================================
-- دسترسی سطر-محور — بخش ۱۴.۲، ۱۴.۴ و ۳.۳ سند
--
-- این حصار دوم است. حصار اول لایه core/data است که center_id را یک‌جا
-- تزریق می‌کند. سند می‌گوید «هیچ کوئری‌ای بدون فیلتر center_id مجاز
-- نیست»، و یک حصار برای این ادعا کافی نیست.
--
-- قاعده سفت بخش ۳.۲: دسترسی‌ها هرگز ترکیب نمی‌شوند. همه توابع زیر از
-- «حساب فعال» می‌خوانند، نه از همه حساب‌های آن شماره.
-- ============================================================

-- ------------------------------------------------------------
-- حساب فعال نشست
--
-- ردیف active_account تنها وقتی معتبر است که شماره حسابِ انتخاب‌شده با
-- شماره داخل توکن یکی باشد. بدون این بررسی، کسی می‌توانست حساب دیگری را
-- در جدول بنشاند و نقش عوض کند.
-- ------------------------------------------------------------
create or replace function app.current_account()
returns user_account
language sql
stable
security definer
set search_path = public, app, auth
as $$
  select ua.*
  from active_account aa
  join user_account ua on ua.id = aa.user_account_id
  where aa.auth_user_id = auth.uid()
    and ua.active
    and ua.phone = (auth.jwt() ->> 'phone')
  limit 1
$$;

create or replace function app.current_center_id()
returns uuid
language sql
stable
as $$ select (app.current_account()).center_id $$;

create or replace function app.current_role()
returns app.account_role
language sql
stable
as $$ select (app.current_account()).role $$;

create or replace function app.is_manager()
returns boolean
language sql
stable
as $$ select app.current_role() = 'manager' $$;

-- مربی و کمک‌مربی به کلاس‌های تخصیص‌یافته محدودند — بخش ۳.۳.
create or replace function app.current_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select sc.class_id
  from staff_class sc
  where sc.staff_id = (app.current_account()).staff_id
$$;

-- سرپرست فقط کودک خودش را می‌بیند — بخش ۳.۳.
create or replace function app.current_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select cg.child_id
  from child_guardian cg
  where cg.guardian_id = (app.current_account()).guardian_id
    and cg.restricted = false
$$;

-- کودکی که حساب فعال حق دیدنش را دارد.
create or replace function app.can_see_child(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select case app.current_role()
    when 'manager' then exists (
      select 1 from child c
      where c.id = target and c.center_id = app.current_center_id()
    )
    when 'teacher' then exists (
      select 1 from child c
      where c.id = target
        and c.center_id = app.current_center_id()
        and c.class_id in (select app.current_class_ids())
    )
    when 'assistant' then exists (
      select 1 from child c
      where c.id = target
        and c.center_id = app.current_center_id()
        and c.class_id in (select app.current_class_ids())
    )
    when 'guardian' then target in (select app.current_child_ids())
    else false
  end
$$;

-- کمک‌مربی مثل مربی است ولی بدون ویرایش و بدون ثبت رویداد — بخش ۳.۱.
create or replace function app.can_write()
returns boolean
language sql
stable
as $$ select app.current_role() in ('manager', 'teacher') $$;

-- ============================================================
-- روشن کردن RLS روی همه جدول‌ها
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'center', 'class', 'staff', 'staff_class', 'user_account', 'active_account',
    'child', 'guardian', 'child_guardian', 'authorized_pickup',
    'medical_profile', 'consent',
    'attendance', 'pickup_code', 'absence_notice',
    'daily_report', 'daily_report_amendment', 'meal_log', 'medication_log',
    'photo', 'photo_tag',
    'incident',
    'fee_plan', 'child_fee', 'invoice', 'payment',
    'announcement', 'announcement_read', 'message_thread', 'message', 'closure',
    'audit_log', 'notification', 'sms_quota'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- حساب و نشست
-- ------------------------------------------------------------

-- کاربر همه حساب‌های شماره خودش را می‌بیند، چون صفحه انتخاب حساب به آن
-- نیاز دارد. دیدن فهرست حساب‌ها ترکیب دسترسی نیست.
create policy user_account_own_phone on user_account
  for select using (phone = (auth.jwt() ->> 'phone') and active);

create policy active_account_self on active_account
  for all using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from user_account ua
      where ua.id = user_account_id
        and ua.active
        and ua.phone = (auth.jwt() ->> 'phone')
    )
  );

-- ------------------------------------------------------------
-- جدول‌هایی که با center_id محدود می‌شوند و همه نقش‌های مرکز می‌بینند
-- ------------------------------------------------------------
create policy center_own on center
  for select using (id = app.current_center_id());

create policy class_own_center on class
  for select using (center_id = app.current_center_id());

-- بخش ۳.۳: پرسنل و شیفت فقط مدیر.
create policy staff_manager_only on staff
  for select using (center_id = app.current_center_id() and app.is_manager());

create policy staff_class_manager_only on staff_class
  for select using (
    app.is_manager()
    and exists (select 1 from class c where c.id = class_id and c.center_id = app.current_center_id())
  );

-- ------------------------------------------------------------
-- کودک و خانواده
-- ------------------------------------------------------------
create policy child_visible on child
  for select using (deleted_at is null and app.can_see_child(id));

create policy child_write on child
  for update using (center_id = app.current_center_id() and app.is_manager());

create policy guardian_visible on guardian
  for select using (
    deleted_at is null
    and center_id = app.current_center_id()
    and (
      app.is_manager()
      or exists (
        select 1 from child_guardian cg
        where cg.guardian_id = guardian.id and app.can_see_child(cg.child_id)
      )
    )
  );

create policy child_guardian_visible on child_guardian
  for select using (app.can_see_child(child_id));

create policy authorized_pickup_visible on authorized_pickup
  for select using (active and app.can_see_child(child_id));

-- بخش ۳.۳: پرونده پزشکی را مربی و کمک‌مربی می‌بینند، مدیر ویرایش می‌کند.
create policy medical_profile_visible on medical_profile
  for select using (app.can_see_child(child_id));

create policy consent_visible on consent
  for select using (app.can_see_child(child_id));

-- ------------------------------------------------------------
-- عملیات روزانه
-- ------------------------------------------------------------
create policy attendance_visible on attendance
  for select using (app.can_see_child(child_id));

-- بخش ۳.۳: ثبت ورود و خروج، مربی و کمک‌مربی برای کلاس خود، مدیر همه.
-- سرپرست هرگز.
create policy attendance_insert on attendance
  for insert with check (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  );

create policy attendance_update on attendance
  for update using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  );

create policy pickup_code_visible on pickup_code
  for select using (app.can_see_child(child_id));

-- بخش ۳.۳: ساخت کد تحویل، مدیر و سرپرست.
create policy pickup_code_insert on pickup_code
  for insert with check (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'guardian')
    and app.can_see_child(child_id)
  );

create policy absence_notice_visible on absence_notice
  for select using (app.can_see_child(child_id));

create policy absence_notice_insert on absence_notice
  for insert with check (
    center_id = app.current_center_id() and app.can_see_child(child_id)
  );

create policy daily_report_visible on daily_report
  for select using (
    app.can_see_child(child_id)
    -- سرپرست گزارش را فقط پس از ارسال می‌بیند.
    and (app.current_role() <> 'guardian' or sent_at is not null)
  );

create policy daily_report_write on daily_report
  for all using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  ) with check (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  );

create policy amendment_visible on daily_report_amendment
  for select using (
    exists (select 1 from daily_report r where r.id = daily_report_id and app.can_see_child(r.child_id))
  );

create policy meal_log_visible on meal_log
  for select using (
    exists (select 1 from daily_report r where r.id = daily_report_id and app.can_see_child(r.child_id))
  );

create policy meal_log_write on meal_log
  for all using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  ) with check (center_id = app.current_center_id());

create policy medication_log_visible on medication_log
  for select using (app.can_see_child(child_id));

create policy medication_log_write on medication_log
  for all using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
  ) with check (center_id = app.current_center_id());

-- بخش ۶.۶: سرپرست فقط عکسی را می‌بیند که کودک خودش در آن تگ خورده، و
-- فقط پس از انتشار.
create policy photo_visible on photo
  for select using (
    center_id = app.current_center_id()
    and (
      app.current_role() in ('manager', 'teacher', 'assistant')
      or (
        status = 'published'
        and exists (
          select 1 from photo_tag t
          where t.photo_id = photo.id and t.child_id in (select app.current_child_ids())
        )
      )
    )
  );

create policy photo_tag_visible on photo_tag
  for select using (app.can_see_child(child_id));

-- ------------------------------------------------------------
-- رویداد
-- ------------------------------------------------------------
create policy incident_visible on incident
  for select using (
    app.can_see_child(child_id)
    -- بخش ۳.۳ قاعده دوم: رویداد متوسط یا بالا بدون تأیید مدیر به سرپرست
    -- نمی‌رسد. سرپرست ردیفش را هم نمی‌بیند.
    and (
      app.current_role() <> 'guardian'
      or severity = 'minor'
      or manager_decision = 'send'
      or manager_decision = 'call_then_send'
    )
  );

-- بخش ۳.۳: ثبت رویداد، مربی و مدیر. کمک‌مربی نه.
create policy incident_insert on incident
  for insert with check (
    center_id = app.current_center_id()
    and app.can_write()
    and app.can_see_child(child_id)
  );

-- تأیید و انتشار رویداد فقط مدیر.
create policy incident_update on incident
  for update using (center_id = app.current_center_id() and app.is_manager());

-- ------------------------------------------------------------
-- مالی — بخش ۳.۳ قاعده اول: مربی هیچ‌گاه به داده مالی دسترسی ندارد.
-- سرپرست فقط کودک خودش، و فقط اگر is_payer باشد.
-- ------------------------------------------------------------
create policy fee_plan_manager on fee_plan
  for select using (center_id = app.current_center_id() and app.is_manager());

create policy child_fee_manager on child_fee
  for select using (center_id = app.current_center_id() and app.is_manager());

create or replace function app.is_payer_for(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from child_guardian cg
    where cg.child_id = target
      and cg.guardian_id = (app.current_account()).guardian_id
      and cg.is_payer
      and cg.restricted = false
  )
$$;

create policy invoice_visible on invoice
  for select using (
    center_id = app.current_center_id()
    and (app.is_manager() or (app.current_role() = 'guardian' and app.is_payer_for(child_id)))
  );

create policy invoice_manager_write on invoice
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy payment_visible on payment
  for select using (
    center_id = app.current_center_id()
    and (
      app.is_manager()
      or exists (
        select 1 from invoice i
        where i.id = invoice_id
          and app.current_role() = 'guardian'
          and app.is_payer_for(i.child_id)
      )
    )
  );

create policy payment_manager_write on payment
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

-- ------------------------------------------------------------
-- ارتباطات و تعطیلی
-- ------------------------------------------------------------
create policy announcement_visible on announcement
  for select using (
    center_id = app.current_center_id()
    and published_at is not null
    and (audience = 'center' or class_id in (
      select c.class_id from child c where app.can_see_child(c.id)
      union all
      select app.current_class_ids()
    ))
  );

create policy announcement_manager_write on announcement
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

create policy announcement_read_self on announcement_read
  for all using (user_account_id = (app.current_account()).id)
  with check (user_account_id = (app.current_account()).id);

create policy message_thread_visible on message_thread
  for select using (app.can_see_child(child_id));

create policy message_visible on message
  for select using (
    exists (select 1 from message_thread t where t.id = thread_id and app.can_see_child(t.child_id))
  );

create policy message_insert on message
  for insert with check (
    center_id = app.current_center_id()
    and exists (select 1 from message_thread t where t.id = thread_id and app.can_see_child(t.child_id))
  );

create policy closure_visible on closure
  for select using (center_id = app.current_center_id());

-- بخش ۳.۳: اعلام تعطیلی فقط مدیر.
create policy closure_manager_write on closure
  for all using (center_id = app.current_center_id() and app.is_manager())
  with check (center_id = app.current_center_id() and app.is_manager());

-- ------------------------------------------------------------
-- سیستمی
--
-- audit_log فقط نوشتنی است. هیچ نقشی از کلاینت آن را نمی‌خواند و هیچ‌کس
-- پاکش نمی‌کند؛ خواندنش کار پشتیبانی محصول با نقش جداگانه است.
-- ------------------------------------------------------------
create policy audit_log_insert on audit_log
  for insert with check (center_id = app.current_center_id());

create policy notification_self on notification
  for select using (user_account_id = (app.current_account()).id);

create policy notification_update_self on notification
  for update using (user_account_id = (app.current_account()).id);

create policy sms_quota_manager on sms_quota
  for select using (center_id = app.current_center_id() and app.is_manager());
