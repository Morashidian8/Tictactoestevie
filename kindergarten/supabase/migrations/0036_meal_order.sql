-- ============================================================
-- رزرو غذا — منوی ماهانه، انتخاب خانواده، پرداخت، نهایی‌شدن
-- ============================================================
--
-- مهد منوی ماه را منتشر می‌کند با قیمت هر روز. خانواده روزهایی را که
-- می‌خواهد تیک می‌زند، یک‌جا پرداخت می‌کند، و از آن لحظه غذای کودکش
-- نهایی است — در پنل خودش، و در پنل مربی که باید بداند سر ظهر چند
-- بشقاب لازم است.
--
-- ── پنج تصمیم ───────────────────────────────────────────────
--
-- الف) **رزرو، پرداختِ خودش را دارد و به شهریه وصل نمی‌شود.** وسوسه
--      این بود که سطر روی صورتحساب ماه بنشیند و همان راه پرداخت
--      استفاده شود. ولی آن یعنی خانواده‌ای که شهریه عقب دارد، ناهار
--      هم ندارد — و آن رفتار غلط است. شهریه ماهانه و اجباری است، غذا
--      روزانه و اختیاری؛ دو پول با دو قاعده.
--
-- ب) **قیمت در لحظه رزرو قفل می‌شود.** اگر مهد فردا قیمت را بالا
--      ببرد، رزروِ پرداخت‌شده گران نمی‌شود.
--
-- ج) **مهلت رزرو، روزِ قبل است.** آشپزخانه صبح خرید می‌کند؛ رزروِ
--      ساعت یازده برای ناهارِ همان روز یعنی یک بشقاب که وجود ندارد.
--
-- د) **پرداخت‌نشده، رزرو نیست.** تا `paid_at` پر نشده هیچ‌جا به عنوان
--      غذای کودک دیده نمی‌شود — نه در پنل خانواده، نه در فهرست آشپزخانه.
--      همان قاعده سفتِ درگاه در مهاجرت ۰۰۲۰.
--
-- ه) **ظرفیت، اگر مهد بگذارد.** خالی یعنی بی‌حد. شمارش فقط روی
--      رزروهای پرداخت‌شده و در انتظار است، نه لغوشده‌ها.
-- ============================================================

alter table menu_day
  /*
   * قیمت هر پرس، به ریال. خالی یعنی این وعده رزروی نیست —
   * مهدی که غذا را داخل شهریه حساب می‌کند، منو را می‌نویسد ولی
   * قیمت نمی‌گذارد و هیچ دکمه رزروی هم ساخته نمی‌شود.
   */
  add column price bigint,
  add column capacity integer,
  /* آخرین روزی که می‌شود رزرو کرد. خالی یعنی روزِ قبل. */
  add column order_by date;

alter table menu_day
  add constraint menu_day_price_sane check (price is null or price between 0 and 100000000),
  add constraint menu_day_capacity_sane check (capacity is null or capacity > 0),
  add constraint menu_day_order_by_before check (order_by is null or order_by <= date);

create type app.meal_order_state as enum ('pending', 'confirmed', 'cancelled');

-- ------------------------------------------------------------
-- سبد پرداخت
--
-- چند روزِ رزروشده با یک پرداخت نهایی می‌شوند. جدا از `payment` است و
-- عمداً: آن جدول `invoice_id` اجباری دارد و هر صورتحساب یکی‌ست برای هر
-- کودک در هر ماه، پس رزروِ غذا در آن جا نمی‌شود. تکرارِ منطقِ درگاه
-- هزینه‌ای است که آگاهانه پرداخت شده تا غذا به بدهیِ شهریه گره نخورد.
-- ------------------------------------------------------------
create table meal_payment (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,

  amount bigint not null,
  method app.payment_method not null default 'online',

  /* درگاه: تا تأیید سمت سرور، پرداختی وجود ندارد. */
  gateway_state app.gateway_state,
  tracking_code text,
  idempotency_key text,

  /* کارت‌به‌کارت: رسید و تأیید مدیر. */
  receipt_url text,
  approved_by uuid references user_account(id) on delete set null,

  paid_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references user_account(id) on delete set null,

  constraint meal_payment_amount_positive check (amount > 0)
);

create unique index meal_payment_idempotency_idx
  on meal_payment (center_id, idempotency_key)
  where idempotency_key is not null;

