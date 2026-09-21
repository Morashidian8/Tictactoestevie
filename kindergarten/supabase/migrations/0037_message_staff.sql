-- ============================================================
-- پیام میان همکاران — اصلاح ۰۰۲۹
--
-- خواسته مالک محصول: «مدیر یا هر مربی دیگه». تا اینجا دو مربی هیچ راهی
-- برای نوشتن به هم نداشتند و باید از مدیر رد می‌شدند — در مهدی که دو
-- مربی یک کلاس را شیفتی می‌گردانند، یعنی تحویل شیفت از کانالی بیرون از
-- سامانه رد می‌شود و هیچ ردی نمی‌ماند.
--
-- آنچه عمداً باز نمی‌شود: سرپرست به سرپرست. نام و زمینه خانواده‌های
-- دیگر در این سامانه به خانواده نشان داده نمی‌شود (همان قاعده‌ای که
-- نام کودک دوم را از گزارش رویداد بیرون می‌گذارد)، و فهرست انتخاب
-- گیرنده دقیقاً همان چیزی است که آن را نقض می‌کند.
-- ============================================================

create or replace function app.may_message(from_account uuid, to_account uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  with a as (select * from user_account where id = from_account),
       b as (select * from user_account where id = to_account)
  select exists (
    select 1 from a, b
    where a.center_id = b.center_id
      and a.id <> b.id
      and a.active and b.active
      and (
        -- مدیر با همه، و همه با مدیر.
        a.role = 'manager' or b.role = 'manager'

        -- همکار با همکار، در همان مرکز.
        or (a.role = 'teacher' and b.role = 'teacher')

        -- سرپرست با مربیِ کلاسِ کودک خودش.
        or (a.role = 'guardian' and b.role = 'teacher' and exists (
          select 1
            from child_guardian cg
            join child c on c.id = cg.child_id
            join staff_class sc on sc.class_id = c.class_id
           where cg.guardian_id = a.guardian_id and sc.staff_id = b.staff_id
        ))

        -- و همان، از سمت مربی.
        or (a.role = 'teacher' and b.role = 'guardian' and exists (
          select 1
            from child_guardian cg
            join child c on c.id = cg.child_id
            join staff_class sc on sc.class_id = c.class_id
           where cg.guardian_id = b.guardian_id and sc.staff_id = a.staff_id
        ))
      )
  )
$$;
