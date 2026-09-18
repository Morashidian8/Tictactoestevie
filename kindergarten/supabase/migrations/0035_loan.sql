-- ============================================================
-- دفتر امانت — چه کودکی، چه وسیله‌ای، چه روزی
-- ============================================================
--
-- کودک کتاب یا اسباب‌بازی مهد را خانه می‌برد. امروز این را مربی روی یک
-- کاغذ می‌نویسد یا اصلاً نمی‌نویسد، و هفته بعد هیچ‌کس نمی‌داند «کتاب
-- قصه‌های خوب» کجاست — و بدتر: خانواده‌ای که آن را برگردانده، دوباره
-- ازش پرسیده می‌شود.
--
-- ── چهار تصمیم ──────────────────────────────────────────────
--
-- الف) **دفتر است، نه انبار.** پیوست ج انبارداری را صریح رد کرده. اینجا
--      موجودی، سفارش، و ارزش ریالی وجود ندارد؛ فقط «چه چیزی دست کیست».
--
-- ب) **برگرداندن، تاریخ است نه تیک.** «برگشت؟ بله» به کسی نمی‌گوید کِی.
--      همان قاعده‌ای که برای «اقدام لازم» بازرسی هم گرفتیم.
--
-- ج) **هیچ جریمه و بدهی‌ای ساخته نمی‌شود.** وسیله‌ای که برنگشته، یک
--      یادآوری است نه یک قلم مالی. وصل کردنش به صورتحساب یعنی مهد سر
--      یک کتاب با خانواده طرف حساب می‌شود.
--
-- د) **شمارش تأخیر، معیارِ کودک نیست.** خط قرمز ۱۰: هیچ عددی که بشود
--      کودکان را با آن رتبه کرد. پس نه «امتیاز امانت» و نه شمارنده‌ای
--      روی پرونده کودک.
-- ============================================================

create type app.loan_kind as enum (
  'book',       -- کتاب
  'toy',        -- اسباب‌بازی
  'clothing',   -- لباس یا کفش
  'equipment',  -- وسیله آموزشی
  'other'
);

