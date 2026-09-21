-- ============================================================
-- پایه: شِمای کمکی، تریگر updated_at، و شمارش‌های ثابت پیوست الف
-- ============================================================

create extension if not exists "pgcrypto";

-- توابع کمکی دسترسی اینجا می‌نشینند تا از دید کلاینت پنهان بمانند.
create schema if not exists app;

-- ------------------------------------------------------------
-- همه جدول‌ها created_at و updated_at دارند (سرصفحه بخش ۱۱).
-- ------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- شمارش‌ها — پیوست الف سند.
-- به‌صورت enum ساخته می‌شوند تا مقدار خارج از فهرست اصلاً نتواند ثبت شود.
-- ------------------------------------------------------------

create type app.staff_role as enum ('manager', 'teacher', 'assistant');
create type app.account_role as enum ('manager', 'teacher', 'assistant', 'guardian', 'platform_admin');

create type app.child_status as enum ('active', 'left');

create type app.meal_type as enum ('breakfast', 'lunch', 'snack');
create type app.meal_amount as enum ('all', 'most', 'little', 'none');

-- بخش ۵.۵: نوار گروهی سه مقدار اول را می‌دهد چون برای حالت غالب کلاس است.
-- «sad» فقط از شیت استثنای هر کودک قابل ثبت است.
create type app.mood as enum ('good', 'normal', 'restless', 'sad');

create type app.arrival_condition as enum ('normal', 'fever_or_cold', 'scratch_or_bruise', 'restless');
create type app.pickup_method as enum ('guardian', 'authorized', 'code');

create type app.incident_type as enum ('fall', 'conflict', 'bite', 'fever', 'vomit', 'other');
create type app.incident_severity as enum ('minor', 'notify_parent', 'medical_attention');
create type app.incident_location as enum ('classroom', 'yard', 'kitchen', 'restroom', 'stairs', 'other');

-- بخش ۷.۳: سه اقدام مدیر روی رویداد.
create type app.manager_decision as enum ('send', 'call_then_send', 'archive');

-- بخش ۵.۶: سه حالت ارتقای خودکار شدت، به‌علاوه متن آزاد خارج از دسته بسته.
create type app.escalation_reason as enum ('photo_attached', 'head_or_face', 'repeated_7d', 'free_text');

-- بخش ۵.۶: دسته‌بندی رویداد جزئی بسته و از پیش تعریف‌شده است.
create type app.minor_category as enum ('fall_no_injury', 'surface_scratch', 'verbal_dispute', 'food_spill');

create type app.consent_type as enum ('photo_capture', 'photo_group_publish', 'field_trip', 'medication', 'emergency_care');

create type app.photo_status as enum ('draft', 'published');

-- بخش ۵.۹: «کامل» یعنی غذا و خواب و هر سه بازه خلق پر شده باشند.
create type app.report_status as enum ('draft', 'complete', 'sent', 'amended');

create type app.closure_type as enum ('full_closure', 'delayed_opening');
create type app.closure_reason as enum ('weather', 'air_quality', 'official', 'utility', 'health', 'other');

create type app.notification_channel as enum ('push', 'sms', 'in_app');

-- بخش ۶.۶: سیاست عکس گروهی، تنظیم سطح مهد.
create type app.group_photo_policy as enum ('never', 'with_consent');
