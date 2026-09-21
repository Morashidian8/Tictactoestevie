-- ============================================================
-- درخواست مرخصی مربی
-- ============================================================
--
-- مربی‌ای که فردا نمی‌تواند بیاید، امروز باید به مدیر بگوید. تا اینجا
-- راهش تلگرام و تماس بود — یعنی هیچ ردی نمی‌ماند، و مدیری که صبح
-- برنامه شیفت را می‌چیند نمی‌دانست چند نفر کم دارد.
--
-- ── چهار تصمیم ──────────────────────────────────────────────
--
-- الف) **بازه، نه یک روز.** مرخصی سه‌روزه یعنی سه درخواست جدا؟ نه.
--      `from_date`..`to_date` یک ردیف است و مدیر یک بار تصمیم می‌گیرد.
--
-- ب) **تأیید، نه اطلاع.** درخواست تا تأیید نشود مرخصی نیست. همان
--      الگوی `profile_change_request`: حالت بسته، تصمیم‌گیرنده ثبت‌شده.
--
-- ج) **رد، دلیل می‌خواهد.** مربی‌ای که «نه» می‌شنود بی دلیل، دفعه بعد
--      اصلاً درخواست نمی‌دهد و همان روز غیبت می‌کند.
--
-- د) **هیچ سهمیه‌ای شمرده نمی‌شود.** نه «مانده مرخصی»، نه شمارشِ
--      مقایسه‌ایِ بین مربیان — خط قرمز ۱۰. حقوق و مرخصی استحقاقی کارِ
--      دفتر حسابداری است، نه این اپ (پیوست ج).
-- ============================================================

create type app.leave_kind as enum (
  'personal',   -- شخصی
  'sick',       -- بیماری
  'family',     -- گرفتاری خانوادگی
  'other'
);