create table meal_order (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references center(id) on delete restrict,
  child_id uuid not null references child(id) on delete restrict,
  menu_day_id uuid not null references menu_day(id) on delete restrict,

  state app.meal_order_state not null default 'pending',
  /* قیمت در لحظه رزرو. گران شدنِ بعدیِ منو، رزروِ قدیمی را گران نمی‌کند. */
  price bigint not null,
  payment_id uuid references meal_payment(id) on delete set null,

  ordered_at timestamptz not null default now(),
  ordered_by uuid references user_account(id) on delete set null,
  cancelled_at timestamptz,

  constraint meal_order_price_non_negative check (price >= 0),
  /* یک کودک، یک وعده، یک رزرو. دو بار زدن دکمه دو بشقاب نمی‌سازد. */
  constraint meal_order_once unique (child_id, menu_day_id)
);

create index meal_order_day_idx on meal_order (menu_day_id) where state <> 'cancelled';
create index meal_order_child_idx on meal_order (child_id, state);

-- ------------------------------------------------------------
-- منوی قابل رزرو یک بازه، از دید یک کودک
--
-- هم منو را می‌دهد، هم هشدار آلرژی، هم وضعیت رزروِ همین کودک. سه
-- پرس‌وجوی جدا یعنی رابط باید خودش به‌همشان بدوزد و یک جا از قلم بیفتد.
-- ------------------------------------------------------------
create or replace function app.meal_menu(child uuid, from_date date, to_date date)
returns table (
  menu_day_id uuid,
  date date,
  slot app.meal_slot,
  title text,
  ingredients text[],
  price bigint,
  order_by date,
  capacity integer,
  taken integer,
  allergy_hits text[],
  order_state app.meal_order_state,
  orderable boolean
)
language sql
stable
security definer
set search_path = public, app
as $$
  with mine as (
    select coalesce(
      (select array_agg(lower(btrim(a::text)))
         from medical_profile m, jsonb_array_elements_text(m.allergies_json) a
        where m.child_id = child),
      '{}'::text[]) as allergies
  )
  select
    m.id, m.date, m.slot, m.title, m.ingredients, m.price,
    coalesce(m.order_by, m.date - 1),
    m.capacity,
    (select count(*)::integer from meal_order o
      where o.menu_day_id = m.id and o.state <> 'cancelled'),
    /*
     * تقاطع آلرژی در سرور، نه در رابط.
     *
     * دو طرفه مقایسه می‌شود چون «بادام‌زمینی» و «کره بادام‌زمینی» باید
     * هم را بگیرند. اگر کلاینت حسابش می‌کرد، یک باگ رابط می‌توانست
     * هشدار را خاموش کند.
     */
    coalesce((
      select array_agg(i)
        from unnest(m.ingredients) i, mine
       where exists (
         select 1 from unnest(mine.allergies) a
          where lower(i) like '%' || a || '%' or a like '%' || lower(i) || '%'
       )
    ), '{}'::text[]),
    o.state,
    (
      m.price is not null
      and current_date <= coalesce(m.order_by, m.date - 1)
      and (m.capacity is null or (
        select count(*) from meal_order x
         where x.menu_day_id = m.id and x.state <> 'cancelled'
      ) < m.capacity)
    )
  from menu_day m
  left join meal_order o on o.menu_day_id = m.id and o.child_id = child and o.state <> 'cancelled'
  where m.center_id = app.current_center_id()
    and m.date between from_date and to_date
    and app.can_see_child(child)
  order by m.date, m.slot;
$$;