create table loan (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,

  kind app.loan_kind not null default 'book',
  /* نامِ خودِ وسیله. «کتاب» به کسی نمی‌گوید کدام کتاب. */
  title text not null,

  lent_on date not null default current_date,
  /* قرارِ برگرداندن. خالی یعنی قراری گذاشته نشده، نه اینکه گذشته. */
  due_on date,
  returned_on date,

  note text,
  lent_by uuid references user_account(id) on delete set null,
  returned_by uuid references user_account(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint loan_title_len check (length(btrim(title)) between 1 and 120),
  constraint loan_note_len check (note is null or length(note) <= 300),
  constraint loan_dates check (returned_on is null or returned_on >= lent_on),
  constraint loan_due_after_lent check (due_on is null or due_on >= lent_on)
);

create index loan_open_idx on loan (center_id, lent_on)
  where returned_on is null;
create index loan_child_idx on loan (child_id, lent_on);

-- ------------------------------------------------------------
-- ثبت امانت
--
-- کار مربی است، نه فقط مدیر: لحظه‌ای که کودک کتاب را برمی‌دارد، مربی
-- کنارش ایستاده. اگر فقط مدیر بتواند ثبت کند، هیچ‌وقت ثبت نمی‌شود.
-- ------------------------------------------------------------
/*
 * `lent` هست چون مربی همیشه همان لحظه ثبت نمی‌کند.
 *
 * کودک دیروز کتاب را برد و مربی امروز یادش افتاد؛ بی این پارامتر، یا
 * تاریخ غلط ثبت می‌شود یا اصلاً ثبت نمی‌شود. خالی یعنی امروز.
 */
create or replace function app.lend_item(
  child uuid,
  kind app.loan_kind,
  title text,
  due date default null,
  note text default null,
  lent date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid := app.current_center_id();
  clean  text := nullif(btrim(coalesce(title, '')), '');
  made   uuid;
begin
  if app.current_role() not in ('manager', 'teacher', 'assistant') then
    raise exception 'ثبت امانت کار کارکنان مهد است.';
  end if;
  if clean is null then
    raise exception 'نام وسیله لازم است.';
  end if;
  if not exists (
    select 1 from child c where c.id = child and c.center_id = centre and c.deleted_at is null
  ) then
    raise exception 'کودک پیدا نشد.';
  end if;

  insert into loan (center_id, child_id, kind, title, lent_on, due_on, note, lent_by)
  values (centre, child, kind, clean, coalesce(lent, current_date), due,
          nullif(btrim(coalesce(note, '')), ''), app.current_account_id())
  returning id into made;

  return made;
end;
$$;

-- ------------------------------------------------------------
-- برگرداندن
--
-- تاریخ، نه تیک: بازگشتی که تاریخش را ندانیم، به سؤالِ «کِی پس داد؟»
-- جواب نمی‌دهد.
-- ------------------------------------------------------------
create or replace function app.return_item(loan_id uuid, day date default null)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid;
  already date;
  lent    date;
  when_   date := coalesce(day, current_date);
begin
  if app.current_role() not in ('manager', 'teacher', 'assistant') then
    raise exception 'ثبت بازگشت کار کارکنان مهد است.';
  end if;

  select center_id, returned_on, lent_on into centre, already, lent
    from loan where id = loan_id;
  if centre is null or centre <> app.current_center_id() then
    raise exception 'امانت پیدا نشد.';
  end if;
  if already is not null then
    raise exception 'این وسیله قبلاً برگشته.';
  end if;
  if when_ < lent then
    raise exception 'روز بازگشت پیش از روز امانت نمی‌شود.';
  end if;

  update loan
     set returned_on = when_, returned_by = app.current_account_id()
   where id = loan_id;
end;
$$;

-- ------------------------------------------------------------
-- امانت‌های یک کودک
--
-- باز اول، بعد برگشته‌ها به ترتیب تازگی: آنچه هنوز دست کودک است کارِ
-- امروز است؛ بقیه تاریخچه‌اند.
-- ------------------------------------------------------------
create or replace function app.child_loans(child uuid)
returns table (
  id uuid,
  kind app.loan_kind,
  title text,
  lent_on date,
  due_on date,
  returned_on date,
  note text,
  overdue boolean
)
language sql
stable
security definer
set search_path = public, app
as $$
  select l.id, l.kind, l.title, l.lent_on, l.due_on, l.returned_on, l.note,
         (l.returned_on is null and l.due_on is not null and l.due_on < current_date)
    from loan l
   where l.child_id = child
     and l.center_id = app.current_center_id()
     and app.can_see_child(child)
   order by (l.returned_on is null) desc, l.lent_on desc;
$$;

-- ------------------------------------------------------------
-- هرچه هنوز برنگشته، در کل مهد
--
-- نمای مدیر و مربی. با نام کودک، چون سؤالِ واقعی «این کتاب دست کیست؟»
-- است نه «چند کتاب بیرون است؟».
-- ------------------------------------------------------------
create or replace function app.open_loans(centre uuid)
returns table (
  id uuid,
  child_id uuid,
  child_name text,
  class_name text,
  kind app.loan_kind,
  title text,
  lent_on date,
  due_on date,
  days_out integer,
  overdue boolean
)
language sql
stable
security definer
set search_path = public, app
as $$
  select l.id, l.child_id,
         btrim(c.first_name || ' ' || c.last_name),
         k.name,
         l.kind, l.title, l.lent_on, l.due_on,
         (current_date - l.lent_on)::integer,
         (l.due_on is not null and l.due_on < current_date)
    from loan l
    join child c on c.id = l.child_id
    left join class k on k.id = c.class_id
   where l.center_id = centre
     and l.returned_on is null
     and app.can_see_child(l.child_id)
   order by (l.due_on is not null and l.due_on < current_date) desc, l.lent_on;
$$;

-- ------------------------------------------------------------
-- دسترسی
--
-- مربی و مدیر کودکانی را می‌بینند که حق دیدنشان را دارند؛ خانواده فقط
-- کودک خودش. همان قاعده `may_see_child` که بقیه اپ رویش سوار است.
-- ------------------------------------------------------------
alter table loan enable row level security;

create policy loan_visible on loan
  for select using (
    center_id = app.current_center_id() and app.can_see_child(child_id)
  );

create policy loan_staff_write on loan
  for all using (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  )
  with check (
    center_id = app.current_center_id()
    and app.current_role() in ('manager', 'teacher', 'assistant')
    and app.can_see_child(child_id)
  );