create table leave_request (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  staff_id uuid not null references staff(id) on delete cascade,

  kind app.leave_kind not null default 'personal',
  from_date date not null,
  to_date date not null,
  reason text,

  state app.change_state not null default 'pending',
  requested_by uuid references user_account(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references user_account(id) on delete set null,
  reviewed_at timestamptz,
  /* دلیلِ رد. تأیید دلیل نمی‌خواهد؛ رد می‌خواهد. */
  decision_note text,

  constraint leave_request_range check (to_date >= from_date),
  /*
   * بازه‌ای بلندتر از یک ماه یعنی تاریخ اشتباه انتخاب شده. مرخصی
   * بلندمدت و مرخصی زایمان از راه قرارداد می‌گذرد نه از این فرم.
   */
  constraint leave_request_length check (to_date - from_date <= 31),
  constraint leave_request_reason_len check (reason is null or length(reason) <= 500),
  constraint leave_request_reject_has_note
    check (state <> 'rejected' or nullif(btrim(coalesce(decision_note, '')), '') is not null)
);

create index leave_request_pending_idx on leave_request (center_id, from_date)
  where state = 'pending';
create index leave_request_staff_idx on leave_request (staff_id, from_date);

-- ------------------------------------------------------------
-- ثبت درخواست — به دست خودِ مربی
-- ------------------------------------------------------------
/*
 * نام پارامترها `starts`/`ends` است نه `from_date`/`to_date`.
 *
 * `to_date` هم نام ستون این جدول است و هم تابع درونی پستگرس؛ داخل بدنه
 * تابع، ارجاع مبهم می‌شود و کوئری اصلاً اجرا نمی‌شود. همان دامی که
 * پارامتر `conversation` در مهاجرت ۰۰۲۹ افتاد.
 */
create or replace function app.request_leave(
  kind app.leave_kind,
  starts date,
  ends date,
  reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  me     uuid := app.current_account_id();
  centre uuid := app.current_center_id();
  who    uuid;
  made   uuid;
begin
  select staff_id into who from user_account where id = me;
  if who is null then
    raise exception 'فقط کارکنان مهد می‌توانند درخواست مرخصی بدهند.';
  end if;
  if ends < starts then
    raise exception 'روز پایان نمی‌تواند پیش از روز شروع باشد.';
  end if;

  /*
   * درخواست بازِ هم‌پوشان، دوباره ساخته نمی‌شود.
   *
   * وگرنه مربی‌ای که دکمه را دو بار زد، دو ردیف در صف مدیر می‌سازد و
   * مدیر نمی‌داند کدام را تصمیم بگیرد.
   */
  if exists (
    select 1 from leave_request r
     where r.staff_id = who and r.state = 'pending'
       and r.from_date <= ends and r.to_date >= starts
  ) then
    raise exception 'برای همین روزها درخواست بازی دارید.';
  end if;

  insert into leave_request
    (center_id, staff_id, kind, from_date, to_date, reason, requested_by)
  values
    (centre, who, kind, starts, ends, nullif(btrim(coalesce(reason, '')), ''), me)
  returning id into made;

  return made;
end;
$$;

-- ------------------------------------------------------------
-- تصمیم مدیر
-- ------------------------------------------------------------
create or replace function app.decide_leave(
  request uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  row_state app.change_state;
  centre    uuid;
  clean     text := nullif(btrim(coalesce(note, '')), '');
begin
  if not app.is_manager() then
    raise exception 'تصمیم درباره مرخصی فقط با مدیر است.';
  end if;

  select state, center_id into row_state, centre
    from leave_request where id = request;
  if row_state is null or centre <> app.current_center_id() then
    raise exception 'درخواست پیدا نشد.';
  end if;
  if row_state <> 'pending' then
    raise exception 'این درخواست قبلاً بررسی شده.';
  end if;
  if not approve and clean is null then
    raise exception 'برای رد درخواست، دلیلش را بنویسید.';
  end if;

  update leave_request
     set state = case when approve then 'approved' else 'rejected' end::app.change_state,
         reviewed_by = app.current_account_id(),
         reviewed_at = now(),
         decision_note = clean
   where id = request;

  insert into audit_log (center_id, actor_id, action, entity, entity_id, meta_json)
  values (centre, app.current_account_id(),
          case when approve then 'leave_approved' else 'leave_rejected' end,
          'leave_request', request,
          jsonb_build_object('note', clean));
end;
$$;

-- ------------------------------------------------------------
-- صف مدیر
--
-- نزدیک‌ترین روزِ شروع اول: درخواستی که فرداست از درخواستی که ماه بعد
-- است فوری‌تر است، هرچند دیرتر ثبت شده باشد.
-- ------------------------------------------------------------
create or replace function app.pending_leave(centre uuid)
returns table (
  id uuid,
  staff_id uuid,
  full_name text,
  kind app.leave_kind,
  starts date,
  ends date,
  days integer,
  reason text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public, app
as $$
  select r.id, r.staff_id, s.full_name, r.kind, r.from_date, r.to_date,
         (r.to_date - r.from_date + 1)::integer, r.reason, r.requested_at
    from leave_request r
    join staff s on s.id = r.staff_id
   where r.center_id = centre and r.state = 'pending'
     and app.is_manager()
   order by r.from_date, r.requested_at;
$$;

-- ------------------------------------------------------------
-- تاریخچه خودِ مربی
-- ------------------------------------------------------------
create or replace function app.my_leave()
returns table (
  id uuid,
  kind app.leave_kind,
  starts date,
  ends date,
  days integer,
  reason text,
  state app.change_state,
  decision_note text,
  requested_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public, app
as $$
  select r.id, r.kind, r.from_date, r.to_date,
         (r.to_date - r.from_date + 1)::integer, r.reason,
         r.state, r.decision_note, r.requested_at, r.reviewed_at
    from leave_request r
   where r.staff_id = (select staff_id from user_account where id = app.current_account_id())
   order by r.from_date desc;
$$;

-- ------------------------------------------------------------
-- مرخصی تأییدشده یک روز، برای برنامه شیفت
--
-- مدیری که صبح برنامه را می‌چیند باید بداند چه کسی امروز نیست. بی این،
-- تأیید مرخصی یک ردیف در پایگاه داده است که هیچ‌جا دیده نمی‌شود.
-- ------------------------------------------------------------
create or replace function app.staff_on_leave(centre uuid, day date)
returns table (staff_id uuid, full_name text, kind app.leave_kind)
language sql
stable
security definer
set search_path = public, app
as $$
  select r.staff_id, s.full_name, r.kind
    from leave_request r
    join staff s on s.id = r.staff_id
   where r.center_id = centre and r.state = 'approved'
     and day between r.from_date and r.to_date
     and app.current_role() in ('manager', 'teacher', 'assistant')
   order by s.full_name;
$$;

-- ------------------------------------------------------------
-- دسترسی
--
-- مربی فقط درخواست‌های خودش؛ مدیر همه مرکز. سرپرست هیچ — مرخصی
-- کارکنان به خانواده ربطی ندارد.
-- ------------------------------------------------------------
alter table leave_request enable row level security;

create policy leave_request_own on leave_request
  for select using (
    center_id = app.current_center_id()
    and staff_id = (select staff_id from user_account where id = app.current_account_id())
  );

create policy leave_request_manager on leave_request
  for select using (center_id = app.current_center_id() and app.is_manager());