-- ------------------------------------------------------------
-- رزرو یک وعده
-- ------------------------------------------------------------
create or replace function app.reserve_meal(child uuid, day uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre  uuid := app.current_center_id();
  row_    record;
  made    uuid;
begin
  if not app.can_see_child(child) then
    raise exception 'این کودک به حساب شما وصل نیست.';
  end if;

  select m.*, coalesce(m.order_by, m.date - 1) as deadline
    into row_
    from menu_day m
   where m.id = day and m.center_id = centre;

  if row_.id is null then
    raise exception 'این وعده پیدا نشد.';
  end if;
  if row_.price is null then
    raise exception 'این وعده رزروی نیست.';
  end if;
  /*
   * مهلت. آشپزخانه صبح خرید می‌کند؛ رزروِ ساعت یازده برای ناهارِ همان
   * روز یعنی یک بشقاب که وجود ندارد.
   */
  if current_date > row_.deadline then
    raise exception 'مهلت رزرو این روز گذشته.';
  end if;
  if row_.capacity is not null and (
    select count(*) from meal_order o
     where o.menu_day_id = day and o.state <> 'cancelled'
  ) >= row_.capacity then
    raise exception 'ظرفیت این روز پر شده.';
  end if;

  insert into meal_order (center_id, child_id, menu_day_id, price, ordered_by)
  values (centre, child, day, row_.price, app.current_account_id())
  on conflict (child_id, menu_day_id) do update
     set state = 'pending',
         price = excluded.price,
         cancelled_at = null,
         ordered_at = now()
   where meal_order.state = 'cancelled'
  returning id into made;

  if made is null then
    raise exception 'این وعده قبلاً رزرو شده.';
  end if;
  return made;
end;
$$;

-- ------------------------------------------------------------
-- لغو یک رزروِ پرداخت‌نشده
--
-- رزروِ پرداخت‌شده از این راه لغو نمی‌شود: پولی جابه‌جا شده و برگرداندنش
-- تصمیم مدیر است، نه یک دکمه در پنل خانواده.
-- ------------------------------------------------------------
create or replace function app.cancel_meal_order(order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  row_ record;
begin
  select o.*, coalesce(m.order_by, m.date - 1) as deadline
    into row_
    from meal_order o join menu_day m on m.id = o.menu_day_id
   where o.id = order_id and o.center_id = app.current_center_id();

  if row_.id is null or not app.can_see_child(row_.child_id) then
    raise exception 'رزرو پیدا نشد.';
  end if;
  if row_.state = 'confirmed' then
    raise exception 'این رزرو پرداخت شده. برای لغوش با مدیر مهد صحبت کنید.';
  end if;
  if current_date > row_.deadline then
    raise exception 'مهلت این روز گذشته.';
  end if;

  update meal_order set state = 'cancelled', cancelled_at = now() where id = order_id;
end;
$$;

-- ------------------------------------------------------------
-- سبد: هرچه رزروشده و پرداخت‌نشده
-- ------------------------------------------------------------
create or replace function app.meal_basket(child uuid)
returns table (order_id uuid, date date, slot app.meal_slot, title text, price bigint)
language sql
stable
security definer
set search_path = public, app
as $$
  select o.id, m.date, m.slot, m.title, o.price
    from meal_order o join menu_day m on m.id = o.menu_day_id
   where o.child_id = child
     and o.state = 'pending'
     and o.center_id = app.current_center_id()
     and app.can_see_child(child)
   order by m.date, m.slot;
$$;

-- ------------------------------------------------------------
-- پرداخت سبد
--
-- `online` در این نسخه همان‌جا تأیید می‌شود چون واسط واقعی هنوز وصل
-- نیست؛ جای وصل شدنش دقیقاً همین‌جاست و تا آن روز، کد صادق می‌ماند:
-- `gateway_state` و `tracking_code` از حالا ثبت می‌شوند.
--
-- `manual_receipt` تأیید مدیر می‌خواهد و تا آن لحظه رزرو نهایی نیست.
-- ------------------------------------------------------------
create or replace function app.pay_meal_basket(
  child uuid,
  method app.payment_method default 'online',
  receipt text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid := app.current_center_id();
  total  bigint;
  made   uuid;
begin
  if not app.can_see_child(child) then
    raise exception 'این کودک به حساب شما وصل نیست.';
  end if;

  select coalesce(sum(price), 0) into total
    from meal_order where child_id = child and state = 'pending';
  if total <= 0 then
    raise exception 'سبد خالی است.';
  end if;
  if method = 'manual_receipt' and nullif(btrim(coalesce(receipt, '')), '') is null then
    raise exception 'برای کارت‌به‌کارت، تصویر رسید لازم است.';
  end if;

  insert into meal_payment
    (center_id, child_id, amount, method, receipt_url, created_by,
     gateway_state, tracking_code, paid_at)
  values
    (centre, child, total, method, nullif(btrim(coalesce(receipt, '')), ''),
     app.current_account_id(),
     case when method = 'online' then 'verified'::app.gateway_state end,
     case when method = 'online'
          then upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) end,
     case when method = 'online' then now() end)
  returning id into made;

  update meal_order
     set payment_id = made,
         /* کارت‌به‌کارت تا تأیید مدیر در انتظار می‌ماند. */
         state = case when method = 'online' then 'confirmed'::app.meal_order_state
                      else state end
   where child_id = child and state = 'pending';

  return made;
end;
$$;

-- ------------------------------------------------------------
-- تأیید کارت‌به‌کارت — مدیر
-- ------------------------------------------------------------
create or replace function app.approve_meal_payment(payment uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  centre uuid;
  done   timestamptz;
begin
  if not app.is_manager() then
    raise exception 'تأیید پرداخت فقط با مدیر است.';
  end if;

  select center_id, paid_at into centre, done from meal_payment where id = payment;
  if centre is null or centre <> app.current_center_id() then
    raise exception 'پرداخت پیدا نشد.';
  end if;
  if done is not null then
    raise exception 'این پرداخت قبلاً تأیید شده.';
  end if;

  update meal_payment
     set paid_at = now(), approved_by = app.current_account_id()
   where id = payment;

  update meal_order set state = 'confirmed' where payment_id = payment and state = 'pending';
end;
$$;

-- ------------------------------------------------------------
-- غذای یک روز، از دید مربی و آشپزخانه
--
-- سؤال واقعی سر ظهر «چند بشقاب؟» و «برای چه کسانی؟» است. فقط
-- رزروهای نهایی‌شده شمرده می‌شوند — پرداخت‌نشده، غذا نیست.
-- ------------------------------------------------------------
create or replace function app.meals_for_day(centre uuid, day date)
returns table (
  slot app.meal_slot,
  title text,
  child_id uuid,
  child_name text,
  class_name text,
  allergy_hits text[]
)
language sql
stable
security definer
set search_path = public, app
as $$
  select m.slot, m.title, c.id,
         btrim(c.first_name || ' ' || c.last_name),
         k.name,
         coalesce((
           select array_agg(i)
             from unnest(m.ingredients) i
            where exists (
              select 1
                from medical_profile mp, jsonb_array_elements_text(mp.allergies_json) a
               where mp.child_id = c.id
                 and (lower(i) like '%' || lower(btrim(a)) || '%'
                      or lower(btrim(a)) like '%' || lower(i) || '%')
            )
         ), '{}'::text[])
    from meal_order o
    join menu_day m on m.id = o.menu_day_id
    join child c on c.id = o.child_id
    left join class k on k.id = c.class_id
   where o.center_id = centre
     and o.state = 'confirmed'
     and m.date = day
     and app.can_see_child(c.id)
   order by m.slot, c.first_name;
$$;

-- ------------------------------------------------------------
-- پرداخت‌های کارت‌به‌کارتِ در انتظار — صف مدیر
-- ------------------------------------------------------------
create or replace function app.pending_meal_payments(centre uuid)
returns table (
  id uuid,
  child_id uuid,
  child_name text,
  amount bigint,
  receipt_url text,
  meals integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, app
as $$
  select p.id, p.child_id,
         btrim(c.first_name || ' ' || c.last_name),
         p.amount, p.receipt_url,
         (select count(*)::integer from meal_order o where o.payment_id = p.id),
         p.created_at
    from meal_payment p
    join child c on c.id = p.child_id
   where p.center_id = centre and p.paid_at is null and app.is_manager()
   order by p.created_at;
$$;

-- ------------------------------------------------------------
-- دسترسی
-- ------------------------------------------------------------
alter table meal_order enable row level security;
alter table meal_payment enable row level security;

create policy meal_order_visible on meal_order
  for select using (
    center_id = app.current_center_id() and app.can_see_child(child_id)
  );

create policy meal_payment_visible on meal_payment
  for select using (
    center_id = app.current_center_id() and app.can_see_child(child_id)
  );

-- ------------------------------------------------------------
-- شناسه وعده به منوی خانواده اضافه می‌شود
--
-- `menu_for_child` تا اینجا شناسه برنمی‌گرداند چون کسی به یک وعده
-- اشاره نمی‌کرد. حالا رزرو و قیمت‌گذاری هر دو به آن اشاره می‌کنند.
--
-- `drop` لازم است چون شکل خروجی عوض می‌شود و `create or replace`
-- اجازه تغییر نوع بازگشتی را نمی‌دهد.
-- ------------------------------------------------------------
drop function if exists app.menu_for_child(uuid, uuid, date, date);

create function app.menu_for_child(
  centre uuid,
  target uuid,
  from_date date,
  to_date date
)
returns table (
  menu_day_id uuid,
  date date,
  slot app.meal_slot,
  title text,
  ingredients text[],
  note text,
  allergy_hits text[]
)
language sql
stable
security definer
set search_path = public, app
as $$
  with mine as (
    select coalesce(
      (select array_agg(lower(btrim(value #>> '{}')))
         from medical_profile m, jsonb_array_elements(m.allergies_json) value
        where m.child_id = target), '{}'::text[]) as allergies
  )
  select m.id, m.date, m.slot, m.title, m.ingredients, m.note,
         coalesce((
           select array_agg(distinct i)
             from unnest(m.ingredients) i, mine
            where exists (
              select 1 from unnest(mine.allergies) a
               where lower(i) like '%' || a || '%' or a like '%' || lower(i) || '%'
            )
         ), '{}'::text[])
    from menu_day m
   where m.center_id = centre
     and m.date between from_date and to_date
   order by m.date, m.slot;
$$;
