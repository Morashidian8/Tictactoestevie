-- ============================================================
-- M4 رویداد — بخش ۵.۶، ۷.۳ و ۱۱.۶ سند
-- ============================================================

create table incident (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  occurred_at timestamptz not null,

  type app.incident_type not null,
  severity app.incident_severity not null,
  location app.incident_location not null,
  -- بخش ۵.۶: دسته‌بندی رویداد جزئی بسته و از پیش تعریف‌شده است.
  -- متن آزاد خارج از این‌ها باعث ارتقای خودکار شدت می‌شود.
  minor_category app.minor_category,

  description text,
  action_taken text,
  photo_url text,
  staff_id uuid references staff(id) on delete set null,

  -- بخش ۵.۶ و ۷.۳: متن اولیه مربی تغییرناپذیر است، حتی وقتی مدیر
  -- description را ویرایش می‌کند.
  original_description text,
  escalation_reason app.escalation_reason,

  -- پرچم مسیر، نه حامل تصمیم.
  requires_approval boolean not null default false,
  manager_decision app.manager_decision,
  approved_by uuid references user_account(id) on delete set null,
  approved_at timestamptz,

  parent_notified_at timestamptz,
  parent_ack_at timestamptz,

  -- بخش ۵.۶: نام کودک دوم در خروجی سرپرست هرگز نمایش داده نمی‌شود.
  -- در سیستم ثبت می‌شود، در گزارش والد نه.
  other_child_id uuid references child(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- رویداد جزئی باید دسته داشته باشد؛ رویداد جدی‌تر دسته جزئی نمی‌گیرد.
  constraint incident_minor_needs_category
    check ((severity = 'minor') = (minor_category is not null)),

  -- بخش ۵.۶: درگیری بین دو کودک هرگز جزئی محسوب نمی‌شود، حتی کلامی.
  constraint incident_conflict_never_minor
    check (type <> 'conflict' or severity <> 'minor'),

  constraint incident_other_child_differs
    check (other_child_id is null or other_child_id <> child_id),

  constraint incident_decision_has_approver
    check (manager_decision is null or approved_by is not null)
);
create index incident_center_time_idx on incident (center_id, occurred_at desc);
create index incident_child_time_idx on incident (child_id, occurred_at desc);
-- صف تأیید مدیر، بخش ۷.۳
create index incident_pending_idx on incident (center_id, occurred_at)
  where requires_approval and manager_decision is null;

-- ------------------------------------------------------------
-- بخش ۵.۶: ارتقای خودکار شدت در سه حالت.
--   عکس ضمیمه شده باشد
--   ناحیه سر یا صورت باشد
--   برای همان کودک در ۷ روز گذشته بیش از دو رویداد جزئی ثبت شده باشد
--
-- «ناحیه سر یا صورت» فیلد جدایی در سند ندارد. تا روشن شدن تکلیفش، این
-- حالت فقط وقتی اعمال می‌شود که فراخوان صراحتاً escalation_reason را
-- head_or_face گذاشته باشد. دو حالت دیگر خودکارند.
-- ------------------------------------------------------------
create or replace function app.escalate_incident()
returns trigger
language plpgsql
as $$
declare
  recent_minor integer;
  reason app.escalation_reason;
begin
  -- متن اولیه مربی یک‌بار نوشته می‌شود و دیگر عوض نمی‌شود.
  if tg_op = 'INSERT' then
    new.original_description := new.description;
  else
    new.original_description := old.original_description;
  end if;

  if tg_op <> 'INSERT' or new.severity <> 'minor' then
    return new;
  end if;

  if new.photo_url is not null then
    reason := 'photo_attached';
  elsif new.escalation_reason = 'head_or_face' then
    reason := 'head_or_face';
  else
    select count(*) into recent_minor
    from incident
    where child_id = new.child_id
      and severity = 'minor'
      and occurred_at >= new.occurred_at - interval '7 days'
      and occurred_at < new.occurred_at;

    if recent_minor > 2 then
      reason := 'repeated_7d';
    end if;
  end if;

  if reason is not null then
    new.severity := 'notify_parent';
    new.escalation_reason := reason;
    new.minor_category := null;
  end if;

  return new;
end;
$$;

create trigger incident_escalate
  before insert or update on incident
  for each row execute function app.escalate_incident();

-- ------------------------------------------------------------
-- بخش ۳.۳، قاعده سفت دوم: رویداد با شدت متوسط یا بالا بدون تأیید مدیر
-- به سرپرست نمی‌رسد. رویداد جزئی مستقیم می‌رود.
-- ------------------------------------------------------------
create or replace function app.route_incident()
returns trigger
language plpgsql
as $$
begin
  new.requires_approval := (new.severity <> 'minor');

  if new.requires_approval
     and new.parent_notified_at is not null
     and new.manager_decision is null
  then
    raise exception
      'رویداد با شدت % بدون تأیید مدیر به سرپرست اطلاع داده نمی‌شود.', new.severity;
  end if;

  return new;
end;
$$;

create trigger incident_route
  before insert or update on incident
  for each row execute function app.route_incident();

create trigger incident_touch before update on incident
  for each row execute function app.touch_updated_at();
